import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";
import { publications } from "./publications.ts";

export const publicationLinks = pgTable(
	"publication_links",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		publicationId: uuid("publication_id")
			.notNull()
			.references(() => publications.id, { onDelete: "cascade" }),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		readAt: timestamp("read_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique().on(table.publicationId, table.lawyerId),
		index("publication_links_lawyer_id_read_at_idx").on(table.lawyerId, table.readAt),
	],
);
