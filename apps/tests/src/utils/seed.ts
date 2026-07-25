import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import {
	type DeadlineAudience,
	type DeadlineConfidence,
	type DeadlineOrigin,
	type DeadlineStatus,
	deadlines,
} from "@kw-lawyer/api/src/db/schema/deadlines.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { publicationLinks } from "@kw-lawyer/api/src/db/schema/publication_links.ts";
import { publications } from "@kw-lawyer/api/src/db/schema/publications.ts";
import {
	extractActBody,
	formatCnj,
	summarize,
} from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { assertDefined } from "./assertions.ts";

export async function seedLawyer(tx: Tx, oabNumber: string) {
	const [lawyer] = await tx
		.insert(lawyers)
		.values({ name: `ADVOGADO ${oabNumber}`, oabNumber, oabUf: "SP" })
		.returning({
			id: lawyers.id,
			name: lawyers.name,
			oabNumber: lawyers.oabNumber,
			oabUf: lawyers.oabUf,
		});

	assertDefined(lawyer);

	return lawyer;
}

export async function seedCase(
	tx: Tx,
	input: {
		lawyerId: string;
		cnjNumber: string;
		tribunal: string;
		className?: string;
		grau?: string;
	},
) {
	const [row] = await tx
		.insert(cases)
		.values({
			cnjNumber: input.cnjNumber,
			formattedNumber: formatCnj(input.cnjNumber),
			tribunal: input.tribunal,
			orgName: "1ª Vara Cível",
			className: input.className ?? "Procedimento Comum Cível",
			grau: input.grau ?? "G1",
		})
		.returning({ id: cases.id });

	assertDefined(row);

	await tx.insert(caseLawyers).values({ caseId: row.id, lawyerId: input.lawyerId });

	return row.id;
}

export async function seedPublication(
	tx: Tx,
	input: {
		lawyerIds: string[];
		caseId: string;
		cnjNumber: string;
		availableAt: string;
		textPlain: string;
		documentType?: string;
		tribunal?: string;
		readAt?: Date;
	},
) {
	const [row] = await tx
		.insert(publications)
		.values({
			externalId: crypto.randomUUID(),
			contentHash: crypto.randomUUID(),
			caseId: input.caseId,
			cnjNumber: input.cnjNumber,
			tribunal: input.tribunal ?? "TJSP",
			orgName: "1ª Vara Cível",
			communicationType: "Intimação",
			documentType: input.documentType ?? "Despacho",
			availableAt: input.availableAt,
			medium: "Diário de Justiça Eletrônico Nacional",
			link: "https://exemplo.jus.br/publicacao",
			textHtml: `<p>${input.textPlain}</p>`,
			textPlain: input.textPlain,
			excerpt: summarize(extractActBody(input.textPlain)),
			raw: {},
		})
		.returning({ id: publications.id });

	assertDefined(row);

	await tx.insert(publicationLinks).values(
		input.lawyerIds.map((lawyerId) => ({
			publicationId: row.id,
			lawyerId,
			readAt: input.readAt,
		})),
	);

	return row.id;
}

export interface SeedDeadlineInput {
	lawyerId: string;
	title: string;
	dueAt: string;
	caseId?: string;
	publicationId?: string;
	status?: DeadlineStatus;
	audience?: DeadlineAudience;
	confidence?: DeadlineConfidence;
	origin?: DeadlineOrigin;
	actKey?: string;
	snippet?: string;
	days?: number;
}

export async function seedDeadline(tx: Tx, input: SeedDeadlineInput) {
	const [row] = await tx
		.insert(deadlines)
		.values({
			lawyerId: input.lawyerId,
			caseId: input.caseId,
			publicationId: input.publicationId,
			title: input.title,
			dueAt: input.dueAt,
			days: input.days ?? 5,
			status: input.status,
			audience: input.audience,
			confidence: input.confidence,
			origin: input.origin,
			actKey: input.actKey,
			snippet: input.snippet,
		})
		.returning({ id: deadlines.id });

	assertDefined(row);

	return row.id;
}
