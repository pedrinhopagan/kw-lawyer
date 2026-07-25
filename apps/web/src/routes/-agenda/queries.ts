import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isClientError, orpc, type RouterOutputs } from "@/lib/orpc";
import { pluralOf } from "./agenda-meta";

export type DeadlineItem = RouterOutputs["deadlines"]["list"]["items"][number];

export type DeadlineDetail = RouterOutputs["deadlines"]["get"];

export type TriageItem = RouterOutputs["deadlines"]["triage"]["items"][number];

export type DeadlineSummary = RouterOutputs["deadlines"]["summary"];

export type CalendarStatus = RouterOutputs["calendar"]["status"];

type SyncResult = RouterOutputs["calendar"]["sync"];

function syncMessage(result: SyncResult) {
	const parts = [
		result.created > 0 && `${result.created} criado${pluralOf(result.created)}`,
		result.updated > 0 && `${result.updated} atualizado${pluralOf(result.updated)}`,
		result.removed > 0 && `${result.removed} removido${pluralOf(result.removed)}`,
		result.unchanged > 0 && `${result.unchanged} sem mudança`,
	].filter((part) => typeof part === "string");

	const rest =
		result.pending > 0
			? ` Faltam ${result.pending} prazo${pluralOf(result.pending)} deste recorte: clique em Sincronizar de novo.`
			: "";

	if (parts.length === 0) {
		return `Nenhum prazo deste recorte para enviar ao Google Agenda.${rest}`;
	}

	return `Google Agenda atualizado: ${parts.join(", ")}.${rest}`;
}

export function useCalendarActions() {
	const queryClient = useQueryClient();

	const sync = useMutation(
		orpc.calendar.sync.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({ queryKey: orpc.calendar.key() });

				if (result.pending > 0) {
					toast.warning(syncMessage(result));

					return;
				}

				toast.success(syncMessage(result));
			},
			onError: (error) => {
				toast.error(
					isClientError(error)
						? error.message
						: "Não foi possível enviar os prazos para o Google Agenda. Tente de novo.",
				);
			},
		}),
	);

	const disconnect = useMutation(
		orpc.calendar.disconnect.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.calendar.key() });
				toast.success("Google Agenda desconectado. Os eventos já criados continuam lá.");
			},
			onError: () => toast.error("Não foi possível desconectar o Google Agenda. Tente de novo."),
		}),
	);

	return { sync, disconnect };
}
