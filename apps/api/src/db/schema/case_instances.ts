import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";
import { datajudDocuments } from "./datajud_documents.ts";

export const caseInstances = pgTable(
	"case_instances",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id, { onDelete: "cascade" }),
		grau: text("grau").notNull(),
		orgJudgingName: text("org_judging_name"),
		orgJudgingCode: text("org_judging_code"),
		systemName: text("system_name"),
		formatName: text("format_name"),
		filedAt: timestamp("filed_at", { withTimezone: true }),
		secrecyLevel: integer("secrecy_level"),
		datajudDocumentId: uuid("datajud_document_id").references(() => datajudDocuments.id, {
			onDelete: "set null",
		}),
		sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [unique("case_instances_case_grau_unique").on(table.caseId, table.grau)],
);
