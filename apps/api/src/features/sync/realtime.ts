import { createRealtimeChannel } from "../../realtime.ts";

export type SyncPhase = "descoberta" | "enriquecimento" | "concluida" | "falhou";

export interface SyncCounters {
	fetched: number;
	created: number;
	duplicated: number;
	invalid: number;
	casesCreated: number;
	casesEnriched: number;
	movementsCreated: number;
}

export interface SyncProgress extends SyncCounters {
	lawyerId: string;
	runId: string;
	phase: SyncPhase;
	errorMessage: string | null;
}

export const syncRealtime = createRealtimeChannel<SyncProgress>();

export function emptySyncCounters(): SyncCounters {
	return {
		fetched: 0,
		created: 0,
		duplicated: 0,
		invalid: 0,
		casesCreated: 0,
		casesEnriched: 0,
		movementsCreated: 0,
	};
}
