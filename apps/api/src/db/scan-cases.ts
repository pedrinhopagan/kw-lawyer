import { CaseAnalysisManager, STATE_ENGINE_VERSION } from "../features/analysis/manager.ts";
import { DECISION_ENGINE_VERSION } from "../features/decisions/manager.ts";
import { EVIDENCE_ENGINE_VERSION } from "../features/evidence/manager.ts";
import { INCIDENT_ENGINE_VERSION } from "../features/incidents/manager.ts";
import { db, sql } from "./client.ts";

const ENGINE_VERSIONS: Record<string, number> = {
	decisoes: DECISION_ENGINE_VERSION,
	provas: EVIDENCE_ENGINE_VERSION,
	incidentes: INCIDENT_ENGINE_VERSION,
	estado: STATE_ENGINE_VERSION,
};

const force = process.argv.includes("--force");
const result = await new CaseAnalysisManager(db).scan({ force });

console.log(`[processos] leitura por eixo${force ? " (reprocessamento forçado)" : ""}`);

for (const [scanner, stats] of Object.entries(result)) {
	console.log(
		`[${scanner}] motor v${ENGINE_VERSIONS[scanner]}: ${stats.cases} processos, ${stats.sources} fontes lidas, ${stats.created} criados, ${stats.updated} atualizados, ${stats.removed} removidos`,
	);
}

await sql.end();
