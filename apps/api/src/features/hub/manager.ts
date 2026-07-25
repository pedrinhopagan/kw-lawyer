import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseAppeals } from "../../db/schema/case_appeals.ts";
import { caseDecisions } from "../../db/schema/case_decisions.ts";
import { caseEvidence } from "../../db/schema/case_evidence.ts";
import { caseLawyers } from "../../db/schema/case_lawyers.ts";
import { cases } from "../../db/schema/cases.ts";
import { deadlines } from "../../db/schema/deadlines.ts";
import { publications } from "../../db/schema/publications.ts";
import { appealAdviceFor } from "../appeals/catalog.ts";
import { AppealManager } from "../appeals/manager.ts";
import { IncidentManager } from "../incidents/manager.ts";

const MATERIAL_LIMIT = 8;

export class HubManager {
	constructor(private readonly db: Db | Tx) {}

	async get(input: { lawyerId: string; deadlineId: string }) {
		const [deadline] = await this.db
			.select({
				id: deadlines.id,
				title: deadlines.title,
				actKey: deadlines.actKey,
				basis: deadlines.basis,
				days: deadlines.days,
				unit: deadlines.unit,
				availableAt: deadlines.availableAt,
				publishedAt: deadlines.publishedAt,
				startsAt: deadlines.startsAt,
				dueAt: deadlines.dueAt,
				expectedDueAt: deadlines.expectedDueAt,
				status: deadlines.status,
				origin: deadlines.origin,
				confidence: deadlines.confidence,
				audience: deadlines.audience,
				snippet: deadlines.snippet,
				note: deadlines.note,
				warnings: deadlines.warnings,
				calculation: deadlines.calculation,
				completedAt: deadlines.completedAt,
				caseId: deadlines.caseId,
				publicationId: deadlines.publicationId,
			})
			.from(deadlines)
			.where(and(eq(deadlines.id, input.deadlineId), eq(deadlines.lawyerId, input.lawyerId)))
			.limit(1);

		if (!deadline) {
			throw new ORPCError("NOT_FOUND", { message: "Prazo não encontrado." });
		}

		const [motive, caseRow] = await Promise.all([
			this.motiveOf(deadline.publicationId),
			this.caseOf(deadline.caseId, input.lawyerId),
		]);

		if (!caseRow) {
			return {
				deadline,
				motive,
				case: null,
				parties: [],
				evidence: [],
				decisions: [],
				satellites: [],
				history: [],
				appeal: null,
			};
		}

		const [evidence, decisions, satellites, history, appeal] = await Promise.all([
			this.evidenceOf(caseRow.id, deadline.publicationId),
			this.decisionsOf(caseRow.id, deadline.publicationId),
			new IncidentManager(this.db).byCase({
				lawyerId: input.lawyerId,
				caseId: caseRow.id,
				cnjNumber: caseRow.cnjNumber,
			}),
			this.historyOf(caseRow.id, input.lawyerId, deadline.id),
			this.appealOf(caseRow, deadline.publicationId, input.lawyerId),
		]);

		return {
			deadline,
			motive,
			case: caseRow,
			parties: caseRow.parties,
			evidence,
			decisions,
			satellites,
			history,
			appeal,
		};
	}

	private async motiveOf(publicationId: string | null) {
		if (!publicationId) {
			return null;
		}

		const [row] = await this.db
			.select({
				id: publications.id,
				availableAt: publications.availableAt,
				documentType: publications.documentType,
				communicationType: publications.communicationType,
				orgName: publications.orgName,
				medium: publications.medium,
				link: publications.link,
				excerpt: publications.excerpt,
				textPlain: publications.textPlain,
			})
			.from(publications)
			.where(eq(publications.id, publicationId))
			.limit(1);

		if (!row) {
			return null;
		}

		return row;
	}

	private async caseOf(caseId: string | null, lawyerId: string) {
		if (!caseId) {
			return null;
		}

		const [row] = await this.db
			.select({
				id: cases.id,
				cnjNumber: cases.cnjNumber,
				formattedNumber: cases.formattedNumber,
				tribunal: cases.tribunal,
				orgName: cases.orgName,
				className: cases.className,
				grau: cases.grau,
				orgJudgingName: cases.orgJudgingName,
				systemName: cases.systemName,
				parties: sql<{ name: string; polo: string | null }[]>`coalesce(
					(select json_agg(json_build_object('name', p.name, 'polo', p.polo) order by p.polo, p.name)
					 from case_parties p where p.case_id = ${cases.id}),
					'[]'::json
				)`,
			})
			.from(cases)
			.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
			.where(and(eq(cases.id, caseId), eq(caseLawyers.lawyerId, lawyerId)))
			.limit(1);

		if (!row) {
			return null;
		}

		return row;
	}

	private async evidenceOf(caseId: string, publicationId: string | null) {
		const rows = await this.db
			.select({
				id: caseEvidence.id,
				kind: caseEvidence.kind,
				stage: caseEvidence.stage,
				producedBy: caseEvidence.producedBy,
				title: caseEvidence.title,
				snippet: caseEvidence.snippet,
				occurredAt: caseEvidence.occurredAt,
				publicationId: caseEvidence.publicationId,
				availableAt: publications.availableAt,
				link: publications.link,
			})
			.from(caseEvidence)
			.leftJoin(publications, eq(publications.id, caseEvidence.publicationId))
			.where(and(eq(caseEvidence.caseId, caseId), isNull(caseEvidence.dismissedAt)))
			.orderBy(desc(caseEvidence.occurredAt))
			.limit(MATERIAL_LIMIT);

		return rows.map((row) => ({
			...row,
			fromThisAct: !!publicationId && row.publicationId === publicationId,
		}));
	}

	private async decisionsOf(caseId: string, publicationId: string | null) {
		const rows = await this.db
			.select({
				id: caseDecisions.id,
				species: caseDecisions.species,
				outcome: caseDecisions.outcome,
				effects: caseDecisions.effects,
				snippet: caseDecisions.snippet,
				decidedAt: caseDecisions.decidedAt,
				publicationId: caseDecisions.publicationId,
				availableAt: publications.availableAt,
				link: publications.link,
			})
			.from(caseDecisions)
			.leftJoin(publications, eq(publications.id, caseDecisions.publicationId))
			.where(
				and(
					eq(caseDecisions.caseId, caseId),
					isNull(caseDecisions.dismissedAt),
					ne(caseDecisions.species, "despacho"),
				),
			)
			.orderBy(desc(caseDecisions.decidedAt))
			.limit(MATERIAL_LIMIT);

		return rows.map((row) => ({
			...row,
			fromThisAct: !!publicationId && row.publicationId === publicationId,
		}));
	}

	private historyOf(caseId: string, lawyerId: string, currentId: string) {
		return this.db
			.select({
				id: deadlines.id,
				title: deadlines.title,
				dueAt: deadlines.dueAt,
				status: deadlines.status,
				audience: deadlines.audience,
				note: deadlines.note,
				completedAt: deadlines.completedAt,
			})
			.from(deadlines)
			.where(
				and(
					eq(deadlines.caseId, caseId),
					eq(deadlines.lawyerId, lawyerId),
					ne(deadlines.id, currentId),
				),
			)
			.orderBy(asc(deadlines.dueAt));
	}

	private async appealOf(
		caseRow: {
			id: string;
			cnjNumber: string;
			className: string | null;
			orgName: string | null;
			grau: string | null;
		},
		publicationId: string | null,
		lawyerId: string,
	) {
		if (!publicationId) {
			return null;
		}

		const [decision] = await this.db
			.select({
				id: caseDecisions.id,
				species: caseDecisions.species,
				choice: caseAppeals.choice,
				choiceActKey: caseAppeals.actKey,
				choiceReason: caseAppeals.reason,
			})
			.from(caseDecisions)
			.leftJoin(
				caseAppeals,
				and(eq(caseAppeals.decisionId, caseDecisions.id), eq(caseAppeals.lawyerId, lawyerId)),
			)
			.where(
				and(
					eq(caseDecisions.publicationId, publicationId),
					isNull(caseDecisions.dismissedAt),
					ne(caseDecisions.species, "despacho"),
				),
			)
			.limit(1);

		if (!decision) {
			return null;
		}

		const advice = appealAdviceFor({
			species: decision.species,
			grau: caseRow.grau,
			cnjNumber: caseRow.cnjNumber,
			className: caseRow.className,
			orgName: caseRow.orgName,
			transitedAt: await new AppealManager(this.db).transitedAt(caseRow.id),
		});

		return {
			decisionId: decision.id,
			species: decision.species,
			advice,
			choice: decision.choice,
			choiceActKey: decision.choiceActKey,
			choiceReason: decision.choiceReason,
		};
	}
}
