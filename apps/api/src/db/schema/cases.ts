import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export interface CaseSubject {
	codigo: number | null;
	nome: string | null;
}

export type CaseDatajudStatus = "ok" | "sem_registro" | "tribunal_nao_suportado" | "falhou";

export const cases = pgTable("cases", {
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
	grau: text("grau"),
	orgJudgingName: text("org_judging_name"),
	orgJudgingCode: text("org_judging_code"),
	subjects: jsonb("subjects").$type<CaseSubject[]>(),
	systemName: text("system_name"),
	filedAt: timestamp("filed_at", { withTimezone: true }),
	secrecyLevel: integer("secrecy_level"),
	datajudSyncedAt: timestamp("datajud_synced_at", { withTimezone: true }),
	datajudStatus: text("datajud_status").$type<CaseDatajudStatus>(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});
