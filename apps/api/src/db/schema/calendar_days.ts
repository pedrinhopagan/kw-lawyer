import { date, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export type CalendarDayKind = "feriado" | "suspensao";

export type CalendarDayCertainty = "certa" | "provavel";

export const calendarDays = pgTable(
	"calendar_days",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		scope: text("scope").notNull(),
		day: date("day").notNull(),
		kind: text("kind").$type<CalendarDayKind>().notNull(),
		certainty: text("certainty").$type<CalendarDayCertainty>().notNull().default("certa"),
		description: text("description").notNull(),
		source: text("source"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [unique().on(table.scope, table.day, table.kind)],
);
