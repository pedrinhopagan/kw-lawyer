import { resolve } from "node:path";
import { db, sql } from "@kw-lawyer/api/src/db/client.ts";
import { sql as raw } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const testsDir = resolve(import.meta.dir, "..");
const migrationsFolder = resolve(import.meta.dir, "../../api/drizzle");

async function isPostgresReady() {
	try {
		await sql`select 1`;
		return true;
	} catch {
		return false;
	}
}

async function waitForPostgres(timeoutMs = 30_000) {
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		const ready = await isPostgresReady();

		if (ready) {
			return;
		}

		await Bun.sleep(500);
	}

	throw new Error("[tests] postgres não ficou pronto em 30s");
}

async function ensurePostgresUp() {
	const ready = await isPostgresReady();

	if (ready) {
		return;
	}

	console.log("[tests] subindo docker compose...");

	const proc = Bun.spawn(["docker", "compose", "up", "-d", "--wait"], {
		cwd: testsDir,
		stdout: "inherit",
		stderr: "inherit",
	});

	const code = await proc.exited;

	if (code !== 0) {
		throw new Error("[tests] docker compose up falhou");
	}

	await waitForPostgres();
}

await ensurePostgresUp();

await db.execute(raw`DROP SCHEMA IF EXISTS public CASCADE`);
await db.execute(raw`DROP SCHEMA IF EXISTS drizzle CASCADE`);
await db.execute(raw`CREATE SCHEMA public`);

await migrate(db, { migrationsFolder });

console.log("[tests] setup completo");
