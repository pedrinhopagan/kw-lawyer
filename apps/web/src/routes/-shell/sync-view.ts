import type { SyncEvent, SyncStatus } from "./sync";

export const SYNC_UNKNOWN_FAILURE = "Erro desconhecido durante a sincronização.";

// O evento do canal e a linha lida por `sync.status` são a mesma corrida gravada no banco, só que
// uma delas pode estar velha: o batimento diz qual das duas foi escrita por último.
export type SyncSnapshot = Omit<SyncEvent, "runId">;

type SyncPhase = SyncEvent["phase"];

type RunningPhase = Exclude<SyncPhase, "concluida" | "falhou">;

interface PhaseCopy {
	label: string;
	unit: string;
	// A descoberta só conhece o tamanho de uma janela do DJEN depois de abrir a primeira página dela,
	// então o total cresce durante a etapa. Fração sobre denominador que cresce anda para trás: essa
	// etapa mostra contagem, não barra.
	exactTotal: boolean;
}

const PHASES: Record<RunningPhase, PhaseCopy> = {
	descoberta: {
		label: "Buscando publicações",
		unit: "publicações",
		exactTotal: false,
	},
	projecao: {
		label: "Organizando as publicações",
		unit: "publicações",
		exactTotal: true,
	},
	enriquecimento: {
		label: "Lendo os andamentos",
		unit: "processos",
		exactTotal: true,
	},
	classificacao: {
		label: "Identificando prazos",
		unit: "publicações e processos",
		exactTotal: true,
	},
};

const PHASE_ORDER: RunningPhase[] = ["descoberta", "projecao", "enriquecimento", "classificacao"];

export const SYNC_PHASE_LABELS = PHASE_ORDER.map((phase) => PHASES[phase].label);

export const SYNC_PHASE_COUNT = PHASE_ORDER.length;

export interface SyncRunningView {
	phase: RunningPhase;
	label: string;
	step: number;
	done: number;
	total: number;
	detail: string;
	ratio: number | null;
}

function detailOf(copy: PhaseCopy, done: number, total: number) {
	const doneLabel = done.toLocaleString("pt-BR");

	if (!total) {
		return `${doneLabel} ${copy.unit}`;
	}

	const totalLabel = total.toLocaleString("pt-BR");

	if (!copy.exactTotal) {
		return `${doneLabel} de ${totalLabel} ${copy.unit} encontradas até aqui`;
	}

	return `${doneLabel} de ${totalLabel} ${copy.unit}`;
}

export function latestSyncSnapshot(
	event: SyncEvent | undefined,
	run: SyncStatus["run"] | undefined,
) {
	if (!event || !run) {
		return event ?? run;
	}

	if (event.heartbeatAt >= run.heartbeatAt) {
		return event;
	}

	return run;
}

export function syncRunningView(snapshot: SyncSnapshot | null | undefined): SyncRunningView | null {
	if (!snapshot || snapshot.phase === "concluida" || snapshot.phase === "falhou") {
		return null;
	}

	const copy = PHASES[snapshot.phase];
	const done = Math.min(snapshot.stepDone, snapshot.stepTotal || snapshot.stepDone);

	return {
		phase: snapshot.phase,
		label: copy.label,
		step: PHASE_ORDER.indexOf(snapshot.phase) + 1,
		done,
		total: snapshot.stepTotal,
		detail: detailOf(copy, snapshot.stepDone, snapshot.stepTotal),
		ratio: copy.exactTotal && snapshot.stepTotal > 0 ? done / snapshot.stepTotal : null,
	};
}

export function syncFailureOf(snapshot: SyncSnapshot | null | undefined) {
	if (snapshot?.phase !== "falhou") {
		return null;
	}

	return snapshot.errorMessage ?? SYNC_UNKNOWN_FAILURE;
}
