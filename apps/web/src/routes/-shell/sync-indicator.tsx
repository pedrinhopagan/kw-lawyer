import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlugZapIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatEventDate } from "@/lib/format";
import {
	reconnectSyncProgress,
	syncProgressQueryOptions,
	syncStatusQueryOptions,
	useStartSync,
} from "./sync";
import { latestSyncSnapshot, SYNC_PHASE_COUNT, syncFailureOf, syncRunningView } from "./sync-view";

export function SyncIndicator() {
	const queryClient = useQueryClient();
	const progress = useQuery(syncProgressQueryOptions(queryClient));
	const status = useQuery(syncStatusQueryOptions);
	const startSync = useStartSync();

	const snapshot = latestSyncSnapshot(progress.data, status.data?.run);
	const running = syncRunningView(snapshot);
	const failure = syncFailureOf(snapshot);
	const lastSyncedAt = status.data?.lastSyncedAt;

	if (running && progress.isError) {
		return (
			<div className="border-t border-sidebar-border px-3 py-2.5">
				<div className="flex items-center gap-2">
					<PlugZapIcon className="size-3 shrink-0 text-muted-foreground" />
					<span className="text-xs font-medium">Progresso fora do ar</span>
				</div>
				<p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
					A sincronização continua no servidor, mas esta tela parou de receber o andamento dela.
				</p>
				<Button
					variant="ghost"
					size="xs"
					className="mt-1 -ml-2 h-6 text-2xs"
					onClick={() => reconnectSyncProgress(queryClient)}
				>
					<RefreshCwIcon />
					Recarregar o progresso
				</Button>
			</div>
		);
	}

	if (running) {
		return (
			<div className="border-t border-sidebar-border px-3 py-2.5">
				<div className="flex items-center gap-2">
					<RefreshCwIcon className="size-3 shrink-0 animate-spin text-primary" />
					<span className="min-w-0 flex-1 truncate text-xs font-medium">{running.label}</span>
					<span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
						{running.step}/{SYNC_PHASE_COUNT}
					</span>
				</div>
				<p className="mt-1 truncate font-mono text-2xs tabular-nums text-muted-foreground">
					{running.detail}
				</p>
				<div className="mt-2 h-px w-full overflow-hidden bg-border">
					{running.ratio === null && <div className="h-full w-1/3 animate-sweep bg-primary" />}
					{running.ratio !== null && (
						<div
							className="h-full bg-primary transition-[width] duration-500 ease-out"
							style={{ width: `${running.ratio * 100}%` }}
						/>
					)}
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
