import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import { deadlines } from "@kw-lawyer/api/src/db/schema/deadlines.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { publicationLinks } from "@kw-lawyer/api/src/db/schema/publication_links.ts";
import { publications } from "@kw-lawyer/api/src/db/schema/publications.ts";
import { CLOSED_STATUSES, OPEN_STATUSES } from "@kw-lawyer/api/src/features/deadlines/filters.ts";
import { DeadlineManager } from "@kw-lawyer/api/src/features/deadlines/manager.ts";
import {
	extractActBody,
	formatCnj,
	summarize,
} from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { deadlinesRouter } from "@kw-lawyer/api/src/router/deadlines.ts";
import { createRouterClient } from "@orpc/server";
import { expect, test } from "bun:test";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";

async function seedLawyer(tx: Tx, scenario: number, slot: number) {
	const [lawyer] = await tx
		.insert(lawyers)
		.values({ name: `ADVOGADO ${slot}`, oabNumber: `${scenario}0${slot}`, oabUf: "SP" })
		.returning({
			id: lawyers.id,
			name: lawyers.name,
			oabNumber: lawyers.oabNumber,
			oabUf: lawyers.oabUf,
		});

	assertDefined(lawyer);

	return lawyer;
}

async function seedCase(tx: Tx, lawyerId: string, cnjNumber: string) {
	const [row] = await tx
		.insert(cases)
		.values({
			cnjNumber,
			formattedNumber: formatCnj(cnjNumber),
			tribunal: "TJSP",
			orgName: "1ª Vara Cível",
		})
		.returning({ id: cases.id });

	assertDefined(row);

	await tx.insert(caseLawyers).values({ caseId: row.id, lawyerId });

	return row.id;
}

async function seedPublication(
	tx: Tx,
	input: { lawyerIds: string[]; caseId?: string; availableAt: string; textPlain: string },
) {
	const [row] = await tx
		.insert(publications)
		.values({
			externalId: crypto.randomUUID(),
			contentHash: crypto.randomUUID(),
			caseId: input.caseId,
			tribunal: "TJSP",
			orgName: "1ª Vara Cível",
			communicationType: "Intimação",
			documentType: "DESPACHO/DECISÃO",
			availableAt: input.availableAt,
			medium: "Diário de Justiça Eletrônico Nacional",
			textHtml: `<p>${input.textPlain}</p>`,
			textPlain: input.textPlain,
			excerpt: summarize(extractActBody(input.textPlain)),
			raw: { origem: "teste" },
		})
		.returning({ id: publications.id });

	assertDefined(row);

	await tx
		.insert(publicationLinks)
		.values(input.lawyerIds.map((lawyerId) => ({ publicationId: row.id, lawyerId })));

	return row.id;
}

test(
	"o scan transforma a publicação em prazo calculado e não duplica ao rodar de novo",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, 7301, 1);
		const caseId = await seedCase(tx, lawyer.id, "40117908520258260114");

		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			caseId,
			availableAt: "2026-07-24",
			textPlain:
				"Intime-se a parte autora para, no prazo de 15 (quinze) dias, apresentar contrarrazões.",
		});

		const manager = new DeadlineManager(tx);
		const first = await manager.scan({});

		expect(first.created).toBe(1);

		const second = await manager.scan({});

		expect(second.scanned).toBe(0);
		expect(second.created).toBe(0);

		const rows = await tx.select().from(deadlines);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.dueAt).toBe("2026-08-17");
		expect(rows[0]?.publishedAt).toBe("2026-07-27");
		expect(rows[0]?.startsAt).toBe("2026-07-28");
		expect(rows[0]?.status).toBe("a_confirmar");
		expect(rows[0]?.calculation?.steps.filter((step) => step.counted)).toHaveLength(15);
	}),
);

test(
	"cada advogado ligado à publicação ganha o próprio prazo",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, 7302, 1);
		const bruno = await seedLawyer(tx, 7302, 2);

		await seedPublication(tx, {
			lawyerIds: [alice.id, bruno.id],
			availableAt: "2026-07-24",
			textPlain: "Manifestem-se as partes no prazo de 5 (cinco) dias.",
		});

		await new DeadlineManager(tx).scan({});

		const rows = await tx.select({ lawyerId: deadlines.lawyerId }).from(deadlines);

		expect(rows.map((row) => row.lawyerId).sort()).toEqual([alice.id, bruno.id].sort());
	}),
);

test(
	"a agenda de um advogado nunca mostra prazo de outro",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, 7303, 1);
		const bruno = await seedLawyer(tx, 7303, 2);

		await seedPublication(tx, {
			lawyerIds: [alice.id],
			availableAt: "2026-07-24",
			textPlain: "Intime-se o exequente para, no prazo de 5 (cinco) dias, requerer o que entender.",
		});
		await new DeadlineManager(tx).scan({});

		const brunoClient = createRouterClient(deadlinesRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});
		const brunoAgenda = await brunoClient.list({});

		expect(brunoAgenda.total).toBe(0);

		const aliceClient = createRouterClient(deadlinesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const aliceAgenda = await aliceClient.list({});

		expect(aliceAgenda.total).toBe(1);
		await expectOrpcError(brunoClient.get({ id: aliceAgenda.items[0]?.id ?? "" }), "NOT_FOUND");
	}),
);

test(
	"confirmar, cumprir e descartar movem o prazo sem apagar o cálculo",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, 7304, 1);

		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			availableAt: "2026-07-24",
			textPlain: "Manifestem-se as partes no prazo de 5 (cinco) dias.",
		});
		await new DeadlineManager(tx).scan({});

		const client = createRouterClient(deadlinesRouter, {
			context: { lawyer, access: true, db: tx },
		});
		const agenda = await client.list({});
		const id = agenda.items[0]?.id ?? "";

		await client.confirm({ id });
		expect((await client.get({ id })).status).toBe("confirmado");

		await client.complete({ id });

		const done = await client.get({ id });

		expect(done.status).toBe("cumprido");
		expect(done.calculation?.dueAt).toBe(done.dueAt);

		await client.dismiss({ id });
		expect((await client.get({ id })).status).toBe("descartado");
	}),
);

test(
	"reprocessar com motor novo não mexe em prazo já confirmado",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, 7305, 1);

		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			availableAt: "2026-07-24",
			textPlain: "Manifestem-se as partes no prazo de 5 (cinco) dias.",
		});

		const manager = new DeadlineManager(tx);

		await manager.scan({});

		const client = createRouterClient(deadlinesRouter, {
			context: { lawyer, access: true, db: tx },
		});
		const agenda = await client.list({});
		const id = agenda.items[0]?.id ?? "";

		await client.reschedule({ id, dueAt: "2026-08-10", note: "confirmei no cartório" });

		const rescan = await manager.scan({ force: true });

		expect(rescan).toMatchObject({ updated: 0, created: 0 });

		const kept = await client.get({ id });

		expect(kept.dueAt).toBe("2026-08-10");
		expect(kept.origin).toBe("automatico");
		expect(kept.note).toBe("confirmei no cartório");
		expect((await client.list({ status: [...OPEN_STATUSES, ...CLOSED_STATUSES] })).total).toBe(1);
	}),
);

test(
	"publicação sem prazo detectado vai para a triagem em vez de sumir",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, 7306, 1);

		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			availableAt: "2026-07-24",
			textPlain: "Vistos. Homologo o acordo e julgo extinto o processo.",
		});
		await new DeadlineManager(tx).scan({});

		const client = createRouterClient(deadlinesRouter, {
			context: { lawyer, access: true, db: tx },
		});
		const triage = await client.triage({});

		expect(triage.total).toBe(1);
		expect(triage.items[0]?.reviewReasons.length).toBeGreaterThan(0);

		const summary = await client.summary({ today: "2026-07-25" });

		expect(summary.pendingReview).toBe(1);
	}),
);

test(
	"o resumo separa atrasado, hoje e próximos sete dias",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, 7307, 1);
		const client = createRouterClient(deadlinesRouter, {
			context: { lawyer, access: true, db: tx },
		});

		await client.create({ title: "Atrasado", dueAt: "2026-07-20" });
		await client.create({ title: "Hoje", dueAt: "2026-07-25" });
		await client.create({ title: "Semana", dueAt: "2026-07-29" });
		await client.create({ title: "Depois", dueAt: "2026-09-01" });

		const summary = await client.summary({ today: "2026-07-25" });

		expect(summary.overdue).toBe(1);
		expect(summary.today).toBe(1);
		expect(summary.next7).toBe(1);
	}),
);

test(
	"prazo de terceiro entra na agenda como baixa confiança, não como prazo do advogado",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, 7308, 1);

		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			availableAt: "2026-07-24",
			textPlain: "Fixo o prazo de 60 dias para que o perito contábil apresente o laudo.",
		});
		await new DeadlineManager(tx).scan({});

		const client = createRouterClient(deadlinesRouter, {
			context: { lawyer, access: true, db: tx },
		});
		const agenda = await client.list({});

		expect(agenda.items[0]?.confidence).toBe("baixa");
		expect(agenda.items[0]?.audience).toBe("terceiro");
		expect(agenda.items[0]?.status).toBe("a_confirmar");
	}),
);
