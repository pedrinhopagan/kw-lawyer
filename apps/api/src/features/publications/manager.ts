import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseParties } from "../../db/schema/case_parties.ts";
import { cases } from "../../db/schema/cases.ts";
import { publicationLinks } from "../../db/schema/publication_links.ts";
import { publications } from "../../db/schema/publications.ts";
import { addDays } from "../deadlines/calendar.ts";
import { PUBLICATION_BACKFILL_DAYS } from "./window.ts";

interface PublicationFilterInput {
	lawyerId: string;
	historyCutoffAt: string;
	includeHistory: boolean;
	tribunal?: string;
	from?: string;
	to?: string;
	query?: string;
}

interface PublicationListInput extends PublicationFilterInput {
	onlyUnread: boolean;
	limit: number;
	offset: number;
}

function floorCondition(input: PublicationFilterInput) {
	if (input.from) {
		return gte(publications.availableAt, input.from);
	}

	if (input.includeHistory) {
		return;
	}

	return gte(publications.availableAt, addDays(input.historyCutoffAt, -PUBLICATION_BACKFILL_DAYS));
}

function likePattern(value: string) {
	return `%${value.replaceAll(/[\\%_]/gu, (match) => `\\${match}`)}%`;
}

function searchCondition(query: string) {
	const digits = query.replaceAll(/\D/gu, "");

	return or(
		ilike(publications.textPlain, likePattern(query)),
		ilike(publications.orgName, likePattern(query)),
		digits ? ilike(publications.cnjNumber, likePattern(digits)) : undefined,
	);
}

function publicationCondition(input: PublicationFilterInput) {
	const query = input.query?.trim();

	return and(
		input.tribunal ? eq(publications.tribunal, input.tribunal.trim().toUpperCase()) : undefined,
		floorCondition(input),
		input.to ? lte(publications.availableAt, input.to) : undefined,
		query ? searchCondition(query) : undefined,
	);
}

interface PublicationParty {
	name: string;
	polo: string | null;
}

interface PublicationItemInput {
	lawyerId: string;
	id: string;
}

export class PublicationManager {
	constructor(private readonly db: Db | Tx) {}

	async list(input: PublicationListInput) {
		const where = and(
			eq(publicationLinks.lawyerId, input.lawyerId),
			input.onlyUnread ? isNull(publicationLinks.readAt) : undefined,
			publicationCondition(input),
		);

		const [rows, totals, unreads] = await Promise.all([
			this.db
				.select({
					id: publications.id,
					cnjNumber: publications.cnjNumber,
					tribunal: publications.tribunal,
					orgName: publications.orgName,
					communicationType: publications.communicationType,
					documentType: publications.documentType,
					availableAt: publications.availableAt,
					medium: publications.medium,
					link: publications.link,
					excerpt: publications.excerpt,
					active: publications.active,
					status: publications.status,
					cancelReason: publications.cancelReason,
					canceledAt: publications.canceledAt,
					readAt: publicationLinks.readAt,
					parties: sql<PublicationParty[]>`coalesce((
						select json_agg(json_build_object('name', ${caseParties.name}, 'polo', ${caseParties.polo}) order by ${caseParties.polo} nulls last, ${caseParties.name})
						from ${caseParties}
						where ${caseParties.caseId} = ${publications.caseId}
					), '[]'::json)`,
					case: {
						id: cases.id,
						cnjNumber: cases.cnjNumber,
						formattedNumber: cases.formattedNumber,
						tribunal: cases.tribunal,
					},
				})
				.from(publications)
				.innerJoin(publicationLinks, eq(publicationLinks.publicationId, publications.id))
				.leftJoin(cases, eq(cases.id, publications.caseId))
				.where(where)
				.orderBy(desc(publications.availableAt), desc(publications.createdAt), asc(publications.id))
				.limit(input.limit)
				.offset(input.offset),
			this.db
				.select({ total: count() })
				.from(publications)
				.innerJoin(publicationLinks, eq(publicationLinks.publicationId, publications.id))
				.where(where),
			this.db
				.select({ unread: count() })
				.from(publicationLinks)
				.innerJoin(publications, eq(publications.id, publicationLinks.publicationId))
				.where(
					and(
						eq(publicationLinks.lawyerId, input.lawyerId),
						isNull(publicationLinks.readAt),
						floorCondition(input),
					),
				),
		]);

		return {
			items: rows,
			total: totals[0]?.total ?? 0,
			unread: unreads[0]?.unread ?? 0,
		};
	}

	// A barra lateral quer um número, não uma página. Pedir `list` com `limit: 1` só para ler o campo
	// `unread` custava três consultas por montagem da barra, duas delas jogadas fora.
	async unread(input: { lawyerId: string; historyCutoffAt: string }) {
		const [row] = await this.db
			.select({ unread: count() })
			.from(publicationLinks)
			.innerJoin(publications, eq(publications.id, publicationLinks.publicationId))
			.where(
				and(
					eq(publicationLinks.lawyerId, input.lawyerId),
					isNull(publicationLinks.readAt),
					floorCondition({ ...input, includeHistory: false }),
				),
			);

		return { unread: row ? row.unread : 0 };
	}

	async get(input: PublicationItemInput) {
		const [found] = await this.db
			.select({
				id: publications.id,
				source: publications.source,
				externalId: publications.externalId,
				cnjNumber: publications.cnjNumber,
				tribunal: publications.tribunal,
				orgName: publications.orgName,
				communicationType: publications.communicationType,
				documentType: publications.documentType,
				availableAt: publications.availableAt,
				medium: publications.medium,
				link: publications.link,
				textHtml: publications.textHtml,
				textPlain: publications.textPlain,
				active: publications.active,
				status: publications.status,
				cancelReason: publications.cancelReason,
				canceledAt: publications.canceledAt,
				createdAt: publications.createdAt,
				readAt: publicationLinks.readAt,
				case: {
					id: cases.id,
					cnjNumber: cases.cnjNumber,
					formattedNumber: cases.formattedNumber,
					tribunal: cases.tribunal,
					orgName: cases.orgName,
					className: cases.className,
				},
			})
			.from(publications)
			.innerJoin(
				publicationLinks,
				and(
					eq(publicationLinks.publicationId, publications.id),
					eq(publicationLinks.lawyerId, input.lawyerId),
				),
			)
			.leftJoin(cases, eq(cases.id, publications.caseId))
			.where(eq(publications.id, input.id))
			.limit(1);

		if (!found) {
			throw new ORPCError("NOT_FOUND", { message: "Publicação não encontrada." });
		}

		return found;
	}

	async read(input: PublicationItemInput) {
		const [updated] = await this.db
			.update(publicationLinks)
			.set({ readAt: sql`coalesce(${publicationLinks.readAt}, now())` })
			.where(
				and(
					eq(publicationLinks.publicationId, input.id),
					eq(publicationLinks.lawyerId, input.lawyerId),
				),
			)
			.returning({ id: publicationLinks.id });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Publicação não encontrada." });
		}

		return { ok: true };
	}

	async readAll(input: PublicationFilterInput) {
		const matching = this.db
			.select({ id: publications.id })
			.from(publications)
			.where(publicationCondition(input));

		const updated = await this.db
			.update(publicationLinks)
			.set({ readAt: sql`now()` })
			.where(
				and(
					eq(publicationLinks.lawyerId, input.lawyerId),
					isNull(publicationLinks.readAt),
					inArray(publicationLinks.publicationId, matching),
				),
			)
			.returning({ id: publicationLinks.id });

		return { read: updated.length };
	}
}
