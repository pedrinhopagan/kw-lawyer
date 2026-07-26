import type { syncRuns } from "../../db/schema/sync_runs.ts";
import { createRealtimeChannel } from "../../realtime.ts";

export type { SyncPhase } from "../../db/schema/sync_runs.ts";

type SyncRun = typeof syncRuns.$inferSelect;

export interface SyncCounters {
	fetched: number;
	created: number;
	updated: number;
	duplicated: number;
	invalid: number;
	casesCreated: number;
	casesEnriched: number;
	movementsCreated: number;
}

// O progresso é a linha de `sync_runs` e nada além dela: o canal transmite o que acabou de ser
// gravado, então o evento que chega e o F5 que relê o banco respondem a mesma coisa.
export interface SyncProgress extends Omit<SyncRun, "id"> {
	runId: string;
}

export function syncProgressOf({ id, ...run }: SyncRun): SyncProgress {
	return { runId: id, ...run };
}

export const syncRealtime = createRealtimeChannel<SyncProgress>();

export function emptySyncCounters(): SyncCounters {
	return {
		fetched: 0,
		created: 0,
		updated: 0,
		duplicated: 0,
		invalid: 0,
		casesCreated: 0,
		casesEnriched: 0,
		movementsCreated: 0,
	};
}
