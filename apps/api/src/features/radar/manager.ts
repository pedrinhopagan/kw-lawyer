import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lte,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseLawyers } from "../../db/schema/case_lawyers.ts";
import { type CaseDatajudStatus, cases } from "../../db/schema/cases.ts";
import { movements } from "../../db/schema/movements.ts";
import { type CaseState, SILENCE_SAFE_STATES } from "../legal/case-state.ts";
import { CONCLUSION_WEIGHT, SILENCE_THRESHOLD_DAYS } from "./risk.ts";

export const RADAR_LIMIT = 400;

// Processo sem cobertura do DataJud não é processo parado: o app simplesmente não sabe o que
// aconteceu nele. Misturar os dois faria o radar mentir na primeira tela.
const UNCOVERED_STATUSES: CaseDatajudStatus[] = [
	"sem_registro",
	"tribunal_nao_suportado",
	"falhou",
];

const silentDays = sql<number>`floor(extract(epoch from now() - ${cases.lastMovementAt}) / 86400)::int`;

// O peso do estado entra na ordenação antes do limite. Ordenar em JS depois de trazer os mais
// antigos entregava o topo dos candidatos, não o topo do risco.
const riskScore = sql<number>`round(floor(extract(epoch from now() - ${cases.lastMovementAt}) / 86400) * case when ${cases.state} = 'conclusao' then ${CONCLUSION_WEIGHT}::numeric else 1 end)::int`;

export interface SilentCase {
	id: string;
	cnjNumber: string;
	formattedNumber: string;
	tribunal: string;
	orgName: string | null;
	className: string | null;
	lastMovementAt: Date;
	lastMovementSummary: string | null;
	daysSilent: number;
	datajudSyncedAt: Date | null;
	state: CaseState;
	stateSince: Date | null;
	score: number;
}

export class RadarManager {
	constructor(private readonly db: Db | Tx) {}

	async silent(input: { lawyerId: string; thresholdDays?: number }) {
		const thresholdDays = input.thresholdDays ?? SILENCE_THRESHOLD_DAYS;

		const rows = await this.db
			.select({
				id: cases.id,
				cnjNumber: cases.cnjNumber,
				formattedNumber: cases.formattedNumber,
				tribunal: cases.tribunal,
				orgName: cases.orgName,
				className: cases.className,
				lastMovementAt: sql<Date>`${cases.lastMovementAt}`,
				datajudSyncedAt: cases.datajudSyncedAt,
				state: cases.state,
				stateSince: cases.stateSince,
				daysSilent: silentDays,
				score: riskScore,
			})
			.from(cases)
			.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
			.where(
				and(
					eq(caseLawyers.lawyerId, input.lawyerId),
					eq(cases.datajudStatus, "ok"),
					isNotNull(cases.lastMovementAt),
					lte(cases.lastMovementAt, sql`now() - make_interval(days => ${thresholdDays})`),
					notInArray(cases.state, SILENCE_SAFE_STATES),
				),
			)
			.orderBy(desc(riskScore), asc(cases.cnjNumber))
			.limit(RADAR_LIMIT);

		const summaries = await this.lastSummaries(rows.map((row) => row.id));

		return {
			thresholdDays,
			items: rows.map((row) => {
				const summary = summaries.get(row.id);

				return { ...row, lastMovementSummary: summary === undefined ? null : summary };
			}),
		};
	}

	async uncovered(lawyerId: string) {
		const items = await this.db
			.select({
				id: cases.id,
				cnjNumber: cases.cnjNumber,
				formattedNumber: cases.formattedNumber,
				tribunal: cases.tribunal,
				orgName: cases.orgName,
				className: cases.className,
				datajudStatus: cases.datajudStatus,
				datajudSyncedAt: cases.datajudSyncedAt,
			})
			.from(cases)
			.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
			.where(
				and(
					eq(caseLawyers.lawyerId, lawyerId),
					or(isNull(cases.datajudStatus), inArray(cases.datajudStatus, UNCOVERED_STATUSES)),
				),
			)
			.orderBy(asc(cases.cnjNumber))
			.limit(RADAR_LIMIT);

		return { items };
	}

	// O resumo do último movimento é buscado só para o que sobreviveu ao limite: é a linha que a
	// advogada lê na lista, e montá-la junto do recorte custaria a carteira inteira.
	private async lastSummaries(caseIds: string[]) {
		const byCase = new Map<string, string>();

		if (!caseIds.length) {
			return byCase;
		}

		const rows = await this.db
			.selectDistinctOn([movements.caseId], {
				caseId: movements.caseId,
				summary: movements.summary,
			})
			.from(movements)
			.where(inArray(movements.caseId, caseIds))
			.orderBy(movements.caseId, desc(movements.occurredAt), asc(movements.id));

		for (const row of rows) {
			byCase.set(row.caseId, row.summary);
		}

		return byCase;
	}
}
