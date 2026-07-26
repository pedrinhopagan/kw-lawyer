import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { CaseAnalysisManager } from "@kw-lawyer/api/src/features/analysis/manager.ts";
import { formatCnj } from "@kw-lawyer/api/src/features/djen/normalize.ts";
import {
	type CaseState,
	classifyMovement,
	stateOf,
} from "@kw-lawyer/api/src/features/legal/case-state.ts";
import { RADAR_LIMIT, RadarManager } from "@kw-lawyer/api/src/features/radar/manager.ts";
import { SILENCE_THRESHOLD_DAYS } from "@kw-lawyer/api/src/features/radar/risk.ts";
import { expect, test } from "bun:test";
import { asc, desc, eq } from "drizzle-orm";
import { assertDefined } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { seedCase, seedLawyer, uniqueCnj } from "./utils/seed.ts";

const MS_PER_DAY = 86_400_000;
const SUFIXO_TJSP = "8520258260114";

// Base congelada: `Date.now()` a cada chamada faria a data usada para montar o dado diferir da usada
// no assert por alguns milissegundos, e o teste falharia só sob carga.
const NOW = Date.now();

function daysAgo(days: number) {
	return new Date(NOW - days * MS_PER_DAY);
}

// O estado do processo é materializado pela varredura, então o caminho do teste é o mesmo do app: o
// movimento entra, o scan classifica e o radar lê a linha já classificada.
async function silentCase(
	tx: Tx,
	input: {
		lawyerId: string;
		cnjNumber: string;
		lastMovementAt: Date;
		summary?: string;
		datajudStatus?: "ok" | "sem_registro" | "tribunal_nao_suportado" | "falhou";
	},
) {
	const caseId = await seedCase(tx, {
		lawyerId: input.lawyerId,
		cnjNumber: input.cnjNumber,
		tribunal: "TJSP",
	});

	await tx
		.update(cases)
		.set({
			lastMovementAt: input.lastMovementAt,
			datajudStatus: input.datajudStatus ?? "ok",
			datajudSyncedAt: new Date(),
		})
		.where(eq(cases.id, caseId));

	if (input.summary) {
		await tx.insert(movements).values({
			caseId,
			occurredAt: input.lastMovementAt,
			summary: input.summary,
			source: "datajud",
			externalCode: "51",
		});
	}

	await new CaseAnalysisManager(tx).scan({ caseIds: [caseId] });

	return caseId;
}

// Carteira grande sem passar pela varredura: quem está sob teste aqui é o recorte do radar, e o
// estado entra já gravado justamente para o teste caber no tempo da suíte.
async function silentCrowd(
	tx: Tx,
	input: { lawyerId: string; count: number; daysSilent: number; state: CaseState },
) {
	const rows = Array.from({ length: input.count }, () => {
		const cnjNumber = uniqueCnj(SUFIXO_TJSP);

		return {
			cnjNumber,
			formattedNumber: formatCnj(cnjNumber),
			tribunal: "TJSP",
			state: input.state,
			lastMovementAt: daysAgo(input.daysSilent),
			datajudStatus: "ok" as const,
			datajudSyncedAt: new Date(),
		};
	});

	const inserted = await tx.insert(cases).values(rows).returning({ id: cases.id });

	await tx
		.insert(caseLawyers)
		.values(inserted.map((row) => ({ caseId: row.id, lawyerId: input.lawyerId })));

	return inserted.map((row) => row.id);
}

test("o estado do processo sai do texto do movimento tabelado", () => {
	expect(classifyMovement("Conclusão para julgamento")).toBe("conclusao");
	expect(classifyMovement("Baixa Definitiva")).toBe("baixado");
	expect(classifyMovement("Suspensão ou Sobrestamento do processo")).toBe("suspenso");
	expect(classifyMovement("Remessa ao Tribunal de Justiça")).toBe("remetido");
	expect(classifyMovement("Redistribuição por prevenção")).toBe("redistribuido");
	expect(classifyMovement("Juntada de petição")).toBe("tramitando");
});

test("juntada de petição depois da conclusão não desfaz a conclusão", () => {
	const concluded = stateOf([
		{ summary: "Juntada de Petição de petição", occurredAt: daysAgo(10) },
		{ summary: "Conclusão para julgamento", occurredAt: daysAgo(40) },
		{ summary: "Juntada de Petição inicial", occurredAt: daysAgo(90) },
	]);

	expect(concluded.state).toBe("conclusao");
	expect(concluded.since).toEqual(daysAgo(40));
});

test("processo sem nenhum movimento de estado fica em tramitação", () => {
	expect(stateOf([{ summary: "Juntada de petição", occurredAt: daysAgo(3) }]).state).toBe(
		"tramitando",
	);
	expect(stateOf([]).state).toBe("tramitando");
	expect(stateOf([]).since).toBeNull();
});

test(
	"a varredura grava no processo o mesmo estado que a faixa da tela calcula",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "920010");
		const caseId = await silentCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "20000000620268260100",
			lastMovementAt: daysAgo(40),
			summary: "Conclusão para julgamento",
		});

		await tx.insert(movements).values({
			caseId,
			occurredAt: daysAgo(10),
			summary: "Juntada de petição",
			source: "datajud",
			externalCode: "51",
		});

		await new CaseAnalysisManager(tx).scan({ caseIds: [caseId], force: true });

		const [stored] = await tx
			.select({ state: cases.state, stateSince: cases.stateSince })
			.from(cases)
			.where(eq(cases.id, caseId));

		assertDefined(stored);
		expect(stored.state).toBe("conclusao");
		expect(stored.stateSince).toEqual(daysAgo(40));
	}),
);

// O radar ordena pelo estado gravado. Se a coluna divergir de `stateOf`, a primeira tela passa a
// mentir de um jeito novo: o processo aparece no lugar de um estado que ele não tem mais.
test(
	"o estado gravado é o mesmo que `stateOf` calcula sobre a história inteira do processo",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "920011");

		const historias = [
			["Conclusão para julgamento"],
			["Juntada de petição", "Conclusão para decisão"],
			["Juntada de petição", "Baixa Definitiva", "Conclusão para julgamento"],
			["Remessa ao Tribunal de Justiça", "Suspensão do processo por convenção das partes"],
			["Redistribuição por prevenção", "Distribuição por sorteio"],
			["Juntada de petição", "Juntada de documento"],
			[],
		];

		const caseIds: string[] = [];

		for (const resumos of historias) {
			const caseId = await seedCase(tx, {
				lawyerId: lawyer.id,
				cnjNumber: uniqueCnj(SUFIXO_TJSP),
				tribunal: "TJSP",
			});

			if (resumos.length) {
				await tx.insert(movements).values(
					resumos.map((summary, ordem) => ({
						caseId,
						occurredAt: daysAgo((ordem + 1) * 10),
						summary,
						source: "datajud" as const,
						externalCode: "51",
					})),
				);
			}

			caseIds.push(caseId);
		}

		await new CaseAnalysisManager(tx).scan({ caseIds, force: true });

		for (const caseId of caseIds) {
			// A história sai do banco na mesma ordem que a timeline da tela usa: comparar com a fixture
			// deixaria passar uma varredura que lê os movimentos na ordem errada.
			const historia = await tx
				.select({ summary: movements.summary, occurredAt: movements.occurredAt })
				.from(movements)
				.where(eq(movements.caseId, caseId))
				.orderBy(desc(movements.occurredAt), asc(movements.id));

			const [stored] = await tx
				.select({ state: cases.state, stateSince: cases.stateSince })
				.from(cases)
				.where(eq(cases.id, caseId));

			const calculado = stateOf(historia);

			assertDefined(stored);
			expect(stored.state).toBe(calculado.state);
			expect(stored.stateSince).toEqual(calculado.since);
		}
	}),
);

test(
	"processo dentro do limiar fica fora do radar",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "920001");

		await silentCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "20000000020268260100",
			lastMovementAt: daysAgo(SILENCE_THRESHOLD_DAYS - 5),
			summary: "Juntada de petição",
		});

		const radar = await new RadarManager(tx).silent({ lawyerId: lawyer.id });

		expect(radar.items).toHaveLength(0);
	}),
);

test(
	"processo sem cobertura do DataJud não entra no radar e ganha lista própria",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "920002");

		await silentCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "20000000120268260100",
			lastMovementAt: daysAgo(200),
			summary: "Juntada de petição",
			datajudStatus: "tribunal_nao_suportado",
		});

		const manager = new RadarManager(tx);
		const radar = await manager.silent({ lawyerId: lawyer.id });
		const blind = await manager.uncovered(lawyer.id);

		expect(radar.items).toHaveLength(0);
		expect(blind.items).toHaveLength(1);
		expect(blind.items[0]?.datajudStatus).toBe("tribunal_nao_suportado");
	}),
);

test(
	"processo baixado ou suspenso não aparece como esquecido",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "920003");

		await silentCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "20000000220268260100",
			lastMovementAt: daysAgo(400),
			summary: "Baixa Definitiva",
		});
		await silentCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "20000000720268260100",
			lastMovementAt: daysAgo(300),
			summary: "Suspensão do processo por convenção das partes",
		});

		const radar = await new RadarManager(tx).silent({ lawyerId: lawyer.id });

		expect(radar.items).toHaveLength(0);
	}),
);

test(
	"o concluso mais antigo lidera a lista mesmo com outro parado há mais tempo em tramitação",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "920004");

		await silentCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "20000000320268260100",
			lastMovementAt: daysAgo(100),
			summary: "Conclusão para julgamento",
		});
		await silentCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "20000000420268260100",
			lastMovementAt: daysAgo(120),
			summary: "Juntada de petição",
		});

		const radar = await new RadarManager(tx).silent({ lawyerId: lawyer.id });

		expect(radar.items).toHaveLength(2);

		const first = radar.items[0];

		assertDefined(first);
		expect(first.cnjNumber).toBe("20000000320268260100");
		expect(first.state).toBe("conclusao");
		expect(first.daysSilent).toBe(100);
		expect(first.lastMovementSummary).toBe("Conclusão para julgamento");
	}),
);

test(
	"o processo de maior risco lidera mesmo estando fora dos mais antigos que cabem no limite",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "920008");

		await silentCrowd(tx, {
			lawyerId: lawyer.id,
			count: RADAR_LIMIT,
			daysSilent: 200,
			state: "tramitando",
		});

		const leader = uniqueCnj(SUFIXO_TJSP);

		const [concluso] = await tx
			.insert(cases)
			.values({
				cnjNumber: leader,
				formattedNumber: formatCnj(leader),
				tribunal: "TJSP",
				state: "conclusao",
				stateSince: daysAgo(150),
				lastMovementAt: daysAgo(150),
				datajudStatus: "ok",
				datajudSyncedAt: new Date(),
			})
			.returning({ id: cases.id });

		assertDefined(concluso);

		await tx.insert(caseLawyers).values({ caseId: concluso.id, lawyerId: lawyer.id });

		const radar = await new RadarManager(tx).silent({ lawyerId: lawyer.id });
		const first = radar.items[0];

		assertDefined(first);
		expect(radar.items).toHaveLength(RADAR_LIMIT);
		expect(first.cnjNumber).toBe(leader);
		expect(first.score).toBe(225);
	}),
);

test(
	"carteira cheia de processos baixados não esconde o único que é risco",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "920009");

		await silentCrowd(tx, {
			lawyerId: lawyer.id,
			count: RADAR_LIMIT,
			daysSilent: 400,
			state: "baixado",
		});

		const forgotten = uniqueCnj(SUFIXO_TJSP);

		const [risky] = await tx
			.insert(cases)
			.values({
				cnjNumber: forgotten,
				formattedNumber: formatCnj(forgotten),
				tribunal: "TJSP",
				lastMovementAt: daysAgo(90),
				datajudStatus: "ok",
				datajudSyncedAt: new Date(),
			})
			.returning({ id: cases.id });

		assertDefined(risky);

		await tx.insert(caseLawyers).values({ caseId: risky.id, lawyerId: lawyer.id });

		const radar = await new RadarManager(tx).silent({ lawyerId: lawyer.id });

		expect(radar.items).toHaveLength(1);
		expect(radar.items[0]?.cnjNumber).toBe(forgotten);
	}),
);

test(
	"o processo de outro advogado não entra no radar dela",
	withRollback(async (tx) => {
		const mine = await seedLawyer(tx, "920005");
		const other = await seedLawyer(tx, "920006");

		await silentCase(tx, {
			lawyerId: other.id,
			cnjNumber: "20000000520268260100",
			lastMovementAt: daysAgo(300),
			summary: "Conclusão para julgamento",
		});

		const radar = await new RadarManager(tx).silent({ lawyerId: mine.id });

		expect(radar.items).toHaveLength(0);
	}),
);
