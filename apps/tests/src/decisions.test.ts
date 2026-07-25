import { caseDecisions } from "@kw-lawyer/api/src/db/schema/case_decisions.ts";
import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { classifyDecision } from "@kw-lawyer/api/src/features/decisions/classify.ts";
import type {
	CaseSource,
	CaseSourcePublication,
} from "@kw-lawyer/api/src/features/legal/case-scan.ts";
import { DecisionManager } from "@kw-lawyer/api/src/features/decisions/manager.ts";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { createTestClient } from "./utils/orpc.ts";
import { seedCase, seedDeadline, seedLawyer, seedPublication } from "./utils/seed.ts";

function publicationOf(textPlain: string, documentType: string): CaseSourcePublication {
	return {
		id: crypto.randomUUID(),
		documentType,
		communicationType: "Intimação",
		textPlain,
		availableAt: "2026-05-04",
		link: "https://exemplo.jus.br/publicacao",
	};
}

function movementSource(input: {
	summary: string;
	type: string | null;
	externalCode: string | null;
	publication: CaseSourcePublication | null;
}): CaseSource {
	return {
		movementId: crypto.randomUUID(),
		occurredAt: new Date("2026-05-04T00:00:00Z"),
		type: input.type,
		summary: input.summary,
		externalCode: input.externalCode,
		complements: null,
		publication: input.publication,
	};
}

test("classifica sentença de mérito pelo dispositivo e guarda o trecho decisório", () => {
	const classification = classifyDecision(
		movementSource({
			summary: "Intimação",
			type: null,
			externalCode: null,
			publication: publicationOf(
				"Diante do exposto, JULGO IMPROCEDENTES as pretensões formuladas. Sucumbente, condeno a autora ao pagamento das custas e honorários advocatícios fixados em R$ 700,00.",
				"Sentença",
			),
		}),
	);

	assertDefined(classification);

	expect(classification.species).toBe("sentenca");
	expect(classification.outcome).toBe("improcedente");
	expect(classification.effects).toContain("encerra_fase");
	expect(classification.effects).toContain("condena_verba");
	expect(classification.snippet).toContain("JULGO IMPROCEDENTES");
	expect(classification.confidence).toBe("alta");
});

test("acórdão que cita o art. 485 da sentença atacada é lido pelo que decidiu do recurso", () => {
	const classification = classifyDecision(
		movementSource({
			summary: "Intimação",
			type: null,
			externalCode: null,
			publication: publicationOf(
				"Negaram provimento ao recurso. V. U. - APELAÇÃO - SENTENÇA DE EXTINÇÃO, SEM JULGAMENTO DO MÉRITO (ART. 485, VI, DO CPC) - INSURGÊNCIA RECURSAL DO EXEQUENTE.",
				"Intimação de acórdão",
			),
		}),
	);

	assertDefined(classification);

	expect(classification.species).toBe("acordao");
	expect(classification.outcome).toBe("recurso_desprovido");
});

test("pauta de julgamento virtual não entra como decisão", () => {
	const classification = classifyDecision(
		movementSource({
			summary: "Intimação",
			type: null,
			externalCode: null,
			publication: publicationOf(
				"Número da pauta: 55 Íntegra da pauta de julgamento: https://esaj.tjsp.jus.br/pauta-julgamento-virtual Torno público, nos termos da Resolução n.º 984/2025, que regulamenta o julgamento eletrônico no âmbito do Tribunal de Justiça do Estado de São Paulo.",
				"Despacho",
			),
		}),
	);

	expect(classification).toBeNull();
});

test("movimento do DataJud sem teor decisório não vira linha na aba de decisões", () => {
	const vazio = classifyDecision(
		movementSource({
			summary: "Outras Decisões",
			type: "Outras Decisões",
			externalCode: "12164",
			publication: null,
		}),
	);

	expect(vazio).toBeNull();

	const comResultado = classifyDecision(
		movementSource({
			summary: "Procedência",
			type: "Procedência",
			externalCode: "219",
			publication: null,
		}),
	);

	assertDefined(comResultado);

	expect(comResultado.species).toBe("sentenca");
	expect(comResultado.outcome).toBe("procedente");
	expect(comResultado.confidence).toBe("alta");
});

test("despacho só entra quando produz efeito, não quando é mero expediente", () => {
	const semEfeito = classifyDecision(
		movementSource({
			summary: "Intimação",
			type: null,
			externalCode: null,
			publication: publicationOf("Vistos. Cumpra-se o v. Acórdão. Ciência às partes.", "Despacho"),
		}),
	);

	expect(semEfeito).toBeNull();

	const comPrazo = classifyDecision(
		movementSource({
			summary: "Intimação",
			type: null,
			externalCode: null,
			publication: publicationOf(
				"Vistos. Manifeste-se a parte autora sobre a contestação no prazo de 15 dias.",
				"Despacho",
			),
		}),
	);

	assertDefined(comPrazo);

	expect(comPrazo.species).toBe("despacho");
	expect(comPrazo.effects).toContain("abre_prazo");
});

test(
	"decisions.byCase devolve só o processo do advogado da sessão e aponta o prazo que a decisão gerou",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7301");
		const bruno = await seedLawyer(tx, "7302");
		const cnjNumber = "70010000920268260100";
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber,
			tribunal: "TJSP",
		});

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			textPlain:
				"Diante do exposto, JULGO PROCEDENTE o pedido e condeno a ré ao pagamento de honorários advocatícios.",
		});

		await tx.insert(movements).values({
			caseId,
			publicationId,
			occurredAt: new Date("2026-05-04T00:00:00Z"),
			type: "Intimação",
			summary: "sentença publicada",
		});

		await seedDeadline(tx, {
			lawyerId: alice.id,
			caseId,
			publicationId,
			title: "Apelação",
			dueAt: "2026-05-26",
		});

		const scan = await new DecisionManager(tx).scan({ caseIds: [caseId] });

		expect(scan.created).toBe(1);

		const aliceClient = createTestClient(tx, alice);
		const brunoClient = createTestClient(tx, bruno);

		const found = await aliceClient.decisions.byCase({ cnjNumber });
		const decision = found.items[0];

		assertDefined(decision);

		expect(found.items).toHaveLength(1);
		expect(decision.species).toBe("sentenca");
		expect(decision.outcome).toBe("procedente");
		expect(decision.publication?.link).toBe("https://exemplo.jus.br/publicacao");
		expect(decision.deadlines.map((deadline) => deadline.title)).toEqual(["Apelação"]);

		await expectOrpcError(brunoClient.decisions.byCase({ cnjNumber }), "NOT_FOUND");
	}),
);

test(
	"correção da advogada sobrevive ao reprocessamento do motor",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7303");
		const cnjNumber = "70020000920268260100";
		const caseId = await seedCase(tx, { lawyerId: alice.id, cnjNumber, tribunal: "TJSP" });

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			textPlain: "Diante do exposto, JULGO PROCEDENTE o pedido formulado na inicial.",
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
		const [original] = (await client.decisions.byCase({ cnjNumber })).items;

		assertDefined(original);

		await client.decisions.correct({
			id: original.id,
			outcome: "parcialmente_procedente",
			note: "O dispositivo acolheu apenas o pedido de danos materiais.",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId], force: true });

		const [corrected] = (await client.decisions.byCase({ cnjNumber })).items;

		assertDefined(corrected);

		expect(corrected.outcome).toBe("parcialmente_procedente");
		expect(corrected.origin).toBe("manual");
		expect(corrected.note).toBe("O dispositivo acolheu apenas o pedido de danos materiais.");
	}),
);

test(
	"decisão descartada sai da aba e o reprocessamento não a ressuscita",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7304");
		const cnjNumber = "70030000920268260100";
		const caseId = await seedCase(tx, { lawyerId: alice.id, cnjNumber, tribunal: "TJSP" });

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			textPlain: "Diante do exposto, JULGO PROCEDENTE o pedido formulado na inicial.",
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
		const [decision] = (await client.decisions.byCase({ cnjNumber })).items;

		assertDefined(decision);

		await client.decisions.dismiss({ id: decision.id });
		await new DecisionManager(tx).scan({ caseIds: [caseId], force: true });

		expect((await client.decisions.byCase({ cnjNumber })).items).toHaveLength(0);

		const [stored] = await tx
			.select({ dismissedAt: caseDecisions.dismissedAt })
			.from(caseDecisions)
			.where(and(eq(caseDecisions.id, decision.id), eq(caseDecisions.caseId, caseId)));

		assertDefined(stored);

		expect(stored.dismissedAt).not.toBeNull();
	}),
);

test(
	"o mesmo ato publicado para cada destinatário entra uma vez só na aba",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7305");
		const cnjNumber = "70040000920268260100";
		const caseId = await seedCase(tx, { lawyerId: alice.id, cnjNumber, tribunal: "TJSP" });
		const dispositivo =
			"Diante do exposto, JULGO PROCEDENTE o pedido e condeno a ré ao pagamento de honorários.";

		for (const destinatario of ["CARLA SOUZA LIMA", "COMPANHIA BRASILEIRA LTDA"]) {
			const publicationId = await seedPublication(tx, {
				lawyerIds: [alice.id],
				caseId,
				cnjNumber,
				availableAt: "2026-05-04",
				documentType: "Sentença",
				textPlain: `${dispositivo} Citado(s): ${destinatario}`,
			});

			await tx.insert(movements).values({
				caseId,
				publicationId,
				occurredAt: new Date("2026-05-04T00:00:00Z"),
				type: "Intimação",
				summary: "sentença publicada",
			});
		}

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const found = await client.decisions.byCase({ cnjNumber });

		expect(found.items).toHaveLength(1);
		expect(found.items[0]?.outcome).toBe("procedente");
	}),
);

test(
	"republicação do mesmo despacho não duplica a decisão",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7306");
		const cnjNumber = "70050000920268260100";
		const caseId = await seedCase(tx, { lawyerId: alice.id, cnjNumber, tribunal: "TJSP" });
		const ato = "Fls.2646/2654: Defiro o pedido de habilitação no prazo de 15 dias. Int.";

		for (const texto of [ato, `TEXTO REPUBLICADO POR NÃO CONSTAR O ADVOGADO. ${ato}`]) {
			const publicationId = await seedPublication(tx, {
				lawyerIds: [alice.id],
				caseId,
				cnjNumber,
				availableAt: "2026-02-02",
				textPlain: texto,
			});

			await tx.insert(movements).values({
				caseId,
				publicationId,
				occurredAt: new Date("2026-02-02T00:00:00Z"),
				type: "Intimação",
				summary: "despacho publicado",
			});
		}

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);

		expect((await client.decisions.byCase({ cnjNumber })).items).toHaveLength(1);
	}),
);
