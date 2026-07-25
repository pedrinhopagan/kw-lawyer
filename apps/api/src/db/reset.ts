import { sql as raw } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client.ts";

await db.execute(raw`DROP SCHEMA IF EXISTS public CASCADE`);
await db.execute(raw`DROP SCHEMA IF EXISTS drizzle CASCADE`);
await db.execute(raw`CREATE SCHEMA public`);

await migrate(db, { migrationsFolder: "./drizzle" });

console.log("[db] schema resetado");

await sql.end();
