import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import type { RelationKind, RelationState } from "../../features/incidents/classify.ts";
import { cases } from "./cases.ts";

export type CaseRelationOrigin = "automatico" | "manual";

export const caseRelations = pgTable(
	"case_relations",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		incidentCaseId: uuid("incident_case_id").references(() => cases.id, { onDelete: "cascade" }),
		incidentCnjNumber: text("incident_cnj_number").notNull(),
		principalCaseId: uuid("principal_case_id").references(() => cases.id, { onDelete: "cascade" }),
		principalCnjNumber: text("principal_cnj_number").notNull(),
		kind: text("kind").$type<RelationKind>().notNull(),
		state: text("state").$type<RelationState>(),
		suspensiveEffect: boolean("suspensive_effect"),
		snippet: text("snippet"),
		origin: text("origin").$type<CaseRelationOrigin>().notNull().default("automatico"),
		dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
		engineVersion: integer("engine_version").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("case_relations_pair_unique").on(table.incidentCnjNumber, table.principalCnjNumber),
		index("case_relations_principal_idx").on(table.principalCaseId),
		index("case_relations_incident_idx").on(table.incidentCaseId),
	],
);
