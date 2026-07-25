import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, like, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseDecisions } from "../../db/schema/case_decisions.ts";
import { caseEvidence } from "../../db/schema/case_evidence.ts";
import { caseLawyers } from "../../db/schema/case_lawyers.ts";
import { caseParties } from "../../db/schema/case_parties.ts";
import { caseRelations } from "../../db/schema/case_relations.ts";
import { cases } from "../../db/schema/cases.ts";
import { deadlines } from "../../db/schema/deadlines.ts";
import { movements } from "../../db/schema/movements.ts";
import { publicationLinks } from "../../db/schema/publication_links.ts";
import { publications } from "../../db/schema/publications.ts";

const NUMERIC_SEARCH_PATTERN = /^[\d\s./-]+$/u;

interface CaseListInput {
	lawyerId: string;
	search?: string;
	tribunal?: string;
	limit: number;
	offset: number;
}

interface CaseGetInput {
	lawyerId: string;
	cnjNumber: string;
}

export class CaseManager {
	constructor(private readonly db: Db | Tx) {}

	async list(input: CaseListInput) {
		const search = input.search?.trim();

		const where = and(
			eq(caseLawyers.lawyerId, input.lawyerId),
			input.tribunal ? eq(cases.tribunal, input.tribunal.trim().toUpperCase()) : undefined,
			search ? this.searchFilter(search) : undefined,
		);

		const [rows, totals] = await Promise.all([
			this.db
				.select({
					id: cases.id,
					cnjNumber: cases.cnjNumber,
					formattedNumber: cases.formattedNumber,
					tribunal: cases.tribunal,
					orgName: cases.orgName,
					className: cases.className,
					classCode: cases.classCode,
					lastMovementAt: cases.lastMovementAt,
				})
				.from(cases)
				.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
				.where(where)
				.orderBy(sql`${cases.lastMovementAt} desc nulls last`, asc(cases.cnjNumber))
				.limit(input.limit)
				.offset(input.offset),
			this.db
				.select({ total: count() })
				.from(cases)
				.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
				.where(where),
		]);

		const caseIds = rows.map((row) => row.id);

		const [lastMovements, unreadCounts] = await Promise.all([
			this.db
				.selectDistinctOn([movements.caseId], {
					caseId: movements.caseId,
					occurredAt: movements.occurredAt,
					type: movements.type,
					summary: movements.summary,
					source: movements.source,
				})
				.from(movements)
				.where(inArray(movements.caseId, caseIds))
				.orderBy(movements.caseId, desc(movements.occurredAt), asc(movements.id)),
			this.db
				.select({ caseId: publications.caseId, unread: count() })
				.from(publicationLinks)
				.innerJoin(publications, eq(publications.id, publicationLinks.publicationId))
				.where(
					and(
						eq(publicationLinks.lawyerId, input.lawyerId),
						isNull(publicationLinks.readAt),
						inArray(publications.caseId, caseIds),
					),
				)
				.groupBy(publications.caseId),
		]);

		const lastByCase = new Map(
			lastMovements.map((row) => [
				row.caseId,
				{ occurredAt: row.occurredAt, type: row.type, summary: row.summary, source: row.source },
			]),
		);

		const unreadByCase = new Map(unreadCounts.map((row) => [row.caseId, row.unread]));

		return {
			items: rows.map((row) => ({
				...row,
				lastMovement: lastByCase.get(row.id),
				unreadCount: unreadByCase.get(row.id) ?? 0,
			})),
			total: totals[0]?.total ?? 0,
		};
	}

	async requireByCnj(input: CaseGetInput) {
		const cnjNumber = input.cnjNumber.replaceAll(/\D/gu, "");

		const [found] = await this.db
			.select({
				id: cases.id,
				cnjNumber: cases.cnjNumber,
				formattedNumber: cases.formattedNumber,
				tribunal: cases.tribunal,
				orgName: cases.orgName,
				className: cases.className,
				classCode: cases.classCode,
				grau: cases.grau,
				orgJudgingName: cases.orgJudgingName,
				subjects: cases.subjects,
				systemName: cases.systemName,
				filedAt: cases.filedAt,
				secrecyLevel: cases.secrecyLevel,
				datajudStatus: cases.datajudStatus,
				datajudSyncedAt: cases.datajudSyncedAt,
				lastMovementAt: cases.lastMovementAt,
				createdAt: cases.createdAt,
			})
			.from(cases)
			.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
			.where(and(eq(cases.cnjNumber, cnjNumber), eq(caseLawyers.lawyerId, input.lawyerId)))
			.limit(1);

		if (!found) {
			throw new ORPCError("NOT_FOUND", { message: "Processo não encontrado." });
		}

		return found;
	}

	async counters(input: { lawyerId: string; caseId: string }) {
		const [row] = await this.db
			.select({
				decisions: sql<number>`(select count(*) from ${caseDecisions} where ${caseDecisions.caseId} = ${input.caseId} and ${caseDecisions.dismissedAt} is null)::int`,
				evidence: sql<number>`(select count(*) from ${caseEvidence} where ${caseEvidence.caseId} = ${input.caseId} and ${caseEvidence.dismissedAt} is null)::int`,
				appealable: sql<number>`(select count(*) from ${caseDecisions} where ${caseDecisions.caseId} = ${input.caseId} and ${caseDecisions.dismissedAt} is null and ${caseDecisions.species} <> 'despacho')::int`,
				relations: sql<number>`(select count(*) from ${caseRelations} where (${caseRelations.principalCaseId} = ${input.caseId} or ${caseRelations.incidentCaseId} = ${input.caseId}) and ${caseRelations.dismissedAt} is null)::int`,
				openDeadlines: sql<number>`(select count(*) from ${deadlines} where ${deadlines.caseId} = ${input.caseId} and ${deadlines.lawyerId} = ${input.lawyerId} and ${deadlines.status} in ('a_confirmar', 'confirmado'))::int`,
				transited: sql<number>`(select count(*) from ${movements} where ${movements.caseId} = ${input.caseId} and ${movements.externalCode} = '848')::int`,
			})
			.from(cases)
			.where(eq(cases.id, input.caseId))
			.limit(1);

		return {
			decisions: row?.decisions ?? 0,
			evidence: row?.evidence ?? 0,
			appealable: row?.transited ? 0 : (row?.appealable ?? 0),
			relations: row?.relations ?? 0,
			openDeadlines: row?.openDeadlines ?? 0,
		};
	}

	async get(input: CaseGetInput) {
		const found = await this.requireByCnj(input);

		const [counters, parties, timelineRows] = await Promise.all([
			this.counters({ lawyerId: input.lawyerId, caseId: found.id }),
			this.db
				.select({ id: caseParties.id, name: caseParties.name, polo: caseParties.polo })
				.from(caseParties)
				.where(eq(caseParties.caseId, found.id))
				.orderBy(asc(caseParties.polo), asc(caseParties.name)),
			this.db
				.select({
					id: movements.id,
					occurredAt: movements.occurredAt,
					type: movements.type,
					summary: movements.summary,
					externalCode: movements.externalCode,
					complements: movements.complements,
					readAt: publicationLinks.readAt,
					publication: {
						id: publications.id,
						communicationType: publications.communicationType,
						documentType: publications.documentType,
						availableAt: publications.availableAt,
						orgName: publications.orgName,
						medium: publications.medium,
						link: publications.link,
						excerpt: publications.excerpt,
						textPlain: publications.textPlain,
					},
				})
				.from(movements)
				.leftJoin(publications, eq(publications.id, movements.publicationId))
				.leftJoin(
					publicationLinks,
					and(
						eq(publicationLinks.publicationId, publications.id),
						eq(publicationLinks.lawyerId, input.lawyerId),
					),
				)
				.where(eq(movements.caseId, found.id))
				.orderBy(desc(movements.occurredAt), asc(movements.id)),
		]);

		const timeline = timelineRows.map((row) => {
			if (row.publication) {
				return {
					id: row.id,
					source: "publication" as const,
					occurredAt: row.occurredAt,
					summary: row.summary,
					publication: { ...row.publication, readAt: row.readAt },
				};
			}

			return {
				id: row.id,
				source: "datajud" as const,
				occurredAt: row.occurredAt,
				summary: row.summary,
				name: row.type,
				code: row.externalCode,
				complements: row.complements,
			};
		});

		return { case: found, counters, parties, timeline };
	}

	private searchFilter(term: string) {
		const digits = term.replaceAll(/\D/gu, "");

		if (digits && NUMERIC_SEARCH_PATTERN.test(term)) {
			return like(cases.cnjNumber, `%${digits}%`);
		}

		const escaped = term.replaceAll(/[\\%_]/gu, (char) => `\\${char}`);

		return exists(
			this.db
				.select({ found: sql`1` })
				.from(caseParties)
				.where(and(eq(caseParties.caseId, cases.id), ilike(caseParties.name, `%${escaped}%`))),
		);
	}
}
