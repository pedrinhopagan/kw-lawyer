import { notificationSends } from "@kw-lawyer/api/src/db/schema/notification_sends.ts";
import { pushSubscriptions } from "@kw-lawyer/api/src/db/schema/push_subscriptions.ts";
import { syncRuns } from "@kw-lawyer/api/src/db/schema/sync_runs.ts";
import { AuthManager } from "@kw-lawyer/api/src/features/auth/manager.ts";
import { NotificationsManager } from "@kw-lawyer/api/src/features/notifications/manager.ts";
import {
	collectionFailureAlert,
	deadlinesAlert,
	publicationsAlert,
} from "@kw-lawyer/api/src/features/notifications/triggers.ts";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { assertDefined } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { seedCase, seedDeadline, seedLawyer, seedPublication } from "./utils/seed.ts";

const TODAY = "2026-07-27";

function device(suffix: string) {
	return {
		endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
		keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` },
	};
}

async function subscribed(tx: Parameters<Parameters<typeof withRollback>[0]>[0], oab: string) {
	const lawyer = await seedLawyer(tx, oab);

	await new NotificationsManager(tx).subscribe(lawyer.id, device(oab));

	return lawyer;
}

test("nenhum texto de alerta carrega número de processo, parte ou trecho da publicação", () => {
	const payloads = [
		publicationsAlert(3),
		deadlinesAlert({ overdue: 1, today: 2, tomorrow: 0, inThreeDays: 0 }, "prazo-1"),
		collectionFailureAlert(),
	];

	for (const payload of payloads) {
		assertDefined(payload);

		const text = `${payload.title} ${payload.body}`;

		expect(text).not.toMatch(/\d{7}-\d{2}\.\d{4}/u);
		expect(text).not.toMatch(/\d{20}/u);
	}
});

test("o alerta de prazo aponta para o hub quando existe um só prazo no recorte", () => {
	const single = deadlinesAlert({ overdue: 0, today: 1, tomorrow: 0, inThreeDays: 0 }, "prazo-42");

	assertDefined(single);
	expect(single.url).toBe("/prazos/prazo-42");

	const many = deadlinesAlert({ overdue: 0, today: 2, tomorrow: 1, inThreeDays: 0 }, null);

	assertDefined(many);
	expect(many.url).toBe("/agenda");
});

test("recorte sem prazo nenhum não vira alerta", () => {
	expect(deadlinesAlert({ overdue: 0, today: 0, tomorrow: 0, inThreeDays: 0 }, null)).toBeNull();
	expect(publicationsAlert(0)).toBeNull();
});

test(
	"o mesmo aparelho assina pelos dois advogados sem um tirar o outro",
	withRollback(async (tx) => {
		const first = await seedLawyer(tx, "910001");
		const second = await seedLawyer(tx, "910002");
		const notifications = new NotificationsManager(tx);
		const shared = device("aparelho-compartilhado");

		await notifications.subscribe(first.id, shared);
		await notifications.subscribe(second.id, shared);

		const rows = await tx
			.select({ lawyerId: pushSubscriptions.lawyerId })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, shared.endpoint));

		expect(rows.map((row) => row.lawyerId).toSorted()).toEqual([first.id, second.id].toSorted());
	}),
);

test(
	"sair apaga a assinatura daquele aparelho e preserva a dos outros",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "910003");
		const notifications = new NotificationsManager(tx);
		const phone = device("celular-dela");
		const desktop = device("desktop-dela");

		await notifications.subscribe(lawyer.id, phone);
		await notifications.subscribe(lawyer.id, desktop);

		await new AuthManager(tx).logout({
			context: { lawyer, deviceId: crypto.randomUUID() },
			pushEndpoint: phone.endpoint,
		});

		const remaining = await tx
			.select({ endpoint: pushSubscriptions.endpoint })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.lawyerId, lawyer.id));

		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.endpoint).toBe(desktop.endpoint);
	}),
);

test(
	"o ciclo de alerta grava um disparo por gatilho por dia, mesmo rodando duas vezes",
	withRollback(async (tx) => {
		const lawyer = await subscribed(tx, "910004");
		const caseId = await seedCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "10000000020268260100",
			tribunal: "TJSP",
		});

		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			caseId,
			cnjNumber: "10000000020268260100",
			availableAt: TODAY,
			textPlain: "Intimação para manifestação em cinco dias.",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			caseId,
			title: "Manifestar-se",
			dueAt: TODAY,
		});

		const notifications = new NotificationsManager(tx);

		await notifications.alert({ lawyerId: lawyer.id, day: TODAY });
		await notifications.alert({ lawyerId: lawyer.id, day: TODAY });

		const sends = await tx
			.select({ trigger: notificationSends.trigger })
			.from(notificationSends)
			.where(and(eq(notificationSends.lawyerId, lawyer.id), eq(notificationSends.day, TODAY)));

		expect(sends.map((send) => send.trigger).toSorted()).toEqual(["prazos", "publicacoes"]);
	}),
);

test(
	"publicação que ela já leu não vira alerta",
	withRollback(async (tx) => {
		const lawyer = await subscribed(tx, "910005");
		const caseId = await seedCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "10000000120268260100",
			tribunal: "TJSP",
		});

		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			caseId,
			cnjNumber: "10000000120268260100",
			availableAt: TODAY,
			textPlain: "Intimação lida antes do alerta.",
			readAt: new Date(),
		});

		await new NotificationsManager(tx).alert({ lawyerId: lawyer.id, day: TODAY });

		const sends = await tx
			.select({ trigger: notificationSends.trigger })
			.from(notificationSends)
			.where(eq(notificationSends.lawyerId, lawyer.id));

		expect(sends).toHaveLength(0);
	}),
);

test(
	"prazo que vence em dois dias não entra no alerta",
	withRollback(async (tx) => {
		const lawyer = await subscribed(tx, "910006");

		await seedDeadline(tx, { lawyerId: lawyer.id, title: "Fora da janela", dueAt: "2026-07-29" });

		await new NotificationsManager(tx).alert({ lawyerId: lawyer.id, day: TODAY });

		const sends = await tx
			.select({ trigger: notificationSends.trigger })
			.from(notificationSends)
			.where(eq(notificationSends.lawyerId, lawyer.id));

		expect(sends).toHaveLength(0);
	}),
);

test(
	"prazo de terceiro não compete com o que é dela",
	withRollback(async (tx) => {
		const lawyer = await subscribed(tx, "910007");

		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Perito entrega laudo",
			dueAt: TODAY,
			audience: "terceiro",
		});

		await new NotificationsManager(tx).alert({ lawyerId: lawyer.id, day: TODAY });

		const sends = await tx
			.select({ trigger: notificationSends.trigger })
			.from(notificationSends)
			.where(eq(notificationSends.lawyerId, lawyer.id));

		expect(sends).toHaveLength(0);
	}),
);

test(
	"duas coletas falhadas seguidas viram alerta; uma concluída no meio não",
	withRollback(async (tx) => {
		const failing = await subscribed(tx, "910008");
		const recovered = await subscribed(tx, "910009");

		await tx.insert(syncRuns).values([
			{
				lawyerId: failing.id,
				status: "falhou",
				startedAt: new Date("2026-07-27T09:00:00.000Z"),
			},
			{
				lawyerId: failing.id,
				status: "falhou",
				startedAt: new Date("2026-07-27T16:00:00.000Z"),
			},
			{
				lawyerId: recovered.id,
				status: "falhou",
				startedAt: new Date("2026-07-27T09:00:00.000Z"),
			},
			{
				lawyerId: recovered.id,
				status: "concluida",
				startedAt: new Date("2026-07-27T16:00:00.000Z"),
			},
		]);

		const notifications = new NotificationsManager(tx);

		await notifications.alert({ lawyerId: failing.id, day: TODAY });
		await notifications.alert({ lawyerId: recovered.id, day: TODAY });

		const alerted = await tx
			.select({ lawyerId: notificationSends.lawyerId })
			.from(notificationSends)
			.where(eq(notificationSends.trigger, "coleta_falhou"));

		expect(alerted.map((row) => row.lawyerId)).toEqual([failing.id]);
	}),
);

test(
	"advogado sem aparelho ativo fica fora do ciclo de alerta",
	withRollback(async (tx) => {
		const withDevice = await subscribed(tx, "910010");
		const withoutDevice = await seedLawyer(tx, "910011");

		const targets = await new NotificationsManager(tx).subscribedLawyers();
		const ids = targets.map((target) => target.id);

		expect(ids).toContain(withDevice.id);
		expect(ids).not.toContain(withoutDevice.id);
	}),
);
