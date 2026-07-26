import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { CaseState } from "../../features/legal/case-state.ts";

export interface CaseSubject {
	codigo: number | null;
	nome: string | null;
}

export type CaseDatajudStatus = "ok" | "sem_registro" | "tribunal_nao_suportado" | "falhou";

export const cases = pgTable(
	"cases",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		cnjNumber: text("cnj_number").notNull().unique(),
		formattedNumber: text("formatted_number").notNull(),
		tribunal: text("tribunal").notNull(),
		orgName: text("org_name"),
		className: text("class_name"),
		classCode: text("class_code"),
		lastMovementAt: timestamp("last_movement_at", { withTimezone: true }),
		// Estado materializado pela varredura: reler a timeline inteira de cada processo para descobrir
		// se ele está concluso é o que impedia o radar de filtrar e ordenar antes do limite.
		state: text("state").$type<CaseState>().notNull().default("tramitando"),
		stateSince: timestamp("state_since", { withTimezone: true }),
		subjects: jsonb("subjects").$type<CaseSubject[]>(),
		datajudSyncedAt: timestamp("datajud_synced_at", { withTimezone: true }),
		// Marca d'água por conteúdo: enquanto a fonte não anuncia atualização mais nova que esta,
		// reenriquecer o processo só reescreveria o que já está gravado.
		datajudSourceUpdatedAt: timestamp("datajud_source_updated_at", { withTimezone: true }),
		datajudStatus: text("datajud_status").$type<CaseDatajudStatus>(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("cases_last_movement_cnj_idx").on(
			table.lastMovementAt.desc().nullsLast(),
			table.cnjNumber,
		),
		index("cases_tribunal_idx").on(table.tribunal),
	],
);
