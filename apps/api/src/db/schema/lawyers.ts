import { sql } from "drizzle-orm";
import { date, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export type OnboardingState = "sem_sync" | "sincronizando" | "pronto" | "falhou";

export const lawyers = pgTable(
	"lawyers",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text("name").notNull(),
		oabNumber: text("oab_number").notNull(),
		oabUf: text("oab_uf").notNull(),
		djenAdvogadoId: integer("djen_advogado_id"),
		historyCutoffAt: date("history_cutoff_at")
			.notNull()
			.default(sql`current_date`),
		onboardingState: text("onboarding_state")
			.$type<OnboardingState>()
			.notNull()
			.default("sem_sync"),
		firstSyncCompletedAt: timestamp("first_sync_completed_at", { withTimezone: true }),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [unique().on(table.oabNumber, table.oabUf)],
);
