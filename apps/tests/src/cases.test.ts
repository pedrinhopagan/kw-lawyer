import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { caseParties } from "@kw-lawyer/api/src/db/schema/case_parties.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { publicationLinks } from "@kw-lawyer/api/src/db/schema/publication_links.ts";
import { publications } from "@kw-lawyer/api/src/db/schema/publications.ts";
import {
	extractActBody,
	formatCnj,
	summarize,
} from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { casesRouter } from "@kw-lawyer/api/src/router/cases.ts";
import { createRouterClient } from "@orpc/server";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";

function cnjOf(scenario: number, index: number) {
	return `${`${scenario}${index}`.padStart(7, "0")}8520258260114`;
}

async function seedLawyer(tx: Tx, scenario: number, slot: number, name: string) {
	const [lawyer] = await tx
		.insert(lawyers)
		.values({ name, oabNumber: `${scenario}0${slot}`, oabUf: "SP" })
		.returning({
			id: lawyers.id,
			name: lawyers.name,
			oabNumber: lawyers.oabNumber,
			oabUf: lawyers.oabUf,
		});

	assertDefined(lawyer);

	return lawyer;
}

async function seedCase(
	tx: Tx,
	input: {
		lawyerIds: string[];
		cnjNumber: string;
		tribunal?: string;
		lastMovementAt?: Date;
		parties?: { name: string; polo: string }[];
	},
) {
	const [row] = await tx
		.insert(cases)
		.values({
			cnjNumber: input.cnjNumber,
			formattedNumber: formatCnj(input.cnjNumber),
			tribunal: input.tribunal ?? "TJSP",
			orgName: "1ª Vara Cível",
			className: "PROCEDIMENTO COMUM CÍVEL",
			classCode: "7",
			lastMovementAt: input.lastMovementAt,
		})
		.returning({ id: cases.id });

	assertDefined(row);

	await tx
		.insert(caseLawyers)
		.values(input.lawyerIds.map((lawyerId) => ({ caseId: row.id, lawyerId })));

	if (input.parties?.length) {
		await tx
			.insert(caseParties)
			.values(input.parties.map((party) => ({ caseId: row.id, ...party })));
	}

	return row.id;
}

async function seedPublication(
	tx: Tx,
	input: {
		lawyerIds: string[];
		caseId: string;
		cnjNumber: string;
		availableAt: string;
		textPlain: string;
		readAt?: Date;
	},
) {
	const [row] = await tx
		.insert(publications)
		.values({
			externalId: crypto.randomUUID(),
			contentHash: crypto.randomUUID(),
			caseId: input.caseId,
			cnjNumber: input.cnjNumber,
			tribunal: "TJSP",
			orgName: "1ª Vara Cível",
			communicationType: "Intimação",
			documentType: "DESPACHO/DECISÃO",
			availableAt: input.availableAt,
			medium: "Diário de Justiça Eletrônico Nacional",
			link: "https://exemplo.jus.br/publicacao",
			textHtml: `<p>${input.textPlain}</p>`,
			textPlain: input.textPlain,
			excerpt: summarize(extractActBody(input.textPlain)),
			raw: {},
		})
		.returning({ id: publications.id });

	assertDefined(row);

	await tx.insert(publicationLinks).values(
		input.lawyerIds.map((lawyerId) => ({
			publicationId: row.id,
			lawyerId,
			readAt: input.readAt,
		})),
	);

	return row.id;
}

test(
	"cases.list devolve só os processos vinculados ao advogado da sessão",
	withRollback(async (tx) => {
		const scenario = 9101;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");

		await seedCase(tx, { lawyerIds: [alice.id], cnjNumber: cnjOf(scenario, 1) });
		await seedCase(tx, { lawyerIds: [alice.id], cnjNumber: cnjOf(scenario, 2) });
		await seedCase(tx, { lawyerIds: [bruno.id], cnjNumber: cnjOf(scenario, 3) });

		const aliceClient = createRouterClient(casesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const brunoClient = createRouterClient(casesRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		const aliceList = await aliceClient.list({});
		const brunoList = await brunoClient.list({});

		expect(aliceList.total).toBe(2);
		expect(aliceList.items.map((item) => item.cnjNumber).toSorted()).toEqual([
			cnjOf(scenario, 1),
			cnjOf(scenario, 2),
		]);

		expect(brunoList.total).toBe(1);
		expect(brunoList.items.map((item) => item.cnjNumber)).toEqual([cnjOf(scenario, 3)]);
	}),
);

test(
	"cases.get de processo alheio devolve NOT_FOUND em vez de FORBIDDEN",
	withRollback(async (tx) => {
		const scenario = 9102;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");
		const cnjNumber = cnjOf(scenario, 1);

		await seedCase(tx, { lawyerIds: [bruno.id], cnjNumber });

		const aliceClient = createRouterClient(casesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const brunoClient = createRouterClient(casesRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		await expectOrpcError(aliceClient.get({ cnjNumber }), "NOT_FOUND");

		const visible = await brunoClient.get({ cnjNumber });

		expect(visible.case.cnjNumber).toBe(cnjNumber);
	}),
);

test(
	"cases.list acha o processo com e sem máscara e nunca o de outro advogado",
	withRollback(async (tx) => {
		const scenario = 9103;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");
		const cnjNumber = cnjOf(scenario, 1);

		await seedCase(tx, { lawyerIds: [alice.id], cnjNumber });
		await seedCase(tx, { lawyerIds: [bruno.id], cnjNumber: cnjOf(scenario, 2) });

		const aliceClient = createRouterClient(casesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const brunoClient = createRouterClient(casesRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		const masked = await aliceClient.list({ search: formatCnj(cnjNumber) });
		const plain = await aliceClient.list({ search: cnjNumber });
		const partial = await aliceClient.list({ search: cnjNumber.slice(0, 7) });

		expect(masked.items.map((item) => item.id)).toEqual(plain.items.map((item) => item.id));
		expect(partial.items.map((item) => item.id)).toEqual(plain.items.map((item) => item.id));
		expect(plain.total).toBe(1);
		expect(plain.items[0]?.formattedNumber).toBe(formatCnj(cnjNumber));

		const foreign = await brunoClient.list({ search: formatCnj(cnjNumber) });

		expect(foreign.total).toBe(0);
		expect(foreign.items).toEqual([]);
	}),
);

test(
	"cases.list busca por nome de parte dentro do escopo do advogado",
	withRollback(async (tx) => {
		const scenario = 9104;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");

		await seedCase(tx, {
			lawyerIds: [alice.id],
			cnjNumber: cnjOf(scenario, 1),
			parties: [{ name: "JOANA PEREIRA MENDES", polo: "A" }],
		});
		await seedCase(tx, {
			lawyerIds: [alice.id],
			cnjNumber: cnjOf(scenario, 2),
			parties: [{ name: "OUTRA PESSOA", polo: "P" }],
		});
		await seedCase(tx, {
			lawyerIds: [bruno.id],
			cnjNumber: cnjOf(scenario, 3),
			parties: [{ name: "JOANA PEREIRA MENDES", polo: "A" }],
		});

		const aliceClient = createRouterClient(casesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const brunoClient = createRouterClient(casesRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		const found = await aliceClient.list({ search: "joana pereira" });

		expect(found.total).toBe(1);
		expect(found.items[0]?.cnjNumber).toBe(cnjOf(scenario, 1));

		const fromBruno = await brunoClient.list({ search: "joana pereira" });

		expect(fromBruno.items.map((item) => item.cnjNumber)).toEqual([cnjOf(scenario, 3)]);
	}),
);

test(
	"cases.list pagina mantendo o total e o filtro por tribunal",
	withRollback(async (tx) => {
		const scenario = 9105;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");

		await seedCase(tx, {
			lawyerIds: [alice.id],
			cnjNumber: cnjOf(scenario, 1),
			lastMovementAt: new Date("2026-03-01T12:00:00Z"),
		});
		await seedCase(tx, {
			lawyerIds: [alice.id],
			cnjNumber: cnjOf(scenario, 2),
			lastMovementAt: new Date("2026-02-01T12:00:00Z"),
		});
		await seedCase(tx, {
			lawyerIds: [alice.id],
			cnjNumber: cnjOf(scenario, 3),
			tribunal: "TRF3",
			lastMovementAt: new Date("2026-01-01T12:00:00Z"),
		});

		const client = createRouterClient(casesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});

		const firstPage = await client.list({ limit: 2, offset: 0 });
		const secondPage = await client.list({ limit: 2, offset: 2 });

		expect(firstPage.total).toBe(3);
		expect(secondPage.total).toBe(3);
		expect(firstPage.items.map((item) => item.cnjNumber)).toEqual([
			cnjOf(scenario, 1),
			cnjOf(scenario, 2),
		]);
		expect(secondPage.items.map((item) => item.cnjNumber)).toEqual([cnjOf(scenario, 3)]);

		const byTribunal = await client.list({ tribunal: "trf3" });

		expect(byTribunal.total).toBe(1);
		expect(byTribunal.items[0]?.cnjNumber).toBe(cnjOf(scenario, 3));
	}),
);

test(
	"cases.list traz a última movimentação e as não lidas só do advogado da sessão",
	withRollback(async (tx) => {
		const scenario = 9106;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");
		const cnjNumber = cnjOf(scenario, 1);

		const caseId = await seedCase(tx, {
			lawyerIds: [alice.id, bruno.id],
			cnjNumber,
			lastMovementAt: new Date("2026-06-10T12:00:00Z"),
		});

		const readPublication = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-06-01",
			textPlain: "publicação já lida pela Alice",
			readAt: new Date("2026-06-02T10:00:00Z"),
		});

		const unreadPublication = await seedPublication(tx, {
			lawyerIds: [alice.id, bruno.id],
			caseId,
			cnjNumber,
			availableAt: "2026-06-10",
			textPlain: "publicação nova para os dois",
		});

		await tx.insert(movements).values([
			{
				caseId,
				publicationId: readPublication,
				occurredAt: new Date("2026-06-01T00:00:00Z"),
				type: "Intimação",
				summary: "movimento antigo",
			},
			{
				caseId,
				publicationId: unreadPublication,
				occurredAt: new Date("2026-06-10T00:00:00Z"),
				type: "Intimação",
				summary: "movimento recente",
			},
		]);

		const aliceClient = createRouterClient(casesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const brunoClient = createRouterClient(casesRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		const aliceItem = (await aliceClient.list({})).items[0];
		const brunoItem = (await brunoClient.list({})).items[0];

		assertDefined(aliceItem);
		assertDefined(brunoItem);

		expect(aliceItem.lastMovement?.summary).toBe("movimento recente");
		expect(aliceItem.lastMovement?.source).toBe("publication");
		expect(aliceItem.unreadCount).toBe(1);
		expect(brunoItem.unreadCount).toBe(1);
	}),
);

test(
	"cases.get funde publicação e DataJud numa timeline ordenada por data desc",
	withRollback(async (tx) => {
		const scenario = 9107;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");
		const cnjNumber = cnjOf(scenario, 1);

		const caseId = await seedCase(tx, {
			lawyerIds: [alice.id, bruno.id],
			cnjNumber,
			parties: [
				{ name: "JOANA PEREIRA MENDES", polo: "A" },
				{ name: "CONSTRUTORA XYZ LTDA", polo: "P" },
			],
		});

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id, bruno.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-01",
			textPlain: "intimação para manifestação em cinco dias",
		});

		await tx.insert(movements).values([
			{
				caseId,
				publicationId,
				occurredAt: new Date("2026-05-01T00:00:00Z"),
				type: "Intimação",
				summary: "intimação para manifestação em cinco dias",
			},
			{
				caseId,
				occurredAt: new Date("2026-06-01T00:00:00Z"),
				type: "Documento",
				summary: "Documento juntado aos autos",
				source: "datajud",
			},
			{
				caseId,
				occurredAt: new Date("2026-04-01T00:00:00Z"),
				type: "Conclusão",
				summary: "Conclusos para despacho",
				source: "datajud",
			},
		]);

		await tx
			.update(publicationLinks)
			.set({ readAt: new Date("2026-05-02T10:00:00Z") })
			.where(
				and(
					eq(publicationLinks.publicationId, publicationId),
					eq(publicationLinks.lawyerId, alice.id),
				),
			);

		const client = createRouterClient(casesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const result = await client.get({ cnjNumber: formatCnj(cnjNumber) });

		expect(result.case.cnjNumber).toBe(cnjNumber);
		expect(result.parties.map((party) => party.name)).toEqual([
			"JOANA PEREIRA MENDES",
			"CONSTRUTORA XYZ LTDA",
		]);

		expect(result.timeline.map((item) => item.source)).toEqual([
			"datajud",
			"publication",
			"datajud",
		]);
		expect(result.timeline.map((item) => item.occurredAt.toISOString())).toEqual([
			"2026-06-01T00:00:00.000Z",
			"2026-05-01T00:00:00.000Z",
			"2026-04-01T00:00:00.000Z",
		]);

		const [first, second] = result.timeline;

		assertDefined(first);
		assertDefined(second);

		if (first.source !== "datajud") {
			throw new Error("primeiro item deveria vir do DataJud");
		}

		expect(first.name).toBe("Documento");

		if (second.source !== "publication") {
			throw new Error("segundo item deveria vir de publicação");
		}

		expect(second.publication.textPlain).toContain("intimação para manifestação");
		expect(second.publication).not.toHaveProperty("textHtml");
		expect(second.publication.link).toBe("https://exemplo.jus.br/publicacao");
		expect(second.publication.readAt).toEqual(new Date("2026-05-02T10:00:00Z"));

		const brunoClient = createRouterClient(casesRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});
		const fromBruno = await brunoClient.get({ cnjNumber });
		const brunoSecond = fromBruno.timeline[1];

		assertDefined(brunoSecond);

		if (brunoSecond.source !== "publication") {
			throw new Error("segundo item deveria vir de publicação");
		}

		expect(brunoSecond.publication.readAt).toBeNull();
	}),
);

test(
	"cases.get devolve o teor do ato no excerpt da timeline, não o cabeçalho do DJEN",
	withRollback(async (tx) => {
		const scenario = 9108;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const cnjNumber = cnjOf(scenario, 1);
		const textPlain =
			"Processo 1000343-10.2023.8.26.0022 - Procedimento Comum Cível - Direito de Vizinhança - Jose Carlos Vallone - - Patricia Martorano Vallone - Maria Leticia Oliveira Lima - Vistos. Cumpra-se o v. Acórdão. Ciência às partes acerca da decisão final proferida.";

		const caseId = await seedCase(tx, { lawyerIds: [alice.id], cnjNumber });

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-01",
			textPlain,
		});

		await tx.insert(movements).values({
			caseId,
			publicationId,
			occurredAt: new Date("2026-05-01T00:00:00Z"),
			type: "Intimação",
			summary: summarize(extractActBody(textPlain)),
		});

		const client = createRouterClient(casesRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const [item] = (await client.get({ cnjNumber })).timeline;

		assertDefined(item);

		if (item.source !== "publication") {
			throw new Error("o item deveria vir de publicação");
		}

		expect(item.publication.excerpt).toBe(
			"Vistos. Cumpra-se o v. Acórdão. Ciência às partes acerca da decisão final proferida.",
		);
		expect(item.publication.excerpt).not.toContain("Jose Carlos Vallone");
		expect(item.publication.textPlain).toBe(textPlain);
		expect(item.summary).toBe(item.publication.excerpt);
	}),
);
