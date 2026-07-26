import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { calendarDays } from "../../db/schema/calendar_days.ts";
import { caseParties } from "../../db/schema/case_parties.ts";
import { cases } from "../../db/schema/cases.ts";
import {
	type DeadlineAudience,
	type DeadlineConfidence,
	type DeadlineStatus,
	deadlines,
} from "../../db/schema/deadlines.ts";
import { publicationLinks } from "../../db/schema/publication_links.ts";
import { publicationScans } from "../../db/schema/publication_scans.ts";
import { publications } from "../../db/schema/publications.ts";
import { CANCELED_PUBLICATION_WARNING, isCanceledPublication } from "../djen/project.ts";
import { type CuratedDay, createForensicCalendar } from "./calendar.ts";
import { calculateDeadline, type CountingUnit } from "./counting.ts";
import { detectDeadline } from "./extract.ts";
import {
	type DeadlineFilters,
	OPEN_STATUSES,
	THIRD_PARTY_AUDIENCE,
	deadlineWhere,
} from "./filters.ts";

export const DEADLINE_ENGINE_VERSION = 2;

interface DeadlineParty {
	name: string;
	polo: string | null;
}

interface DeadlineByPublication {
	id: string;
	publicationId: string | null;
	title: string;
	dueAt: string;
	status: DeadlineStatus;
	audience: DeadlineAudience;
}

const SUMMARY_WINDOW_DAYS = 7;

interface ScanInput {
	publicationIds?: string[];
	force?: boolean;
	onProgress?: (done: number) => Promise<void>;
}

// A carga inicial varre o histórico inteiro, e o texto da publicação vem junto na consulta. Em uma
// só passada isso é um statement de dezenas de milhares de linhas com texto: passa do teto de tempo
// do banco e derruba a sincronização inteira, além de subir tudo para a memória de uma vez.
const DEADLINE_SCAN_CHUNK = 500;

interface ListInput extends DeadlineFilters {
	lawyerId: string;
	historyCutoffAt: string;
	limit: number;
	offset: number;
}

interface SummaryInput extends DeadlineFilters {
	lawyerId: string;
	historyCutoffAt: string;
	today: string;
}

export class DeadlineManager {
	constructor(private readonly db: Db | Tx) {}

	private async curatedDaysByScope() {
		const rows = await this.db
			.select({
				scope: calendarDays.scope,
				day: calendarDays.day,
				kind: calendarDays.kind,
				certainty: calendarDays.certainty,
				description: calendarDays.description,
			})
			.from(calendarDays);

		const byScope = new Map<string, CuratedDay[]>();

		for (const row of rows) {
			const list = byScope.get(row.scope) ?? [];

			list.push({
				date: row.day,
				reason: row.description,
				kind: row.kind,
				certainty: row.certainty,
			});
			byScope.set(row.scope, list);
		}

		return byScope;
	}

	async scan(input: ScanInput) {
		const result = { scanned: 0, created: 0, updated: 0, flagged: 0 };

		if (!input.publicationIds?.length) {
			return await this.scanBatch(input, await this.curatedDaysByScope());
		}

		const curated = await this.curatedDaysByScope();

		for (let start = 0; start < input.publicationIds.length; start += DEADLINE_SCAN_CHUNK) {
			const batch = await this.scanBatch(
				{
					...input,
					publicationIds: input.publicationIds.slice(start, start + DEADLINE_SCAN_CHUNK),
				},
				curated,
			);

			result.scanned += batch.scanned;
			result.created += batch.created;
			result.updated += batch.updated;
			result.flagged += batch.flagged;

			await input.onProgress?.(result.scanned);
		}

		return result;
	}

	private async scanBatch(
		input: ScanInput,
		curated: Awaited<ReturnType<DeadlineManager["curatedDaysByScope"]>>,
	) {
		const pending = await this.db
			.select({
				id: publications.id,
				caseId: publications.caseId,
				tribunal: publications.tribunal,
				documentType: publications.documentType,
				communicationType: publications.communicationType,
				availableAt: publications.availableAt,
				textPlain: publications.textPlain,
				active: publications.active,
				cancelReason: publications.cancelReason,
				scannedVersion: publicationScans.engineVersion,
			})
			.from(publications)
			.leftJoin(publicationScans, eq(publicationScans.publicationId, publications.id))
			.where(
				and(
					input.publicationIds?.length ? inArray(publications.id, input.publicationIds) : undefined,
					input.force
						? undefined
						: or(
								isNull(publicationScans.publicationId),
								lt(publicationScans.engineVersion, DEADLINE_ENGINE_VERSION),
							),
				),
			);

		if (pending.length === 0) {
			return { scanned: 0, created: 0, updated: 0, flagged: 0 };
		}

		const links = await this.db
			.select({
				publicationId: publicationLinks.publicationId,
				lawyerId: publicationLinks.lawyerId,
			})
			.from(publicationLinks)
			.where(
				inArray(
					publicationLinks.publicationId,
					pending.map((row) => row.id),
				),
			);

		const lawyersByPublication = new Map<string, string[]>();

		for (const link of links) {
			const list = lawyersByPublication.get(link.publicationId) ?? [];

			list.push(link.lawyerId);
			lawyersByPublication.set(link.publicationId, list);
		}

		const result = { scanned: 0, created: 0, updated: 0, flagged: 0 };

		for (const publication of pending) {
			const detection = detectDeadline(publication);

			result.scanned += 1;

			if (detection.needsReview) {
				result.flagged += 1;
			}

			await this.db
				.insert(publicationScans)
				.values({
					publicationId: publication.id,
					engineVersion: DEADLINE_ENGINE_VERSION,
					hasCandidate: !!detection.primary,
					needsReview: detection.needsReview,
					confidence: detection.confidence,
					reviewReasons: detection.reviewReasons,
					candidates: [detection.primary, ...detection.others]
						.filter((candidate) => !!candidate)
						.map((candidate) => ({
							days: candidate.days,
							unit: candidate.unit,
							counting: candidate.counting,
							actKey: candidate.actKey,
							actLabel: candidate.actLabel,
							audience: candidate.audience,
							snippet: candidate.snippet,
						})),
				})
				.onConflictDoUpdate({
					target: publicationScans.publicationId,
					set: {
						engineVersion: DEADLINE_ENGINE_VERSION,
						hasCandidate: sql`excluded.has_candidate`,
						needsReview: sql`excluded.needs_review`,
						confidence: sql`excluded.confidence`,
						reviewReasons: sql`excluded.review_reasons`,
						candidates: sql`excluded.candidates`,
						scannedAt: new Date(),
					},
				});

			if (!detection.primary || detection.primary.unit !== "dias") {
				continue;
			}

			const calendar = createForensicCalendar({
				tribunal: publication.tribunal,
				curatedDays: [
					...(curated.get("nacional") ?? []),
					...(publication.tribunal ? (curated.get(publication.tribunal.toUpperCase()) ?? []) : []),
				],
			});
			const calculation = calculateDeadline({
				calendar,
				availableAt: publication.availableAt,
				days: detection.primary.days,
				unit: detection.primary.counting,
			});
			const warnings = [
				...calculation.warnings,
				...detection.reviewReasons,
				...(isCanceledPublication(publication) ? [CANCELED_PUBLICATION_WARNING] : []),
			];

			for (const lawyerId of lawyersByPublication.get(publication.id) ?? []) {
				const [existing] = await this.db
					.select({
						id: deadlines.id,
						status: deadlines.status,
						rescheduledAt: deadlines.rescheduledAt,
					})
					.from(deadlines)
					.where(
						and(
							eq(deadlines.publicationId, publication.id),
							eq(deadlines.lawyerId, lawyerId),
							eq(deadlines.origin, "automatico"),
						),
					)
					.limit(1);

				const values = {
					lawyerId,
					publicationId: publication.id,
					caseId: publication.caseId,
					title: detection.primary.actLabel,
					actKey: detection.primary.actKey,
					basis: detection.primary.basis,
					days: detection.primary.days,
					unit: detection.primary.counting,
					availableAt: calculation.availableAt,
					publishedAt: calculation.publishedAt,
					startsAt: calculation.startsAt,
					dueAt: calculation.dueAt,
					expectedDueAt: calculation.expectedDueAt,
					confidence: detection.confidence,
					audience: detection.primary.audience,
					snippet: detection.primary.snippet,
					warnings,
					calculation: { ...calculation, engineVersion: DEADLINE_ENGINE_VERSION },
					engineVersion: DEADLINE_ENGINE_VERSION,
				};

				if (!existing) {
					await this.db.insert(deadlines).values(values);
					result.created += 1;
					continue;
				}

				if (existing.status !== "pendente" || existing.rescheduledAt) {
					continue;
				}

				await this.db.update(deadlines).set(values).where(eq(deadlines.id, existing.id));
				result.updated += 1;
			}
		}

		return result;
	}

	async list(input: ListInput) {
		const where = deadlineWhere({
			lawyerId: input.lawyerId,
			historyCutoffAt: input.historyCutoffAt,
			filters: input,
		});

		const [rows, totals] = await Promise.all([
			this.db
				.select({
					id: deadlines.id,
					title: deadlines.title,
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
					publicationId: deadlines.publicationId,
					parties: sql<DeadlineParty[]>`coalesce((
						select json_agg(json_build_object('name', ${caseParties.name}, 'polo', ${caseParties.polo}) order by ${caseParties.polo} nulls last, ${caseParties.name})
						from ${caseParties}
						where ${caseParties.caseId} = ${deadlines.caseId}
					), '[]'::json)`,
					case: {
						id: cases.id,
						cnjNumber: cases.cnjNumber,
						formattedNumber: cases.formattedNumber,
						tribunal: cases.tribunal,
						orgName: cases.orgName,
						className: cases.className,
					},
				})
				.from(deadlines)
				.leftJoin(cases, eq(cases.id, deadlines.caseId))
				.where(where)
				.orderBy(asc(deadlines.dueAt), asc(deadlines.createdAt))
				.limit(input.limit)
				.offset(input.offset),
			this.db
				.select({ total: count() })
				.from(deadlines)
				.leftJoin(cases, eq(cases.id, deadlines.caseId))
				.where(where),
		]);

		return { items: rows, total: totals[0]?.total ?? 0 };
	}

	async summary(input: SummaryInput) {
		const open = inArray(deadlines.status, OPEN_STATUSES);

		const [rows] = await this.db
			.select({
				overdue: sql<number>`count(*) filter (where ${and(open, lt(deadlines.dueAt, input.today))})::int`,
				today: sql<number>`count(*) filter (where ${and(open, eq(deadlines.dueAt, input.today))})::int`,
				next7: sql<number>`count(*) filter (where ${and(
					open,
					gt(deadlines.dueAt, input.today),
					lte(deadlines.dueAt, sql`${input.today}::date + ${SUMMARY_WINDOW_DAYS}::int`),
				)})::int`,
				actionable: sql<number>`count(*) filter (where ${and(
					open,
					ne(deadlines.audience, THIRD_PARTY_AUDIENCE),
				)})::int`,
				pending: sql<number>`count(*) filter (where ${eq(deadlines.status, "pendente")})::int`,
				done: sql<number>`count(*) filter (where ${eq(deadlines.status, "cumprido")})::int`,
				dismissed: sql<number>`count(*) filter (where ${eq(deadlines.status, "descartado")})::int`,
			})
			.from(deadlines)
			.leftJoin(cases, eq(cases.id, deadlines.caseId))
			.where(
				deadlineWhere({
					lawyerId: input.lawyerId,
					historyCutoffAt: input.historyCutoffAt,
					filters: input,
					allStatuses: true,
				}),
			);

		const pendingReview = await this.pendingReviewTotal(input.lawyerId);

		return {
			overdue: rows?.overdue ?? 0,
			today: rows?.today ?? 0,
			next7: rows?.next7 ?? 0,
			actionable: rows?.actionable ?? 0,
			pending: rows?.pending ?? 0,
			done: rows?.done ?? 0,
			dismissed: rows?.dismissed ?? 0,
			pendingReview,
		};
	}

	private pendingReviewConditions(lawyerId: string) {
		return [
			eq(publicationLinks.lawyerId, lawyerId),
			eq(publicationScans.needsReview, true),
			eq(publicationScans.hasCandidate, false),
			isNull(deadlines.id),
		];
	}

	private async pendingReviewTotal(lawyerId: string) {
		const [row] = await this.db
			.select({ total: count() })
			.from(publicationScans)
			.innerJoin(
				publicationLinks,
				eq(publicationLinks.publicationId, publicationScans.publicationId),
			)
			.leftJoin(
				deadlines,
				and(
					eq(deadlines.publicationId, publicationScans.publicationId),
					eq(deadlines.lawyerId, lawyerId),
				),
			)
			.where(and(...this.pendingReviewConditions(lawyerId)));

		return row?.total ?? 0;
	}

	async byPublications(input: { lawyerId: string; publicationIds: string[] }) {
		const byPublication = new Map<string, DeadlineByPublication[]>();

		if (!input.publicationIds.length) {
			return byPublication;
		}

		const rows = await this.db
			.select({
				id: deadlines.id,
				publicationId: deadlines.publicationId,
				title: deadlines.title,
				dueAt: deadlines.dueAt,
				status: deadlines.status,
				audience: deadlines.audience,
			})
			.from(deadlines)
			.where(
				and(
					eq(deadlines.lawyerId, input.lawyerId),
					inArray(deadlines.publicationId, input.publicationIds),
				),
			)
			.orderBy(asc(deadlines.dueAt));

		for (const row of rows) {
			if (!row.publicationId) {
				continue;
			}

			const list = byPublication.get(row.publicationId) ?? [];

			list.push(row);
			byPublication.set(row.publicationId, list);
		}

		return byPublication;
	}

	async get(input: { lawyerId: string; id: string }) {
		const [found] = await this.db
			.select({
				id: deadlines.id,
				title: deadlines.title,
				actKey: deadlines.actKey,
				basis: deadlines.basis,
				days: deadlines.days,
				unit: deadlines.unit,
				multiplier: deadlines.multiplier,
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
				publicationId: deadlines.publicationId,
				publicationExcerpt: publications.excerpt,
				case: {
					id: cases.id,
					cnjNumber: cases.cnjNumber,
					formattedNumber: cases.formattedNumber,
					tribunal: cases.tribunal,
					orgName: cases.orgName,
					className: cases.className,
				},
			})
			.from(deadlines)
			.leftJoin(cases, eq(cases.id, deadlines.caseId))
			.leftJoin(publications, eq(publications.id, deadlines.publicationId))
			.where(and(eq(deadlines.id, input.id), eq(deadlines.lawyerId, input.lawyerId)))
			.limit(1);

		if (!found) {
			throw new ORPCError("NOT_FOUND", { message: "Prazo não encontrado." });
		}

		return found;
	}

	async setStatus(input: { lawyerId: string; id: string; status: DeadlineStatus }) {
		const [updated] = await this.db
			.update(deadlines)
			.set({
				status: input.status,
				completedAt: input.status === "cumprido" ? new Date() : null,
			})
			.where(and(eq(deadlines.id, input.id), eq(deadlines.lawyerId, input.lawyerId)))
			.returning({ id: deadlines.id, status: deadlines.status });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Prazo não encontrado." });
		}

		return updated;
	}

	async reschedule(input: { lawyerId: string; id: string; dueAt: string; note?: string | null }) {
		const [updated] = await this.db
			.update(deadlines)
			.set({
				dueAt: input.dueAt,
				status: "pendente",
				note: input.note,
				rescheduledAt: new Date(),
			})
			.where(and(eq(deadlines.id, input.id), eq(deadlines.lawyerId, input.lawyerId)))
			.returning({ id: deadlines.id, dueAt: deadlines.dueAt });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Prazo não encontrado." });
		}

		return updated;
	}

	async createManual(input: {
		lawyerId: string;
		publicationId?: string | null;
		caseId?: string | null;
		title: string;
		dueAt: string;
		note?: string | null;
	}) {
		const [created] = await this.db
			.insert(deadlines)
			.values({
				lawyerId: input.lawyerId,
				publicationId: input.publicationId,
				caseId: input.caseId,
				title: input.title,
				days: 0,
				dueAt: input.dueAt,
				status: "pendente",
				origin: "manual",
				confidence: "alta",
				audience: "partes",
				note: input.note,
				engineVersion: DEADLINE_ENGINE_VERSION,
			})
			.returning({ id: deadlines.id });

		if (!created) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Não foi possível criar o prazo." });
		}

		return created;
	}

	async createForAppeal(input: {
		lawyerId: string;
		caseId: string;
		publicationId: string | null;
		tribunal: string | null;
		availableAt: string;
		baseIsPublication: boolean;
		actKey: string;
		title: string;
		basis: string;
		days: number;
		unit: CountingUnit;
		confidence: DeadlineConfidence;
		reviewReasons: string[];
	}) {
		const curated = await this.curatedDaysByScope();
		const calendar = createForensicCalendar({
			tribunal: input.tribunal,
			curatedDays: [
				...(curated.get("nacional") ?? []),
				...(input.tribunal ? (curated.get(input.tribunal.toUpperCase()) ?? []) : []),
			],
		});
		const calculation = calculateDeadline({
			calendar,
			availableAt: input.availableAt,
			days: input.days,
			unit: input.unit,
		});
		const warnings = [...calculation.warnings, ...input.reviewReasons];

		if (!input.baseIsPublication) {
			warnings.push(
				"A contagem partiu da data do movimento, não da disponibilização da publicação: confira a intimação nos autos.",
			);
		}

		const [created] = await this.db
			.insert(deadlines)
			.values({
				lawyerId: input.lawyerId,
				caseId: input.caseId,
				publicationId: input.publicationId,
				title: input.title,
				actKey: input.actKey,
				basis: input.basis,
				days: input.days,
				unit: input.unit,
				availableAt: calculation.availableAt,
				publishedAt: calculation.publishedAt,
				startsAt: calculation.startsAt,
				dueAt: calculation.dueAt,
				expectedDueAt: calculation.expectedDueAt,
				status: "pendente",
				origin: "manual",
				confidence: input.confidence,
				audience: "partes",
				warnings,
				calculation: { ...calculation, engineVersion: DEADLINE_ENGINE_VERSION },
				engineVersion: DEADLINE_ENGINE_VERSION,
			})
			.returning({ id: deadlines.id, dueAt: deadlines.dueAt });

		if (!created) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Não foi possível abrir o prazo do recurso.",
			});
		}

		return created;
	}

	async triage(input: { lawyerId: string; limit: number; offset: number }) {
		const [rows, total] = await Promise.all([
			this.db
				.select({
					publicationId: publications.id,
					availableAt: publications.availableAt,
					tribunal: publications.tribunal,
					documentType: publications.documentType,
					excerpt: publications.excerpt,
					reviewReasons: publicationScans.reviewReasons,
					case: {
						id: cases.id,
						cnjNumber: cases.cnjNumber,
						formattedNumber: cases.formattedNumber,
					},
				})
				.from(publicationScans)
				.innerJoin(publications, eq(publications.id, publicationScans.publicationId))
				.innerJoin(
					publicationLinks,
					eq(publicationLinks.publicationId, publicationScans.publicationId),
				)
				.leftJoin(cases, eq(cases.id, publications.caseId))
				.leftJoin(
					deadlines,
					and(
						eq(deadlines.publicationId, publicationScans.publicationId),
						eq(deadlines.lawyerId, input.lawyerId),
					),
				)
				.where(and(...this.pendingReviewConditions(input.lawyerId)))
				.orderBy(desc(publications.availableAt))
				.limit(input.limit)
				.offset(input.offset),
			this.pendingReviewTotal(input.lawyerId),
		]);

		return { items: rows, total };
	}
}
