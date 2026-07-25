import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client.ts";

await migrate(db, { migrationsFolder: "./drizzle" });

console.log("[db] migrations aplicadas");

await sql.end();
