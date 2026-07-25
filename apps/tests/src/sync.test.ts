import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { caseParties } from "@kw-lawyer/api/src/db/schema/case_parties.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { publicationLinks } from "@kw-lawyer/api/src/db/schema/publication_links.ts";
import { publications } from "@kw-lawyer/api/src/db/schema/publications.ts";
import { syncRuns } from "@kw-lawyer/api/src/db/schema/sync_runs.ts";
import type { DatajudClient } from "@kw-lawyer/api/src/features/datajud/client.ts";
import type { DjenClient } from "@kw-lawyer/api/src/features/djen/client.ts";
import type { DjenItem } from "@kw-lawyer/api/src/features/djen/types.ts";
import { SyncManager } from "@kw-lawyer/api/src/features/sync/manager.ts";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assertDefined } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";

type DjenSource = Pick<DjenClient, "fetchAll">;
type DatajudSource = Pick<DatajudClient, "findCase">;
type DatajudResult = Awaited<ReturnType<DatajudSource["findCase"]>>;

const CNJ_A = "40117908520258260114";
const CNJ_B = "10025874520248260100";

const PUBLICATION_HTML = `<html><body>
	<p><b>Procedimento Comum C&iacute;vel N&ordm; 4011790-85.2025.8.26.0114/SP</b></p>
	<p>AUTOR: JOANA PEREIRA MENDES</p>
	<p>ADVOGADO(A): ANA LUISA FERREIRA CAMPOS (OAB SP999001)</p>
	<p>Manifeste-se a parte autora sobre a decis&atilde;o, sob pena de extin&ccedil;&atilde;o do processo.</p>
</body></html>`;

function djenItem(overrides: Partial<DjenItem> & { id: number }): DjenItem {
	return {
		data_disponibilizacao: "2026-07-24",
		texto: PUBLICATION_HTML,
		siglaTribunal: "TJSP",
		tipoComunicacao: "Intimação",
		nomeOrgao: "UPJ da 1ª a 4ª Varas Civeis - Regional de Vila Mimosa",
		idOrgao: 104229,
		numero_processo: CNJ_A,
		numeroprocessocommascara: "4011790-85.2025.8.26.0114",
		meio: "D",
		meiocompleto: "Diário de Justiça Eletrônico Nacional",
		link: "https://comunica.pje.jus.br/consulta",
		tipoDocumento: "DESPACHO/DECISÃO",
		nomeClasse: "PROCEDIMENTO COMUM CíVEL",
		codigoClasse: "7",
		numeroComunicacao: 223764,
		ativo: true,
		hash: "e9MjpmE6nOs9JAJHlTlPJEwZqrnD41",
		status: "P",
		motivo_cancelamento: null,
		data_cancelamento: null,
		destinatarios: [{ nome: "JOANA PEREIRA MENDES", polo: "A" }],
		destinatarioadvogados: [
			{
				advogado: {
					id: 1081698,
					nome: "ANA LUISA FERREIRA CAMPOS",
					numero_oab: "999001",
					uf_oab: "SP",
				},
			},
		],
		...overrides,
	};
}

function djenSource(pages: { items: DjenItem[]; invalid?: number }[]): DjenSource {
	const count = pages.reduce((total, page) => total + page.items.length + (page.invalid ?? 0), 0);

	return {
		fetchAll: async (_params, onPage) => {
			let total = 0;
			let invalid = 0;

			for (const [index, page] of pages.entries()) {
				const pageInvalid = page.invalid ?? 0;

				await onPage({ page: index + 1, count, items: page.items, invalid: pageInvalid });

				total += page.items.length;
				invalid += pageInvalid;
			}

			return { total, invalid };
		},
	};
}

function datajudCase(overrides: {
	movements?: { code: number; name: string; occurredAt: Date }[];
}) {
	return {
		className: "Procedimento Comum Cível",
		classCode: "7",
		grau: "G1",
		orgJudgingName: "Juízo Titular I - 2ª Vara Civel - Regional de Vila Mimosa",
		orgJudgingCode: "9450",
		subjects: [{ codigo: 4703, nome: "Defeito, nulidade ou anulação" }],
		systemName: "Projudi",
		filedAt: new Date("2025-10-02T12:19:45.000Z"),
		secrecyLevel: 0,
		movements: (
			overrides.movements ?? [
				{ code: 581, name: "Documento", occurredAt: new Date("2026-04-10T13:35:43.000Z") },
				{ code: 51, name: "Decurso de Prazo", occurredAt: new Date("2026-05-02T09:12:00.000Z") },
			]
		).map((movement) => ({ ...movement, complements: [] })),
	};
}

function datajudSource(byCnj: Record<string, () => DatajudResult>): DatajudSource {
	return {
		findCase: (params) => {
			const entry = byCnj[params.cnjNumber];

			if (!entry) {
				return Promise.resolve({ status: "sem_registro" as const });
			}

			return Promise.resolve(entry());
		},
	};
}

const DATAJUD_EMPTY = datajudSource({});

async function createLawyer(tx: Tx, oabNumber: string) {
	const [lawyer] = await tx
		.insert(lawyers)
		.values({ name: "ANA LUISA FERREIRA CAMPOS", oabNumber, oabUf: "SP" })
		.returning({ id: lawyers.id });

	assertDefined(lawyer);

	return lawyer.id;
}

async function sync(
	tx: Tx,
	lawyerId: string,
	djen: DjenSource,
	datajud: DatajudSource,
	force = false,
) {
	const manager = new SyncManager(tx, djen, datajud);
	const { runId } = await manager.start(lawyerId);

	return await manager.syncLawyer(lawyerId, { runId, force });
}

async function counts(tx: Tx, lawyerId: string) {
	const caseRows = await tx
		.select({ id: cases.id })
		.from(cases)
		.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
		.where(eq(caseLawyers.lawyerId, lawyerId));

	const linkRows = await tx
		.select({ id: publicationLinks.id })
		.from(publicationLinks)
		.where(eq(publicationLinks.lawyerId, lawyerId));

	const publicationRows = await tx
		.select({ id: publications.id })
		.from(publications)
		.innerJoin(publicationLinks, eq(publicationLinks.publicationId, publications.id))
		.where(eq(publicationLinks.lawyerId, lawyerId));

	const movementRows = await tx
		.select({ id: movements.id })
		.from(movements)
		.innerJoin(caseLawyers, eq(caseLawyers.caseId, movements.caseId))
		.where(eq(caseLawyers.lawyerId, lawyerId));

	const partyRows = await tx
		.select({ id: caseParties.id })
		.from(caseParties)
		.innerJoin(caseLawyers, eq(caseLawyers.caseId, caseParties.caseId))
		.where(eq(caseLawyers.lawyerId, lawyerId));

	return {
		cases: caseRows.length,
		publications: publicationRows.length,
		links: linkRows.length,
		movements: movementRows.length,
		parties: partyRows.length,
	};
}

test(
	"sincronizar duas vezes o mesmo lote deixa o banco idêntico",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910001");
		const djen = djenSource([
			{ items: [djenItem({ id: 678173456 }), djenItem({ id: 678173457, texto: "<p>Outra</p>" })] },
		]);

		const first = await sync(tx, lawyerId, djen, DATAJUD_EMPTY);
		const afterFirst = await counts(tx, lawyerId);

		const second = await sync(tx, lawyerId, djen, DATAJUD_EMPTY);
		const afterSecond = await counts(tx, lawyerId);

		expect(afterFirst).toEqual({
			cases: 1,
			publications: 2,
			links: 2,
			movements: 2,
			parties: 1,
		});
		expect(afterSecond).toEqual(afterFirst);

		expect(first.status).toBe("concluida");
		expect(first.fetched).toBe(2);
		expect(first.created).toBe(2);
		expect(first.duplicated).toBe(0);
		expect(first.casesCreated).toBe(1);

		expect(second.status).toBe("concluida");
		expect(second.fetched).toBe(2);
		expect(second.created).toBe(0);
		expect(second.duplicated).toBe(2);
		expect(second.casesCreated).toBe(0);
	}),
);

test(
	"publicação sem número de processo entra sem processo e sem andamento",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910002");

		const djen = djenSource([
			{
				items: [djenItem({ id: 678173458, numero_processo: null, numeroprocessocommascara: null })],
			},
		]);

		const result = await sync(tx, lawyerId, djen, DATAJUD_EMPTY);

		expect(result.status).toBe("concluida");
		expect(await counts(tx, lawyerId)).toEqual({
			cases: 0,
			publications: 1,
			links: 1,
			movements: 0,
			parties: 0,
		});

		const [publication] = await tx
			.select({ caseId: publications.caseId, cnjNumber: publications.cnjNumber })
			.from(publications)
			.where(eq(publications.externalId, "678173458"));

		assertDefined(publication);
		expect(publication.caseId).toBeNull();
		expect(publication.cnjNumber).toBeNull();
	}),
);

test(
	"duas publicações com o mesmo texto e ids diferentes entram as duas",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910003");

		const djen = djenSource([
			{ items: [djenItem({ id: 678173459 }), djenItem({ id: 678173460 })] },
		]);

		const result = await sync(tx, lawyerId, djen, DATAJUD_EMPTY);

		expect(result.created).toBe(2);
		expect(result.duplicated).toBe(0);

		const rows = await tx
			.select({ externalId: publications.externalId, contentHash: publications.contentHash })
			.from(publications)
			.innerJoin(publicationLinks, eq(publicationLinks.publicationId, publications.id))
			.where(eq(publicationLinks.lawyerId, lawyerId));

		expect(rows).toHaveLength(2);
		expect(new Set(rows.map((row) => row.externalId))).toEqual(new Set(["678173459", "678173460"]));
		expect(new Set(rows.map((row) => row.contentHash)).size).toBe(1);
	}),
);

test(
	"o excerto da publicação e o resumo do andamento guardam o teor, não o cabeçalho",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910009");

		const djen = djenSource([
			{
				items: [
					djenItem({ id: 678173490 }),
					djenItem({ id: 678173491, texto: "<p>&nbsp;</p>", numero_processo: null }),
				],
			},
		]);

		await sync(tx, lawyerId, djen, DATAJUD_EMPTY);

		const [publication] = await tx
			.select({ excerpt: publications.excerpt, textPlain: publications.textPlain })
			.from(publications)
			.where(eq(publications.externalId, "678173490"));

		assertDefined(publication);
		expect(publication.excerpt).toBe(
			"Manifeste-se a parte autora sobre a decisão, sob pena de extinção do processo.",
		);
		expect(publication.textPlain).toContain("AUTOR: JOANA PEREIRA MENDES");

		const [movement] = await tx
			.select({ summary: movements.summary })
			.from(movements)
			.innerJoin(publications, eq(publications.id, movements.publicationId))
			.where(eq(publications.externalId, "678173490"));

		assertDefined(movement);
		expect(movement.summary).toBe(publication.excerpt);

		const [semTexto] = await tx
			.select({ excerpt: publications.excerpt })
			.from(publications)
			.where(eq(publications.externalId, "678173491"));

		assertDefined(semTexto);
		expect(semTexto.excerpt).toBe("Intimação");
	}),
);

test(
	"enriquecimento do DataJud cria andamentos e reexecutar não duplica",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910004");
		const djen = djenSource([{ items: [djenItem({ id: 678173461 })] }]);
		const datajud = datajudSource({
			[CNJ_A]: () => ({ status: "ok" as const, case: datajudCase({}) }),
		});

		const first = await sync(tx, lawyerId, djen, datajud);

		expect(first.status).toBe("concluida");
		expect(first.casesEnriched).toBe(1);
		expect(first.movementsCreated).toBe(2);
		expect((await counts(tx, lawyerId)).movements).toBe(3);

		const [enriched] = await tx
			.select({
				grau: cases.grau,
				systemName: cases.systemName,
				datajudStatus: cases.datajudStatus,
			})
			.from(cases)
			.where(eq(cases.cnjNumber, CNJ_A));

		assertDefined(enriched);
		expect(enriched.grau).toBe("G1");
		expect(enriched.systemName).toBe("Projudi");
		expect(enriched.datajudStatus).toBe("ok");

		const skipped = await sync(tx, lawyerId, djen, datajud);

		expect(skipped.casesEnriched).toBe(0);
		expect(skipped.movementsCreated).toBe(0);

		const forced = await sync(tx, lawyerId, djen, datajud, true);

		expect(forced.casesEnriched).toBe(1);
		expect(forced.movementsCreated).toBe(0);
		expect((await counts(tx, lawyerId)).movements).toBe(3);
	}),
);

test(
	"tribunal sem alias marca tribunal_nao_suportado sem derrubar o run",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910005");
		const djen = djenSource([{ items: [djenItem({ id: 678173462, siglaTribunal: "TJZZ" })] }]);
		const datajud = datajudSource({
			[CNJ_A]: () => ({ status: "tribunal_nao_suportado" as const }),
		});

		const result = await sync(tx, lawyerId, djen, datajud);

		expect(result.status).toBe("concluida");
		expect(result.casesEnriched).toBe(0);
		expect(result.movementsCreated).toBe(0);

		const [row] = await tx
			.select({ datajudStatus: cases.datajudStatus, datajudSyncedAt: cases.datajudSyncedAt })
			.from(cases)
			.where(eq(cases.cnjNumber, CNJ_A));

		assertDefined(row);
		expect(row.datajudStatus).toBe("tribunal_nao_suportado");
		expect(row.datajudSyncedAt).not.toBeNull();
	}),
);

test(
	"falha do DataJud em um processo não impede os outros nem falha o run",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910006");

		const djen = djenSource([
			{
				items: [
					djenItem({ id: 678173463 }),
					djenItem({
						id: 678173464,
						numero_processo: CNJ_B,
						numeroprocessocommascara: "1002587-45.2024.8.26.0100",
					}),
				],
			},
		]);

		const datajud = datajudSource({
			[CNJ_A]: () => {
				throw new Error("DataJud fora do ar");
			},
			[CNJ_B]: () => ({ status: "ok" as const, case: datajudCase({}) }),
		});

		const result = await sync(tx, lawyerId, djen, datajud);

		expect(result.status).toBe("concluida");
		expect(result.casesEnriched).toBe(1);
		expect(result.movementsCreated).toBe(2);

		const rows = await tx
			.select({ cnjNumber: cases.cnjNumber, datajudStatus: cases.datajudStatus })
			.from(cases)
			.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
			.where(eq(caseLawyers.lawyerId, lawyerId));

		expect(new Map(rows.map((row) => [row.cnjNumber, row.datajudStatus]))).toEqual(
			new Map([
				[CNJ_A, "falhou"],
				[CNJ_B, "ok"],
			]),
		);
	}),
);

test(
	"segunda chamada de start reaproveita o run em execução",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910007");
		const manager = new SyncManager(tx, djenSource([]), DATAJUD_EMPTY);

		const first = await manager.start(lawyerId);
		const second = await manager.start(lawyerId);

		expect(first.resumed).toBe(false);
		expect(second.resumed).toBe(true);
		expect(second.runId).toBe(first.runId);

		const rows = await tx
			.select({ id: syncRuns.id })
			.from(syncRuns)
			.where(eq(syncRuns.lawyerId, lawyerId));

		expect(rows).toHaveLength(1);
	}),
);

test(
	"run em execução parado há mais de quinze minutos é substituído",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910008");

		const [orphan] = await tx
			.insert(syncRuns)
			.values({
				lawyerId,
				status: "em_execucao",
				startedAt: new Date(Date.now() - 16 * 60 * 1000),
			})
			.returning({ id: syncRuns.id });

		assertDefined(orphan);

		const started = await new SyncManager(tx, djenSource([]), DATAJUD_EMPTY).start(lawyerId);

		expect(started.resumed).toBe(false);
		expect(started.runId).not.toBe(orphan.id);

		const [previous] = await tx
			.select({ status: syncRuns.status, errorMessage: syncRuns.errorMessage })
			.from(syncRuns)
			.where(eq(syncRuns.id, orphan.id));

		assertDefined(previous);
		expect(previous.status).toBe("falhou");
		expect(previous.errorMessage).toBe("Sincronização interrompida antes de terminar.");
	}),
);
