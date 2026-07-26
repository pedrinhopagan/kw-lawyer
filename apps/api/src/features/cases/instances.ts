import { asc, inArray } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseInstances } from "../../db/schema/case_instances.ts";
import { grauRank } from "../legal/grau.ts";

function selectInstances(db: Db | Tx, caseIds: string[]) {
	return db
		.select({
			caseId: caseInstances.caseId,
			grau: caseInstances.grau,
			orgJudgingName: caseInstances.orgJudgingName,
			orgJudgingCode: caseInstances.orgJudgingCode,
			systemName: caseInstances.systemName,
			formatName: caseInstances.formatName,
			filedAt: caseInstances.filedAt,
			secrecyLevel: caseInstances.secrecyLevel,
		})
		.from(caseInstances)
		.where(inArray(caseInstances.caseId, caseIds))
		.orderBy(asc(caseInstances.grau));
}

export type CaseInstance = Omit<Awaited<ReturnType<typeof selectInstances>>[number], "caseId">;

export async function instancesByCase(db: Db | Tx, caseIds: string[]) {
	const grouped = new Map<string, CaseInstance[]>(caseIds.map((caseId) => [caseId, []]));

	if (!caseIds.length) {
		return grouped;
	}

	for (const { caseId, ...instance } of await selectInstances(db, caseIds)) {
		grouped.get(caseId)?.push(instance);
	}

	return grouped;
}

// O cabeçalho mostra uma linha só, e a instância que responde "onde o processo está hoje" é a mais
// alta que a fonte conhece: o processo já no tribunal não pode aparecer como se estivesse na vara.
export function currentInstance(instances: CaseInstance[]) {
	return instances.toSorted((left, right) => grauRank(left.grau) - grauRank(right.grau)).at(-1);
}
