import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";

export const sessions = pgTable("sessions", {
	id: uuid("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	lawyerId: uuid("lawyer_id")
		.notNull()
		.references(() => lawyers.id, { onDelete: "cascade" }),
	token: text("token").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
