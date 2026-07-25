import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { caseDecisions } from "./case_decisions.ts";
import { deadlines } from "./deadlines.ts";
import { lawyers } from "./lawyers.ts";

export type AppealChoice = "recorrer" | "nao_recorrer" | "recorrido";

export const caseAppeals = pgTable(
	"case_appeals",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		decisionId: uuid("decision_id")
			.notNull()
			.references(() => caseDecisions.id, { onDelete: "cascade" }),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		choice: text("choice").$type<AppealChoice>().notNull(),
		actKey: text("act_key"),
		reason: text("reason"),
		deadlineId: uuid("deadline_id").references(() => deadlines.id, { onDelete: "set null" }),
		decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [unique("case_appeals_decision_lawyer_unique").on(table.decisionId, table.lawyerId)],
);
