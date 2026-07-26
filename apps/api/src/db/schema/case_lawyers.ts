import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases.ts";
import { lawyers } from "./lawyers.ts";

export const caseLawyers = pgTable(
	"case_lawyers",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id, { onDelete: "cascade" }),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	// O unique é liderado por `case_id`, mas todo escopo do app é por advogada: sem este índice, ler a
	// carteira dela é varredura da tabela inteira de vínculos.
	(table) => [
		unique().on(table.caseId, table.lawyerId),
		index("case_lawyers_lawyer_case_idx").on(table.lawyerId, table.caseId),
	],
);
