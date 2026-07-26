import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";

export type CaseScanner = "decisoes" | "provas" | "incidentes" | "estado";

export interface CaseScanStats {
	sources: number;
	created: number;
	updated: number;
	removed: number;
}

export const caseScans = pgTable(
	"case_scans",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id, { onDelete: "cascade" }),
		scanner: text("scanner").$type<CaseScanner>().notNull(),
		engineVersion: integer("engine_version").notNull(),
		stats: jsonb("stats").$type<CaseScanStats>(),
		scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [unique("case_scans_case_scanner_unique").on(table.caseId, table.scanner)],
);
