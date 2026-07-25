import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { classifyEvidence } from "@kw-lawyer/api/src/features/evidence/classify.ts";
import { EvidenceManager } from "@kw-lawyer/api/src/features/evidence/manager.ts";
import { expect, test } from "bun:test";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { createTestClient } from "./utils/orpc.ts";
import { seedCase, seedDeadline, seedLawyer, seedPublication } from "./utils/seed.ts";

function publicationSource(textPlain: string, documentType = "Despacho") {
	return {
		movementId: crypto.randomUUID(),
		occurredAt: new Date("2026-05-04T00:00:00Z"),
		type: "Intimação",
		summary: "intimação",
		externalCode: null,
		complements: null,
		publication: {
			id: crypto.randomUUID(),
			documentType,
			communicationType: "Intimação",
			textPlain,
			availableAt: "2026-05-04",
			link: "https://exemplo.jus.br/publicacao",
		},
	};
}

test("manifestação sobre laudo é prova pericial com prazo aberto", () => {
	const classification = classifyEvidence(
		publicationSource("Que as partes se manifestem sobre o laudo, no prazo de 15 dias."),
	);

	assertDefined(classification);

	expect(classification.kind).toBe("pericial");
	expect(classification.stage).toBe("manifestacao_aberta");
	expect(classification.snippet).toContain("laudo");
});

test("nomeação de perito é produção de prova deferida", () => {
	const classification = classifyEvidence(
		publicationSource(
			"Defiro a produção de prova pericial. Nomeio como perito o Dr. João, que deverá apresentar o laudo em 30 dias.",
		),
	);

	assertDefined(classification);

	expect(classification.kind).toBe("pericial");
	expect(classification.stage).toBe("deferida");
});

test("prova indeferida por desnecessária é registrada como indeferida", () => {
	const classification = classifyEvidence(
		publicationSource(
			"Indefiro a produção da prova pericial requerida pelo réu, por ser desnecessária a prova técnica no caso.",
		),
	);

	assertDefined(classification);

	expect(classification.stage).toBe("indeferida");
	expect(classification.producedBy).toBe("reu");
});

test("expediente de cartório não entra no dossiê como prova documental", () => {
	expect(
		classifyEvidence(
			publicationSource("Juntada de certidão de publicação e aviso de recebimento."),
		),
	).toBeNull();

	expect(classifyEvidence(publicationSource("Vistos. Cumpra-se o v. Acórdão."))).toBeNull();
});

test("movimento do DataJud sem termo de prova não entra no dossiê", () => {
	expect(
		classifyEvidence({
			movementId: crypto.randomUUID(),
			occurredAt: new Date("2026-05-04T00:00:00Z"),
			type: "Documento",
			summary: "Documento: Certidão",
			externalCode: "581",
			complements: [{ codigo: null, valor: null, nome: "Certidão", descricao: null }],
			publication: null,
		}),
	).toBeNull();
});

test(
	"evidence.byCase agrupa a prova com o prazo que ela abriu e respeita o escopo do advogado",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7401");
		const bruno = await seedLawyer(tx, "7402");
		const cnjNumber = "74010000920268260100";
		const caseId = await seedCase(tx, { lawyerId: alice.id, cnjNumber, tribunal: "TJSP" });

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-04",
			textPlain: "Que as partes se manifestem sobre o laudo pericial, no prazo de 15 dias.",
		});

		await tx.insert(movements).values({
			caseId,
			publicationId,
			occurredAt: new Date("2026-05-04T00:00:00Z"),
			type: "Intimação",
			summary: "manifestação sobre laudo",
		});

		await seedDeadline(tx, {
			lawyerId: alice.id,
			caseId,
			publicationId,
			title: "Manifestação sobre laudo",
			dueAt: "2026-05-26",
		});

		await new EvidenceManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const found = await client.evidence.byCase({ cnjNumber });
		const evidence = found.items[0];

		assertDefined(evidence);

		expect(evidence.kind).toBe("pericial");
		expect(evidence.stage).toBe("manifestacao_aberta");
		expect(evidence.hasSourceLink).toBe(true);
		expect(evidence.deadlines.map((deadline) => deadline.title)).toEqual([
			"Manifestação sobre laudo",
		]);

		await expectOrpcError(createTestClient(tx, bruno).evidence.byCase({ cnjNumber }), "NOT_FOUND");
	}),
);

test(
	"reclassificação da advogada sobrevive ao reprocessamento",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7403");
		const cnjNumber = "74020000920268260100";
		const caseId = await seedCase(tx, { lawyerId: alice.id, cnjNumber, tribunal: "TJSP" });

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-04",
			textPlain: "Que as partes se manifestem sobre o laudo pericial, no prazo de 15 dias.",
		});

		await tx.insert(movements).values({
			caseId,
			publicationId,
			occurredAt: new Date("2026-05-04T00:00:00Z"),
			type: "Intimação",
			summary: "manifestação sobre laudo",
		});

		await new EvidenceManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const [original] = (await client.evidence.byCase({ cnjNumber })).items;

		assertDefined(original);

		await client.evidence.correct({ id: original.id, producedBy: "autor" });
		await new EvidenceManager(tx).scan({ caseIds: [caseId], force: true });

		const [corrected] = (await client.evidence.byCase({ cnjNumber })).items;

		assertDefined(corrected);

		expect(corrected.producedBy).toBe("autor");
		expect(corrected.origin).toBe("manual");
	}),
);
