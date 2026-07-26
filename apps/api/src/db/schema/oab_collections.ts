import { date, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { syncRuns } from "./sync_runs.ts";

// A marca d'água da coleta é por inscrição, não por advogado: duas advogadas que acompanham a mesma
// OAB não crawleiam o mesmo intervalo duas vezes.
export const oabCollections = pgTable(
	"oab_collections",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		oabNumber: text("oab_number").notNull(),
		oabUf: text("oab_uf").notNull(),
		collectedFrom: date("collected_from").notNull(),
		collectedThrough: date("collected_through").notNull(),
		lastRunId: uuid("last_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [unique().on(table.oabNumber, table.oabUf)],
);
