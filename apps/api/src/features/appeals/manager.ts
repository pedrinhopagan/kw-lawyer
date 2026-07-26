import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { type AppealChoice, caseAppeals } from "../../db/schema/case_appeals.ts";
import { caseDecisions } from "../../db/schema/case_decisions.ts";
import { cases } from "../../db/schema/cases.ts";
import { type DeadlineStatus, deadlines } from "../../db/schema/deadlines.ts";
import { movements } from "../../db/schema/movements.ts";
import { publications } from "../../db/schema/publications.ts";
import { currentInstance, instancesByCase } from "../cases/instances.ts";
import { CaseManager } from "../cases/manager.ts";
import { DeadlineManager } from "../deadlines/manager.ts";
import type { DecisionSpecies, DecisionSpeciesConfidence } from "../decisions/classify.ts";
import { DecisionManager } from "../decisions/manager.ts";
import { ownedByLawyer } from "../legal/scope.ts";
import { appealAdviceFor } from "./catalog.ts";

const TRANSIT_MOVEMENT_CODE = "848";

interface AppealChoiceRecord {
	decisionId: string;
	choice: AppealChoice;
	actKey: string | null;
	reason: string | null;
	deadlineId: string | null;
	decidedAt: Date;
	deadline: { title: string; dueAt: string; status: DeadlineStatus } | null;
}

export class AppealManager {
	constructor(private readonly db: Db | Tx) {}

	async transitedAt(caseId: string) {
		const [row] = await this.db
			.select({ occurredAt: movements.occurredAt })
			.from(movements)
			.where(and(eq(movements.caseId, caseId), eq(movements.externalCode, TRANSIT_MOVEMENT_CODE)))
			.orderBy(desc(movements.occurredAt))
			.limit(1);

		if (!row) {
			return null;
		}

		return row.occurredAt;
	}

	async byCase(input: { lawyerId: string; cnjNumber: string }) {
		const found = await new CaseManager(this.db).requireByCnj(input);
		const [decisions, transitedAt] = await Promise.all([
			new DecisionManager(this.db).byCase({ lawyerId: input.lawyerId, caseId: found.id }),
			this.transitedAt(found.id),
		]);

		const choices = await this.choicesOf(
			input.lawyerId,
			decisions.map((decision) => decision.id),
		);

		const items = decisions.map((decision) => ({
			decision,
			advice: appealAdviceFor({
				species: decision.species,
				speciesConfidence: decision.speciesConfidence,
				currentGrau: found.instance?.grau,
				cnjNumber: found.cnjNumber,
				className: found.className,
				caseOrgName: found.orgName,
				decisionGrau: decision.grau,
				decisionPublication: decision.publication,
				transitedAt,
			}),
			choice: choices.get(decision.id),
		}));

		return {
			case: found,
			transitedAt,
			items: items.filter((item) => item.advice.options.length > 0),
		};
	}

	private async choicesOf(lawyerId: string, decisionIds: string[]) {
		if (!decisionIds.length) {
			return new Map<string, AppealChoiceRecord>();
		}

		const rows = await this.db
			.select({
				decisionId: caseAppeals.decisionId,
				choice: caseAppeals.choice,
				actKey: caseAppeals.actKey,
				reason: caseAppeals.reason,
				deadlineId: caseAppeals.deadlineId,
				decidedAt: caseAppeals.decidedAt,
				deadline: {
					title: deadlines.title,
					dueAt: deadlines.dueAt,
					status: deadlines.status,
				},
			})
			.from(caseAppeals)
			.leftJoin(deadlines, eq(deadlines.id, caseAppeals.deadlineId))
			.where(and(eq(caseAppeals.lawyerId, lawyerId), inArray(caseAppeals.decisionId, decisionIds)));

		return new Map(rows.map((row) => [row.decisionId, row]));
	}

	async choose(input: {
		lawyerId: string;
		decisionId: string;
		choice: AppealChoice;
		actKey?: string;
		reason?: string | null;
	}) {
		const [decision] = await this.db
			.select({
				id: caseDecisions.id,
				caseId: caseDecisions.caseId,
				species: caseDecisions.species,
				speciesConfidence: caseDecisions.speciesConfidence,
				decidedAt: caseDecisions.decidedAt,
				publicationId: caseDecisions.publicationId,
				publicationAvailableAt: publications.availableAt,
				publication: {
					orgName: publications.orgName,
					className: publications.className,
					documentType: publications.documentType,
				},
				grau: movements.grau,
				tribunal: cases.tribunal,
				cnjNumber: cases.cnjNumber,
				className: cases.className,
				orgName: cases.orgName,
			})
			.from(caseDecisions)
			.innerJoin(cases, eq(cases.id, caseDecisions.caseId))
			.innerJoin(movements, eq(movements.id, caseDecisions.movementId))
			.leftJoin(publications, eq(publications.id, caseDecisions.publicationId))
			.where(
				and(
					eq(caseDecisions.id, input.decisionId),
					ownedByLawyer({
						db: this.db,
						lawyerId: input.lawyerId,
						caseIdColumns: [caseDecisions.caseId],
					}),
				),
			)
			.limit(1);

		if (!decision) {
			throw new ORPCError("NOT_FOUND", { message: "Decisão não encontrada." });
		}

		const deadlineId =
			input.choice === "recorrer" ? await this.openAppealDeadline({ ...input, decision }) : null;

		const [saved] = await this.db
			.insert(caseAppeals)
			.values({
				decisionId: input.decisionId,
				lawyerId: input.lawyerId,
				choice: input.choice,
				actKey: input.actKey,
				reason: input.reason,
				deadlineId,
				decidedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [caseAppeals.decisionId, caseAppeals.lawyerId],
				set: {
					choice: sql`excluded.choice`,
					actKey: sql`excluded.act_key`,
					reason: sql`excluded.reason`,
					deadlineId: sql`coalesce(excluded.deadline_id, ${caseAppeals.deadlineId})`,
					decidedAt: new Date(),
				},
			})
			.returning({ id: caseAppeals.id, deadlineId: caseAppeals.deadlineId });

		if (!saved) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Não foi possível registrar a decisão sobre o recurso.",
			});
		}

		return saved;
	}

	private async openAppealDeadline(input: {
		lawyerId: string;
		actKey?: string;
		decision: {
			id: string;
			caseId: string;
			species: DecisionSpecies;
			speciesConfidence: DecisionSpeciesConfidence;
			decidedAt: Date;
			publicationId: string | null;
			publicationAvailableAt: string | null;
			publication: {
				orgName: string | null;
				className: string | null;
				documentType: string | null;
			} | null;
			grau: string | null;
			tribunal: string;
			cnjNumber: string;
			className: string | null;
			orgName: string | null;
		};
	}) {
		if (!input.actKey) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Escolha qual recurso será interposto para abrir o prazo.",
			});
		}

		const instances = await instancesByCase(this.db, [input.decision.caseId]);

		const advice = appealAdviceFor({
			species: input.decision.species,
			speciesConfidence: input.decision.speciesConfidence,
			currentGrau: currentInstance(instances.get(input.decision.caseId) ?? [])?.grau,
			cnjNumber: input.decision.cnjNumber,
			className: input.decision.className,
			caseOrgName: input.decision.orgName,
			decisionGrau: input.decision.grau,
			decisionPublication: input.decision.publication,
			transitedAt: await this.transitedAt(input.decision.caseId),
		});

		const option = advice.options.find((entry) => entry.actKey === input.actKey);

		if (!option) {
			throw new ORPCError("BAD_REQUEST", {
				message: "O recurso escolhido não é cabível contra esta decisão.",
			});
		}

		const availableAt =
			input.decision.publicationAvailableAt ?? input.decision.decidedAt.toISOString().slice(0, 10);

		const created = await new DeadlineManager(this.db).createForAppeal({
			lawyerId: input.lawyerId,
			caseId: input.decision.caseId,
			publicationId: input.decision.publicationId,
			tribunal: input.decision.tribunal,
			availableAt,
			baseIsPublication: !!input.decision.publicationAvailableAt,
			actKey: option.actKey,
			title: option.label,
			basis: `${option.admissibilityBasis}; prazo: ${option.deadlineBasis}`,
			days: option.days,
			unit: option.unit,
			confidence: option.confidence,
			reviewReasons: option.review ? [option.review] : [],
		});

		return created.id;
	}
}
