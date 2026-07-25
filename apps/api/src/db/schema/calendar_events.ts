import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { calendarIntegrations } from "./calendar_integrations.ts";
import { deadlines } from "./deadlines.ts";

export const calendarEvents = pgTable(
	"calendar_events",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		integrationId: uuid("integration_id")
			.notNull()
			.references(() => calendarIntegrations.id, { onDelete: "cascade" }),
		deadlineId: uuid("deadline_id")
			.notNull()
			.references(() => deadlines.id, { onDelete: "cascade" }),
		googleEventId: text("google_event_id").notNull(),
		contentHash: text("content_hash").notNull(),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("calendar_events_integration_deadline_unique").on(
			table.integrationId,
			table.deadlineId,
		),
		index("calendar_events_deadline_idx").on(table.deadlineId),
	],
);
