import { lawyers, type OnboardingState } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { sessions } from "@kw-lawyer/api/src/db/schema/sessions.ts";
import { AuthManager } from "@kw-lawyer/api/src/features/auth/manager.ts";
import {
	createSessionToken,
	readSessionToken,
	SESSION_ROW_REFRESH_AFTER_MS,
	SESSION_TTL_MS,
	sessionCookieOptions,
} from "@kw-lawyer/api/src/features/auth/session.ts";
import { authRouter } from "@kw-lawyer/api/src/router/auth.ts";
import { casesRouter } from "@kw-lawyer/api/src/router/cases.ts";
import { publicationsRouter } from "@kw-lawyer/api/src/router/publications.ts";
import { syncRouter } from "@kw-lawyer/api/src/router/sync.ts";
import { createRouterClient } from "@orpc/server";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { testContext } from "./utils/orpc.ts";
import { seedLawyer } from "./utils/seed.ts";

function djenFinding(result: { name: string; djenAdvogadoId: number | null } | null) {
	const stub = {
		calls: 0,
		findLawyer: () => {
			stub.calls++;

			return Promise.resolve(result);
		},
	};

	return stub;
}

function djenOffline() {
	const stub = {
		calls: 0,
		findLawyer: () => {
			stub.calls++;

			return Promise.reject(new Error("DJEN fora do ar"));
		},
	};

	return stub;
}

test(
	"login cria o advogado normalizado e a sessão",
	withRollback(async (tx) => {
		const manager = new AuthManager(
			tx,
			djenFinding({ name: "ANA LUISA FERREIRA CAMPOS", djenAdvogadoId: 1081698 }),
		);

		const { lawyer, token } = await manager.loginWithOab({
			oabNumber: "900.001",
			oabUf: " sp ",
			deviceId: null,
		});

		expect(lawyer.oabNumber).toBe("900001");
		expect(lawyer.oabUf).toBe("SP");
		expect(lawyer.name).toBe("ANA LUISA FERREIRA CAMPOS");
		expect(token.length).toBeGreaterThan(30);

		const [session] = await tx.select().from(sessions).where(eq(sessions.token, token));

		assertDefined(session);
		expect(session.lawyerId).toBe(lawyer.id);
		expect(session.revokedAt).toBeNull();
		expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(SESSION_TTL_MS - 60_000);
		expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(SESSION_TTL_MS);
	}),
);

test(
	"login repetido reaproveita o advogado, mantém o nome do banco e não consulta o DJEN",
	withRollback(async (tx) => {
		const first = await new AuthManager(
			tx,
			djenFinding({ name: "NOME ANTIGO", djenAdvogadoId: 1 }),
		).loginWithOab({ oabNumber: "900002", oabUf: "SP", deviceId: null });

		const djen = djenFinding({ name: "NOME NOVO", djenAdvogadoId: 2 });
		const second = await new AuthManager(tx, djen).loginWithOab({
			oabNumber: "900002",
			oabUf: "SP",
			deviceId: null,
		});

		expect(djen.calls).toBe(0);
		expect(second.lawyer.id).toBe(first.lawyer.id);
		expect(second.lawyer.name).toBe("NOME ANTIGO");
		expect(second.token).not.toBe(first.token);

		const rows = await tx
			.select()
			.from(lawyers)
			.where(and(eq(lawyers.oabNumber, "900002"), eq(lawyers.oabUf, "SP")));

		expect(rows).toHaveLength(1);
		expect(rows[0]?.djenAdvogadoId).toBe(1);
	}),
);

test(
	"advogado já cadastrado entra com o DJEN fora do ar",
	withRollback(async (tx) => {
		const first = await new AuthManager(
			tx,
			djenFinding({ name: "FORA DO AR", djenAdvogadoId: 9 }),
		).loginWithOab({ oabNumber: "900012", oabUf: "SP", deviceId: null });

		const { lawyer, token } = await new AuthManager(tx, djenOffline()).loginWithOab({
			oabNumber: "900012",
			oabUf: "SP",
			deviceId: null,
		});

		expect(lawyer.id).toBe(first.lawyer.id);
		expect(lawyer.name).toBe("FORA DO AR");

		const [session] = await tx.select().from(sessions).where(eq(sessions.token, token));

		assertDefined(session);
		expect(session.lawyerId).toBe(lawyer.id);
	}),
);

test(
	"OAB desconhecida com o DJEN fora do ar pede o nome em vez de estourar",
	withRollback(async (tx) => {
		const djen = djenOffline();

		await expectOrpcError(
			new AuthManager(tx, djen).loginWithOab({ oabNumber: "900013", oabUf: "SP", deviceId: null }),
			"NOT_FOUND",
		);

		expect(djen.calls).toBe(1);

		const declared = await new AuthManager(tx, djenOffline()).loginWithOab({
			oabNumber: "900013",
			oabUf: "SP",
			name: "quem se declarou",
			deviceId: null,
		});

		expect(declared.lawyer.name).toBe("QUEM SE DECLAROU");
	}),
);

test(
	"login sem publicações no DJEN devolve NOT_FOUND",
	withRollback(async (tx) => {
		const manager = new AuthManager(tx, djenFinding(null));

		await expectOrpcError(
			manager.loginWithOab({ oabNumber: "900003", oabUf: "SP", deviceId: null }),
			"NOT_FOUND",
		);
	}),
);

test(
	"advogado sem publicação entra declarando o nome e o nome declarado é o que vale",
	withRollback(async (tx) => {
		const declared = await new AuthManager(tx, djenFinding(null)).loginWithOab({
			oabNumber: "900010",
			oabUf: "SP",
			name: " vitor de teste ",
			deviceId: null,
		});

		expect(declared.lawyer.name).toBe("VITOR DE TESTE");

		const [row] = await tx
			.select()
			.from(lawyers)
			.where(and(eq(lawyers.oabNumber, "900010"), eq(lawyers.oabUf, "SP")));

		expect(row?.djenAdvogadoId).toBeNull();

		const djen = djenFinding({ name: "VITOR PUBLICADO", djenAdvogadoId: 77 });
		const again = await new AuthManager(tx, djen).loginWithOab({
			oabNumber: "900010",
			oabUf: "SP",
			deviceId: null,
		});

		expect(djen.calls).toBe(0);
		expect(again.lawyer.id).toBe(declared.lawyer.id);
		expect(again.lawyer.name).toBe("VITOR DE TESTE");
	}),
);

test(
	"login com OAB malformada nem chega no DJEN",
	withRollback(async (tx) => {
		const djen = djenOffline();
		const manager = new AuthManager(tx, djen);

		await expectOrpcError(
			manager.loginWithOab({ oabNumber: "abc", oabUf: "SP", deviceId: null }),
			"BAD_REQUEST",
		);
		await expectOrpcError(
			manager.loginWithOab({ oabNumber: "900004", oabUf: "Brasil", deviceId: null }),
			"BAD_REQUEST",
		);

		expect(djen.calls).toBe(0);
	}),
);

test(
	"login acima de dez tentativas por minuto devolve RATE_LIMITED",
	withRollback(async (tx) => {
		const manager = new AuthManager(tx, djenFinding({ name: "LIMITE", djenAdvogadoId: null }));

		for (let attempt = 1; attempt <= 10; attempt++) {
			await manager.loginWithOab({ oabNumber: "900005", oabUf: "SP", deviceId: null });
		}

		await expectOrpcError(
			manager.loginWithOab({ oabNumber: "900005", oabUf: "SP", deviceId: null }),
			"RATE_LIMITED",
		);
	}),
);

test(
	"sessão expirada não resolve",
	withRollback(async (tx) => {
		const [lawyer] = await tx
			.insert(lawyers)
			.values({ name: "EXPIRADA", oabNumber: "900006", oabUf: "SP" })
			.returning();

		assertDefined(lawyer);

		const token = createSessionToken();

		await tx.insert(sessions).values({
			lawyerId: lawyer.id,
			deviceId: crypto.randomUUID(),
			token,
			expiresAt: new Date(Date.now() - 1000),
		});

		expect(await new AuthManager(tx).resolveSession(token)).toBeNull();
	}),
);

test(
	"sessão revogada não resolve",
	withRollback(async (tx) => {
		const manager = new AuthManager(tx, djenFinding({ name: "REVOGADA", djenAdvogadoId: null }));
		const { token } = await manager.loginWithOab({
			oabNumber: "900007",
			oabUf: "SP",
			deviceId: null,
		});
		const context = await manager.resolveSession(token);

		assertDefined(context);

		await manager.logout({ context });

		expect(await manager.resolveSession(token)).toBeNull();
	}),
);

test(
	"sessão perto de expirar é estendida ao ser usada",
	withRollback(async (tx) => {
		const [lawyer] = await tx
			.insert(lawyers)
			.values({ name: "RENOVADA", oabNumber: "900008", oabUf: "SP" })
			.returning();

		assertDefined(lawyer);

		const token = createSessionToken();

		await tx.insert(sessions).values({
			lawyerId: lawyer.id,
			deviceId: crypto.randomUUID(),
			token,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS - SESSION_ROW_REFRESH_AFTER_MS - 60_000),
		});

		expect(await new AuthManager(tx).resolveSession(token)).not.toBeNull();

		const [renewed] = await tx.select().from(sessions).where(eq(sessions.token, token));

		assertDefined(renewed);
		expect(renewed.expiresAt.getTime() - Date.now()).toBeGreaterThan(SESSION_TTL_MS - 60_000);
	}),
);

test(
	"sessão inválida não vira contexto autenticado",
	withRollback(async (tx) => {
		const session = await new AuthManager(tx).resolveSession("token-que-nunca-existiu");

		expect(session).toBeNull();

		const client = createRouterClient(authRouter, { context: { session, access: true, db: tx } });

		await expectOrpcError(client.logout({}), "UNAUTHORIZED");
		await expectOrpcError(client.profiles(), "UNAUTHORIZED");
		await expectOrpcError(client.switch({ lawyerId: crypto.randomUUID() }), "UNAUTHORIZED");
		expect(await client.me()).toEqual({ lawyer: null });
	}),
);

test(
	"procedure autenticada usa o advogado do contexto",
	withRollback(async (tx) => {
		const manager = new AuthManager(tx, djenFinding({ name: "AUTENTICADA", djenAdvogadoId: null }));
		const { lawyer, token } = await manager.loginWithOab({
			oabNumber: "900009",
			oabUf: "SP",
			deviceId: null,
		});
		const session = await manager.resolveSession(token);

		assertDefined(session);

		const client = createRouterClient(authRouter, {
			context: { session, access: true, db: tx },
		});

		expect(await client.me()).toEqual({ lawyer });

		// Perfil único: sair não sobra ninguém para assumir a aba, e o token nulo é o que apaga o cookie.
		expect(await client.logout({})).toEqual({
			ok: true,
			token: null,
			lawyer: null,
			endpointInUse: false,
		});
		expect(await manager.resolveSession(token)).toBeNull();
	}),
);

const PENDING_ONBOARDING = [
	"sem_sync",
	"sincronizando",
	"falhou",
] as const satisfies OnboardingState[];

test(
	"procedure de dado só responde depois da primeira sincronização",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "900014");

		expect(lawyer.onboardingState).toBe("pronto");

		for (const onboardingState of PENDING_ONBOARDING) {
			const context = testContext(tx, { ...lawyer, onboardingState });

			await expectOrpcError(
				createRouterClient(publicationsRouter, { context }).list({}),
				"SYNC_REQUIRED",
			);
			await expectOrpcError(createRouterClient(casesRouter, { context }).list({}), "SYNC_REQUIRED");

			// A saída do onboarding depende do próprio sync, então ele nunca pode ficar atrás do gate.
			expect(await createRouterClient(syncRouter, { context }).status()).toEqual({
				run: null,
				lastSyncedAt: null,
			});
		}

		const context = testContext(tx, lawyer);

		expect(await createRouterClient(publicationsRouter, { context }).list({})).toEqual({
			items: [],
			total: 0,
			unread: 0,
		});
		expect((await createRouterClient(casesRouter, { context }).list({})).items).toEqual([]);
	}),
);

test("readSessionToken lê o token do corpo RPC de quem troca a sessão da aba", () => {
	const body = JSON.stringify({
		json: { lawyer: { id: "a", name: "b", oabNumber: "1", oabUf: "SP" }, token: "tok-123" },
		meta: [],
	});

	expect(readSessionToken(body)).toBe("tok-123");

	// Sair do último perfil responde com token nulo de propósito, e é isso que apaga o cookie.
	expect(readSessionToken(JSON.stringify({ json: { ok: true, token: null } }))).toBeNull();
	expect(readSessionToken(JSON.stringify({ json: { ok: true } }))).toBeNull();
	expect(readSessionToken("não é json")).toBeNull();
});

test("cookie de sessão é httpOnly, lax e válido por trinta dias", () => {
	expect(sessionCookieOptions()).toEqual({
		httpOnly: true,
		sameSite: "Lax",
		path: "/",
		secure: false,
		maxAge: SESSION_TTL_MS / 1000,
	});
});
