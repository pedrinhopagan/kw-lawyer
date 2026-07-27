import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env.ts";

// Conexão própria, sem o teto de 30s do handle de leitura: aquele teto existe para consulta de tela,
// e migration não é consulta de tela. O backfill que preenche as publicações a partir das comunicações
// do DJEN levou 1m50 na vps, foi cortado no meio do deploy e derrubou a api, que não sobe enquanto a
// migration não completa.
const sql = postgres(env.DATABASE_URL, { max: 1, connection: { statement_timeout: 0 } });

await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });

console.log("[db] migrations aplicadas");

await sql.end();
