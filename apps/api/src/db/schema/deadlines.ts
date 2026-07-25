import { sql } from "drizzle-orm";
import {
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";
import { lawyers } from "./lawyers.ts";
import { publications } from "./publications.ts";

export type DeadlineStatus = "a_confirmar" | "confirmado" | "cumprido" | "descartado";

export type DeadlineOrigin = "automatico" | "manual";

export type DeadlineConfidence = "alta" | "media" | "baixa";

export type DeadlineAudience = "partes" | "terceiro" | "indefinido";

export interface DeadlineCalculationLog {
	availableAt: string;
	publishedAt: string;
	startsAt: string;
	dueAt: string;
	expectedDueAt: string;
	days: number;
	unit: "uteis" | "corridos";
	multiplier: number;
	steps: { date: string; counted: boolean; position: number | null; reason: string | null }[];
	warnings: string[];
	engineVersion: number;
}

export const deadlines = pgTable(
	"deadlines",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		publicationId: uuid("publication_id").references(() => publications.id, {
			onDelete: "cascade",
		}),
		caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
		title: text("title").notNull(),
		actKey: text("act_key"),
		basis: text("basis"),
		days: integer("days").notNull(),
		unit: text("unit").$type<"uteis" | "corridos">().notNull().default("uteis"),
		multiplier: integer("multiplier").notNull().default(1),
		availableAt: date("available_at"),
		publishedAt: date("published_at"),
		startsAt: date("starts_at"),
		dueAt: date("due_at").notNull(),
		expectedDueAt: date("expected_due_at"),
		status: text("status").$type<DeadlineStatus>().notNull().default("a_confirmar"),
		origin: text("origin").$type<DeadlineOrigin>().notNull().default("automatico"),
		confidence: text("confidence").$type<DeadlineConfidence>().notNull().default("baixa"),
		audience: text("audience").$type<DeadlineAudience>().notNull().default("indefinido"),
		snippet: text("snippet"),
		note: text("note"),
		warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
		calculation: jsonb("calculation").$type<DeadlineCalculationLog | null>(),
		engineVersion: integer("engine_version").notNull().default(1),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("deadlines_auto_publication_lawyer_unique")
			.on(table.publicationId, table.lawyerId)
			.where(sql`${table.origin} = 'automatico'`),
		index("deadlines_lawyer_due_idx").on(table.lawyerId, table.dueAt),
		index("deadlines_lawyer_status_idx").on(table.lawyerId, table.status),
		index("deadlines_publication_idx").on(table.publicationId),
		index("deadlines_case_idx").on(table.caseId),
	],
);
