import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import {
	type CaseIdentity,
	classifyRelations,
} from "@kw-lawyer/api/src/features/incidents/classify.ts";
import { IncidentManager } from "@kw-lawyer/api/src/features/incidents/manager.ts";
import { expect, test } from "bun:test";
import { assertDefined } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { createTestClient } from "./utils/orpc.ts";
import { seedCase, seedLawyer, seedPublication } from "./utils/seed.ts";

const NO_KNOWN_CASES = new Map<string, CaseIdentity>();

const PRINCIPAL = "10041767520198260022";
const CUMPRIMENTO = "00018349820258260022";
const AGRAVO = "20223109920268260000";

function source(textPlain: string) {
	return {
		movementId: crypto.randomUUID(),
		occurredAt: new Date("2026-05-04T00:00:00Z"),
		type: "Intimação",
		summary: "intimação",
		externalCode: null,
		complements: null,
		publication: {
			id: crypto.randomUUID(),
			documentType: "Despacho",
			communicationType: "Intimação",
			textPlain,
			availableAt: "2026-05-04",
			link: "https://exemplo.jus.br/publicacao",
		},
	};
}

test("marcador de processo principal do DJEN define a orientação do vínculo", () => {
	const [relation] = classifyRelations({
		self: { cnjNumber: CUMPRIMENTO, className: "Cumprimento de sentença", grau: "G1" },
		source: source(
			"Processo 0001834-98.2025.8.26.0022 (processo principal 1004176-75.2019.8.26.0022) - Cumprimento de sentença - Seguro - José Antonio Cardoso - Banco do Brasil S/A - Ante o exposto, REJEITO a impugnação.",
		),
		known: (cnjNumber) => NO_KNOWN_CASES.get(cnjNumber),
	});

	assertDefined(relation);

	expect(relation.incidentCnjNumber).toBe(CUMPRIMENTO);
	expect(relation.principalCnjNumber).toBe(PRINCIPAL);
	expect(relation.kind).toBe("cumprimento_sentenca");
});

test("agravo citando o processo de origem aponta o principal certo", () => {
	const [relation] = classifyRelations({
		self: { cnjNumber: AGRAVO, className: "Agravo de Instrumento", grau: "G2" },
		source: source(
			"AGRAVO DE INSTRUMENTO Nº 2022310-99.2026.8.26.0000 - Origem: processo 1004176-75.2019.8.26.0022 - Limeira - Vistos.",
		),
		known: () => ({ cnjNumber: PRINCIPAL, className: "Procedimento Comum Cível", grau: "G1" }),
	});

	assertDefined(relation);

	expect(relation.incidentCnjNumber).toBe(AGRAVO);
	expect(relation.principalCnjNumber).toBe(PRINCIPAL);
	expect(relation.kind).toBe("agravo_instrumento");
});

test("citação ambígua entre dois processos comuns não inventa vínculo", () => {
	expect(
		classifyRelations({
			self: { cnjNumber: PRINCIPAL, className: "Procedimento Comum Cível", grau: "G1" },
			source: source(
				"Processo 1004176-75.2019.8.26.0022 - Vistos. Conforme decidido nos autos 1009999-11.2020.8.26.0022, aplica-se o mesmo entendimento.",
			),
			known: (cnjNumber) => NO_KNOWN_CASES.get(cnjNumber),
		}),
	).toEqual([]);
});

test(
	"o principal enxerga o satélite e o satélite enxerga o principal, com o estado do incidente",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7601");
		const principalId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: PRINCIPAL,
			tribunal: "TJSP",
		});
		const agravoId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: AGRAVO,
			tribunal: "TJSP",
			className: "Agravo de Instrumento",
			grau: "G2",
		});

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId: agravoId,
			cnjNumber: AGRAVO,
			availableAt: "2026-05-04",
			textPlain:
				"AGRAVO DE INSTRUMENTO Nº 2022310-99.2026.8.26.0000 (processo principal 1004176-75.2019.8.26.0022) - Vistos. Recebo o agravo.",
		});

		await tx.insert(movements).values([
			{
				caseId: agravoId,
				publicationId,
				occurredAt: new Date("2026-05-04T00:00:00Z"),
				type: "Intimação",
				summary: "agravo distribuído",
			},
			{
				caseId: agravoId,
				occurredAt: new Date("2026-05-06T00:00:00Z"),
				type: "Com efeito suspensivo",
				summary: "Com efeito suspensivo",
				source: "datajud",
				externalCode: "394",
			},
		]);

		await new IncidentManager(tx).scan({ caseIds: [agravoId] });

		const client = createTestClient(tx, alice);

		const doAgravo = await client.incidents.byCase({ cnjNumber: AGRAVO });
		const doPrincipal = await client.incidents.byCase({ cnjNumber: PRINCIPAL });

		const visaoAgravo = doAgravo.items[0];
		const visaoPrincipal = doPrincipal.items[0];

		assertDefined(visaoAgravo);
		assertDefined(visaoPrincipal);

		expect(visaoAgravo.role).toBe("principal");
		expect(visaoAgravo.counterpart.cnjNumber).toBe(PRINCIPAL);

		expect(visaoPrincipal.role).toBe("satelite");
		expect(visaoPrincipal.counterpart.cnjNumber).toBe(AGRAVO);
		expect(visaoPrincipal.kind).toBe("agravo_instrumento");
		expect(visaoPrincipal.suspensiveEffect).toBe(true);
		expect(visaoPrincipal.state).toBe("liminar_deferida");

		const suspensoes = await client.incidents.suspensions();

		expect(suspensoes.map((row) => row.caseId)).toEqual([principalId]);
		expect(suspensoes[0]?.incidentCnjNumber).toBe(AGRAVO);
	}),
);
