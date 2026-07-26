import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.ts";

const READ_POOL_MAX = 10;

// O crawl segura a conexão pelo tempo da ida ao DJEN e ao DataJud. Com pool próprio e pequeno, ele
// para de disputar com as consultas da primeira tela: no máximo duas conexões saem da leitura.
const SYNC_POOL_MAX = 2;

const IDLE_TIMEOUT_SECONDS = 30;
const CONNECT_TIMEOUT_SECONDS = 10;

// Teto por statement, não por requisição: consulta que passa disso está travando a leitura de todo
// mundo, e devolver erro é melhor do que segurar a conexão até o navegador desistir.
const READ_STATEMENT_TIMEOUT_MS = 30_000;
const SYNC_STATEMENT_TIMEOUT_MS = 120_000;

const sql = postgres(env.DATABASE_URL, {
	max: READ_POOL_MAX,
	idle_timeout: IDLE_TIMEOUT_SECONDS,
	connect_timeout: CONNECT_TIMEOUT_SECONDS,
	connection: { statement_timeout: READ_STATEMENT_TIMEOUT_MS },
});

const syncSql = postgres(env.DATABASE_URL, {
	max: SYNC_POOL_MAX,
	idle_timeout: IDLE_TIMEOUT_SECONDS,
	connect_timeout: CONNECT_TIMEOUT_SECONDS,
	connection: { statement_timeout: SYNC_STATEMENT_TIMEOUT_MS },
});

export const db = drizzle(sql);

// Handle dos jobs de coleta: sync disparado pela requisição e relógio de vigilância.
export const syncDb = drizzle(syncSql);

export { sql };

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
