import type { Db, Tx } from "../../db/client.ts";
import { DecisionManager } from "../decisions/manager.ts";
import { EvidenceManager } from "../evidence/manager.ts";
import { IncidentManager } from "../incidents/manager.ts";

interface ScanInput {
	caseIds?: string[];
	force?: boolean;
}

export class CaseAnalysisManager {
	constructor(private readonly db: Db | Tx) {}

	async scan(input: ScanInput) {
		return {
			decisoes: await new DecisionManager(this.db).scan(input),
			provas: await new EvidenceManager(this.db).scan(input),
			incidentes: await new IncidentManager(this.db).scan(input),
		};
	}
}
