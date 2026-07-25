import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatEventDate } from "@/lib/format";
import {
	type SyncEvent,
	syncProgressQueryOptions,
	type SyncStatus,
	syncStatusQueryOptions,
	useStartSync,
} from "./sync";

const UNKNOWN_FAILURE = "Erro desconhecido durante a sincronização.";

type RunningPhase = "descoberta" | "enriquecimento";

type Counters = Pick<SyncEvent, "fetched" | "casesCreated" | "casesEnriched" | "movementsCreated">;

type Run = SyncStatus["run"] | undefined;

function detailOf(counters: Counters, phase: RunningPhase) {
	if (phase === "descoberta") {
		return `${counters.fetched} publicações, ${counters.casesCreated} processos`;
	}

	return `${counters.casesEnriched} processos, ${counters.movementsCreated} andamentos`;
}

function runningView(event: SyncEvent | undefined, run: Run) {
	if (event?.phase === "descoberta" || event?.phase === "enriquecimento") {
		return { phase: event.phase, detail: detailOf(event, event.phase) };
	}

	if (!event && run?.status === "em_execucao") {
		return { phase: "descoberta" as const, detail: detailOf(run, "descoberta") };
	}

	return null;
}

function failureMessage(event: SyncEvent | undefined, run: Run) {
	if (event?.phase === "falhou") {
		return event.errorMessage ?? UNKNOWN_FAILURE;
	}

	if (!event && run?.status === "falhou") {
		return run.errorMessage ?? UNKNOWN_FAILURE;
	}

	return null;
}

export function SyncIndicator() {
	const queryClient = useQueryClient();
	const progress = useQuery(syncProgressQueryOptions(queryClient));
	const status = useQuery(syncStatusQueryOptions);
	const startSync = useStartSync();

	const running = runningView(progress.data, status.data?.run);
	const failure = failureMessage(progress.data, status.data?.run);
	const lastSyncedAt = status.data?.lastSyncedAt;

	if (running) {
		return (
			<div className="border-t border-sidebar-border px-3 py-2.5">
				<div className="flex items-center gap-2">
					<RefreshCwIcon className="size-3 shrink-0 animate-spin text-primary" />
					<span className="text-xs font-medium">
						{running.phase === "descoberta" && "Buscando publicações"}
						{running.phase === "enriquecimento" && "Lendo andamentos"}
					</span>
				</div>
				<p className="mt-1 truncate font-mono text-2xs tabular-nums text-muted-foreground">
					{running.detail}
				</p>
				<div className="mt-2 h-px w-full overflow-hidden bg-border">
					<div className="h-full w-1/3 animate-sweep bg-primary" />
				</div>
			</div>
		);
	}

	if (failure) {
		return (
			<div className="border-t border-sidebar-border px-3 py-2.5">
				<div className="flex items-center gap-2 text-destructive">
					<TriangleAlertIcon className="size-3 shrink-0" />
					<span className="text-xs font-medium">A sincronização falhou</span>
				</div>
				<p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
					{failure}
				</p>
				<Button
					variant="ghost"
					size="xs"
					className="mt-1 -ml-2 h-6 text-2xs"
					disabled={startSync.isPending}
					onClick={() => startSync.mutate({ force: false })}
				>
					<RefreshCwIcon />
					Tentar de novo
				</Button>
			</div>
		);
	}

	return (
		<div className="flex items-center justify-between gap-2 border-t border-sidebar-border py-1.5 pr-2 pl-3">
			<span className="truncate text-2xs text-muted-foreground">
				{!!lastSyncedAt && `Atualizado ${formatEventDate(lastSyncedAt)}`}
				{!lastSyncedAt && "Ainda não sincronizado"}
			</span>
			<Button
				variant="ghost"
				size="icon-xs"
				className="shrink-0 text-muted-foreground"
				aria-label="Sincronizar agora"
				disabled={startSync.isPending}
				onClick={() => startSync.mutate({ force: false })}
			>
				<RefreshCwIcon className={cn(startSync.isPending && "animate-spin")} />
			</Button>
		</div>
	);
}
