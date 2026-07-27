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
		// `current_date` é o dia do servidor, que roda em UTC: entre as 21h e a meia-noite de Brasília a
		// advogada que entrava pela primeira vez nascia com o corte um dia à frente, e a caixa abria já
		// sem a publicação daquela tarde. O dia forense é o de `FORENSIC_TIME_ZONE`, aqui e no calendário.
		historyCutoffAt: date("history_cutoff_at")
			.notNull()
			.default(sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`),
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
