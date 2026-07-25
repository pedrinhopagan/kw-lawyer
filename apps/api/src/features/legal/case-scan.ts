import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import type { MovementComplement } from "../../db/schema/movements.ts";
import { type CaseScanStats, type CaseScanner, caseScans } from "../../db/schema/case_scans.ts";
import { cases } from "../../db/schema/cases.ts";
import { movements } from "../../db/schema/movements.ts";
import { publications } from "../../db/schema/publications.ts";

export const CASE_SCAN_CHUNK = 40;

export interface CaseSourcePublication {
	id: string;
	documentType: string | null;
	communicationType: string | null;
	textPlain: string;
	availableAt: string;
	link: string | null;
}

export interface CaseSource {
	movementId: string;
	occurredAt: Date;
	type: string | null;
	summary: string;
	externalCode: string | null;
	complements: MovementComplement[] | null;
	publication: CaseSourcePublication | null;
}

export interface CaseScanScope {
	db: Db | Tx;
	scanner: CaseScanner;
	engineVersion: number;
	caseIds?: string[];
	force?: boolean;
}

export async function staleCaseIds(scope: CaseScanScope) {
	const rows = await scope.db
		.select({ id: cases.id })
		.from(cases)
		.leftJoin(caseScans, and(eq(caseScans.caseId, cases.id), eq(caseScans.scanner, scope.scanner)))
		.where(
			and(
				scope.caseIds?.length ? inArray(cases.id, scope.caseIds) : undefined,
				scope.force
					? undefined
					: or(
							isNull(caseScans.id),
							lt(caseScans.engineVersion, scope.engineVersion),
							gt(cases.lastMovementAt, caseScans.scannedAt),
						),
			),
		);

	return rows.map((row) => row.id);
}

export async function caseSources(db: Db | Tx, caseIds: string[]) {
	const byCase = new Map<string, CaseSource[]>();

	if (!caseIds.length) {
		return byCase;
	}

	const rows = await db
		.select({
			caseId: movements.caseId,
			movementId: movements.id,
			occurredAt: movements.occurredAt,
			type: movements.type,
			summary: movements.summary,
			externalCode: movements.externalCode,
			complements: movements.complements,
			publication: {
				id: publications.id,
				documentType: publications.documentType,
				communicationType: publications.communicationType,
				textPlain: publications.textPlain,
				availableAt: publications.availableAt,
				link: publications.link,
			},
		})
		.from(movements)
		.leftJoin(publications, eq(publications.id, movements.publicationId))
		.where(inArray(movements.caseId, caseIds))
		.orderBy(desc(movements.occurredAt));

	for (const row of rows) {
		const list = byCase.get(row.caseId) ?? [];

		list.push({
			movementId: row.movementId,
			occurredAt: row.occurredAt,
			type: row.type,
			summary: row.summary,
			externalCode: row.externalCode,
			complements: row.complements,
			publication: row.publication?.id ? row.publication : null,
		});
		byCase.set(row.caseId, list);
	}

	return byCase;
}

export async function recordCaseScan(input: {
	db: Db | Tx;
	caseId: string;
	scanner: CaseScanner;
	engineVersion: number;
	stats: CaseScanStats;
}) {
	await input.db
		.insert(caseScans)
		.values({
			caseId: input.caseId,
			scanner: input.scanner,
			engineVersion: input.engineVersion,
			stats: input.stats,
		})
		.onConflictDoUpdate({
			target: [caseScans.caseId, caseScans.scanner],
			set: {
				engineVersion: input.engineVersion,
				stats: sql`excluded.stats`,
				scannedAt: new Date(),
			},
		});
}
