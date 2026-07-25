import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";

export const lawyerOabs = pgTable(
	"lawyer_oabs",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		oabNumber: text("oab_number").notNull(),
		oabUf: text("oab_uf").notNull(),
		holderName: text("holder_name"),
		djenAdvogadoId: integer("djen_advogado_id"),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [unique().on(table.lawyerId, table.oabNumber, table.oabUf)],
);
