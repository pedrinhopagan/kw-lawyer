import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseEvidence } from "../../db/schema/case_evidence.ts";
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
import {
	classifyEvidence,
	type EvidenceKind,
	type EvidenceProducer,
	type EvidenceStage,
} from "./classify.ts";

export const EVIDENCE_ENGINE_VERSION = 1;

const SCANNER = "provas";

interface ScanInput {
	caseIds?: string[];
	force?: boolean;
}

export class EvidenceManager {
	constructor(private readonly db: Db | Tx) {}

	async scan(input: ScanInput) {
		const stale = await staleCaseIds({
			db: this.db,
			scanner: SCANNER,
			engineVersion: EVIDENCE_ENGINE_VERSION,
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
		const classified: (typeof caseEvidence.$inferInsert)[] = [];

		for (const source of sources) {
			const classification = classifyEvidence(source);

			if (!classification) {
				continue;
			}

			classified.push({
				caseId,
				movementId: source.movementId,
				publicationId: source.publication?.id,
				occurredAt: source.occurredAt,
				kind: classification.kind,
				stage: classification.stage,
				producedBy: classification.producedBy,
				title: classification.title,
				snippet: classification.snippet,
				confidence: classification.confidence,
				engineVersion: EVIDENCE_ENGINE_VERSION,
			});
		}

		const values = withoutRepeatedActs(classified, (row) =>
			actKeyOf({
				occurredAt: row.occurredAt,
				traits: [row.kind, row.stage],
				snippet: row.snippet,
			}),
		);
		const kept = values.map((value) => value.movementId);

		const removed = await this.db
			.delete(caseEvidence)
			.where(
				and(
					eq(caseEvidence.caseId, caseId),
					eq(caseEvidence.origin, "automatico"),
					kept.length ? notInArray(caseEvidence.movementId, kept) : undefined,
				),
			)
			.returning({ id: caseEvidence.id });

		let created = 0;
		let updated = 0;

		if (values.length) {
			const written = await this.db
				.insert(caseEvidence)
				.values(values)
				.onConflictDoUpdate({
					target: caseEvidence.movementId,
					set: {
						kind: sql`excluded.kind`,
						stage: sql`excluded.stage`,
						producedBy: sql`excluded.produced_by`,
						title: sql`excluded.title`,
						snippet: sql`excluded.snippet`,
						confidence: sql`excluded.confidence`,
						publicationId: sql`excluded.publication_id`,
						occurredAt: sql`excluded.occurred_at`,
						engineVersion: sql`excluded.engine_version`,
					},
					setWhere: eq(caseEvidence.origin, "automatico"),
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
			engineVersion: EVIDENCE_ENGINE_VERSION,
			stats,
		});

		return stats;
	}

	async byCase(input: { lawyerId: string; caseId: string }) {
		const rows = await this.db
			.select({
				id: caseEvidence.id,
				movementId: caseEvidence.movementId,
				publicationId: caseEvidence.publicationId,
				occurredAt: caseEvidence.occurredAt,
				kind: caseEvidence.kind,
				stage: caseEvidence.stage,
				producedBy: caseEvidence.producedBy,
				title: caseEvidence.title,
				snippet: caseEvidence.snippet,
				confidence: caseEvidence.confidence,
				origin: caseEvidence.origin,
				note: caseEvidence.note,
				publication: {
					availableAt: publications.availableAt,
					documentType: publications.documentType,
					orgName: publications.orgName,
					link: publications.link,
				},
			})
			.from(caseEvidence)
			.leftJoin(publications, eq(publications.id, caseEvidence.publicationId))
			.where(and(eq(caseEvidence.caseId, input.caseId), isNull(caseEvidence.dismissedAt)))
			.orderBy(desc(caseEvidence.occurredAt));

		const byPublication = await new DeadlineManager(this.db).byPublications({
			lawyerId: input.lawyerId,
			publicationIds: rows
				.map((row) => row.publicationId)
				.filter((value): value is string => !!value),
		});

		return rows.map((row) => ({
			...row,
			deadlines: row.publicationId ? (byPublication.get(row.publicationId) ?? []) : [],
			hasSourceLink: !!row.publication?.link,
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
		kind?: EvidenceKind;
		stage?: EvidenceStage;
		producedBy?: EvidenceProducer;
		note?: string | null;
	}) {
		const [updated] = await this.db
			.update(caseEvidence)
			.set({
				kind: input.kind,
				stage: input.stage,
				producedBy: input.producedBy,
				note: input.note,
				origin: "manual",
			})
			.where(
				and(
					eq(caseEvidence.id, input.id),
					ownedByLawyer({
						db: this.db,
						lawyerId: input.lawyerId,
						caseIdColumns: [caseEvidence.caseId],
					}),
				),
			)
			.returning({ id: caseEvidence.id, kind: caseEvidence.kind });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Prova não encontrada." });
		}

		return updated;
	}

	async setDismissed(input: { lawyerId: string; id: string; dismissed: boolean }) {
		const [updated] = await this.db
			.update(caseEvidence)
			.set({ dismissedAt: input.dismissed ? new Date() : null, origin: "manual" })
			.where(
				and(
					eq(caseEvidence.id, input.id),
					ownedByLawyer({
						db: this.db,
						lawyerId: input.lawyerId,
						caseIdColumns: [caseEvidence.caseId],
					}),
				),
			)
			.returning({ id: caseEvidence.id, dismissedAt: caseEvidence.dismissedAt });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Prova não encontrada." });
		}

		return updated;
	}
}
