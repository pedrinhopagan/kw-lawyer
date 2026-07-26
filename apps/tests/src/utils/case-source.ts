import type {
	CaseSource,
	CaseSourcePublication,
} from "@kw-lawyer/api/src/features/legal/case-scan.ts";

export function publicationOf(textPlain: string, documentType: string): CaseSourcePublication {
	return {
		id: crypto.randomUUID(),
		documentType,
		communicationType: "Intimação",
		textPlain,
		availableAt: "2026-05-04",
		link: "https://exemplo.jus.br/publicacao",
	};
}

export function movementSource(input: {
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
