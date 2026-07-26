import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseInstances } from "@kw-lawyer/api/src/db/schema/case_instances.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { caseParties } from "@kw-lawyer/api/src/db/schema/case_parties.ts";
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

export const SEED_HISTORY_CUTOFF = "2000-01-01";

let cnjSequence = 0;

// O índice único de `cases.cnj_number` não é isolado por MVCC: dois testes concorrentes que gravam o
// mesmo número esperam um pelo outro no índice até o rollback e, quando cada lote pega os números em
// ordem diferente, o Postgres mata um dos dois por deadlock. Cada teste pede os números que só ele
// vai usar. O sufixo carrega o resto do CNJ (dígitos, ano, segmento, tribunal e origem), que é o que
// o app lê para decidir ramo da justiça e tribunal.
export function uniqueCnj(suffix: string) {
	cnjSequence += 1;

	return `${String(cnjSequence).padStart(7, "0")}${suffix}`;
}

export async function seedLawyer(tx: Tx, oabNumber: string, historyCutoffAt = SEED_HISTORY_CUTOFF) {
	const [lawyer] = await tx
		.insert(lawyers)
		.values({
			name: `ADVOGADO ${oabNumber}`,
			oabNumber,
			oabUf: "SP",
			historyCutoffAt,
			onboardingState: "pronto",
		})
		.returning({
			id: lawyers.id,
			name: lawyers.name,
			oabNumber: lawyers.oabNumber,
			oabUf: lawyers.oabUf,
			historyCutoffAt: lawyers.historyCutoffAt,
			onboardingState: lawyers.onboardingState,
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
		orgName?: string;
		graus?: string[];
		parties?: { name: string; polo: string }[];
	},
) {
	const [row] = await tx
		.insert(cases)
		.values({
			cnjNumber: input.cnjNumber,
			formattedNumber: formatCnj(input.cnjNumber),
			tribunal: input.tribunal,
			orgName: input.orgName ?? "1ª Vara Cível",
			className: input.className ?? "Procedimento Comum Cível",
		})
		.returning({ id: cases.id });

	assertDefined(row);

	await tx.insert(caseLawyers).values({ caseId: row.id, lawyerId: input.lawyerId });

	await tx.insert(caseInstances).values(
		(input.graus ?? ["G1"]).map((grau) => ({
			caseId: row.id,
			grau,
			orgJudgingName: "1ª Vara Cível",
		})),
	);

	if (input.parties?.length) {
		await tx
			.insert(caseParties)
			.values(input.parties.map((party) => ({ caseId: row.id, ...party })));
	}

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
		orgName?: string;
		className?: string;
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
			orgName: input.orgName ?? "1ª Vara Cível",
			className: input.className,
			communicationType: "Intimação",
			documentType: input.documentType ?? "Despacho",
			availableAt: input.availableAt,
			medium: "Diário de Justiça Eletrônico Nacional",
			link: "https://exemplo.jus.br/publicacao",
			textHtml: `<p>${input.textPlain}</p>`,
			textPlain: input.textPlain,
			excerpt: summarize(extractActBody(input.textPlain)),
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
