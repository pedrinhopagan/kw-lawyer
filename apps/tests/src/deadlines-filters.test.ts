import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { expect, test } from "bun:test";
import { withRollback } from "./utils/db.ts";
import { createTestClient } from "./utils/orpc.ts";
import { seedCase, seedDeadline, seedLawyer } from "./utils/seed.ts";

const TODAY = "2026-07-25";

const titlesOf = (result: { items: { title: string }[] }) => result.items.map((item) => item.title);

async function seedAxisScenario(tx: Tx, oabNumber: string) {
	const lawyer = await seedLawyer(tx, oabNumber);
	const estadual = await seedCase(tx, {
		lawyerId: lawyer.id,
		cnjNumber: `1020457852023826010${oabNumber.slice(-1)}`,
		tribunal: "TJSP",
	});
	const federal = await seedCase(tx, {
		lawyerId: lawyer.id,
		cnjNumber: `5001234562025403610${oabNumber.slice(-1)}`,
		tribunal: "TRF3",
	});

	await seedDeadline(tx, {
		lawyerId: lawyer.id,
		caseId: estadual,
		title: "Contrarrazões",
		dueAt: "2026-08-03",
		audience: "partes",
		confidence: "alta",
		origin: "automatico",
		actKey: "contrarrazoes",
	});
	await seedDeadline(tx, {
		lawyerId: lawyer.id,
		caseId: estadual,
		title: "Laudo pericial",
		dueAt: "2026-08-04",
		audience: "terceiro",
		confidence: "baixa",
		origin: "automatico",
		actKey: "laudo",
	});
	await seedDeadline(tx, {
		lawyerId: lawyer.id,
		caseId: federal,
		title: "Petição avulsa",
		dueAt: "2026-08-05",
		status: "pendente",
		audience: "partes",
		confidence: "media",
		origin: "manual",
	});
	await seedDeadline(tx, {
		lawyerId: lawyer.id,
		caseId: estadual,
		title: "Apelação protocolada",
		dueAt: "2026-08-06",
		status: "cumprido",
		audience: "partes",
		confidence: "alta",
		origin: "automatico",
		actKey: "apelacao",
	});

	return { lawyer, client: createTestClient(tx, lawyer) };
}

test(
	"o recorte da ação dela mantém o vencido e derruba prazo de terceiro e prazo fechado",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "94101");

		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Contrarrazões vencidas",
			dueAt: "2026-07-20",
			audience: "partes",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Embargos futuros",
			dueAt: "2026-09-01",
			status: "pendente",
			audience: "partes",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Laudo do perito",
			dueAt: "2026-07-28",
			audience: "terceiro",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Já protocolado",
			dueAt: "2026-07-22",
			status: "cumprido",
			audience: "partes",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Fora da agenda",
			dueAt: "2026-07-30",
			status: "descartado",
			audience: "partes",
		});

		const client = createTestClient(tx, lawyer);
		const actionable = await client.deadlines.list({ actionable: true });

		expect(titlesOf(actionable)).toEqual(["Contrarrazões vencidas", "Embargos futuros"]);
		expect(actionable.total).toBe(2);

		const semRecorte = await client.deadlines.list({});

		expect(titlesOf(semRecorte)).toContain("Laudo do perito");

		const fechados = await client.deadlines.list({
			actionable: true,
			status: ["cumprido", "descartado"],
		});

		expect(titlesOf(fechados)).toEqual(["Já protocolado", "Fora da agenda"]);
	}),
);

test(
	"cada eixo de filtro corta a lista pelo próprio campo",
	withRollback(async (tx) => {
		const { client } = await seedAxisScenario(tx, "94102");

		expect(titlesOf(await client.deadlines.list({}))).toEqual([
			"Contrarrazões",
			"Laudo pericial",
			"Petição avulsa",
		]);
		expect(titlesOf(await client.deadlines.list({ status: ["cumprido"] }))).toEqual([
			"Apelação protocolada",
		]);
		expect(titlesOf(await client.deadlines.list({ audience: ["terceiro"] }))).toEqual([
			"Laudo pericial",
		]);
		expect(titlesOf(await client.deadlines.list({ confidence: ["media"] }))).toEqual([
			"Petição avulsa",
		]);
		expect(titlesOf(await client.deadlines.list({ origin: ["manual"] }))).toEqual([
			"Petição avulsa",
		]);
		expect(titlesOf(await client.deadlines.list({ actKeys: ["laudo"] }))).toEqual([
			"Laudo pericial",
		]);
		expect(titlesOf(await client.deadlines.list({ tribunals: ["TRF3"] }))).toEqual([
			"Petição avulsa",
		]);
		expect(
			titlesOf(await client.deadlines.list({ audience: ["partes"], confidence: ["alta"] })),
		).toEqual(["Contrarrazões"]);
		expect(titlesOf(await client.deadlines.list({ from: "2026-08-04", to: "2026-08-05" }))).toEqual(
			["Laudo pericial", "Petição avulsa"],
		);
	}),
);

test(
	"a busca textual acha pelo título, pelo trecho da publicação e pelo número do processo",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "94103");
		const caseId = await seedCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "10204578520238260100",
			tribunal: "TJSP",
		});

		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			caseId,
			title: "Contrarrazões de apelação",
			dueAt: "2026-08-03",
			snippet: "Manifeste-se a parte sobre o laudo contábil apresentado.",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Embargos de declaração",
			dueAt: "2026-08-04",
			snippet: "Prazo de 5 (cinco) dias para embargar.",
		});

		const client = createTestClient(tx, lawyer);

		expect(titlesOf(await client.deadlines.list({ query: "contrarrazões" }))).toEqual([
			"Contrarrazões de apelação",
		]);
		expect(titlesOf(await client.deadlines.list({ query: "contábil" }))).toEqual([
			"Contrarrazões de apelação",
		]);
		expect(titlesOf(await client.deadlines.list({ query: "1020457-85.2023" }))).toEqual([
			"Contrarrazões de apelação",
		]);
		expect(await client.deadlines.list({ query: "%" })).toMatchObject({ total: 0 });
	}),
);

test(
	"o resumo conta ação dela, pendentes, cumpridos e descartados sob o mesmo recorte",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "94104");

		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Vencido",
			dueAt: "2026-07-20",
			audience: "partes",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Hoje",
			dueAt: TODAY,
			status: "pendente",
			audience: "partes",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Do perito",
			dueAt: "2026-07-27",
			audience: "terceiro",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Protocolado",
			dueAt: "2026-07-24",
			status: "cumprido",
			audience: "partes",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Descartado",
			dueAt: "2026-07-28",
			status: "descartado",
			audience: "partes",
		});

		const client = createTestClient(tx, lawyer);
		const summary = await client.deadlines.summary({ today: TODAY });

		expect(summary).toMatchObject({
			overdue: 1,
			today: 1,
			next7: 1,
			actionable: 2,
			pending: 3,
			done: 1,
			dismissed: 1,
		});

		const recortado = await client.deadlines.summary({ today: TODAY, audience: ["partes"] });

		expect(recortado).toMatchObject({
			actionable: 2,
			pending: 2,
			done: 1,
			dismissed: 1,
		});
	}),
);

test(
	"a agenda entrega as partes do processo com o polo ativo à frente",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "94107");
		const caseId = await seedCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber: "10204578520238260107",
			tribunal: "TJSP",
			parties: [
				{ name: "JOANA PEREIRA MENDES", polo: "P" },
				{ name: "MASSA FALIDA DE CERAMICA MODELO LTDA", polo: "A" },
			],
		});

		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			caseId,
			title: "Contrarrazões",
			dueAt: "2026-08-03",
			audience: "partes",
		});

		const client = createTestClient(tx, lawyer);
		const agenda = await client.deadlines.list({});

		expect(agenda.items[0]?.parties).toEqual([
			{ name: "MASSA FALIDA DE CERAMICA MODELO LTDA", polo: "A" },
			{ name: "JOANA PEREIRA MENDES", polo: "P" },
		]);
		expect(agenda.items[0]?.case?.className).toBe("Procedimento Comum Cível");
	}),
);

test(
	"os filtros novos nunca alcançam a agenda de outra advogada",
	withRollback(async (tx) => {
		const alice = await seedAxisScenario(tx, "94105");
		const bruno = await seedAxisScenario(tx, "94106");

		expect(await bruno.client.deadlines.list({ tribunals: ["TRF3"] })).toMatchObject({ total: 1 });
		expect(await alice.client.deadlines.list({ tribunals: ["TRF3"] })).toMatchObject({ total: 1 });
		expect(await alice.client.deadlines.list({ actionable: true })).toMatchObject({ total: 2 });
		expect(await alice.client.deadlines.list({ query: "Laudo" })).toMatchObject({ total: 1 });
		expect(await alice.client.deadlines.summary({ today: TODAY })).toMatchObject({
			pending: 3,
			done: 1,
			dismissed: 0,
		});
	}),
);
