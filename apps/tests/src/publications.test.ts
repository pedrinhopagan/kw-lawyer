import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { publicationLinks } from "@kw-lawyer/api/src/db/schema/publication_links.ts";
import { publications } from "@kw-lawyer/api/src/db/schema/publications.ts";
import {
	extractActBody,
	formatCnj,
	summarize,
} from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { publicationsRouter } from "@kw-lawyer/api/src/router/publications.ts";
import { createRouterClient } from "@orpc/server";
import { expect, test } from "bun:test";
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

async function seedCase(tx: Tx, input: { lawyerIds: string[]; cnjNumber: string }) {
	const [row] = await tx
		.insert(cases)
		.values({
			cnjNumber: input.cnjNumber,
			formattedNumber: formatCnj(input.cnjNumber),
			tribunal: "TJSP",
			orgName: "1ª Vara Cível",
			className: "PROCEDIMENTO COMUM CÍVEL",
		})
		.returning({ id: cases.id });

	assertDefined(row);

	await tx
		.insert(caseLawyers)
		.values(input.lawyerIds.map((lawyerId) => ({ caseId: row.id, lawyerId })));

	return row.id;
}

async function seedPublication(
	tx: Tx,
	input: {
		lawyerIds: string[];
		caseId?: string;
		cnjNumber?: string;
		tribunal?: string;
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
			tribunal: input.tribunal ?? "TJSP",
			orgName: "1ª Vara Cível",
			communicationType: "Intimação",
			documentType: "DESPACHO/DECISÃO",
			availableAt: input.availableAt,
			medium: "Diário de Justiça Eletrônico Nacional",
			link: "https://exemplo.jus.br/publicacao",
			textHtml: `<p>${input.textPlain}</p>`,
			textPlain: input.textPlain,
			excerpt: summarize(extractActBody(input.textPlain)),
			raw: { origem: "teste" },
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
	"publications.list devolve só as publicações do advogado, da mais recente para a mais antiga",
	withRollback(async (tx) => {
		const scenario = 9201;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");

		await seedPublication(tx, {
			lawyerIds: [alice.id],
			availableAt: "2026-06-01",
			textPlain: "da alice, antiga",
		});
		await seedPublication(tx, {
			lawyerIds: [alice.id],
			availableAt: "2026-06-20",
			textPlain: "da alice, recente",
		});
		await seedPublication(tx, {
			lawyerIds: [bruno.id],
			availableAt: "2026-06-30",
			textPlain: "só do bruno",
		});

		const aliceClient = createRouterClient(publicationsRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const brunoClient = createRouterClient(publicationsRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		const aliceList = await aliceClient.list({});
		const brunoList = await brunoClient.list({});

		expect(aliceList.total).toBe(2);
		expect(aliceList.unread).toBe(2);
		expect(aliceList.items.map((item) => item.excerpt)).toEqual([
			"da alice, recente",
			"da alice, antiga",
		]);
		expect(aliceList.items.map((item) => item.availableAt)).toEqual(["2026-06-20", "2026-06-01"]);

		expect(brunoList.total).toBe(1);
		expect(brunoList.items.map((item) => item.excerpt)).toEqual(["só do bruno"]);
	}),
);

test(
	"publications.list filtra por não lidas, tribunal e período",
	withRollback(async (tx) => {
		const scenario = 9202;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");

		await seedPublication(tx, {
			lawyerIds: [alice.id],
			availableAt: "2026-01-10",
			textPlain: "lida em janeiro",
			readAt: new Date("2026-01-11T10:00:00Z"),
		});
		await seedPublication(tx, {
			lawyerIds: [alice.id],
			availableAt: "2026-02-10",
			textPlain: "não lida em fevereiro",
		});
		await seedPublication(tx, {
			lawyerIds: [alice.id],
			tribunal: "TRF3",
			availableAt: "2026-03-10",
			textPlain: "não lida no trf3",
		});

		const client = createRouterClient(publicationsRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});

		const unread = await client.list({ onlyUnread: true });

		expect(unread.total).toBe(2);
		expect(unread.unread).toBe(2);
		expect(unread.items.map((item) => item.excerpt)).toEqual([
			"não lida no trf3",
			"não lida em fevereiro",
		]);

		const byTribunal = await client.list({ tribunal: "trf3" });

		expect(byTribunal.total).toBe(1);
		expect(byTribunal.items[0]?.tribunal).toBe("TRF3");

		const byPeriod = await client.list({ from: "2026-01-01", to: "2026-02-28" });

		expect(byPeriod.total).toBe(2);
		expect(byPeriod.unread).toBe(2);
		expect(byPeriod.items.map((item) => item.availableAt)).toEqual(["2026-02-10", "2026-01-10"]);
	}),
);

test(
	"publications.list pagina devolvendo o total inteiro em toda página",
	withRollback(async (tx) => {
		const scenario = 9203;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");

		for (const day of ["2026-04-01", "2026-04-02", "2026-04-03"]) {
			await seedPublication(tx, {
				lawyerIds: [alice.id],
				availableAt: day,
				textPlain: `publicação de ${day}`,
			});
		}

		const client = createRouterClient(publicationsRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});

		const firstPage = await client.list({ limit: 2, offset: 0 });
		const secondPage = await client.list({ limit: 2, offset: 2 });
		const beyond = await client.list({ limit: 2, offset: 10 });

		expect(firstPage.total).toBe(3);
		expect(firstPage.items).toHaveLength(2);
		expect(secondPage.total).toBe(3);
		expect(secondPage.items).toHaveLength(1);
		expect(beyond.total).toBe(3);
		expect(beyond.items).toEqual([]);
		expect(firstPage.items.map((item) => item.availableAt)).toEqual(["2026-04-03", "2026-04-02"]);
		expect(secondPage.items.map((item) => item.availableAt)).toEqual(["2026-04-01"]);
	}),
);

test(
	"publications.list corta o excerto sem devolver o texto integral",
	withRollback(async (tx) => {
		const scenario = 9204;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const textPlain = "palavra ".repeat(120).trim();

		await seedPublication(tx, { lawyerIds: [alice.id], availableAt: "2026-05-05", textPlain });

		const client = createRouterClient(publicationsRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const item = (await client.list({})).items[0];

		assertDefined(item);
		expect(textPlain.length).toBeGreaterThan(300);
		expect(item.excerpt.length).toBeLessThanOrEqual(303);
		expect(item.excerpt.endsWith("...")).toBe(true);
	}),
);

test(
	"publications.list devolve o excerto a partir do teor, não do cabeçalho",
	withRollback(async (tx) => {
		const scenario = 9209;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const textPlain =
			"Processo 1041811-66.2023.8.26.0114 - Procedimento Comum Cível - Alimentos - T.P.A.M. - B.H.M.T. e outro - Encaminhe-se os autos ao Arquivo Definitivo. - ADV: ANA LUISA FERREIRA CAMPOS (OAB 999001/SP)";

		await seedPublication(tx, { lawyerIds: [alice.id], availableAt: "2026-05-06", textPlain });

		const client = createRouterClient(publicationsRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const item = (await client.list({})).items[0];

		assertDefined(item);
		expect(item.excerpt).toBe("Encaminhe-se os autos ao Arquivo Definitivo.");
	}),
);

test(
	"publications.get devolve texto integral e processo, e NOT_FOUND para publicação alheia",
	withRollback(async (tx) => {
		const scenario = 9205;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");
		const cnjNumber = cnjOf(scenario, 1);
		const caseId = await seedCase(tx, { lawyerIds: [alice.id], cnjNumber });

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-06-15",
			textPlain: "intimação integral com todo o teor da decisão",
		});

		const soltaId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			availableAt: "2026-06-16",
			textPlain: "publicação sem processo",
		});

		const aliceClient = createRouterClient(publicationsRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const brunoClient = createRouterClient(publicationsRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		const found = await aliceClient.get({ id: publicationId });

		expect(found.textPlain).toBe("intimação integral com todo o teor da decisão");
		expect(found.textHtml).toContain("<p>");
		expect(found.readAt).toBeNull();
		expect(found.case?.cnjNumber).toBe(cnjNumber);
		expect(found.case?.formattedNumber).toBe(formatCnj(cnjNumber));

		const solta = await aliceClient.get({ id: soltaId });

		expect(solta.case).toBeNull();

		await expectOrpcError(brunoClient.get({ id: publicationId }), "NOT_FOUND");
	}),
);

test(
	"publications.read é idempotente e não mexe no contador do outro advogado",
	withRollback(async (tx) => {
		const scenario = 9206;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");

		const shared = await seedPublication(tx, {
			lawyerIds: [alice.id, bruno.id],
			availableAt: "2026-07-01",
			textPlain: "publicação que os dois recebem",
		});

		await seedPublication(tx, {
			lawyerIds: [alice.id],
			availableAt: "2026-07-02",
			textPlain: "publicação só da alice",
		});

		const aliceClient = createRouterClient(publicationsRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});
		const brunoClient = createRouterClient(publicationsRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		expect((await aliceClient.list({})).unread).toBe(2);
		expect((await brunoClient.list({})).unread).toBe(1);

		expect(await aliceClient.read({ id: shared })).toEqual({ ok: true });

		const firstReadAt = (await aliceClient.get({ id: shared })).readAt;

		assertDefined(firstReadAt);

		expect(await aliceClient.read({ id: shared })).toEqual({ ok: true });

		expect((await aliceClient.get({ id: shared })).readAt).toEqual(firstReadAt);
		expect((await aliceClient.list({})).unread).toBe(1);
		expect((await brunoClient.list({})).unread).toBe(1);
		expect((await brunoClient.get({ id: shared })).readAt).toBeNull();
	}),
);

test(
	"publications.read de publicação alheia devolve NOT_FOUND e não marca nada",
	withRollback(async (tx) => {
		const scenario = 9207;
		const alice = await seedLawyer(tx, scenario, 1, "ALICE");
		const bruno = await seedLawyer(tx, scenario, 2, "BRUNO");

		const daAlice = await seedPublication(tx, {
			lawyerIds: [alice.id],
			availableAt: "2026-07-10",
			textPlain: "publicação da alice",
		});

		const brunoClient = createRouterClient(publicationsRouter, {
			context: { lawyer: bruno, access: true, db: tx },
		});

		await expectOrpcError(brunoClient.read({ id: daAlice }), "NOT_FOUND");

		const aliceClient = createRouterClient(publicationsRouter, {
			context: { lawyer: alice, access: true, db: tx },
		});

		expect((await aliceClient.get({ id: daAlice })).readAt).toBeNull();
		expect((await aliceClient.list({})).unread).toBe(1);
	}),
);
