import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";

export const calendarIntegrations = pgTable("calendar_integrations", {
	id: uuid("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	lawyerId: uuid("lawyer_id")
		.notNull()
		.unique()
		.references(() => lawyers.id, { onDelete: "cascade" }),
	provider: text("provider").notNull().default("google"),
	accountEmail: text("account_email"),
	calendarId: text("calendar_id").notNull().default("primary"),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	scope: text("scope").notNull(),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});
