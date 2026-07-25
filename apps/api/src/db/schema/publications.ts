import { date, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";

export const publications = pgTable(
	"publications",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		source: text("source").notNull().default("djen"),
		externalId: text("external_id").notNull(),
		contentHash: text("content_hash").notNull(),
		caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
		cnjNumber: text("cnj_number"),
		tribunal: text("tribunal"),
		orgName: text("org_name"),
		communicationType: text("communication_type"),
		documentType: text("document_type"),
		availableAt: date("available_at").notNull(),
		medium: text("medium"),
		link: text("link"),
		textHtml: text("text_html").notNull(),
		textPlain: text("text_plain").notNull(),
		excerpt: text("excerpt").notNull(),
		raw: jsonb("raw").$type<unknown>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique().on(table.source, table.externalId),
		index("publications_content_hash_idx").on(table.contentHash),
		index("publications_case_id_idx").on(table.caseId),
		index("publications_available_at_idx").on(table.availableAt),
	],
);
