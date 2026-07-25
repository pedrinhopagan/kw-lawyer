import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { appealAdviceFor } from "@kw-lawyer/api/src/features/appeals/catalog.ts";
import { DecisionManager } from "@kw-lawyer/api/src/features/decisions/manager.ts";
import { expect, test } from "bun:test";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { createTestClient } from "./utils/orpc.ts";
import { seedCase, seedLawyer, seedPublication } from "./utils/seed.ts";

const CNJ_ESTADUAL = "75010000920268260100";
const CNJ_TRABALHISTA = "75020000920265150060";

const BASE_CONTEXT: Parameters<typeof appealAdviceFor>[0] = {
	species: "sentenca",
	grau: "G1",
	cnjNumber: CNJ_ESTADUAL,
	className: "Procedimento Comum Cível",
	orgName: "1ª Vara Cível",
	transitedAt: null,
};

test("sentença comum estadual cabe apelação com prazo de 15 dias úteis", () => {
	const advice = appealAdviceFor(BASE_CONTEXT);
	const apelacao = advice.options.find((option) => option.actKey === "apelacao");

	assertDefined(apelacao);

	expect(apelacao.days).toBe(15);
	expect(apelacao.unit).toBe("uteis");
	expect(apelacao.admissibilityBasis).toBe("CPC, art. 1.009");
	expect(apelacao.needsPreparo).toBe(true);
	expect(advice.options.map((option) => option.actKey)).toContain("embargos_declaracao");
});

test("sentença de juizado especial cabe recurso inominado em 10 dias, não apelação", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		className: "Procedimento do Juizado Especial Cível",
		grau: "JE",
	});
	const keys = advice.options.map((option) => option.actKey);

	expect(keys).toContain("recurso_inominado");
	expect(keys).not.toContain("apelacao");

	const inominado = advice.options.find((option) => option.actKey === "recurso_inominado");

	assertDefined(inominado);

	expect(inominado.days).toBe(10);
});

test("sentença trabalhista cabe recurso ordinário em 8 dias", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		cnjNumber: CNJ_TRABALHISTA,
		className: "Ação Trabalhista",
	});
	const ordinario = advice.options.find((option) => option.actKey === "recurso_ordinario");

	assertDefined(ordinario);

	expect(ordinario.days).toBe(8);
	expect(advice.options.map((option) => option.actKey)).not.toContain("apelacao");
});

test("interlocutória trabalhista é irrecorrível de imediato e o app diz por quê", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		species: "interlocutoria",
		cnjNumber: CNJ_TRABALHISTA,
	});

	assertDefined(advice.blocked);

	expect(advice.blocked.basis).toBe("TST, Súmula 214");
	expect(advice.options.map((option) => option.actKey)).not.toContain("agravo_instrumento");
});

test("interlocutória estadual cabe agravo de instrumento com a ressalva do rol", () => {
	const advice = appealAdviceFor({ ...BASE_CONTEXT, species: "interlocutoria" });
	const agravo = advice.options.find((option) => option.actKey === "agravo_instrumento");

	assertDefined(agravo);
	assertDefined(agravo.condition);

	expect(agravo.admissibilityBasis).toBe("CPC, art. 1.015");
	expect(agravo.condition).toContain("1.015");
});

test("decisão monocrática de relator cabe agravo interno sem preparo", () => {
	const advice = appealAdviceFor({ ...BASE_CONTEXT, species: "monocratica", grau: "G2" });
	const interno = advice.options.find((option) => option.actKey === "agravo_interno");

	assertDefined(interno);

	expect(interno.needsPreparo).toBe(false);
	expect(interno.admissibilityBasis).toBe("CPC, art. 1.021");
});

test("acórdão de turma recursal não abre recurso especial", () => {
	const advice = appealAdviceFor({ ...BASE_CONTEXT, species: "acordao", grau: "TR" });
	const especial = advice.options.find((option) => option.actKey === "recurso_especial");

	assertDefined(especial);
	assertDefined(especial.condition);

	expect(especial.condition).toContain("Súmula 203");
});

test("despacho não é recorrível e o trânsito em julgado fecha todas as vias", () => {
	const despacho = appealAdviceFor({ ...BASE_CONTEXT, species: "despacho" });

	assertDefined(despacho.blocked);

	expect(despacho.options).toHaveLength(0);
	expect(despacho.blocked.basis).toBe("CPC, art. 1.001");

	const transitado = appealAdviceFor({
		...BASE_CONTEXT,
		transitedAt: new Date("2026-04-01T00:00:00Z"),
	});

	assertDefined(transitado.blocked);

	expect(transitado.options).toHaveLength(0);
	expect(transitado.blocked.basis).toBe("CPC, art. 502");
});

test(
	"escolher recorrer abre prazo com memória de cálculo e o ato nomeado na agenda",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7501");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_ESTADUAL,
			tribunal: "TJSP",
		});

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber: CNJ_ESTADUAL,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			textPlain: "Diante do exposto, JULGO IMPROCEDENTE o pedido. Condeno o autor nas custas.",
		});

		await tx.insert(movements).values({
			caseId,
			publicationId,
			occurredAt: new Date("2026-05-04T00:00:00Z"),
			type: "Intimação",
			summary: "sentença publicada",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const recorriveis = await client.appeals.byCase({ cnjNumber: CNJ_ESTADUAL });
		const first = recorriveis.items[0];

		assertDefined(first);

		expect(first.decision.species).toBe("sentenca");
		expect(first.choice).toBeUndefined();

		await client.appeals.choose({
			decisionId: first.decision.id,
			choice: "recorrer",
			actKey: "apelacao",
		});

		const agenda = await client.deadlines.list({ query: "Apelação" });
		const prazo = agenda.items[0];

		assertDefined(prazo);

		expect(prazo.title).toBe("Apelação");
		expect(prazo.origin).toBe("manual");
		expect(prazo.audience).toBe("partes");
		expect(prazo.basis).toContain("CPC, art. 1.009");
		expect(prazo.dueAt).toBe("2026-05-26");

		const depois = await client.appeals.byCase({ cnjNumber: CNJ_ESTADUAL });

		expect(depois.items[0]?.choice?.choice).toBe("recorrer");
		expect(depois.items[0]?.choice?.deadlineId).toBe(prazo.id);
	}),
);

test(
	"recurso não cabível contra a decisão é recusado",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7502");
		const cnjNumber = "75030000920268260100";
		const caseId = await seedCase(tx, { lawyerId: alice.id, cnjNumber, tribunal: "TJSP" });

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			textPlain: "Diante do exposto, JULGO IMPROCEDENTE o pedido.",
		});

		await tx.insert(movements).values({
			caseId,
			publicationId,
			occurredAt: new Date("2026-05-04T00:00:00Z"),
			type: "Intimação",
			summary: "sentença publicada",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const [first] = (await client.appeals.byCase({ cnjNumber })).items;

		assertDefined(first);

		await expectOrpcError(
			client.appeals.choose({
				decisionId: first.decision.id,
				choice: "recorrer",
				actKey: "agravo_instrumento",
			}),
			"BAD_REQUEST",
		);

		await client.appeals.choose({
			decisionId: first.decision.id,
			choice: "nao_recorrer",
			reason: "Cliente orientado a não recorrer: valor da causa não justifica o preparo.",
		});

		const depois = await client.appeals.byCase({ cnjNumber });

		expect(depois.items[0]?.choice?.choice).toBe("nao_recorrer");
		expect(depois.items[0]?.choice?.deadlineId).toBeNull();
	}),
);
