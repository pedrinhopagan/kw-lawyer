import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { db, sql } from "@kw-lawyer/api/src/db/client.ts";
import { sql as raw } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const testsDir = resolve(import.meta.dirname, "../../tests");
const apiDir = resolve(import.meta.dirname, "../../api");
const migrationsFolder = resolve(import.meta.dirname, "../../api/drizzle");

async function isPostgresReadyOnAdmin() {
	const url = new URL(process.env.DATABASE_URL ?? "");
	url.pathname = "/postgres";

	const admin = postgres(url.toString(), { max: 1 });

	try {
		await admin`select 1`;
		return true;
	} catch {
		return false;
	} finally {
		await admin.end();
	}
}

async function waitForPostgres(timeoutMs = 30_000) {
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		const ready = await isPostgresReadyOnAdmin();

		if (ready) {
			return;
		}

		await Bun.sleep(500);
	}

	throw new Error("[e2e] postgres não ficou pronto em 30s");
}

function spawnAwait(cmd: string, args: string[], cwd: string) {
	return new Promise<number>((resolvePromise) => {
		const proc = spawn(cmd, args, { cwd, stdio: "inherit" });
		proc.on("exit", (code) => resolvePromise(code ?? 1));
	});
}

async function ensurePostgresUp() {
	const ready = await isPostgresReadyOnAdmin();

	if (ready) {
		return;
	}

	console.log("[e2e] subindo docker compose...");

	const code = await spawnAwait("docker", ["compose", "up", "-d", "--wait"], testsDir);

	if (code !== 0) {
		throw new Error("[e2e] docker compose up falhou");
	}

	await waitForPostgres();
}

async function ensureDatabaseExists() {
	const url = new URL(process.env.DATABASE_URL ?? "");
	const dbName = url.pathname.slice(1);

	url.pathname = "/postgres";

	const admin = postgres(url.toString(), { max: 1 });

	try {
		const rows = await admin<{ exists: number }[]>`
			SELECT 1 as exists FROM pg_database WHERE datname = ${dbName}
		`;

		if (rows.length === 0) {
			await admin.unsafe(`CREATE DATABASE "${dbName}"`);
			console.log(`[e2e] database criado: ${dbName}`);
		}
	} finally {
		await admin.end();
	}
}

async function prepareSchema() {
	await db.execute(raw`DROP SCHEMA IF EXISTS public CASCADE`);
	await db.execute(raw`DROP SCHEMA IF EXISTS drizzle CASCADE`);
	await db.execute(raw`CREATE SCHEMA public`);

	await migrate(db, { migrationsFolder });
}

await ensurePostgresUp();
await ensureDatabaseExists();
await prepareSchema();
await sql.end();

console.log("[e2e] setup completo, subindo api...");

const api = spawn("bun", ["src/app.ts"], {
	cwd: apiDir,
	stdio: "inherit",
	env: process.env,
});

const forward = (sig: NodeJS.Signals) => () => api.kill(sig);
process.on("SIGTERM", forward("SIGTERM"));
process.on("SIGINT", forward("SIGINT"));

api.on("exit", (code) => process.exit(code ?? 0));
