import { and, eq } from "drizzle-orm";
import type { Db, Tx } from "./client.ts";
import { lawyers } from "./schema/lawyers.ts";

const REFERENCE_LAWYER = {
	name: "ANA LUISA FERREIRA CAMPOS",
	oabNumber: "999001",
	oabUf: "SP",
};

export async function seedDev(db: Db | Tx) {
	const [inserted] = await db
		.insert(lawyers)
		.values(REFERENCE_LAWYER)
		.onConflictDoNothing({ target: [lawyers.oabNumber, lawyers.oabUf] })
		.returning({ id: lawyers.id });

	if (inserted) {
		return { lawyerId: inserted.id, created: true };
	}

	const [existing] = await db
		.select({ id: lawyers.id })
		.from(lawyers)
		.where(
			and(
				eq(lawyers.oabNumber, REFERENCE_LAWYER.oabNumber),
				eq(lawyers.oabUf, REFERENCE_LAWYER.oabUf),
			),
		);

	if (!existing) {
		throw new Error(
			`Advogada de referência OAB/${REFERENCE_LAWYER.oabUf} ${REFERENCE_LAWYER.oabNumber} não foi encontrada depois do seed`,
		);
	}

	return { lawyerId: existing.id, created: false };
}

if (import.meta.main) {
	const { db, sql } = await import("./client.ts");
	const result = await seedDev(db);

	console.log(
		result.created
			? `[db] advogada de referência criada (${result.lawyerId})`
			: `[db] advogada de referência já existia (${result.lawyerId})`,
	);

	await sql.end();
}
