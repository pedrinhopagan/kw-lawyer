import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { djenCommunications } from "./djen_communications.ts";

export const djenCommunicationOabs = pgTable(
	"djen_communication_oabs",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		communicationId: uuid("communication_id")
			.notNull()
			.references(() => djenCommunications.id, { onDelete: "cascade" }),
		oabNumber: text("oab_number").notNull(),
		oabUf: text("oab_uf").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique().on(table.communicationId, table.oabNumber, table.oabUf),
		index("djen_communication_oabs_oab_idx").on(table.oabNumber, table.oabUf),
	],
);
