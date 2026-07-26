import { date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { syncRuns } from "./sync_runs.ts";

export const djenCommunications = pgTable(
	"djen_communications",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		externalId: text("external_id").notNull().unique(),
		availableAt: date("available_at"),
		payload: jsonb("payload").$type<unknown>().notNull(),
		payloadHash: text("payload_hash").notNull(),
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
		runId: uuid("run_id").references(() => syncRuns.id, { onDelete: "set null" }),
		projectedAt: timestamp("projected_at", { withTimezone: true }),
		projectorVersion: integer("projector_version").notNull().default(0),
	},
	(table) => [
		index("djen_communications_available_at_idx").on(table.availableAt.desc()),
		// A fila é "versão do projetor atrás da corrente": quem aterrissa de novo volta para a versão
		// zero, então um índice sobre a versão serve a fila inteira, inclusive depois de um bump.
		index("djen_communications_pending_idx").on(table.projectorVersion, table.availableAt.desc()),
	],
);
