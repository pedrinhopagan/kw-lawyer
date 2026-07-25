import { sql } from "@kw-lawyer/api/src/db/client.ts";

export async function truncateAll() {
	const rows = await sql<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables
		WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
	`;

	if (rows.length === 0) {
		return;
	}

	const names = rows.map((row) => `"${row.tablename}"`).join(", ");

	await sql.unsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
