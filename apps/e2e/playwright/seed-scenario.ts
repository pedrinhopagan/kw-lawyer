import { eq } from "drizzle-orm";
import { db, sql } from "@kw-lawyer/api/src/db/client.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { syncRuns } from "@kw-lawyer/api/src/db/schema/sync_runs.ts";
import { SyncManager } from "@kw-lawyer/api/src/features/sync/manager.ts";
import { stubLawyer } from "./cnj-stub.ts";

const [lawyer] = await db.insert(lawyers).values(stubLawyer).returning({ id: lawyers.id });

if (!lawyer) {
	throw new Error("[e2e] não foi possível semear a advogada do cenário");
}

const manager = new SyncManager(db);
const { runId } = await manager.start(lawyer.id);
const result = await manager.syncLawyer(lawyer.id, { runId, force: true });

if (result.status !== "concluida") {
	const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, runId));

	throw new Error(`[e2e] sincronização do cenário falhou: ${run?.errorMessage}`);
}

await sql.end();

console.log(
	`[e2e] cenário semeado: ${result.created} publicações, ${result.casesCreated} processos, ${result.movementsCreated} andamentos`,
);
