import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";

export const syncRuns = pgTable("sync_runs", {
	id: uuid("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	lawyerId: uuid("lawyer_id")
		.notNull()
		.references(() => lawyers.id, { onDelete: "cascade" }),
	status: text("status").$type<"em_execucao" | "concluida" | "falhou">().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	fetched: integer("fetched").notNull().default(0),
	created: integer("created").notNull().default(0),
	duplicated: integer("duplicated").notNull().default(0),
	invalid: integer("invalid").notNull().default(0),
	casesCreated: integer("cases_created").notNull().default(0),
	casesEnriched: integer("cases_enriched").notNull().default(0),
	movementsCreated: integer("movements_created").notNull().default(0),
	errorMessage: text("error_message"),
});
