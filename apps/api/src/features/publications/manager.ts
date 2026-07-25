import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { cases } from "../../db/schema/cases.ts";
import { publicationLinks } from "../../db/schema/publication_links.ts";
import { publications } from "../../db/schema/publications.ts";

interface PublicationListInput {
	lawyerId: string;
	onlyUnread: boolean;
	tribunal?: string;
	from?: string;
	to?: string;
	limit: number;
	offset: number;
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
			input.tribunal ? eq(publications.tribunal, input.tribunal.trim().toUpperCase()) : undefined,
			input.from ? gte(publications.availableAt, input.from) : undefined,
			input.to ? lte(publications.availableAt, input.to) : undefined,
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
					readAt: publicationLinks.readAt,
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
				.where(and(eq(publicationLinks.lawyerId, input.lawyerId), isNull(publicationLinks.readAt))),
		]);

		return {
			items: rows,
			total: totals[0]?.total ?? 0,
			unread: unreads[0]?.unread ?? 0,
		};
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
}
