import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export type WatchCycleKind = "coleta" | "alerta";

export type WatchCycleStatus = "em_execucao" | "concluido" | "falhou";

export const watchCycles = pgTable(
	"watch_cycles",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		kind: text("kind").$type<WatchCycleKind>().notNull(),
		// Horário forense do ciclo, no formato 2026-07-25T06. Reiniciar o container no meio da manhã
		// não repete o ciclo das 06:00 nem pula o das 13:00.
		slot: text("slot").notNull(),
		status: text("status").$type<WatchCycleStatus>().notNull(),
		lawyers: integer("lawyers").notNull().default(0),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		errorMessage: text("error_message"),
	},
	(table) => [uniqueIndex("watch_cycles_kind_slot_unique").on(table.kind, table.slot)],
);
