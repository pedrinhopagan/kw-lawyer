import { and, eq, exists, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db, Tx } from "../../db/client.ts";
import { caseLawyers } from "../../db/schema/case_lawyers.ts";

export function ownedByLawyer(input: { db: Db | Tx; lawyerId: string; caseIdColumns: PgColumn[] }) {
	const anyOfTheCases = or(...input.caseIdColumns.map((column) => eq(caseLawyers.caseId, column)));
	const scoped = input.db
		.select({ found: sql`1` })
		.from(caseLawyers)
		.where(and(eq(caseLawyers.lawyerId, input.lawyerId), anyOfTheCases));

	return exists(scoped);
}
