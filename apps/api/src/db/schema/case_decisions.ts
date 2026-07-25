import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type {
	DecisionConfidence,
	DecisionEffect,
	DecisionOutcome,
	DecisionSpecies,
} from "../../features/decisions/classify.ts";
import { cases } from "./cases.ts";
import { movements } from "./movements.ts";
import { publications } from "./publications.ts";

export type CaseDecisionOrigin = "automatico" | "manual";

export const caseDecisions = pgTable(
	"case_decisions",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id, { onDelete: "cascade" }),
		movementId: uuid("movement_id")
			.notNull()
			.unique()
			.references(() => movements.id, { onDelete: "cascade" }),
		publicationId: uuid("publication_id").references(() => publications.id, {
			onDelete: "set null",
		}),
		decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
		species: text("species").$type<DecisionSpecies>().notNull(),
		outcome: text("outcome").$type<DecisionOutcome>(),
		effects: jsonb("effects").$type<DecisionEffect[]>().notNull().default([]),
		snippet: text("snippet").notNull(),
		confidence: text("confidence").$type<DecisionConfidence>().notNull().default("baixa"),
		origin: text("origin").$type<CaseDecisionOrigin>().notNull().default("automatico"),
		note: text("note"),
		dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
		engineVersion: integer("engine_version").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("case_decisions_case_decided_idx").on(table.caseId, table.decidedAt.desc()),
		index("case_decisions_case_species_idx").on(table.caseId, table.species),
	],
);
