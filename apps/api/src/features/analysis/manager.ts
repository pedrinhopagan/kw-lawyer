import { asc, desc, inArray, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { cases } from "../../db/schema/cases.ts";
import { movements } from "../../db/schema/movements.ts";
import { DecisionManager } from "../decisions/manager.ts";
import { EvidenceManager } from "../evidence/manager.ts";
import { IncidentManager } from "../incidents/manager.ts";
import { CASE_SCAN_CHUNK, recordCaseScans, staleCaseIds } from "../legal/case-scan.ts";
import { stateOf } from "../legal/case-state.ts";

export const STATE_ENGINE_VERSION = 1;

const SCANNER = "estado";

interface ScanInput {
	caseIds?: string[];
	lawyerId?: string;
	touched?: string[];
	force?: boolean;
}

export class CaseAnalysisManager {
	constructor(private readonly db: Db | Tx) {}

	// Os três primeiros eixos leem publicação e movimento do que acabou de chegar, então a lista é o
	// escopo certo deles. Só o estado precisa da carteira: ele é o único que muda sem nada novo ter
	// entrado, e o único que a tela de parados lê direto da coluna.
	async scan(input: ScanInput) {
		const axes = { caseIds: input.caseIds, force: input.force };

		return {
			decisoes: await new DecisionManager(this.db).scan(axes),
			provas: await new EvidenceManager(this.db).scan(axes),
			incidentes: await new IncidentManager(this.db).scan(axes),
			estado: await this.classify(input),
		};
	}

	// Último passo da varredura, depois que os eixos já leram as fontes: o estado do processo passa a
	// morar na linha dele, e é isso que deixa o radar recortar e ordenar em SQL antes do limite. Quem
	// decide continua sendo `stateOf`, o mesmo que responde pela faixa da tela do processo.
	private async classify(input: ScanInput) {
		const stale = await staleCaseIds({
			db: this.db,
			scanner: SCANNER,
			engineVersion: STATE_ENGINE_VERSION,
			caseIds: input.caseIds,
			lawyerId: input.lawyerId,
			touched: input.touched,
			force: input.force,
		});

		const result = { cases: 0, sources: 0, created: 0, updated: 0, removed: 0 };

		for (let start = 0; start < stale.length; start += CASE_SCAN_CHUNK) {
			const chunk = stale.slice(start, start + CASE_SCAN_CHUNK);
			const history = await this.historyOf(chunk);
			const classified = chunk.map((caseId) => stateOf(history.get(caseId) ?? []));

			const written = await this.db.execute(sql`
				update ${cases} set
					state = classified.state,
					state_since = classified.state_since::timestamptz,
					updated_at = now()
				from unnest(
					${sql.param(chunk)}::text[],
					${sql.param(classified.map((entry) => entry.state))}::text[],
					${sql.param(classified.map((entry) => (entry.since === null ? null : entry.since.toISOString())))}::text[]
				) as classified(id, state, state_since)
				where ${cases.id} = classified.id::uuid
					and (
						${cases.state} is distinct from classified.state
						or ${cases.stateSince} is distinct from classified.state_since::timestamptz
					)
				returning ${cases.id}
			`);

			await recordCaseScans({
				db: this.db,
				caseIds: chunk,
				scanner: SCANNER,
				engineVersion: STATE_ENGINE_VERSION,
			});

			result.cases += chunk.length;
			result.sources += [...history.values()].reduce((total, list) => total + list.length, 0);
			result.updated += [...written].length;
		}

		return result;
	}

	// A mesma ordem da timeline do processo: outro critério de desempate aqui faria a faixa da tela e o
	// estado gravado discordarem sobre onde o processo está.
	private async historyOf(caseIds: string[]) {
		const byCase = new Map<string, { summary: string; occurredAt: Date }[]>();

		const rows = await this.db
			.select({
				caseId: movements.caseId,
				summary: movements.summary,
				occurredAt: movements.occurredAt,
			})
			.from(movements)
			.where(inArray(movements.caseId, caseIds))
			.orderBy(desc(movements.occurredAt), asc(movements.id));

		for (const row of rows) {
			const list = byCase.get(row.caseId) ?? [];

			list.push({ summary: row.summary, occurredAt: row.occurredAt });
			byCase.set(row.caseId, list);
		}

		return byCase;
	}
}
