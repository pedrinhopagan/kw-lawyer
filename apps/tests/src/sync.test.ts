import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseInstances } from "@kw-lawyer/api/src/db/schema/case_instances.ts";
import { datajudDocuments } from "@kw-lawyer/api/src/db/schema/datajud_documents.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { caseParties } from "@kw-lawyer/api/src/db/schema/case_parties.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { publicationLinks } from "@kw-lawyer/api/src/db/schema/publication_links.ts";
import { publications } from "@kw-lawyer/api/src/db/schema/publications.ts";
import { syncRuns } from "@kw-lawyer/api/src/db/schema/sync_runs.ts";
import {
	DATAJUD_BATCH_SIZE,
	type DatajudBatch,
	DatajudClient,
	type DatajudDocument,
} from "@kw-lawyer/api/src/features/datajud/client.ts";
import type { DjenClient } from "@kw-lawyer/api/src/features/djen/client.ts";
import { type DjenItem, djenItemSchema } from "@kw-lawyer/api/src/features/djen/types.ts";
import { appealAdviceFor } from "@kw-lawyer/api/src/features/appeals/catalog.ts";
import { currentInstance, instancesByCase } from "@kw-lawyer/api/src/features/cases/instances.ts";
import { ORPHAN_HEARTBEAT_MS, SyncManager } from "@kw-lawyer/api/src/features/sync/manager.ts";
import { type SyncProgress, syncRealtime } from "@kw-lawyer/api/src/features/sync/realtime.ts";
import { expect, test } from "bun:test";
import { and, eq, getTableName } from "drizzle-orm";
import { formatCnj } from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { assertDefined } from "./utils/assertions.ts";
import { datajudElasticsearch } from "./utils/datajud-stub.ts";
import { withRollback } from "./utils/db.ts";
import { seedCase, uniqueCnj } from "./utils/seed.ts";

type DjenSource = Pick<DjenClient, "fetchAll">;
type DatajudSource = Pick<DatajudClient, "findCases">;

const SUFIXO_TJSP = "8520258260114";
const SUFIXO_TJRJ = "4520248190001";

const PUBLICATION_HTML = `<html><body>
	<p><b>Procedimento Comum C&iacute;vel N&ordm; 4011790-85.2025.8.26.0114/SP</b></p>
	<p>AUTOR: JOANA PEREIRA MENDES</p>
	<p>ADVOGADO(A): ANA LUISA FERREIRA CAMPOS (OAB SP999001)</p>
	<p>Manifeste-se a parte autora sobre a decis&atilde;o, sob pena de extin&ccedil;&atilde;o do processo.</p>
</body></html>`;

function djenItem(input: Partial<DjenItem> & { id: number; cnjNumber: string | null }): DjenItem {
	const { cnjNumber, ...overrides } = input;

	const payload = {
		data_disponibilizacao: "2026-07-24",
		texto: PUBLICATION_HTML,
		siglaTribunal: "TJSP",
		tipoComunicacao: "Intimação",
		nomeOrgao: "UPJ da 1ª a 4ª Varas Civeis - Regional de Vila Mimosa",
		idOrgao: 104229,
		numero_processo: cnjNumber,
		numeroprocessocommascara: cnjNumber && formatCnj(cnjNumber),
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

	return djenItemSchema.assert(payload);
}

// O DJEN só devolve o que cai na janela pedida, e o sync varre o histórico em várias janelas: um
// stub que ignorasse a janela entregaria a mesma publicação em cada uma delas.
function djenSource(pages: { items: DjenItem[] }[]): DjenSource {
	return {
		fetchAll: async (params, onPage) => {
			const windowed = pages.map((page) =>
				page.items.filter(
					(item) =>
						item.data_disponibilizacao >= params.window.from &&
						item.data_disponibilizacao <= params.window.through,
				),
			);

			const count = windowed.reduce((total, items) => total + items.length, 0);

			let total = 0;

			for (const [index, items] of windowed.entries()) {
				if (!items.length) {
					continue;
				}

				await onPage({ page: index + 1, count, items, invalid: 0, window: params.window });

				total += items.length;
			}

			return { total, invalid: 0, counted: count };
		},
	};
}

function datajudDocument(input: {
	cnjNumber: string;
	grau?: string | null;
	documentId?: string;
	sourceUpdatedAt?: Date;
	movements?: { code: number; name: string; occurredAt: Date }[];
}): DatajudDocument {
	const grau = input.grau === undefined ? "G1" : input.grau;

	return {
		documentId: input.documentId ?? `${input.cnjNumber}-${grau}`,
		cnjNumber: input.cnjNumber,
		grau,
		sourceUpdatedAt: input.sourceUpdatedAt ?? new Date("2026-05-02T10:00:00.000Z"),
		className: "Procedimento Comum Cível",
		classCode: "7",
		orgJudgingName: "Juízo Titular I - 2ª Vara Civel - Regional de Vila Mimosa",
		orgJudgingCode: "9450",
		subjects: [{ codigo: 4703, nome: "Defeito, nulidade ou anulação" }],
		systemName: "Projudi",
		formatName: "Eletrônico",
		filedAt: new Date("2025-10-02T12:19:45.000Z"),
		secrecyLevel: 0,
		movements: (
			input.movements ?? [
				{ code: 581, name: "Documento", occurredAt: new Date("2026-04-10T13:35:43.000Z") },
				{ code: 51, name: "Decurso de Prazo", occurredAt: new Date("2026-05-02T09:12:00.000Z") },
			]
		).map((movement) => ({ ...movement, complements: [] })),
		source: { numeroProcesso: input.cnjNumber, grau },
	};
}

// O DataJud responde por lote de um tribunal, então o stub também: o CNJ que não vier na resposta é
// processo sem registro, e não erro.
function datajudSource(byTribunal: Record<string, () => DatajudBatch>): DatajudSource {
	return {
		findCases: (params) => {
			const entry = byTribunal[params.tribunal];

			if (!entry) {
				return Promise.resolve({
					status: "ok" as const,
					alias: params.tribunal.toLowerCase(),
					documents: [],
				});
			}

			// A falha do DataJud chega como promise rejeitada, que é como a consulta de verdade falha.
			return Promise.resolve().then(entry);
		},
	};
}

function datajudBatch(documents: DatajudDocument[]): DatajudBatch {
	return { status: "ok", alias: "tjsp", documents };
}

// Uma consulta por processo é o defeito que o lote existe para matar, e ele só fica provado se o
// teste contar as chamadas ao governo.
function recordedDatajud(byTribunal: Record<string, () => DatajudBatch>) {
	const inner = datajudSource(byTribunal);
	const calls: { tribunal: string; cnjNumbers: string[] }[] = [];

	return {
		calls,
		source: {
			findCases: (params) => {
				calls.push({ tribunal: params.tribunal, cnjNumbers: params.cnjNumbers });

				return inner.findCases(params);
			},
		} satisfies DatajudSource,
	};
}

// O progresso só é fiel se o que a tela recebe for o que ficou gravado. Espiar no exato instante em
// que a etapa está rodando é o único jeito de ler a linha antes de a etapa seguinte reescrevê-la.
function djenObservado(pages: { items: DjenItem[] }[], aoTerminarPagina: () => Promise<void>) {
	const inner = djenSource(pages);

	return {
		fetchAll: (params, onPage) =>
			inner.fetchAll(params, async (page) => {
				await onPage(page);
				await aoTerminarPagina();
			}),
	} satisfies DjenSource;
}

function datajudObservado(
	byTribunal: Record<string, () => DatajudBatch>,
	aoConsultarLote: () => Promise<void>,
) {
	const inner = datajudSource(byTribunal);

	return {
		findCases: async (params) => {
			await aoConsultarLote();

			return await inner.findCases(params);
		},
	} satisfies DatajudSource;
}

// O canal é único e serve a base inteira: um teste concorrente publica no mesmo lugar, e quem não
// recorta pelo advogado lê o progresso do vizinho.
async function fasesPublicadas(lawyerId: string, rodar: () => Promise<unknown>) {
	const canal = syncRealtime.events();
	const publicados: SyncProgress[] = [];

	async function escutar() {
		for await (const event of canal) {
			if (event.lawyerId !== lawyerId) {
				continue;
			}

			publicados.push(event);

			if (event.phase === "concluida" || event.phase === "falhou") {
				break;
			}
		}
	}

	const escutando = escutar();

	await rodar();
	await escutando;

	return publicados;
}

const DATAJUD_EMPTY = datajudSource({});

// A marcação do caminho sem novidade é o caso comum de quem tem milhares de processos parados: ela só
// está barata se sair uma vez por lote, e isso só fica provado contando as idas ao banco.
function contandoUpdates(tx: Tx) {
	const tables: string[] = [];

	const espiao = new Proxy(tx, {
		get(target, property, receiver) {
			if (property !== "update") {
				return Reflect.get(target, property, receiver);
			}

			return (table: Parameters<Tx["update"]>[0]) => {
				tables.push(getTableName(table));

				return target.update(table);
			};
		},
	});

	return { tables, tx: espiao };
}

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

async function estadoDatajud(tx: Tx, lawyerId: string) {
	const rows = await tx
		.select({
			cnjNumber: cases.cnjNumber,
			status: cases.datajudStatus,
			syncedAt: cases.datajudSyncedAt,
			sourceUpdatedAt: cases.datajudSourceUpdatedAt,
		})
		.from(cases)
		.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
		.where(eq(caseLawyers.lawyerId, lawyerId));

	return new Map(rows.map(({ cnjNumber, ...estado }) => [cnjNumber, estado]));
}

test(
	"sincronizar duas vezes o mesmo lote deixa o banco idêntico",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910001");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);
		const djen = djenSource([
			{
				items: [
					djenItem({ id: 678173456, cnjNumber: CNJ_A }),
					djenItem({ id: 678173457, cnjNumber: CNJ_A, texto: "<p>Outra</p>" }),
				],
			},
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
				items: [djenItem({ id: 678173458, cnjNumber: null })],
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
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);

		const djen = djenSource([
			{
				items: [
					djenItem({ id: 678173459, cnjNumber: CNJ_A }),
					djenItem({ id: 678173460, cnjNumber: CNJ_A }),
				],
			},
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
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);

		const djen = djenSource([
			{
				items: [
					djenItem({ id: 678173490, cnjNumber: CNJ_A }),
					djenItem({ id: 678173491, cnjNumber: null, texto: "<p>&nbsp;</p>" }),
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
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);
		const djen = djenSource([{ items: [djenItem({ id: 678173461, cnjNumber: CNJ_A })] }]);
		const datajud = datajudSource({
			TJSP: () => datajudBatch([datajudDocument({ cnjNumber: CNJ_A })]),
		});

		const first = await sync(tx, lawyerId, djen, datajud);

		expect(first.status).toBe("concluida");
		expect(first.casesEnriched).toBe(1);
		expect(first.movementsCreated).toBe(2);
		expect((await counts(tx, lawyerId)).movements).toBe(3);

		const [enriched] = await tx
			.select({
				grau: caseInstances.grau,
				systemName: caseInstances.systemName,
				datajudStatus: cases.datajudStatus,
			})
			.from(cases)
			.innerJoin(caseInstances, eq(caseInstances.caseId, cases.id))
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
	"processo com duas instâncias vira duas linhas e o movimento diz de qual grau é",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910017");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);
		const djen = djenSource([{ items: [djenItem({ id: 678173471, cnjNumber: CNJ_A })] }]);
		const datajud = datajudSource({
			TJSP: () =>
				datajudBatch([
					datajudDocument({
						cnjNumber: CNJ_A,
						grau: "JE",
						movements: [
							{ code: 581, name: "Documento", occurredAt: new Date("2026-04-10T13:35:43.000Z") },
						],
					}),
					datajudDocument({
						cnjNumber: CNJ_A,
						grau: "G1",
						movements: [
							{
								code: 51,
								name: "Decurso de Prazo",
								occurredAt: new Date("2026-05-02T09:12:00.000Z"),
							},
						],
					}),
				]),
		});

		const result = await sync(tx, lawyerId, djen, datajud);

		expect(result.casesEnriched).toBe(1);
		expect(result.movementsCreated).toBe(2);

		const instances = await tx
			.select({ grau: caseInstances.grau })
			.from(caseInstances)
			.innerJoin(cases, eq(cases.id, caseInstances.caseId))
			.where(eq(cases.cnjNumber, CNJ_A));

		expect(instances.map((instance) => instance.grau).toSorted()).toEqual(["G1", "JE"]);

		const documents = await tx
			.select({ documentId: datajudDocuments.documentId })
			.from(datajudDocuments)
			.innerJoin(cases, eq(cases.id, datajudDocuments.caseId))
			.where(eq(cases.cnjNumber, CNJ_A));

		expect(documents).toHaveLength(2);

		const graus = await tx
			.select({ externalCode: movements.externalCode, grau: movements.grau })
			.from(movements)
			.innerJoin(cases, eq(cases.id, movements.caseId))
			.where(and(eq(cases.cnjNumber, CNJ_A), eq(movements.source, "datajud")));

		expect(new Map(graus.map((row) => [row.externalCode, row.grau]))).toEqual(
			new Map([
				["581", "JE"],
				["51", "G1"],
			]),
		);
	}),
);

test(
	"carteira grande consulta o DataJud por lote de tribunal, e não um processo por vez",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910010");
		const paulistas = DATAJUD_BATCH_SIZE + 20;

		for (let index = 0; index < paulistas; index++) {
			await seedCase(tx, {
				lawyerId,
				cnjNumber: `${String(index).padStart(7, "0")}0920268260100`,
				tribunal: "TJSP",
			});
		}

		for (let index = 0; index < 3; index++) {
			await seedCase(tx, {
				lawyerId,
				cnjNumber: `${String(index).padStart(7, "0")}0920268190001`,
				tribunal: "TJRJ",
			});
		}

		const datajud = recordedDatajud({});

		await sync(tx, lawyerId, djenSource([]), datajud.source);

		expect(datajud.calls).toHaveLength(3);
		expect(
			datajud.calls
				.filter((call) => call.tribunal === "TJSP")
				.map((call) => call.cnjNumbers.length)
				.toSorted((left, right) => left - right),
		).toEqual([20, DATAJUD_BATCH_SIZE]);
		expect(
			datajud.calls
				.filter((call) => call.tribunal === "TJRJ")
				.map((call) => call.cnjNumbers.length),
		).toEqual([3]);

		const asked = datajud.calls.flatMap((call) => call.cnjNumbers);

		expect(new Set(asked).size).toBe(paulistas + 3);
	}),
);

test(
	"processo só é reescrito quando o conteúdo mudou na fonte, sem consultar o relógio",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910011");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);
		const CNJ_B = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber: CNJ_A, tribunal: "TJSP" });
		await seedCase(tx, { lawyerId, cnjNumber: CNJ_B, tribunal: "TJSP" });

		// A marca d'água é antiga de propósito: se o filtro olhasse o relógio, os dois processos
		// venceriam a cada ciclo e o único parado voltaria a ser reescrito.
		const parada = new Date("2020-03-01T10:00:00.000Z");
		const nova = new Date("2020-03-02T10:00:00.000Z");

		const primeiro = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({ cnjNumber: CNJ_A, sourceUpdatedAt: parada }),
						datajudDocument({ cnjNumber: CNJ_B, sourceUpdatedAt: parada }),
					]),
			}),
		);

		expect(primeiro.casesEnriched).toBe(2);

		const antes = await estadoDatajud(tx, lawyerId);

		const segundo = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({ cnjNumber: CNJ_A, sourceUpdatedAt: parada }),
						datajudDocument({
							cnjNumber: CNJ_B,
							sourceUpdatedAt: nova,
							movements: [
								{
									code: 848,
									name: "Trânsito em Julgado",
									occurredAt: new Date("2020-03-02T09:00:00.000Z"),
								},
							],
						}),
					]),
			}),
		);

		expect(segundo.casesEnriched).toBe(1);
		expect(segundo.movementsCreated).toBe(1);

		const depois = await estadoDatajud(tx, lawyerId);

		// Conteúdo igual não reescreve o processo, mas a checagem de hoje fica registrada: sem isso o
		// processo ficaria preso no último erro e sairia do radar de silêncio para sempre.
		const antesDeA = antes.get(CNJ_A);

		assertDefined(antesDeA);

		expect(depois.get(CNJ_A)?.sourceUpdatedAt).toEqual(parada);
		expect(depois.get(CNJ_A)?.syncedAt).not.toEqual(antesDeA.syncedAt);
		expect(depois.get(CNJ_B)?.sourceUpdatedAt).toEqual(nova);
		expect(depois.get(CNJ_B)?.syncedAt).not.toEqual(antes.get(CNJ_B)?.syncedAt);
	}),
);

async function grausGravados(tx: Tx, cnjNumber: string) {
	const rows = await tx
		.select({ grau: caseInstances.grau })
		.from(caseInstances)
		.innerJoin(cases, eq(cases.id, caseInstances.caseId))
		.where(eq(cases.cnjNumber, cnjNumber));

	return rows.map((row) => row.grau).toSorted();
}

test(
	"instância nova com carimbo mais antigo que o já gravado entra mesmo assim",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910012");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber: CNJ_A, tribunal: "TJSP" });

		const antigo = new Date("2026-05-10T10:00:00.000Z");
		const recente = new Date("2026-06-01T10:00:00.000Z");

		const primeiro = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () => datajudBatch([datajudDocument({ cnjNumber: CNJ_A, sourceUpdatedAt: recente })]),
			}),
		);

		expect(primeiro.casesEnriched).toBe(1);
		expect(await grausGravados(tx, CNJ_A)).toEqual(["G1"]);

		// O recurso sobe e o tribunal cria o documento da segunda instância datado da distribuição, que
		// é mais antiga que o carimbo do primeiro grau: pela marca d'água de carimbo isso nunca entrava,
		// e o app nunca aprendia que o processo está no tribunal.
		const segundo = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({ cnjNumber: CNJ_A, sourceUpdatedAt: recente }),
						datajudDocument({ cnjNumber: CNJ_A, grau: "G2", sourceUpdatedAt: antigo }),
					]),
			}),
		);

		expect(segundo.casesEnriched).toBe(1);
		expect(await grausGravados(tx, CNJ_A)).toEqual(["G1", "G2"]);
	}),
);

test(
	"instância que sumiu da fonte sai do processo e para de mandar no rito recursal",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910015");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber: CNJ_A, tribunal: "TJSP" });

		const carimbo = new Date("2026-06-01T10:00:00.000Z");

		async function ritoDaInstanciaCorrente() {
			const [row] = await tx.select({ id: cases.id }).from(cases).where(eq(cases.cnjNumber, CNJ_A));

			assertDefined(row);

			const instances = (await instancesByCase(tx, [row.id])).get(row.id) ?? [];

			// Sem classe e sem órgão no texto, quem responde pelo rito é a instância corrente: é assim
			// que a instância espúria vira recurso inominado em processo de vara cível.
			return appealAdviceFor({
				species: "sentenca",
				speciesConfidence: "alta",
				currentGrau: currentInstance(instances)?.grau,
				cnjNumber: CNJ_A,
				className: null,
				caseOrgName: null,
				decisionGrau: null,
				decisionPublication: null,
				transitedAt: null,
			}).options.map((option) => option.actKey);
		}

		await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({ cnjNumber: CNJ_A, sourceUpdatedAt: carimbo }),
						datajudDocument({ cnjNumber: CNJ_A, grau: "TR", sourceUpdatedAt: carimbo }),
					]),
			}),
		);

		expect(await grausGravados(tx, CNJ_A)).toEqual(["G1", "TR"]);
		expect(await ritoDaInstanciaCorrente()).toEqual(["recurso_inominado", "embargos_declaracao"]);

		// O tribunal corrigiu o documento espúrio e ele sumiu do lote: sem reconciliação a turma
		// recursal continuaria ditando o rito para sempre.
		const depois = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () => datajudBatch([datajudDocument({ cnjNumber: CNJ_A, sourceUpdatedAt: carimbo })]),
			}),
		);

		expect(depois.casesEnriched).toBe(1);
		expect(await grausGravados(tx, CNJ_A)).toEqual(["G1"]);
		expect(await ritoDaInstanciaCorrente()).toEqual(["apelacao", "embargos_declaracao"]);

		const documentos = await tx
			.select({ documentId: datajudDocuments.documentId })
			.from(datajudDocuments)
			.innerJoin(cases, eq(cases.id, datajudDocuments.caseId))
			.where(eq(cases.cnjNumber, CNJ_A));

		expect(documentos).toHaveLength(1);
	}),
);

async function grausDosMovimentos(tx: Tx, cnjNumber: string) {
	const rows = await tx
		.select({ grau: movements.grau })
		.from(movements)
		.innerJoin(cases, eq(cases.id, movements.caseId))
		.where(and(eq(cases.cnjNumber, cnjNumber), eq(movements.source, "datajud")));

	return rows.map((row) => row.grau).toSorted();
}

// O tribunal replica o histórico ao subir o processo, então o mesmo movimento chega nos documentos de
// duas instâncias e alguém tem que desempatar. Os três pares cercam o critério pelos dois lados: por
// texto crescente sairia G1 sobre JE (15 dias sobre 10) e G2 sobre TR; por texto decrescente sairia
// TR sobre G1. Só a ordem jurídica acerta os três.
const DESEMPATES_DE_GRAU = [
	{ graus: ["G1", "JE"], maisBaixo: "JE" },
	{ graus: ["G2", "TR"], maisBaixo: "TR" },
	{ graus: ["G1", "TR"], maisBaixo: "G1" },
];

test(
	"o mesmo movimento em duas instâncias fica com a mais baixa, e não com a primeira do lote",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910022");
		const carteira = DESEMPATES_DE_GRAU.map((entry) => ({
			...entry,
			cnjNumber: uniqueCnj(SUFIXO_TJSP),
		}));

		for (const { cnjNumber } of carteira) {
			await seedCase(tx, { lawyerId, cnjNumber, tribunal: "TJSP" });
		}

		await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch(
						carteira.flatMap(({ cnjNumber, graus }) =>
							graus.map((grau) => datajudDocument({ cnjNumber, grau })),
						),
					),
			}),
		);

		for (const { cnjNumber, maisBaixo } of carteira) {
			expect(await grausDosMovimentos(tx, cnjNumber)).toEqual([maisBaixo, maisBaixo]);
		}
	}),
);

test(
	"o grau do movimento é corrigível pela fonte, e o silêncio dela não apaga o que já foi dito",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910023");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber: CNJ_A, tribunal: "TJSP" });

		// O documento de juizado traz um movimento que só ele tem: é a decisão que o mapa de cabimento
		// vai ler, e é ela que responde recurso inominado em 10 dias enquanto o grau disser juizado.
		const juizado = () =>
			datajudDocument({
				cnjNumber: CNJ_A,
				grau: "JE",
				movements: [
					{ code: 12185, name: "Decisão", occurredAt: new Date("2026-04-11T10:00:00.000Z") },
				],
			});

		// O grau gravado no movimento só importa pelo que ele faz com a resposta: é ele que troca 15 dias
		// de apelação por 10 de recurso inominado, e em confiança alta.
		async function ritoDaDecisao() {
			const [row] = await tx
				.select({ grau: movements.grau })
				.from(movements)
				.innerJoin(cases, eq(cases.id, movements.caseId))
				.where(and(eq(cases.cnjNumber, CNJ_A), eq(movements.externalCode, "12185")));

			assertDefined(row);

			return appealAdviceFor({
				species: "sentenca",
				speciesConfidence: "alta",
				currentGrau: undefined,
				cnjNumber: CNJ_A,
				className: null,
				caseOrgName: null,
				decisionGrau: row.grau,
				decisionPublication: null,
				transitedAt: null,
			}).options.map((option) => `${option.actKey}/${option.days}/${option.confidence}`);
		}

		const primeiro = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () => datajudBatch([datajudDocument({ cnjNumber: CNJ_A }), juizado()]),
			}),
		);

		expect(primeiro.movementsCreated).toBe(3);
		expect(await grausDosMovimentos(tx, CNJ_A)).toEqual(["G1", "G1", "JE"]);
		expect(await ritoDaDecisao()).toEqual([
			"recurso_inominado/10/alta",
			"embargos_declaracao/5/alta",
		]);

		// O documento de juizado era espúrio e o tribunal o retirou. A instância já saía do processo; o
		// movimento continuava dizendo juizado e respondendo 10 dias em confiança alta para sempre, e
		// nenhum documento do lote novo fala dele para corrigi-lo.
		const retirado = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () => datajudBatch([datajudDocument({ cnjNumber: CNJ_A })]),
			}),
		);

		expect(retirado.movementsCreated).toBe(0);
		expect(await grausDosMovimentos(tx, CNJ_A)).toEqual(["G1", "G1", null]);

		// Sem o documento espúrio a decisão volta a ser lida como era antes dele: apelação, e em média,
		// porque agora nada no processo diz o rito.
		expect(await ritoDaDecisao()).toEqual(["apelacao/15/media", "embargos_declaracao/5/media"]);

		// Documento sem grau nenhum não é a fonte se retratando: é ela calando. O grau gravado fica.
		const mudo = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({ cnjNumber: CNJ_A, grau: null, documentId: `${CNJ_A}-sem-grau` }),
					]),
			}),
		);

		expect(mudo.movementsCreated).toBe(0);
		expect(await grausDosMovimentos(tx, CNJ_A)).toEqual(["G1", "G1", null]);
	}),
);

test(
	"ato reindexado para outro grau corrige o grau gravado, sem a instância antiga ter sumido",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910024");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber: CNJ_A, tribunal: "TJSP" });

		const decisao = {
			code: 12185,
			name: "Decisão",
			occurredAt: new Date("2026-04-11T10:00:00.000Z"),
		};

		async function ritoDaDecisao() {
			const [row] = await tx
				.select({ grau: movements.grau })
				.from(movements)
				.innerJoin(cases, eq(cases.id, movements.caseId))
				.where(and(eq(cases.cnjNumber, CNJ_A), eq(movements.externalCode, "12185")));

			assertDefined(row);

			return appealAdviceFor({
				species: "sentenca",
				speciesConfidence: "alta",
				currentGrau: undefined,
				cnjNumber: CNJ_A,
				className: null,
				caseOrgName: null,
				decisionGrau: row.grau,
				decisionPublication: null,
				transitedAt: null,
			}).options.map((option) => `${option.actKey}/${option.days}/${option.confidence}`);
		}

		await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([datajudDocument({ cnjNumber: CNJ_A, grau: "JE", movements: [decisao] })]),
			}),
		);

		expect(await ritoDaDecisao()).toEqual([
			"recurso_inominado/10/alta",
			"embargos_declaracao/5/alta",
		]);

		// O tribunal reindexou o ato para o documento da vara e manteve o do juizado no processo: a
		// instância continua lá, então quem tem que corrigir o grau do movimento é a fonte dizendo outra
		// coisa sobre ele, e não a retirada do documento.
		const reindexado = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({ cnjNumber: CNJ_A, movements: [decisao] }),
						datajudDocument({
							cnjNumber: CNJ_A,
							grau: "JE",
							movements: [
								{
									code: 60,
									name: "Expedição de documento",
									occurredAt: new Date("2026-04-12T10:00:00.000Z"),
								},
							],
						}),
					]),
			}),
		);

		expect(reindexado.movementsCreated).toBe(1);
		expect(await grausGravados(tx, CNJ_A)).toEqual(["G1", "JE"]);
		expect(await grausDosMovimentos(tx, CNJ_A)).toEqual(["G1", "JE"]);
		expect(await ritoDaDecisao()).toEqual(["apelacao/15/alta", "embargos_declaracao/5/alta"]);
	}),
);

test(
	"falha do lote não rebaixa o processo que já tinha conteúdo, e derruba só quem nunca teve",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910013");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);
		const CNJ_B = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber: CNJ_A, tribunal: "TJSP" });
		await seedCase(tx, { lawyerId, cnjNumber: CNJ_B, tribunal: "TJSP" });

		await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () => datajudBatch([datajudDocument({ cnjNumber: CNJ_A })]),
			}),
		);

		const depoisDoSucesso = await estadoDatajud(tx, lawyerId);

		expect(depoisDoSucesso.get(CNJ_A)?.status).toBe("ok");

		await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () => {
					throw new Error("DataJud fora do ar");
				},
			}),
		);

		const depoisDaFalha = await estadoDatajud(tx, lawyerId);

		// Uma indisponibilidade do tribunal não pode aposentar do radar de silêncio o processo que já
		// tem conteúdo: ele fica com a última consulta que teve resposta.
		expect(depoisDaFalha.get(CNJ_A)?.status).toBe("ok");
		expect(depoisDaFalha.get(CNJ_A)?.syncedAt).toEqual(depoisDoSucesso.get(CNJ_A)?.syncedAt);
		expect(depoisDaFalha.get(CNJ_B)?.status).toBe("falhou");
	}),
);

test(
	"processo verificado hoje sem novidade registra a checagem e sai do estado preso",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910016");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber: CNJ_A, tribunal: "TJSP" });

		const documentos = datajudSource({
			TJSP: () => datajudBatch([datajudDocument({ cnjNumber: CNJ_A })]),
		});

		await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () => {
					throw new Error("DataJud fora do ar");
				},
			}),
		);

		expect((await estadoDatajud(tx, lawyerId)).get(CNJ_A)?.status).toBe("falhou");

		await sync(tx, lawyerId, djenSource([]), documentos);

		const depoisDoSucesso = await estadoDatajud(tx, lawyerId);

		expect(depoisDoSucesso.get(CNJ_A)?.status).toBe("ok");

		const inalterado = await sync(tx, lawyerId, djenSource([]), documentos);
		const depoisDaChecagem = await estadoDatajud(tx, lawyerId);

		expect(inalterado.casesEnriched).toBe(0);
		expect(depoisDaChecagem.get(CNJ_A)?.status).toBe("ok");
		expect(depoisDaChecagem.get(CNJ_A)?.syncedAt).not.toEqual(depoisDoSucesso.get(CNJ_A)?.syncedAt);
	}),
);

test(
	"movimento gravado antes de a fonte declarar o grau ganha o grau quando ele chega",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910014");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber: CNJ_A, tribunal: "TJSP" });

		const documentId = `${CNJ_A}-unico`;

		async function grauDoMovimento() {
			const [row] = await tx
				.select({ grau: movements.grau })
				.from(movements)
				.innerJoin(cases, eq(cases.id, movements.caseId))
				.where(and(eq(cases.cnjNumber, CNJ_A), eq(movements.externalCode, "51")));

			assertDefined(row);

			return row.grau;
		}

		await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({
							cnjNumber: CNJ_A,
							grau: null,
							documentId,
							sourceUpdatedAt: new Date("2026-05-02T10:00:00.000Z"),
						}),
					]),
			}),
		);

		expect(await grauDoMovimento()).toBeNull();

		const segundo = await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({
							cnjNumber: CNJ_A,
							grau: "G1",
							documentId,
							sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
						}),
					]),
			}),
		);

		expect(segundo.movementsCreated).toBe(0);
		expect(await grauDoMovimento()).toBe("G1");
	}),
);

test(
	"tribunal sem alias marca tribunal_nao_suportado sem derrubar o run",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910005");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);
		const djen = djenSource([
			{ items: [djenItem({ id: 678173462, cnjNumber: CNJ_A, siglaTribunal: "TJZZ" })] },
		]);
		const datajud = datajudSource({
			TJZZ: () => ({ status: "tribunal_nao_suportado" as const }),
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
	"falha do DataJud num tribunal não impede os outros nem falha o run",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910006");
		const CNJ_A = uniqueCnj(SUFIXO_TJSP);
		const CNJ_B = uniqueCnj(SUFIXO_TJRJ);

		const djen = djenSource([
			{
				items: [
					djenItem({ id: 678173463, cnjNumber: CNJ_A }),
					djenItem({ id: 678173464, cnjNumber: CNJ_B, siglaTribunal: "TJRJ" }),
				],
			},
		]);

		const datajud = datajudSource({
			TJSP: () => {
				throw new Error("DataJud fora do ar");
			},
			TJRJ: () => datajudBatch([datajudDocument({ cnjNumber: CNJ_B })]),
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
	"o progresso lido do banco é o mesmo objeto que o canal transmite",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910021");
		const cnjNumber = uniqueCnj(SUFIXO_TJSP);
		const djen = djenSource([{ items: [djenItem({ id: 678173481, cnjNumber })] }]);
		const manager = new SyncManager(tx, djen, DATAJUD_EMPTY);

		const primeira = await manager.start(lawyerId);

		await manager.syncLawyer(lawyerId, { runId: primeira.runId, force: false });

		const [run] = await tx.select().from(syncRuns).where(eq(syncRuns.id, primeira.runId));
		const progress = await manager.progress(lawyerId);

		assertDefined(run);
		assertDefined(progress);

		const { id, ...gravado } = run;

		expect(progress).toEqual({ ...gravado, runId: id });
		expect(run.kind).toBe("inicial");
		expect(run.phase).toBe("concluida");
		expect(run.stepTotal).toBeGreaterThan(0);
		expect(run.stepDone).toBe(run.stepTotal);
		expect(run.heartbeatAt.getTime()).toBeGreaterThanOrEqual(run.startedAt.getTime());

		const segunda = await manager.start(lawyerId);

		const [seguinte] = await tx
			.select({ kind: syncRuns.kind })
			.from(syncRuns)
			.where(eq(syncRuns.id, segunda.runId));

		assertDefined(seguinte);
		expect(seguinte.kind).toBe("incremental");
	}),
);

test(
	"as quatro etapas do sync são publicadas na ordem e ficam gravadas no run",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910023");
		const cnjNumber = uniqueCnj(SUFIXO_TJSP);

		async function linhaDoRun() {
			const [row] = await tx.select().from(syncRuns).where(eq(syncRuns.lawyerId, lawyerId));

			assertDefined(row);

			return row;
		}

		const naDescoberta: (typeof syncRuns.$inferSelect)[] = [];
		const noEnriquecimento: (typeof syncRuns.$inferSelect)[] = [];

		const djen = djenObservado([{ items: [djenItem({ id: 678173482, cnjNumber })] }], async () => {
			naDescoberta.push(await linhaDoRun());
		});

		const datajud = datajudObservado(
			{ TJSP: () => datajudBatch([datajudDocument({ cnjNumber })]) },
			async () => {
				noEnriquecimento.push(await linhaDoRun());
			},
		);

		const manager = new SyncManager(tx, djen, datajud);
		const { runId } = await manager.start(lawyerId);

		const publicados = await fasesPublicadas(lawyerId, () =>
			manager.syncLawyer(lawyerId, { runId, force: false }),
		);

		const etapas = publicados
			.map((event) => event.phase)
			.filter((phase, index, all) => phase !== all[index - 1]);

		expect(etapas).toEqual([
			"descoberta",
			"projecao",
			"enriquecimento",
			"classificacao",
			"concluida",
		]);
		expect(publicados.every((event) => event.runId === runId)).toBe(true);
		// `stepTotal` zero é o total desconhecido da descoberta, que conta em vez de fracionar: o tamanho
		// de cada janela do DJEN só aparece depois de abri-la. Onde existe denominador, ele manda.
		expect(
			publicados.every((event) => event.stepTotal === 0 || event.stepDone <= event.stepTotal),
		).toBe(true);
		expect(publicados.some((event) => event.phase === "descoberta" && event.stepTotal === 0)).toBe(
			true,
		);

		// A linha lida no meio da etapa é a mesma que o canal acabou de transmitir: se a fase vivesse na
		// memória do job, o banco estaria atrás e o F5 mostraria outra coisa.
		const espiadas = [...naDescoberta, ...noEnriquecimento];

		expect(espiadas.length).toBeGreaterThan(0);
		expect(naDescoberta.every((row) => row.phase === "descoberta")).toBe(true);
		expect(noEnriquecimento.every((row) => row.phase === "enriquecimento")).toBe(true);

		for (const row of espiadas) {
			expect(row.status).toBe("em_execucao");
			expect(publicados).toContainEqual(
				expect.objectContaining({
					runId: row.id,
					phase: row.phase,
					stepTotal: row.stepTotal,
					stepDone: row.stepDone,
					fetched: row.fetched,
				}),
			);
		}

		const [ultimo] = publicados.slice(-1);
		const gravado = await linhaDoRun();

		assertDefined(ultimo);
		expect(gravado.phase).toBe("concluida");
		expect(gravado.status).toBe("concluida");
		expect(ultimo).toEqual(expect.objectContaining({ runId: gravado.id, phase: gravado.phase }));
	}),
);

test(
	"quem assina o progresso no meio da coleta recebe o que já está gravado, sem esperar o próximo evento",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910024");
		const cnjNumber = uniqueCnj(SUFIXO_TJSP);
		const coletando = Promise.withResolvers<void>();
		const liberado = Promise.withResolvers<void>();

		let pausou = false;

		const djen = djenObservado([{ items: [djenItem({ id: 678173483, cnjNumber })] }], async () => {
			if (pausou) {
				return;
			}

			pausou = true;
			coletando.resolve();

			await liberado.promise;
		});

		const manager = new SyncManager(tx, djen, DATAJUD_EMPTY);
		const { runId } = await manager.start(lawyerId);
		const rodando = manager.syncLawyer(lawyerId, { runId, force: false });

		await coletando.promise;

		// O primeiro valor do canal é o retrato do banco, não um evento novo: sem ele, quem abre a tela
		// depois do sync começar fica sem nada até a próxima página do DJEN chegar.
		const assinante = manager.events(lawyerId);
		const primeiro = await assinante.next();

		await assinante.return();

		liberado.resolve();

		await rodando;

		if (primeiro.done) {
			throw new Error("o canal fechou antes de mandar o retrato do banco");
		}

		expect(primeiro.value.runId).toBe(runId);
		expect(primeiro.value.status).toBe("em_execucao");
		expect(primeiro.value.phase).toBe("descoberta");
		expect(primeiro.value.fetched).toBe(1);
	}),
);

test(
	"run em execução sem batimento é substituído",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910008");

		const silencioso = new Date(Date.now() - ORPHAN_HEARTBEAT_MS - 1_000);

		const [orphan] = await tx
			.insert(syncRuns)
			.values({
				lawyerId,
				status: "em_execucao",
				startedAt: silencioso,
				heartbeatAt: silencioso,
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

// Carga inicial longa é o caso normal, não defeito: derrubar o run pela idade era o que colocava dois
// syncs para varrer a mesma carteira ao mesmo tempo.
test(
	"run que começou faz muito tempo mas continua batendo não é substituído",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910022");

		const [running] = await tx
			.insert(syncRuns)
			.values({
				lawyerId,
				status: "em_execucao",
				startedAt: new Date(Date.now() - 12 * ORPHAN_HEARTBEAT_MS),
				heartbeatAt: new Date(),
			})
			.returning({ id: syncRuns.id });

		assertDefined(running);

		const started = await new SyncManager(tx, djenSource([]), DATAJUD_EMPTY).start(lawyerId);

		expect(started.resumed).toBe(true);
		expect(started.runId).toBe(running.id);
	}),
);

// Substituir o run órfão não mata o job antigo: ele continua vivo no processo que o abriu. Quem
// impede os dois syncs de brigar pelo painel é a linha, que só aceita escrita de quem ainda está em
// execução.
test(
	"o job do run substituído para de mandar no painel e não reabre um segundo sync",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910025");
		const cnjNumber = uniqueCnj(SUFIXO_TJSP);
		const djen = djenSource([{ items: [djenItem({ id: 678173484, cnjNumber })] }]);
		const manager = new SyncManager(tx, djen, DATAJUD_EMPTY);

		const antigo = await manager.start(lawyerId);

		// `now()` é constante dentro da transação, então os dois runs nasceriam com o mesmo instante e a
		// ordem por data de início seria sorteio. O run antigo começou antes: é isso que a linha diz.
		const silencioso = new Date(Date.now() - ORPHAN_HEARTBEAT_MS - 1_000);

		await tx
			.update(syncRuns)
			.set({ startedAt: silencioso, heartbeatAt: silencioso })
			.where(eq(syncRuns.id, antigo.runId));

		const novo = await manager.start(lawyerId);

		expect(novo.runId).not.toBe(antigo.runId);

		const atrasado = await manager.syncLawyer(lawyerId, { runId: antigo.runId, force: false });

		expect(atrasado.status).toBe("ignorada");

		const rows = await tx
			.select({
				id: syncRuns.id,
				status: syncRuns.status,
				phase: syncRuns.phase,
				stepDone: syncRuns.stepDone,
				fetched: syncRuns.fetched,
			})
			.from(syncRuns)
			.where(eq(syncRuns.lawyerId, lawyerId));

		const substituido = rows.find((row) => row.id === antigo.runId);
		const vigente = rows.find((row) => row.id === novo.runId);

		assertDefined(substituido);
		assertDefined(vigente);

		expect(rows).toHaveLength(2);
		expect(substituido.status).toBe("falhou");
		expect(vigente.status).toBe("em_execucao");
		expect(vigente.phase).toBe("descoberta");
		expect(vigente.stepDone).toBe(0);
		expect(vigente.fetched).toBe(0);

		const progresso = await manager.progress(lawyerId);

		assertDefined(progresso);
		expect(progresso.runId).toBe(novo.runId);
	}),
);

test(
	"lote sem novidade registra a checagem de uma vez só, e não uma ida ao banco por processo",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910018");
		const carteira = [uniqueCnj(SUFIXO_TJSP), uniqueCnj(SUFIXO_TJSP), uniqueCnj(SUFIXO_TJSP)];

		for (const cnjNumber of carteira) {
			await seedCase(tx, { lawyerId, cnjNumber, tribunal: "TJSP" });
		}

		const datajud = datajudSource({
			TJSP: () => datajudBatch(carteira.map((cnjNumber) => datajudDocument({ cnjNumber }))),
		});

		await sync(tx, lawyerId, djenSource([]), datajud);

		// A advogada com três mil processos parados passa por aqui em todo ciclo do relógio: uma UPDATE
		// por processo seria uma ida ao banco por processo, para não gravar novidade nenhuma.
		const espiao = contandoUpdates(tx);
		const inalterado = await sync(espiao.tx, lawyerId, djenSource([]), datajud);

		expect(inalterado.casesEnriched).toBe(0);
		expect(espiao.tables.filter((table) => table === getTableName(cases))).toHaveLength(1);
	}),
);

test(
	"resposta do DataJud sem o total de documentos é recusada em vez de apagar a instância que ficou de fora",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910019");
		const cnjNumber = uniqueCnj(SUFIXO_TJSP);

		await seedCase(tx, { lawyerId, cnjNumber, tribunal: "TJSP", graus: ["G1", "G2"] });

		// O cliente de verdade entra em cena porque o defeito é de leitura da resposta: um stub de
		// `findCases` pularia justamente a validação que precisa segurar o lote sem total.
		const { server } = datajudElasticsearch({
			documentsByCnj: { [cnjNumber]: 1 },
			declaredByCnj: {},
			withTotal: false,
		});

		try {
			const client = new DatajudClient({
				baseUrl: server.url.origin,
				apiKey: "teste",
				maxAttempts: 1,
			});

			const result = await sync(tx, lawyerId, djenSource([]), client);

			// Sem o total não há como saber se o lote veio truncado, e a reconciliação apagaria a segunda
			// instância a cada ciclo com base num conjunto amputado: o processo perderia o rito recursal do
			// tribunal em silêncio.
			expect(await grausGravados(tx, cnjNumber)).toEqual(["G1", "G2"]);
			expect(result.status).toBe("concluida");
			expect(result.casesEnriched).toBe(0);
			expect((await estadoDatajud(tx, lawyerId)).get(cnjNumber)?.status).toBe("falhou");
		} finally {
			await server.stop(true);
		}
	}),
);

test(
	"processo com documentos acima do teto fica sem enriquecimento sozinho, e o resto do lote passa",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "910020");
		const patologico = uniqueCnj(SUFIXO_TJSP);
		const carteira = [patologico, uniqueCnj(SUFIXO_TJSP), uniqueCnj(SUFIXO_TJSP)];

		for (const cnjNumber of carteira) {
			await seedCase(tx, { lawyerId, cnjNumber, tribunal: "TJSP" });
		}

		const { server } = datajudElasticsearch({
			documentsByCnj: Object.fromEntries(carteira.map((cnjNumber) => [cnjNumber, 1])),
			declaredByCnj: { [patologico]: 1_500 },
			withTotal: true,
		});

		try {
			const client = new DatajudClient({
				baseUrl: server.url.origin,
				apiKey: "teste",
				maxAttempts: 1,
			});

			const result = await sync(tx, lawyerId, djenSource([]), client);
			const estado = await estadoDatajud(tx, lawyerId);

			// Um processo que o DataJud não consegue devolver inteiro é problema dele: se a exceção subisse,
			// os outros noventa e nove do lote ficariam sem enriquecimento em todo ciclo, para sempre.
			expect(result.status).toBe("concluida");
			expect(result.casesEnriched).toBe(carteira.length - 1);
			expect(estado.get(patologico)?.status).toBe("sem_registro");
			expect(carteira.slice(1).map((cnjNumber) => estado.get(cnjNumber)?.status)).toEqual([
				"ok",
				"ok",
			]);
		} finally {
			await server.stop(true);
		}
	}),
);

test(
	"conclusão que só o DataJud conhece reclassifica o estado do processo",
	withRollback(async (tx) => {
		const oabNumber = "950031";
		const lawyerId = await createLawyer(tx, oabNumber);
		const cnjNumber = "50123456720268260100";

		// Primeiro sync: o processo entra pela publicação e fica em tramitação.
		await sync(
			tx,
			lawyerId,
			djenSource([{ items: [djenItem({ id: 990031, cnjNumber })] }]),
			datajudSource({ TJSP: () => datajudBatch([datajudDocument({ cnjNumber })]) }),
		);

		const [antes] = await tx.select({ state: cases.state }).from(cases);

		expect(antes?.state).toBe("tramitando");

		// Segundo sync sem publicação nenhuma: a conclusão chega como movimento do DataJud, que é como
		// ela chega na vida real. Classificar só o que veio do DJEN deixaria o processo em tramitação.
		await sync(
			tx,
			lawyerId,
			djenSource([]),
			datajudSource({
				TJSP: () =>
					datajudBatch([
						datajudDocument({
							cnjNumber,
							sourceUpdatedAt: new Date("2026-07-25T10:00:00.000Z"),
							movements: [
								{
									code: 246,
									name: "Conclusão ao Juiz",
									occurredAt: new Date("2026-07-25T09:00:00.000Z"),
								},
							],
						}),
					]),
			}),
		);

		const [depois] = await tx.select({ state: cases.state }).from(cases);

		expect(depois?.state).toBe("conclusao");
	}),
);
