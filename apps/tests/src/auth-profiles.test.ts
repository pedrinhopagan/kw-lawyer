import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { pushSubscriptions } from "@kw-lawyer/api/src/db/schema/push_subscriptions.ts";
import { sessions } from "@kw-lawyer/api/src/db/schema/sessions.ts";
import { AuthManager } from "@kw-lawyer/api/src/features/auth/manager.ts";
import type { SessionLawyer } from "@kw-lawyer/api/src/features/auth/session.ts";
import { NotificationsManager } from "@kw-lawyer/api/src/features/notifications/manager.ts";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { createTestClient } from "./utils/orpc.ts";
import { seedCase, seedLawyer, seedPublication, uniqueCnj } from "./utils/seed.ts";

const SUFIXO_TJSP = "8520258260114";

// Quem já está no banco entra pelo caminho conhecido do login e nunca chega no DJEN, então o cliente
// real do construtor não sai da estante nestes testes.
async function enter(tx: Tx, lawyer: SessionLawyer, deviceId: string = crypto.randomUUID()) {
	const manager = new AuthManager(tx);
	const { token } = await manager.loginWithOab({
		oabNumber: lawyer.oabNumber,
		oabUf: lawyer.oabUf,
		deviceId,
	});
	const context = await manager.resolveSession(token);

	assertDefined(context, `a sessão aberta para ${lawyer.oabNumber} não resolveu`);

	return { token, context };
}

function device(suffix: string) {
	return {
		endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
		keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` },
	};
}

test(
	"a segunda OAB entra no mesmo aparelho sem derrubar a primeira e as duas aparecem no seletor",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930001");
		const bruno = await seedLawyer(tx, "930002");
		const manager = new AuthManager(tx);

		const primeira = await enter(tx, ana);
		const segunda = await enter(tx, bruno, primeira.context.deviceId);

		expect(segunda.context.deviceId).toBe(primeira.context.deviceId);
		expect(await manager.resolveSession(primeira.token)).not.toBeNull();

		const { profiles } = await manager.profiles(segunda.context);

		expect(profiles.map((profile) => profile.id).toSorted()).toEqual([ana.id, bruno.id].toSorted());
		expect(profiles.filter((profile) => profile.active).map((profile) => profile.id)).toEqual([
			bruno.id,
		]);
	}),
);

test(
	"trocar de perfil devolve a sessão que já existia neste aparelho",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930003");
		const bruno = await seedLawyer(tx, "930004");
		const manager = new AuthManager(tx);

		const primeira = await enter(tx, ana);
		const segunda = await enter(tx, bruno, primeira.context.deviceId);

		const trocada = await manager.switchTo({ context: segunda.context, lawyerId: ana.id });

		expect(trocada.lawyer.id).toBe(ana.id);
		expect(trocada.token).toBe(primeira.token);

		const resolvida = await manager.resolveSession(trocada.token);

		assertDefined(resolvida);
		expect(resolvida.lawyer.id).toBe(ana.id);
		expect(resolvida.deviceId).toBe(primeira.context.deviceId);
	}),
);

test(
	"trocar para advogado que não entrou neste aparelho devolve NOT_FOUND",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930005");
		const bruno = await seedLawyer(tx, "930006");
		const manager = new AuthManager(tx);

		const escritorio = await enter(tx, ana);
		const outroNavegador = await enter(tx, bruno);

		expect(outroNavegador.context.deviceId).not.toBe(escritorio.context.deviceId);

		// O id do advogado chega da tela e existe no banco. O que autoriza a troca é a sessão viva no
		// mesmo aparelho, então atravessar de um navegador para o outro não pode encontrar nada.
		await expectOrpcError(
			manager.switchTo({ context: escritorio.context, lawyerId: bruno.id }),
			"NOT_FOUND",
		);
		await expectOrpcError(
			manager.switchTo({ context: outroNavegador.context, lawyerId: ana.id }),
			"NOT_FOUND",
		);

		expect((await manager.profiles(escritorio.context)).profiles.map((p) => p.id)).toEqual([
			ana.id,
		]);
		expect((await manager.profiles(outroNavegador.context)).profiles.map((p) => p.id)).toEqual([
			bruno.id,
		]);
	}),
);

test(
	"trocar para perfil revogado ou expirado devolve NOT_FOUND",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930007");
		const bruno = await seedLawyer(tx, "930008");
		const carla = await seedLawyer(tx, "930009");
		const manager = new AuthManager(tx);

		const primeira = await enter(tx, ana);
		const revogada = await enter(tx, bruno, primeira.context.deviceId);
		const expirada = await enter(tx, carla, primeira.context.deviceId);

		await tx
			.update(sessions)
			.set({ revokedAt: new Date() })
			.where(eq(sessions.token, revogada.token));
		await tx
			.update(sessions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(sessions.token, expirada.token));

		await expectOrpcError(
			manager.switchTo({ context: primeira.context, lawyerId: bruno.id }),
			"NOT_FOUND",
		);
		await expectOrpcError(
			manager.switchTo({ context: primeira.context, lawyerId: carla.id }),
			"NOT_FOUND",
		);

		expect((await manager.profiles(primeira.context)).profiles.map((p) => p.id)).toEqual([ana.id]);
	}),
);

test(
	"sair de um perfil entrega a aba ao que sobrou no aparelho",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930010");
		const bruno = await seedLawyer(tx, "930011");
		const manager = new AuthManager(tx);

		const primeira = await enter(tx, ana);
		const segunda = await enter(tx, bruno, primeira.context.deviceId);

		const saida = await manager.logout({ context: segunda.context });

		expect(saida.ok).toBe(true);
		expect(saida.lawyer?.id).toBe(ana.id);
		assertDefined(saida.token);

		const assumida = await manager.resolveSession(saida.token);

		assertDefined(assumida);
		expect(assumida.lawyer.id).toBe(ana.id);
		expect(assumida.deviceId).toBe(primeira.context.deviceId);
		expect(await manager.resolveSession(segunda.token)).toBeNull();
	}),
);

test(
	"sair do único perfil devolve a aba para a tela de OAB",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930012");
		const manager = new AuthManager(tx);

		const sozinha = await enter(tx, ana);

		expect(await manager.logout({ context: sozinha.context })).toEqual({
			ok: true,
			token: null,
			lawyer: null,
			endpointInUse: false,
		});
		expect(await manager.resolveSession(sozinha.token)).toBeNull();
	}),
);

test(
	"sair no computador do escritório não desconecta o celular da mesma advogada",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930013");
		const manager = new AuthManager(tx);

		const escritorio = await enter(tx, ana);
		const celular = await enter(tx, ana);

		expect(celular.context.deviceId).not.toBe(escritorio.context.deviceId);

		await manager.logout({ context: escritorio.context });

		expect(await manager.resolveSession(escritorio.token)).toBeNull();

		const aindaDentro = await manager.resolveSession(celular.token);

		assertDefined(aindaDentro);
		expect(aindaDentro.lawyer.id).toBe(ana.id);
	}),
);

test(
	"entrar duas vezes com a mesma OAB no mesmo aparelho troca a sessão em vez de duplicar o perfil",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930014");
		const manager = new AuthManager(tx);

		const primeira = await enter(tx, ana);
		const segunda = await enter(tx, ana, primeira.context.deviceId);

		expect(segunda.token).not.toBe(primeira.token);
		expect(segunda.context.deviceId).toBe(primeira.context.deviceId);
		expect(await manager.resolveSession(primeira.token)).toBeNull();

		expect((await manager.profiles(segunda.context)).profiles.map((p) => p.id)).toEqual([ana.id]);
	}),
);

test(
	"o celular assina o push pelos dois advogados e só desliga quando sai o último",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930015");
		const bruno = await seedLawyer(tx, "930016");
		const notifications = new NotificationsManager(tx);
		const celular = device("celular-do-escritorio");

		await notifications.subscribe(ana.id, celular);
		await notifications.subscribe(bruno.id, celular);

		const assinantes = await tx
			.select({ lawyerId: pushSubscriptions.lawyerId })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, celular.endpoint));

		expect(assinantes.map((row) => row.lawyerId).toSorted()).toEqual([ana.id, bruno.id].toSorted());

		expect(
			await notifications.unsubscribe({ lawyerId: ana.id, endpoint: celular.endpoint }),
		).toEqual({ subscribed: false, endpointInUse: true });
		expect(
			await notifications.unsubscribe({ lawyerId: bruno.id, endpoint: celular.endpoint }),
		).toEqual({ subscribed: false, endpointInUse: false });
	}),
);

test(
	"dois perfis no mesmo aparelho continuam vendo só os próprios processos e publicações",
	withRollback(async (tx) => {
		const ana = await seedLawyer(tx, "930017");
		const bruno = await seedLawyer(tx, "930018");
		const cnjDaAna = uniqueCnj(SUFIXO_TJSP);
		const cnjDoBruno = uniqueCnj(SUFIXO_TJSP);

		const casoDaAna = await seedCase(tx, {
			lawyerId: ana.id,
			cnjNumber: cnjDaAna,
			tribunal: "TJSP",
		});
		const casoDoBruno = await seedCase(tx, {
			lawyerId: bruno.id,
			cnjNumber: cnjDoBruno,
			tribunal: "TJSP",
		});

		await seedPublication(tx, {
			lawyerIds: [ana.id],
			caseId: casoDaAna,
			cnjNumber: cnjDaAna,
			availableAt: "2026-06-10",
			textPlain: "intimação da ana",
		});
		await seedPublication(tx, {
			lawyerIds: [bruno.id],
			caseId: casoDoBruno,
			cnjNumber: cnjDoBruno,
			availableAt: "2026-06-11",
			textPlain: "intimação do bruno",
		});

		const primeira = await enter(tx, ana);
		const segunda = await enter(tx, bruno, primeira.context.deviceId);

		const clienteDaAna = createTestClient(tx, ana, primeira.context.deviceId);
		const clienteDoBruno = createTestClient(tx, bruno, segunda.context.deviceId);

		expect((await clienteDaAna.cases.list({})).items.map((item) => item.cnjNumber)).toEqual([
			cnjDaAna,
		]);
		expect((await clienteDoBruno.cases.list({})).items.map((item) => item.cnjNumber)).toEqual([
			cnjDoBruno,
		]);

		expect((await clienteDaAna.publications.list({})).items.map((item) => item.excerpt)).toEqual([
			"intimação da ana",
		]);
		expect((await clienteDoBruno.publications.list({})).items.map((item) => item.excerpt)).toEqual([
			"intimação do bruno",
		]);

		await expectOrpcError(clienteDoBruno.cases.get({ cnjNumber: cnjDaAna }), "NOT_FOUND");
	}),
);
