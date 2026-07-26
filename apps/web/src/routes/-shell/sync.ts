import { type QueryClient, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isClientError, orpc, orpcClient, type RouterOutputs } from "@/lib/orpc";

const STATUS_STALE_MS = 30_000;

// O stream reconectava para sempre, e uma reconexão que nunca desiste é indistinguível de progresso
// parado: depois deste teto a tela assume que perdeu o progresso e diz isso.
const STREAM_RETRIES = 4;
const STREAM_RETRY_CAP_MS = 10_000;

export type SyncStatus = RouterOutputs["sync"]["status"];

export type SyncEvent =
	RouterOutputs["sync"]["progress"] extends AsyncIterable<infer TEvent> ? TEvent : never;

export const syncStatusQueryOptions = orpc.sync.status.queryOptions({
	staleTime: STATUS_STALE_MS,
});

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

	// O sync termina rodando o scan de prazos, então ele cria deadlines. Sem invalidar aqui, a
	// agenda que a advogada já está olhando fica sem o prazo novo até o staleTime expirar.
	// O auth entra junto porque o fim do sync move o onboardingState, e é ele que tira a advogada
	// da tela de /comecar.
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: orpc.auth.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.sync.status.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.publications.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.cases.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.deadlines.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.hub.key() }),
	]);
}

export function syncProgressQueryOptions(queryClient: QueryClient) {
	const liveKey = orpc.sync.progress.experimental_liveKey();

	return queryOptions({
		queryKey: liveKey,
		retry: (failureCount, error: Error) => !isClientError(error) && failureCount < STREAM_RETRIES,
		retryDelay: (failureCount) => Math.min(2 ** failureCount * 1000, STREAM_RETRY_CAP_MS),
		queryFn: async ({ signal, client, queryKey }) => {
			const stream = await orpcClient.sync.progress(undefined, { signal });

			// O canal abre com o estado que está no banco, que costuma ser uma sincronização já
			// terminada: avisar por ele repetiria o toast de conclusão a cada F5. O aviso é da corrida
			// que esta conexão acompanhou terminar.
			let running = false;

			for await (const event of stream) {
				client.setQueryData(queryKey, event);

				if (event.phase !== "concluida" && event.phase !== "falhou") {
					running = true;
					continue;
				}

				if (!running) {
					continue;
				}

				running = false;

				await settleSync(queryClient, event);
			}

			throw new Error("A conexão com o progresso da sincronização caiu.");
		},
	});
}

// Depois do teto de tentativas a query fica em erro e não volta sozinha. Reabrir o stream traz o
// snapshot do banco junto, então uma reconexão recupera tudo o que a tela perdeu enquanto esteve fora.
// A promessa do reset só resolve quando o stream terminar, ou seja, nunca: quem chama não espera.
export function reconnectSyncProgress(queryClient: QueryClient) {
	const liveKey = orpc.sync.progress.experimental_liveKey();

	if (queryClient.getQueryState(liveKey)?.status !== "error") {
		return;
	}

	void queryClient.resetQueries({ queryKey: liveKey });
}

export function useStartSync() {
	const queryClient = useQueryClient();

	return useMutation(
		orpc.sync.start.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.auth.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.sync.status.key() }),
				]);

				reconnectSyncProgress(queryClient);
			},
			onError: () => {
				toast.error("Não foi possível iniciar a sincronização agora. Tente de novo.");
			},
		}),
	);
}
