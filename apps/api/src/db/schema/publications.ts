import { sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";
import { djenCommunications } from "./djen_communications.ts";

export const publications = pgTable(
	"publications",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		source: text("source").notNull().default("djen"),
		externalId: text("external_id").notNull(),
		sourceId: uuid("source_id").references(() => djenCommunications.id, { onDelete: "set null" }),
		contentHash: text("content_hash").notNull(),
		caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
		cnjNumber: text("cnj_number"),
		tribunal: text("tribunal"),
		orgName: text("org_name"),
		orgCode: text("org_code"),
		className: text("class_name"),
		communicationType: text("communication_type"),
		documentType: text("document_type"),
		communicationNumber: text("communication_number"),
		availableAt: date("available_at").notNull(),
		medium: text("medium"),
		link: text("link"),
		textHtml: text("text_html").notNull(),
		textPlain: text("text_plain").notNull(),
		excerpt: text("excerpt").notNull(),
		active: boolean("active").notNull().default(true),
		status: text("status"),
		cancelReason: text("cancel_reason"),
		canceledAt: timestamp("canceled_at", { withTimezone: true }),
		djenHash: text("djen_hash"),
		normalizerVersion: integer("normalizer_version").notNull().default(0),
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
		index("publications_source_id_idx").on(table.sourceId),
		index("publications_text_plain_trgm_idx").using("gin", sql`${table.textPlain} gin_trgm_ops`),
		index("publications_org_name_trgm_idx").using("gin", sql`${table.orgName} gin_trgm_ops`),
	],
);
