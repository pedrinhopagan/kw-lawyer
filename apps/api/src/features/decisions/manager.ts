import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseDecisions } from "../../db/schema/case_decisions.ts";
import { publications } from "../../db/schema/publications.ts";
import { CaseManager } from "../cases/manager.ts";
import { DeadlineManager } from "../deadlines/manager.ts";
import { actKeyOf, withoutRepeatedActs } from "../legal/repeats.ts";
import { ownedByLawyer } from "../legal/scope.ts";
import {
	CASE_SCAN_CHUNK,
	type CaseSource,
	caseSources,
	recordCaseScan,
	staleCaseIds,
} from "../legal/case-scan.ts";
import { classifyDecision, type DecisionOutcome, type DecisionSpecies } from "./classify.ts";

export const DECISION_ENGINE_VERSION = 1;

const SCANNER = "decisoes";

interface ScanInput {
	caseIds?: string[];
	force?: boolean;
}

export class DecisionManager {
	constructor(private readonly db: Db | Tx) {}

	async scan(input: ScanInput) {
		const stale = await staleCaseIds({
			db: this.db,
			scanner: SCANNER,
			engineVersion: DECISION_ENGINE_VERSION,
			caseIds: input.caseIds,
			force: input.force,
		});

		const result = { cases: 0, sources: 0, created: 0, updated: 0, removed: 0 };

		for (let start = 0; start < stale.length; start += CASE_SCAN_CHUNK) {
			const chunk = stale.slice(start, start + CASE_SCAN_CHUNK);
			const sources = await caseSources(this.db, chunk);

			for (const caseId of chunk) {
				const scanned = await this.scanCase(caseId, sources.get(caseId) ?? []);

				result.cases += 1;
				result.sources += scanned.sources;
				result.created += scanned.created;
				result.updated += scanned.updated;
				result.removed += scanned.removed;
			}
		}

		return result;
	}

	private async scanCase(caseId: string, sources: CaseSource[]) {
		const classified: (typeof caseDecisions.$inferInsert)[] = [];

		for (const source of sources) {
			const classification = classifyDecision(source);

			if (!classification) {
				continue;
			}

			classified.push({
				caseId,
				movementId: source.movementId,
				publicationId: source.publication?.id,
				decidedAt: source.occurredAt,
				species: classification.species,
				outcome: classification.outcome,
				effects: classification.effects,
				snippet: classification.snippet,
				confidence: classification.confidence,
				engineVersion: DECISION_ENGINE_VERSION,
			});
		}

		const values = withoutRepeatedActs(classified, (row) =>
			actKeyOf({
				occurredAt: row.decidedAt,
				traits: [row.species, row.outcome],
				snippet: row.snippet,
			}),
		);
		const kept = values.map((value) => value.movementId);

		const removed = await this.db
			.delete(caseDecisions)
			.where(
				and(
					eq(caseDecisions.caseId, caseId),
					eq(caseDecisions.origin, "automatico"),
					kept.length ? notInArray(caseDecisions.movementId, kept) : undefined,
				),
			)
			.returning({ id: caseDecisions.id });

		let created = 0;
		let updated = 0;

		if (values.length) {
			const written = await this.db
				.insert(caseDecisions)
				.values(values)
				.onConflictDoUpdate({
					target: caseDecisions.movementId,
					set: {
						species: sql`excluded.species`,
						outcome: sql`excluded.outcome`,
						effects: sql`excluded.effects`,
						snippet: sql`excluded.snippet`,
						confidence: sql`excluded.confidence`,
						publicationId: sql`excluded.publication_id`,
						decidedAt: sql`excluded.decided_at`,
						engineVersion: sql`excluded.engine_version`,
					},
					setWhere: eq(caseDecisions.origin, "automatico"),
				})
				.returning({ inserted: sql<boolean>`(xmax = 0)` });

			created = written.filter((row) => row.inserted).length;
			updated = written.length - created;
		}

		const stats = { sources: sources.length, created, updated, removed: removed.length };

		await recordCaseScan({
			db: this.db,
			caseId,
			scanner: SCANNER,
			engineVersion: DECISION_ENGINE_VERSION,
			stats,
		});

		return stats;
	}

	async byCase(input: { lawyerId: string; caseId: string }) {
		const rows = await this.db
			.select({
				id: caseDecisions.id,
				movementId: caseDecisions.movementId,
				publicationId: caseDecisions.publicationId,
				decidedAt: caseDecisions.decidedAt,
				species: caseDecisions.species,
				outcome: caseDecisions.outcome,
				effects: caseDecisions.effects,
				snippet: caseDecisions.snippet,
				confidence: caseDecisions.confidence,
				origin: caseDecisions.origin,
				note: caseDecisions.note,
				publication: {
					availableAt: publications.availableAt,
					documentType: publications.documentType,
					orgName: publications.orgName,
					link: publications.link,
				},
			})
			.from(caseDecisions)
			.leftJoin(publications, eq(publications.id, caseDecisions.publicationId))
			.where(and(eq(caseDecisions.caseId, input.caseId), isNull(caseDecisions.dismissedAt)))
			.orderBy(desc(caseDecisions.decidedAt));

		const byPublication = await new DeadlineManager(this.db).byPublications({
			lawyerId: input.lawyerId,
			publicationIds: rows
				.map((row) => row.publicationId)
				.filter((value): value is string => !!value),
		});

		return rows.map((row) => ({
			...row,
			deadlines: row.publicationId ? (byPublication.get(row.publicationId) ?? []) : [],
		}));
	}

	async listByCase(input: { lawyerId: string; cnjNumber: string }) {
		const found = await new CaseManager(this.db).requireByCnj(input);

		return {
			case: found,
			items: await this.byCase({ lawyerId: input.lawyerId, caseId: found.id }),
		};
	}

	async correct(input: {
		lawyerId: string;
		id: string;
		species?: DecisionSpecies;
		outcome?: DecisionOutcome | null;
		note?: string | null;
	}) {
		const [updated] = await this.db
			.update(caseDecisions)
			.set({
				species: input.species,
				outcome: input.outcome,
				note: input.note,
				origin: "manual",
			})
			.where(
				and(
					eq(caseDecisions.id, input.id),
					ownedByLawyer({
						db: this.db,
						lawyerId: input.lawyerId,
						caseIdColumns: [caseDecisions.caseId],
					}),
				),
			)
			.returning({ id: caseDecisions.id, species: caseDecisions.species });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Decisão não encontrada." });
		}

		return updated;
	}

	async setDismissed(input: { lawyerId: string; id: string; dismissed: boolean }) {
		const [updated] = await this.db
			.update(caseDecisions)
			.set({ dismissedAt: input.dismissed ? new Date() : null, origin: "manual" })
			.where(
				and(
					eq(caseDecisions.id, input.id),
					ownedByLawyer({
						db: this.db,
						lawyerId: input.lawyerId,
						caseIdColumns: [caseDecisions.caseId],
					}),
				),
			)
			.returning({ id: caseDecisions.id, dismissedAt: caseDecisions.dismissedAt });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Decisão não encontrada." });
		}

		return updated;
	}
}
