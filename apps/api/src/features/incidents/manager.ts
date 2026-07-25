import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseLawyers } from "../../db/schema/case_lawyers.ts";
import { caseRelations } from "../../db/schema/case_relations.ts";
import { cases } from "../../db/schema/cases.ts";
import { movements } from "../../db/schema/movements.ts";
import { CaseManager } from "../cases/manager.ts";
import { CASE_SCAN_CHUNK, caseSources, recordCaseScan, staleCaseIds } from "../legal/case-scan.ts";
import { ownedByLawyer } from "../legal/scope.ts";
import { classifyRelations, type DiscoveredRelation, type RelationState } from "./classify.ts";

export const INCIDENT_ENGINE_VERSION = 1;

const SCANNER = "incidentes";

const SUSPENSIVE_GRANTED_CODE = "394";
const SUSPENSIVE_DENIED_CODE = "1059";

const STATE_BY_CODE: Record<string, RelationState> = {
	"22": "baixado",
	"246": "baixado",
	"848": "baixado",
	"193": "julgado",
	"219": "julgado",
	"220": "julgado",
	"221": "julgado",
	"239": "julgado",
	"14093": "julgado",
	"394": "liminar_deferida",
	"12444": "liminar_deferida",
	"1059": "liminar_indeferida",
	"12455": "liminar_indeferida",
	"51": "com_relator",
	"26": "distribuido",
	"36": "distribuido",
};

const STATE_RANK: RelationState[] = [
	"distribuido",
	"com_relator",
	"liminar_indeferida",
	"liminar_deferida",
	"julgado",
	"baixado",
];

const OPEN_STATES: RelationState[] = [
	"distribuido",
	"com_relator",
	"liminar_indeferida",
	"liminar_deferida",
];

function suspensiveOf(externalCode: string, current: boolean | null) {
	if (externalCode === SUSPENSIVE_GRANTED_CODE) {
		return true;
	}

	if (externalCode === SUSPENSIVE_DENIED_CODE) {
		return false;
	}

	return current;
}

export class IncidentManager {
	constructor(private readonly db: Db | Tx) {}

	async scan(input: { caseIds?: string[]; force?: boolean }) {
		const stale = await staleCaseIds({
			db: this.db,
			scanner: SCANNER,
			engineVersion: INCIDENT_ENGINE_VERSION,
			caseIds: input.caseIds,
			force: input.force,
		});

		const result = { cases: 0, sources: 0, created: 0, updated: 0, removed: 0 };

		if (!stale.length) {
			return result;
		}

		const directory = await this.caseDirectory();

		for (let start = 0; start < stale.length; start += CASE_SCAN_CHUNK) {
			const chunk = stale.slice(start, start + CASE_SCAN_CHUNK);
			const sources = await caseSources(this.db, chunk);

			for (const caseId of chunk) {
				const self = directory.byId.get(caseId);

				if (!self) {
					continue;
				}

				const discovered = new Map<string, DiscoveredRelation>();

				for (const source of sources.get(caseId) ?? []) {
					for (const relation of classifyRelations({
						self,
						source,
						known: (cnjNumber) => directory.byCnj.get(cnjNumber),
					})) {
						discovered.set(
							`${relation.incidentCnjNumber}|${relation.principalCnjNumber}`,
							relation,
						);
					}
				}

				const written = await this.persist(directory, [...discovered.values()]);

				result.cases += 1;
				result.sources += sources.get(caseId)?.length ?? 0;
				result.created += written.created;
				result.updated += written.updated;

				await recordCaseScan({
					db: this.db,
					caseId,
					scanner: SCANNER,
					engineVersion: INCIDENT_ENGINE_VERSION,
					stats: {
						sources: sources.get(caseId)?.length ?? 0,
						created: written.created,
						updated: written.updated,
						removed: 0,
					},
				});
			}
		}

		await this.refreshStates();

		return result;
	}

	private async caseDirectory() {
		const rows = await this.db
			.select({
				id: cases.id,
				cnjNumber: cases.cnjNumber,
				className: cases.className,
				grau: cases.grau,
			})
			.from(cases);

		return {
			byId: new Map(rows.map((row) => [row.id, row])),
			byCnj: new Map(rows.map((row) => [row.cnjNumber, row])),
		};
	}

	private async persist(
		directory: Awaited<ReturnType<IncidentManager["caseDirectory"]>>,
		relations: DiscoveredRelation[],
	) {
		if (!relations.length) {
			return { created: 0, updated: 0 };
		}

		const written = await this.db
			.insert(caseRelations)
			.values(
				relations.map((relation) => ({
					incidentCnjNumber: relation.incidentCnjNumber,
					incidentCaseId: directory.byCnj.get(relation.incidentCnjNumber)?.id,
					principalCnjNumber: relation.principalCnjNumber,
					principalCaseId: directory.byCnj.get(relation.principalCnjNumber)?.id,
					kind: relation.kind,
					snippet: relation.snippet,
					engineVersion: INCIDENT_ENGINE_VERSION,
				})),
			)
			.onConflictDoUpdate({
				target: [caseRelations.incidentCnjNumber, caseRelations.principalCnjNumber],
				set: {
					kind: sql`excluded.kind`,
					snippet: sql`excluded.snippet`,
					incidentCaseId: sql`coalesce(excluded.incident_case_id, ${caseRelations.incidentCaseId})`,
					principalCaseId: sql`coalesce(excluded.principal_case_id, ${caseRelations.principalCaseId})`,
					engineVersion: sql`excluded.engine_version`,
				},
				setWhere: eq(caseRelations.origin, "automatico"),
			})
			.returning({ inserted: sql<boolean>`(xmax = 0)` });

		const created = written.filter((row) => row.inserted).length;

		return { created, updated: written.length - created };
	}

	private async refreshStates() {
		const pending = await this.db
			.select({ id: caseRelations.id, incidentCaseId: caseRelations.incidentCaseId })
			.from(caseRelations)
			.where(and(eq(caseRelations.origin, "automatico"), isNotNull(caseRelations.incidentCaseId)));

		const incidentIds = pending
			.map((row) => row.incidentCaseId)
			.filter((value): value is string => !!value);

		if (!incidentIds.length) {
			return;
		}

		const signals = await this.db
			.select({ caseId: movements.caseId, externalCode: movements.externalCode })
			.from(movements)
			.where(
				and(
					inArray(movements.caseId, incidentIds),
					inArray(movements.externalCode, Object.keys(STATE_BY_CODE)),
				),
			);

		const byCase = new Map<string, { state: RelationState; suspensive: boolean | null }>();

		for (const signal of signals) {
			if (!signal.externalCode) {
				continue;
			}

			const state = STATE_BY_CODE[signal.externalCode];

			if (!state) {
				continue;
			}

			const current = byCase.get(signal.caseId) ?? { state, suspensive: null };

			byCase.set(signal.caseId, {
				state:
					STATE_RANK.indexOf(state) > STATE_RANK.indexOf(current.state) ? state : current.state,
				suspensive: suspensiveOf(signal.externalCode, current.suspensive),
			});
		}

		for (const row of pending) {
			const derived = row.incidentCaseId ? byCase.get(row.incidentCaseId) : undefined;

			if (!derived) {
				continue;
			}

			await this.db
				.update(caseRelations)
				.set({ state: derived.state, suspensiveEffect: derived.suspensive })
				.where(eq(caseRelations.id, row.id));
		}
	}

	async byCase(input: { lawyerId: string; caseId: string; cnjNumber: string }) {
		const rows = await this.db
			.select({
				id: caseRelations.id,
				kind: caseRelations.kind,
				state: caseRelations.state,
				suspensiveEffect: caseRelations.suspensiveEffect,
				snippet: caseRelations.snippet,
				origin: caseRelations.origin,
				incidentCnjNumber: caseRelations.incidentCnjNumber,
				incidentCaseId: caseRelations.incidentCaseId,
				principalCnjNumber: caseRelations.principalCnjNumber,
				principalCaseId: caseRelations.principalCaseId,
			})
			.from(caseRelations)
			.where(
				and(
					isNull(caseRelations.dismissedAt),
					or(
						eq(caseRelations.incidentCaseId, input.caseId),
						eq(caseRelations.principalCaseId, input.caseId),
					),
				),
			);

		const counterparts = rows.map((row) =>
			row.incidentCnjNumber === input.cnjNumber ? row.principalCnjNumber : row.incidentCnjNumber,
		);

		const known = await this.knownCases(input.lawyerId, counterparts);

		return rows.map((row) => {
			const isSatellite = row.principalCnjNumber === input.cnjNumber;
			const counterpartCnj = isSatellite ? row.incidentCnjNumber : row.principalCnjNumber;

			return {
				id: row.id,
				kind: row.kind,
				state: row.state,
				suspensiveEffect: row.suspensiveEffect,
				snippet: row.snippet,
				origin: row.origin,
				role: isSatellite ? ("satelite" as const) : ("principal" as const),
				counterpart: {
					cnjNumber: counterpartCnj,
					...(known.get(counterpartCnj) ?? { className: null, tribunal: null, inScope: false }),
				},
			};
		});
	}

	private async knownCases(lawyerId: string, cnjNumbers: string[]) {
		if (!cnjNumbers.length) {
			return new Map<
				string,
				{ className: string | null; tribunal: string | null; inScope: boolean }
			>();
		}

		const rows = await this.db
			.select({
				cnjNumber: cases.cnjNumber,
				className: cases.className,
				tribunal: cases.tribunal,
				inScope: sql<boolean>`${caseLawyers.id} is not null`,
			})
			.from(cases)
			.leftJoin(
				caseLawyers,
				and(eq(caseLawyers.caseId, cases.id), eq(caseLawyers.lawyerId, lawyerId)),
			)
			.where(inArray(cases.cnjNumber, cnjNumbers));

		return new Map(rows.map((row) => [row.cnjNumber, row]));
	}

	async listByCase(input: { lawyerId: string; cnjNumber: string }) {
		const found = await new CaseManager(this.db).requireByCnj(input);

		return {
			case: found,
			items: await this.byCase({
				lawyerId: input.lawyerId,
				caseId: found.id,
				cnjNumber: found.cnjNumber,
			}),
		};
	}

	async suspensions(lawyerId: string) {
		const rows = await this.db
			.selectDistinct({
				caseId: caseRelations.principalCaseId,
				incidentCnjNumber: caseRelations.incidentCnjNumber,
				kind: caseRelations.kind,
			})
			.from(caseRelations)
			.innerJoin(
				caseLawyers,
				and(
					eq(caseLawyers.caseId, caseRelations.principalCaseId),
					eq(caseLawyers.lawyerId, lawyerId),
				),
			)
			.where(
				and(
					isNull(caseRelations.dismissedAt),
					eq(caseRelations.suspensiveEffect, true),
					inArray(caseRelations.state, OPEN_STATES),
				),
			);

		return rows.filter((row): row is typeof row & { caseId: string } => !!row.caseId);
	}

	async setDismissed(input: { lawyerId: string; id: string; dismissed: boolean }) {
		const [updated] = await this.db
			.update(caseRelations)
			.set({ dismissedAt: input.dismissed ? new Date() : null, origin: "manual" })
			.where(
				and(
					eq(caseRelations.id, input.id),
					ownedByLawyer({
						db: this.db,
						lawyerId: input.lawyerId,
						caseIdColumns: [caseRelations.principalCaseId, caseRelations.incidentCaseId],
					}),
				),
			)
			.returning({ id: caseRelations.id, dismissedAt: caseRelations.dismissedAt });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Vínculo não encontrado." });
		}

		return updated;
	}
}
