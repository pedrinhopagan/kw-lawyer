import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";

export const datajudDocuments = pgTable(
	"datajud_documents",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id, { onDelete: "cascade" }),
		tribunalAlias: text("tribunal_alias").notNull(),
		documentId: text("document_id").notNull(),
		source: jsonb("source").$type<unknown>().notNull(),
		sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		// O documento é do tribunal, não do processo: um CNJ com duas instâncias tem duas linhas, que é
		// o que a fonte de fato devolve.
		unique("datajud_documents_alias_document_unique").on(table.tribunalAlias, table.documentId),
		index("datajud_documents_case_id_idx").on(table.caseId),
	],
);
