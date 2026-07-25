import { type QueryClient, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { isBefore, subMinutes } from "date-fns";
import { toast } from "sonner";
import { isClientError, orpc, orpcClient, type RouterOutputs } from "@/lib/orpc";

const STATUS_STALE_MS = 30_000;
const SYNC_STALE_MINUTES = 30;
const RUNNING_GRACE_MINUTES = 15;

export type SyncStatus = RouterOutputs["sync"]["status"];

export type SyncEvent =
	RouterOutputs["sync"]["progress"] extends AsyncIterable<infer TEvent> ? TEvent : never;

export const syncStatusQueryOptions = orpc.sync.status.queryOptions({
	staleTime: STATUS_STALE_MS,
});

export function needsSync({ run, lastSyncedAt }: SyncStatus) {
	const now = new Date();

	if (
		run?.status === "em_execucao" &&
		!isBefore(run.startedAt, subMinutes(now, RUNNING_GRACE_MINUTES))
	) {
		return false;
	}

	if (!lastSyncedAt) {
		return true;
	}

	return isBefore(lastSyncedAt, subMinutes(now, SYNC_STALE_MINUTES));
}

function describeResult(event: SyncEvent) {
	const parts = [
		event.created > 0 && `${event.created} publicações`,
		event.movementsCreated > 0 && `${event.movementsCreated} andamentos`,
	].filter((part) => typeof part === "string");

	if (!parts.length) {
		return "Sincronização concluída. Nada novo desde a última vez.";
	}

	return `Sincronização concluída: ${parts.join(" e ")}.`;
}

async function settleSync(queryClient: QueryClient, event: SyncEvent) {
	if (event.phase === "falhou") {
		toast.error(event.errorMessage ?? "A sincronização falhou. Tente de novo.");
	}

	if (event.phase === "concluida") {
		toast.success(describeResult(event));
	}

	await Promise.all([
		queryClient.invalidateQueries({ queryKey: orpc.sync.status.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.publications.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.cases.key() }),
	]);
}

export function syncProgressQueryOptions(queryClient: QueryClient) {
	const liveKey = orpc.sync.progress.experimental_liveKey();

	return queryOptions({
		queryKey: liveKey,
		retry: (_failureCount, error: Error) => !isClientError(error),
		queryFn: async ({ signal, client, queryKey }) => {
			const stream = await orpcClient.sync.progress(undefined, { signal });

			for await (const event of stream) {
				client.setQueryData(queryKey, event);

				if (event.phase === "concluida" || event.phase === "falhou") {
					await settleSync(queryClient, event);
				}
			}

			throw new Error("A conexão com o progresso da sincronização caiu.");
		},
	});
}

export function useStartSync() {
	const queryClient = useQueryClient();

	return useMutation(
		orpc.sync.start.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.sync.status.key() });
			},
			onError: () => {
				toast.error("Não foi possível iniciar a sincronização agora. Tente de novo.");
			},
		}),
	);
}
