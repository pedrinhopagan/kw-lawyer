import { DEADLINE_ENGINE_VERSION, DeadlineManager } from "../features/deadlines/manager.ts";
import { db, sql } from "./client.ts";

const force = process.argv.includes("--force");
const result = await new DeadlineManager(db).scan({ force });

console.log(
	`[prazos] motor v${DEADLINE_ENGINE_VERSION}${force ? " (reprocessamento forçado)" : ""}`,
);
console.log(
	`[prazos] ${result.scanned} publicações lidas, ${result.created} prazos criados, ${result.updated} atualizados, ${result.flagged} marcadas para revisão`,
);

await sql.end();
