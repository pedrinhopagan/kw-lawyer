import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { publications } from "./publications.ts";

export interface PublicationScanCandidate {
	days: number;
	unit: "dias" | "horas" | "meses";
	counting: "uteis" | "corridos";
	actKey: string | null;
	actLabel: string;
	audience: "partes" | "terceiro" | "indefinido";
	snippet: string;
}

export const publicationScans = pgTable(
	"publication_scans",
	{
		publicationId: uuid("publication_id")
			.primaryKey()
			.references(() => publications.id, { onDelete: "cascade" }),
		engineVersion: integer("engine_version").notNull(),
		hasCandidate: boolean("has_candidate").notNull(),
		needsReview: boolean("needs_review").notNull(),
		confidence: text("confidence").$type<"alta" | "media" | "baixa">().notNull(),
		reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default([]),
		candidates: jsonb("candidates").$type<PublicationScanCandidate[]>().notNull().default([]),
		scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("publication_scans_review_idx").on(table.needsReview, table.hasCandidate)],
);
