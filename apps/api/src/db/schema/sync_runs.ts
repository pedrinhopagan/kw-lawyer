import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";

export type SyncRunStatus = "em_execucao" | "concluida" | "falhou";

// A carga inicial varre o histórico inteiro do DJEN e leva minutos; a incremental cobre a janela
// desde a última marca. Quem lê a barra precisa saber em qual das duas está antes de julgar a demora.
export type SyncRunKind = "inicial" | "incremental";

export type SyncPhase =
	| "descoberta"
	| "projecao"
	| "enriquecimento"
	| "classificacao"
	| "concluida"
	| "falhou";

export const syncRuns = pgTable(
	"sync_runs",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		status: text("status").$type<SyncRunStatus>().notNull(),
		kind: text("kind").$type<SyncRunKind>().notNull().default("incremental"),
		phase: text("phase").$type<SyncPhase>().notNull().default("descoberta"),
		// O denominador da etapa em curso. Zero é "ainda não sei": é o que a barra lê para continuar
		// indeterminada em vez de fingir uma fração.
		stepTotal: integer("step_total").notNull().default(0),
		stepDone: integer("step_done").notNull().default(0),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
		// O batimento é o que separa run vivo de run abandonado: carga inicial longa continua sendo run
		// vivo, e só o silêncio do job libera outra sincronização.
		heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		fetched: integer("fetched").notNull().default(0),
		created: integer("created").notNull().default(0),
		updated: integer("updated").notNull().default(0),
		duplicated: integer("duplicated").notNull().default(0),
		invalid: integer("invalid").notNull().default(0),
		casesCreated: integer("cases_created").notNull().default(0),
		casesEnriched: integer("cases_enriched").notNull().default(0),
		movementsCreated: integer("movements_created").notNull().default(0),
		errorMessage: text("error_message"),
	},
	(table) => [index("sync_runs_lawyer_started_idx").on(table.lawyerId, table.startedAt.desc())],
);
