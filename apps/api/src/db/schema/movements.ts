import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";
import { publications } from "./publications.ts";

export interface MovementComplement {
	codigo: number | null;
	valor: number | null;
	nome: string | null;
	descricao: string | null;
}

export type MovementSource = "publication" | "datajud";

export const movements = pgTable(
	"movements",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id, { onDelete: "cascade" }),
		publicationId: uuid("publication_id")
			.references(() => publications.id, { onDelete: "cascade" })
			.unique(),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
		type: text("type"),
		summary: text("summary").notNull(),
		source: text("source").$type<MovementSource>().notNull().default("publication"),
		grau: text("grau"),
		externalCode: text("external_code"),
		complements: jsonb("complements").$type<MovementComplement[]>(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("movements_case_id_occurred_at_idx").on(table.caseId, table.occurredAt.desc()),
		unique("movements_case_source_external_code_occurred_at_unique").on(
			table.caseId,
			table.source,
			table.externalCode,
			table.occurredAt,
		),
	],
);
