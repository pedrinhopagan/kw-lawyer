import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { caseScans } from "@kw-lawyer/api/src/db/schema/case_scans.ts";
import { deadlines } from "@kw-lawyer/api/src/db/schema/deadlines.ts";
import { djenCommunicationOabs } from "@kw-lawyer/api/src/db/schema/djen_communication_oabs.ts";
import { djenCommunications } from "@kw-lawyer/api/src/db/schema/djen_communications.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { publicationLinks } from "@kw-lawyer/api/src/db/schema/publication_links.ts";
import { publicationScans } from "@kw-lawyer/api/src/db/schema/publication_scans.ts";
import { publications } from "@kw-lawyer/api/src/db/schema/publications.ts";
import type { DatajudClient } from "@kw-lawyer/api/src/features/datajud/client.ts";
import { forensicToday } from "@kw-lawyer/api/src/features/deadlines/calendar.ts";
import type { DjenClient } from "@kw-lawyer/api/src/features/djen/client.ts";
import { htmlToPlainText } from "@kw-lawyer/api/src/features/djen/normalize.ts";
import {
	CANCELED_PUBLICATION_WARNING,
	DJEN_PROJECTOR_VERSION,
	RECTIFIED_PUBLICATION_WARNING,
} from "@kw-lawyer/api/src/features/djen/project.ts";
import { type DjenItem, djenItemSchema } from "@kw-lawyer/api/src/features/djen/types.ts";
import { DeadlineManager } from "@kw-lawyer/api/src/features/deadlines/manager.ts";
import { LawyerOabManager } from "@kw-lawyer/api/src/features/oabs/manager.ts";
import { SyncManager } from "@kw-lawyer/api/src/features/sync/manager.ts";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { assertDefined } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { seedCase, seedPublication } from "./utils/seed.ts";

const UF = "SP";
const CNJ = "10204578520238260103";
const HISTORIC_DATE = "2023-05-10";
const DEADLINE_TEXT =
	"<p>Manifeste-se a parte autora sobre a decisão, no prazo de 5 (cinco) dias.</p>";

const DATAJUD_EMPTY: Pick<DatajudClient, "findCases"> = {
	findCases: (params) =>
		Promise.resolve({ status: "ok" as const, alias: params.tribunal.toLowerCase(), documents: [] }),
};

const DJEN_LAWYER_FOUND = {
	findLawyer: () => Promise.resolve({ name: "ADVOGADA ACOMPANHADA", djenAdvogadoId: 1 }),
};

function djenItem(overrides: Partial<DjenItem> & { id: number; data_disponibilizacao: string }) {
	const payload = {
		texto: DEADLINE_TEXT,
		siglaTribunal: "TJSP",
		tipoComunicacao: "Intimação",
		nomeOrgao: "1ª Vara Cível",
		numero_processo: CNJ,
		destinatarios: [{ nome: "JOANA PEREIRA MENDES", polo: "A" }],
		...overrides,
	};

	return djenItemSchema.assert(payload);
}

// O DJEN só devolve o que cai na janela pedida: é o que faz a marca d'água poupar a segunda coleta.
function djenByOab(
	itemsByOab: Record<string, DjenItem[]>,
	afterLanding?: () => Promise<void>,
): Pick<DjenClient, "fetchAll"> {
	return {
		fetchAll: async (params, onPage) => {
			const items = (itemsByOab[params.oabNumber] ?? []).filter(
				(item) =>
					item.data_disponibilizacao >= params.window.from &&
					item.data_disponibilizacao <= params.window.through,
			);

			if (!items.length) {
				return { total: 0, invalid: 0, counted: 0 };
			}

			await onPage({ page: 1, count: items.length, items, invalid: 0, window: params.window });
			await afterLanding?.();

			return { total: items.length, invalid: 0, counted: items.length };
		},
	};
}

function djenCounting(calls: { count: number }): Pick<DjenClient, "fetchAll"> {
	return {
		fetchAll: () => {
			calls.count += 1;

			return Promise.resolve({ total: 0, invalid: 0, counted: 0 });
		},
	};
}

async function communicationOf(tx: Tx, externalId: string) {
	const [row] = await tx
		.select()
		.from(djenCommunications)
		.where(eq(djenCommunications.externalId, externalId));

	assertDefined(row);

	return row;
}

async function publicationOf(tx: Tx, externalId: string) {
	const [row] = await tx.select().from(publications).where(eq(publications.externalId, externalId));

	assertDefined(row);

	return row;
}

async function createLawyer(tx: Tx, oabNumber: string) {
	const [lawyer] = await tx
		.insert(lawyers)
		.values({ name: `ADVOGADA ${oabNumber}`, oabNumber, oabUf: UF })
		.returning({ id: lawyers.id });

	assertDefined(lawyer);

	return lawyer.id;
}

async function sync(tx: Tx, lawyerId: string, djen: Pick<DjenClient, "fetchAll">) {
	const manager = new SyncManager(tx, djen, DATAJUD_EMPTY);
	const { runId } = await manager.start(lawyerId);

	return await manager.syncLawyer(lawyerId, { runId, force: false });
}

test(
	"a segunda advogada da mesma inscrição herda o histórico que ela nunca coletou",
	withRollback(async (tx) => {
		const shared = "950001";
		const primeira = await createLawyer(tx, shared);
		const segunda = await createLawyer(tx, "950002");
		const historic = djenItem({ id: 990001, data_disponibilizacao: HISTORIC_DATE });

		await sync(tx, primeira, djenByOab({ [shared]: [historic] }));

		await new LawyerOabManager(tx, DJEN_LAWYER_FOUND).add(segunda, {
			oabNumber: shared,
			oabUf: UF,
		});

		// A marca d'água da inscrição já está completa, então o DJEN só é consultado no incremento e a
		// publicação de 2023 não volta pelo fio: o vínculo tem de nascer da projeção.
		const result = await sync(tx, segunda, djenByOab({ [shared]: [historic] }));

		expect(result.status).toBe("concluida");
		expect(result.created).toBe(0);

		const links = await tx
			.select({ lawyerId: publicationLinks.lawyerId })
			.from(publicationLinks)
			.innerJoin(publications, eq(publications.id, publicationLinks.publicationId))
			.where(eq(publications.externalId, "990001"));

		expect(new Set(links.map((link) => link.lawyerId))).toEqual(new Set([primeira, segunda]));

		const owners = await tx.select({ lawyerId: caseLawyers.lawyerId }).from(caseLawyers);

		expect(new Set(owners.map((owner) => owner.lawyerId))).toEqual(new Set([primeira, segunda]));

		// Prazo é linha por advogada, não vínculo: sem varrer o que acabou de ganhar vínculo, a
		// segunda abre a agenda vazia enquanto a caixa dela está cheia.
		const prazos = await tx
			.select({ lawyerId: deadlines.lawyerId })
			.from(deadlines)
			.innerJoin(publications, eq(publications.id, deadlines.publicationId))
			.where(eq(publications.externalId, "990001"));

		expect(new Set(prazos.map((prazo) => prazo.lawyerId))).toEqual(new Set([primeira, segunda]));
	}),
);

test(
	"publicação cancelada pelo tribunal fica na caixa marcada e avisa o prazo derivado",
	withRollback(async (tx) => {
		const oabNumber = "950003";
		const lawyerId = await createLawyer(tx, oabNumber);
		const today = forensicToday();
		const original = djenItem({ id: 990002, data_disponibilizacao: today });

		await sync(tx, lawyerId, djenByOab({ [oabNumber]: [original] }));

		const [before] = await tx
			.select({ id: deadlines.id, status: deadlines.status, warnings: deadlines.warnings })
			.from(deadlines)
			.where(eq(deadlines.lawyerId, lawyerId));

		assertDefined(before);
		expect(before.warnings).not.toContain(CANCELED_PUBLICATION_WARNING);

		const canceled = djenItem({
			id: 990002,
			data_disponibilizacao: today,
			ativo: false,
			status: "C",
			motivo_cancelamento: "Publicação cancelada por erro material.",
			data_cancelamento: `${today}T12:00:00.000Z`,
		});

		await sync(tx, lawyerId, djenByOab({ [oabNumber]: [canceled] }));

		const [publication] = await tx
			.select({
				active: publications.active,
				status: publications.status,
				cancelReason: publications.cancelReason,
				canceledAt: publications.canceledAt,
			})
			.from(publications)
			.where(eq(publications.externalId, "990002"));

		assertDefined(publication);
		expect(publication.active).toBe(false);
		expect(publication.status).toBe("C");
		expect(publication.cancelReason).toBe("Publicação cancelada por erro material.");
		expect(publication.canceledAt).not.toBeNull();

		const [after] = await tx
			.select({ status: deadlines.status, warnings: deadlines.warnings })
			.from(deadlines)
			.where(eq(deadlines.id, before.id));

		assertDefined(after);
		expect(after.status).toBe("pendente");
		expect(after.warnings).toContain(CANCELED_PUBLICATION_WARNING);

		const [communication] = await tx
			.select({ projectorVersion: djenCommunications.projectorVersion })
			.from(djenCommunications)
			.where(eq(djenCommunications.externalId, "990002"));

		assertDefined(communication);
		expect(communication.projectorVersion).toBeGreaterThan(0);
	}),
);

test(
	"retificação que troca o órgão da publicação avisa o prazo já aberto",
	withRollback(async (tx) => {
		const oabNumber = "950013";
		const lawyerId = await createLawyer(tx, oabNumber);
		const today = forensicToday();

		await sync(
			tx,
			lawyerId,
			djenByOab({ [oabNumber]: [djenItem({ id: 990013, data_disponibilizacao: today })] }),
		);

		const [publicada] = await tx
			.select({ id: publications.id, caseId: publications.caseId })
			.from(publications)
			.where(eq(publications.externalId, "990013"));

		assertDefined(publicada);
		assertDefined(publicada.caseId);

		// O prazo que congela a base é o que a advogada abre no eixo Recorrer, e quem o escreve é este
		// mesmo método: a base e a contagem ficam gravadas na linha e não são recalculadas depois.
		const before = await new DeadlineManager(tx).createForAppeal({
			lawyerId,
			caseId: publicada.caseId,
			publicationId: publicada.id,
			tribunal: "TJSP",
			availableAt: today,
			baseIsPublication: true,
			actKey: "apelacao",
			title: "Apelação",
			basis: "CPC, art. 1.009; prazo: CPC, art. 1.003",
			days: 15,
			unit: "uteis",
			confidence: "alta",
			reviewReasons: [],
		});

		// Campo que o DJEN não tinha mandado e passou a mandar é registro se completando, e é assim que
		// a classe congelada nasceu para a base inteira: avisar aqui seria carimbar todo prazo aberto.
		await sync(
			tx,
			lawyerId,
			djenByOab({
				[oabNumber]: [
					djenItem({
						id: 990013,
						data_disponibilizacao: today,
						nomeClasse: "Procedimento Comum Cível",
					}),
				],
			}),
		);

		const [completado] = await tx
			.select({ warnings: deadlines.warnings })
			.from(deadlines)
			.where(eq(deadlines.id, before.id));

		assertDefined(completado);
		expect(completado.warnings).not.toContain(RECTIFIED_PUBLICATION_WARNING);

		// Trocar o órgão é o tribunal se retratando: a resposta nova é apelação em 15 dias virando
		// recurso inominado em 10, e o prazo aberto congelou a base e a contagem da versão anterior.
		await sync(
			tx,
			lawyerId,
			djenByOab({
				[oabNumber]: [
					djenItem({
						id: 990013,
						data_disponibilizacao: today,
						nomeClasse: "Procedimento Comum Cível",
						nomeOrgao: "1º Juizado Especial Cível",
					}),
				],
			}),
		);

		const [publication] = await tx
			.select({ orgName: publications.orgName })
			.from(publications)
			.where(eq(publications.externalId, "990013"));

		const [after] = await tx
			.select({ warnings: deadlines.warnings })
			.from(deadlines)
			.where(eq(deadlines.id, before.id));

		assertDefined(publication);
		assertDefined(after);
		expect(publication.orgName).toBe("1º Juizado Especial Cível");
		expect(after.warnings).toContain(RECTIFIED_PUBLICATION_WARNING);
	}),
);

test(
	"payload igual não reescreve a aterrissagem nem reprojeta",
	withRollback(async (tx) => {
		const oabNumber = "950004";
		const lawyerId = await createLawyer(tx, oabNumber);
		const item = djenItem({ id: 990003, data_disponibilizacao: forensicToday() });
		const djen = djenByOab({ [oabNumber]: [item] });

		await sync(tx, lawyerId, djen);

		const [landed] = await tx
			.select({
				projectedAt: djenCommunications.projectedAt,
				fetchedAt: djenCommunications.fetchedAt,
			})
			.from(djenCommunications)
			.where(eq(djenCommunications.externalId, "990003"));

		assertDefined(landed);

		const second = await sync(tx, lawyerId, djen);

		const [again] = await tx
			.select({
				projectedAt: djenCommunications.projectedAt,
				fetchedAt: djenCommunications.fetchedAt,
			})
			.from(djenCommunications)
			.where(eq(djenCommunications.externalId, "990003"));

		assertDefined(again);
		expect(second.created).toBe(0);
		expect(second.duplicated).toBe(1);
		expect(again.fetchedAt).toEqual(landed.fetchedAt);
		expect(again.projectedAt).toEqual(landed.projectedAt);
	}),
);

test(
	"o payload aterrissado é o que o DJEN devolveu, campo a campo",
	withRollback(async (tx) => {
		const oabNumber = "950005";
		const lawyerId = await createLawyer(tx, oabNumber);
		const item = djenItemSchema.assert({
			id: 990004,
			data_disponibilizacao: HISTORIC_DATE,
			texto: DEADLINE_TEXT,
			siglaTribunal: "TJSP",
			tipoComunicacao: "Intimação",
			nomeOrgao: "1ª Vara Cível",
			idOrgao: 4321,
			numero_processo: CNJ,
			numeroprocessocommascara: "1020457-85.2023.8.26.0103",
			meio: "D",
			meiocompleto: "Diário de Justiça Eletrônico Nacional",
			link: "https://comunica.pje.jus.br/990004",
			tipoDocumento: "Despacho",
			nomeClasse: "Procedimento Comum Cível",
			codigoClasse: 7,
			numeroComunicacao: 55123,
			ativo: true,
			hash: "8f14e45fceea167a5a36dedd4bea2543",
			status: "P",
			motivo_cancelamento: null,
			data_cancelamento: null,
			datadisponibilizacao: `${HISTORIC_DATE}T00:00:00.000Z`,
			destinatarios: [{ nome: "JOANA PEREIRA MENDES", polo: "A" }],
			destinatarioadvogados: [
				{
					advogado: {
						id: 77,
						nome: "ANA LUISA FERREIRA CAMPOS",
						numero_oab: oabNumber,
						uf_oab: UF,
					},
				},
			],
		});

		await sync(tx, lawyerId, djenByOab({ [oabNumber]: [item] }));

		const landed = await communicationOf(tx, "990004");

		expect(landed.payload).toEqual(item);
		expect(Object.keys(landed.payload as object).sort()).toEqual(Object.keys(item).sort());
		expect(landed.availableAt).toBe(HISTORIC_DATE);
		expect(landed.runId).not.toBeNull();

		// O hash tem de ser o md5 da forma canônica do jsonb: é a mesma conta do backfill, e é ela que
		// impede a primeira coleta incremental de ver toda linha antiga como diferente.
		const [integrity] = await tx
			.select({
				matches: sql<boolean>`${djenCommunications.payloadHash} = md5(${djenCommunications.payload}::text)`,
			})
			.from(djenCommunications)
			.where(eq(djenCommunications.externalId, "990004"));

		assertDefined(integrity);
		expect(integrity.matches).toBe(true);
	}),
);

test(
	"retificação com payload diferente devolve a comunicação para a fila e atualiza a publicação",
	withRollback(async (tx) => {
		const oabNumber = "950006";
		const lawyerId = await createLawyer(tx, oabNumber);
		const today = forensicToday();

		await sync(
			tx,
			lawyerId,
			djenByOab({ [oabNumber]: [djenItem({ id: 990005, data_disponibilizacao: today })] }),
		);

		const before = await communicationOf(tx, "990005");
		const beforePublication = await publicationOf(tx, "990005");

		assertDefined(before.projectedAt);

		const retified = djenItem({
			id: 990005,
			data_disponibilizacao: today,
			texto: "<p>Manifeste-se a parte autora sobre a perícia, no prazo de 15 (quinze) dias.</p>",
			nomeOrgao: "2ª Vara Cível",
			tipoComunicacao: "Citação",
		});
		const queuedAt: (Date | null)[] = [];

		await sync(
			tx,
			lawyerId,
			djenByOab({ [oabNumber]: [retified] }, async () => {
				queuedAt.push((await communicationOf(tx, "990005")).projectedAt);
			}),
		);

		expect(queuedAt).toEqual([null]);

		const after = await communicationOf(tx, "990005");

		assertDefined(after.projectedAt);
		expect(after.payloadHash).not.toBe(before.payloadHash);
		expect(after.projectedAt.getTime()).toBeGreaterThan(before.projectedAt.getTime());

		const afterPublication = await publicationOf(tx, "990005");

		expect(afterPublication.id).toBe(beforePublication.id);
		expect(afterPublication.textPlain).toBe(htmlToPlainText(retified.texto));
		expect(afterPublication.orgName).toBe("2ª Vara Cível");
		expect(afterPublication.contentHash).not.toBe(beforePublication.contentHash);

		// O movimento é o rastro do fato no processo: reprojetar sem reescrevê-lo deixaria a timeline
		// contando a versão que o tribunal revogou.
		const [movement] = await tx
			.select({ summary: movements.summary, type: movements.type })
			.from(movements)
			.where(eq(movements.publicationId, afterPublication.id));

		assertDefined(movement);
		expect(movement.summary).toBe(afterPublication.excerpt);
		expect(movement.type).toBe("Citação");
	}),
);

test(
	"comunicação retificada é contada como atualizada, não como duplicada",
	withRollback(async (tx) => {
		const oabNumber = "950010";
		const lawyerId = await createLawyer(tx, oabNumber);
		const today = forensicToday();

		const first = await sync(
			tx,
			lawyerId,
			djenByOab({ [oabNumber]: [djenItem({ id: 990009, data_disponibilizacao: today })] }),
		);

		expect(first.created).toBe(1);
		expect(first.updated).toBe(0);

		const second = await sync(
			tx,
			lawyerId,
			djenByOab({
				[oabNumber]: [
					djenItem({
						id: 990009,
						data_disponibilizacao: today,
						texto:
							"<p>Manifeste-se a parte autora sobre o laudo, no prazo de 15 (quinze) dias.</p>",
					}),
				],
			}),
		);

		expect(second.created).toBe(0);
		expect(second.updated).toBe(1);
		expect(second.duplicated).toBe(0);
	}),
);

test(
	"comunicação com data fora do formato aterrissa e só é recusada na projeção",
	withRollback(async (tx) => {
		const oabNumber = "950011";
		const lawyerId = await createLawyer(tx, oabNumber);
		const item = djenItem({ id: 990010, data_disponibilizacao: "10/05/2023" });

		const result = await sync(tx, lawyerId, {
			fetchAll: async (params, onPage) => {
				await onPage({ page: 1, count: 1, items: [item], invalid: 0, window: params.window });

				return { total: 1, invalid: 0, counted: 1 };
			},
		});

		expect(result.status).toBe("concluida");
		expect(result.created).toBe(1);
		expect(result.invalid).toBeGreaterThan(0);

		const landed = await communicationOf(tx, "990010");

		expect(landed.payload).toEqual(item);
		expect(landed.availableAt).toBeNull();

		const projected = await tx
			.select({ id: publications.id })
			.from(publications)
			.where(eq(publications.externalId, "990010"));

		expect(projected).toEqual([]);
	}),
);

test(
	"projeção defasada é refeita a partir do cru, sem baixar nada do governo",
	withRollback(async (tx) => {
		const oabNumber = "950007";
		const lawyerId = await createLawyer(tx, oabNumber);

		await sync(
			tx,
			lawyerId,
			djenByOab({
				[oabNumber]: [
					djenItem({
						id: 990006,
						data_disponibilizacao: forensicToday(),
						nomeClasse: "Procedimento do Juizado Especial Cível",
					}),
				],
			}),
		);

		const landed = await communicationOf(tx, "990006");

		// É o que um bump de DJEN_PROJECTOR_VERSION produz: a base inteira fica atrás da versão
		// corrente, com a projeção antiga já gravada. `class_name` nasceu vazia na versão 2 e é o caso
		// literal do bump mais recente: a coluna nova se preenche do payload cru, sem uma chamada ao
		// governo.
		await tx
			.update(publications)
			.set({
				textPlain: "",
				excerpt: "projeção antiga",
				orgName: null,
				className: null,
				normalizerVersion: 0,
			})
			.where(eq(publications.externalId, "990006"));

		await tx
			.update(djenCommunications)
			.set({ projectorVersion: DJEN_PROJECTOR_VERSION - 1 })
			.where(eq(djenCommunications.externalId, "990006"));

		const calls = { count: 0 };
		const result = await sync(tx, lawyerId, djenCounting(calls));

		expect(result.fetched).toBe(0);
		expect(calls.count).toBeGreaterThan(0);

		const publication = await publicationOf(tx, "990006");

		expect(publication.textPlain).toBe(htmlToPlainText(DEADLINE_TEXT));
		expect(publication.excerpt).not.toBe("projeção antiga");
		expect(publication.orgName).toBe("1ª Vara Cível");
		expect(publication.className).toBe("Procedimento do Juizado Especial Cível");
		expect(publication.normalizerVersion).toBe(DJEN_PROJECTOR_VERSION);

		const reprojected = await communicationOf(tx, "990006");

		expect(reprojected.projectorVersion).toBe(DJEN_PROJECTOR_VERSION);
		expect(reprojected.fetchedAt).toEqual(landed.fetchedAt);
		expect(reprojected.payloadHash).toBe(landed.payloadHash);
	}),
);

test(
	"o scan do sync só reavalia o que a projeção acabou de tocar",
	withRollback(async (tx) => {
		const oabNumber = "950008";
		const lawyerId = await createLawyer(tx, oabNumber);
		const untouchedCaseId = await seedCase(tx, {
			lawyerId,
			cnjNumber: "50123457820238260100",
			tribunal: "TJSP",
		});
		const untouchedPublicationId = await seedPublication(tx, {
			lawyerIds: [lawyerId],
			caseId: untouchedCaseId,
			cnjNumber: "50123457820238260100",
			availableAt: HISTORIC_DATE,
			textPlain: "Manifeste-se a parte autora sobre o laudo, no prazo de 15 (quinze) dias.",
		});

		await sync(
			tx,
			lawyerId,
			djenByOab({
				[oabNumber]: [djenItem({ id: 990007, data_disponibilizacao: forensicToday() })],
			}),
		);

		const projected = await publicationOf(tx, "990007");
		const scannedPublications = await tx
			.select({ publicationId: publicationScans.publicationId })
			.from(publicationScans);

		expect(scannedPublications.map((row) => row.publicationId)).toEqual([projected.id]);
		expect(scannedPublications.map((row) => row.publicationId)).not.toContain(
			untouchedPublicationId,
		);

		const scannedCases = await tx
			.select({ caseId: caseScans.caseId, scanner: caseScans.scanner })
			.from(caseScans);

		assertDefined(projected.caseId);

		// Decisão, prova e incidente saem de publicação e movimento novos, então o recorte por lista é
		// o certo para eles. O estado não: conclusão e baixa chegam pelo DataJud, e processo que nunca
		// foi classificado nunca apareceria numa lista vinda do DJEN. Ele varre a carteira e deixa o
		// filtro de desatualizado decidir, e é por isso que o processo intocado aparece só aqui.
		const byScanner = new Map<string, Set<string>>();

		for (const row of scannedCases) {
			byScanner.set(row.scanner, (byScanner.get(row.scanner) ?? new Set()).add(row.caseId));
		}

		for (const scanner of ["decisoes", "provas", "incidentes"] as const) {
			expect(byScanner.get(scanner)).toEqual(new Set([projected.caseId]));
		}

		expect(byScanner.get("estado")).toEqual(new Set([projected.caseId, untouchedCaseId]));
	}),
);

test(
	"página que repete a mesma comunicação não derruba a coleta",
	withRollback(async (tx) => {
		const oabNumber = "950009";
		const lawyerId = await createLawyer(tx, oabNumber);
		const today = forensicToday();
		const first = djenItem({ id: 990008, data_disponibilizacao: today });
		const repeated = djenItem({
			id: 990008,
			data_disponibilizacao: today,
			texto: "<p>Manifeste-se a parte autora sobre o laudo, no prazo de 15 (quinze) dias.</p>",
		});

		const result = await sync(tx, lawyerId, djenByOab({ [oabNumber]: [first, repeated] }));

		expect(result.status).toBe("concluida");
		expect(result.fetched).toBe(2);
		expect(result.created).toBe(1);
		expect(result.duplicated).toBe(1);

		// Vence a última entrega da página: é a versão mais recente que o DJEN devolveu.
		const publication = await publicationOf(tx, "990008");

		expect(publication.textPlain).toBe(htmlToPlainText(repeated.texto));
	}),
);

test(
	"a comunicação fica gravada na inscrição por onde chegou, não na de quem coletou",
	withRollback(async (tx) => {
		const propria = "950012";
		const socio = "950013";
		const ana = await createLawyer(tx, propria);

		await new LawyerOabManager(tx, DJEN_LAWYER_FOUND).add(ana, { oabNumber: socio, oabUf: UF });

		// A intimação sai só no nome do sócio: é o caso que faz o painel existir e o que não pode
		// carimbar a inscrição própria de quem estava sincronizando.
		await sync(
			tx,
			ana,
			djenByOab({ [socio]: [djenItem({ id: 990011, data_disponibilizacao: HISTORIC_DATE })] }),
		);

		const inscricoes = await tx
			.select({ oabNumber: djenCommunicationOabs.oabNumber })
			.from(djenCommunicationOabs)
			.innerJoin(
				djenCommunications,
				eq(djenCommunications.id, djenCommunicationOabs.communicationId),
			)
			.where(eq(djenCommunications.externalId, "990011"));

		expect(inscricoes.map((row) => row.oabNumber)).toEqual([socio]);

		// Quem passa a acompanhar a inscrição própria de Ana não pode receber o processo do sócio: é o
		// vazamento que a inscrição errada produziria.
		const bruna = await createLawyer(tx, "950014");

		await new LawyerOabManager(tx, DJEN_LAWYER_FOUND).add(bruna, { oabNumber: propria, oabUf: UF });
		await sync(tx, bruna, djenByOab({}));

		const vazados = await tx
			.select({ caseId: caseLawyers.caseId })
			.from(caseLawyers)
			.where(eq(caseLawyers.lawyerId, bruna));

		expect(vazados).toEqual([]);

		// E quem acompanha a inscrição do sócio herda, senão o teste passaria com o vínculo quebrado.
		const carla = await createLawyer(tx, "950015");

		await new LawyerOabManager(tx, DJEN_LAWYER_FOUND).add(carla, { oabNumber: socio, oabUf: UF });
		await sync(tx, carla, djenByOab({}));

		const herdados = await tx
			.select({ externalId: publications.externalId })
			.from(publicationLinks)
			.innerJoin(publications, eq(publications.id, publicationLinks.publicationId))
			.where(eq(publicationLinks.lawyerId, carla));

		expect(herdados.map((row) => row.externalId)).toEqual(["990011"]);
	}),
);

test(
	"a fila da projeção é das inscrições de quem sincroniza, não da base inteira",
	withRollback(async (tx) => {
		const dona = "950016";
		const alheia = await createLawyer(tx, dona);
		const item = djenItem({ id: 990012, data_disponibilizacao: HISTORIC_DATE });

		const [pendente] = await tx
			.insert(djenCommunications)
			.values({
				externalId: "990012",
				availableAt: HISTORIC_DATE,
				payload: item,
				payloadHash: crypto.randomUUID(),
			})
			.returning({ id: djenCommunications.id });

		assertDefined(pendente);

		await tx
			.insert(djenCommunicationOabs)
			.values({ communicationId: pendente.id, oabNumber: dona, oabUf: UF });

		const vizinha = await createLawyer(tx, "950017");
		const alheio = await sync(tx, vizinha, djenByOab({}));

		expect(alheio.status).toBe("concluida");
		expect(alheio.casesCreated).toBe(0);

		const naoProjetada = await communicationOf(tx, "990012");

		expect(naoProjetada.projectedAt).toBeNull();
		expect(naoProjetada.projectorVersion).toBe(0);

		const cedo = await tx
			.select({ id: publications.id })
			.from(publications)
			.where(eq(publications.externalId, "990012"));

		expect(cedo).toEqual([]);

		// A dona da inscrição é quem paga e quem recebe o crédito.
		const propria = await sync(tx, alheia, djenByOab({}));

		expect(propria.casesCreated).toBe(1);

		const projetada = await communicationOf(tx, "990012");

		expect(projetada.projectorVersion).toBe(DJEN_PROJECTOR_VERSION);
	}),
);
