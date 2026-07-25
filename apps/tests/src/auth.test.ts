import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { sessions } from "@kw-lawyer/api/src/db/schema/sessions.ts";
import { AuthManager } from "@kw-lawyer/api/src/features/auth/manager.ts";
import {
	createSessionToken,
	readLoginToken,
	SESSION_RENEWAL_THRESHOLD_MS,
	SESSION_TTL_MS,
	sessionCookieOptions,
} from "@kw-lawyer/api/src/features/auth/session.ts";
import { authRouter } from "@kw-lawyer/api/src/router/auth.ts";
import { createRouterClient } from "@orpc/server";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";

function djenFinding(result: { name: string; djenAdvogadoId: number | null } | null) {
	return { findLawyer: () => Promise.resolve(result) };
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
	"login repetido reaproveita o advogado e atualiza o nome",
	withRollback(async (tx) => {
		const first = await new AuthManager(
			tx,
			djenFinding({ name: "NOME ANTIGO", djenAdvogadoId: 1 }),
		).loginWithOab({ oabNumber: "900002", oabUf: "SP" });

		const second = await new AuthManager(
			tx,
			djenFinding({ name: "NOME NOVO", djenAdvogadoId: 2 }),
		).loginWithOab({ oabNumber: "900002", oabUf: "SP" });

		expect(second.lawyer.id).toBe(first.lawyer.id);
		expect(second.lawyer.name).toBe("NOME NOVO");
		expect(second.token).not.toBe(first.token);

		const rows = await tx
			.select()
			.from(lawyers)
			.where(and(eq(lawyers.oabNumber, "900002"), eq(lawyers.oabUf, "SP")));

		expect(rows).toHaveLength(1);
		expect(rows[0]?.djenAdvogadoId).toBe(2);
	}),
);

test(
	"login sem publicações no DJEN devolve NOT_FOUND",
	withRollback(async (tx) => {
		const manager = new AuthManager(tx, djenFinding(null));

		await expectOrpcError(manager.loginWithOab({ oabNumber: "900003", oabUf: "SP" }), "NOT_FOUND");
	}),
);

test(
	"advogado sem publicação entra declarando o nome e o DJEN corrige depois",
	withRollback(async (tx) => {
		const declared = await new AuthManager(tx, djenFinding(null)).loginWithOab({
			oabNumber: "900010",
			oabUf: "SP",
			name: " vitor de teste ",
		});

		expect(declared.lawyer.name).toBe("VITOR DE TESTE");

		const [row] = await tx
			.select()
			.from(lawyers)
			.where(and(eq(lawyers.oabNumber, "900010"), eq(lawyers.oabUf, "SP")));

		expect(row?.djenAdvogadoId).toBeNull();

		const found = await new AuthManager(
			tx,
			djenFinding({ name: "VITOR PUBLICADO", djenAdvogadoId: 77 }),
		).loginWithOab({ oabNumber: "900010", oabUf: "SP" });

		expect(found.lawyer.id).toBe(declared.lawyer.id);
		expect(found.lawyer.name).toBe("VITOR PUBLICADO");
	}),
);

test(
	"login com OAB malformada nem chega no DJEN",
	withRollback(async (tx) => {
		const manager = new AuthManager(tx, {
			findLawyer: () => Promise.reject(new Error("o DJEN não deveria ser consultado")),
		});

		await expectOrpcError(manager.loginWithOab({ oabNumber: "abc", oabUf: "SP" }), "BAD_REQUEST");
		await expectOrpcError(
			manager.loginWithOab({ oabNumber: "900004", oabUf: "Brasil" }),
			"BAD_REQUEST",
		);
	}),
);

test(
	"login acima de dez tentativas por minuto devolve RATE_LIMITED",
	withRollback(async (tx) => {
		const manager = new AuthManager(tx, djenFinding({ name: "LIMITE", djenAdvogadoId: null }));

		for (let attempt = 1; attempt <= 10; attempt++) {
			await manager.loginWithOab({ oabNumber: "900005", oabUf: "SP" });
		}

		await expectOrpcError(
			manager.loginWithOab({ oabNumber: "900005", oabUf: "SP" }),
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
		const { lawyer, token } = await manager.loginWithOab({ oabNumber: "900007", oabUf: "SP" });

		expect(await manager.resolveSession(token)).not.toBeNull();

		await manager.logout(lawyer.id);

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
			token,
			expiresAt: new Date(Date.now() + SESSION_RENEWAL_THRESHOLD_MS - 60_000),
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
		const lawyer = await new AuthManager(tx).resolveSession("token-que-nunca-existiu");

		expect(lawyer).toBeNull();

		const client = createRouterClient(authRouter, { context: { lawyer, access: true, db: tx } });

		await expectOrpcError(client.logout(), "UNAUTHORIZED");
		expect(await client.me()).toEqual({ lawyer: null });
	}),
);

test(
	"procedure autenticada usa o advogado do contexto",
	withRollback(async (tx) => {
		const manager = new AuthManager(tx, djenFinding({ name: "AUTENTICADA", djenAdvogadoId: null }));
		const { lawyer, token } = await manager.loginWithOab({ oabNumber: "900009", oabUf: "SP" });
		const client = createRouterClient(authRouter, { context: { lawyer, access: true, db: tx } });

		expect(await client.me()).toEqual({ lawyer });
		expect(await client.logout()).toEqual({ ok: true });
		expect(await manager.resolveSession(token)).toBeNull();
	}),
);

test("readLoginToken lê o token do corpo RPC do login", () => {
	const body = JSON.stringify({
		json: { lawyer: { id: "a", name: "b", oabNumber: "1", oabUf: "SP" }, token: "tok-123" },
		meta: [],
	});

	expect(readLoginToken(body)).toBe("tok-123");
	expect(readLoginToken(JSON.stringify({ json: { ok: true } }))).toBeNull();
	expect(readLoginToken("não é json")).toBeNull();
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
