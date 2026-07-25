import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";

export const caseParties = pgTable(
	"case_parties",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		polo: text("polo"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [unique().on(table.caseId, table.name, table.polo).nullsNotDistinct()],
);
