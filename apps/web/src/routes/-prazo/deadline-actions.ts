import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";

export function useDeadlineActions() {
	const queryClient = useQueryClient();

	async function refreshDeadlines() {
		const namespaces = [orpc.deadlines.key(), orpc.hub.key()];

		await Promise.all(namespaces.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
	}

	const complete = useMutation(
		orpc.deadlines.complete.mutationOptions({
			onSuccess: async () => {
				await refreshDeadlines();
				toast.success("Prazo marcado como cumprido.");
			},
			onError: () => toast.error("Não foi possível marcar o prazo como cumprido. Tente de novo."),
		}),
	);

	const dismiss = useMutation(
		orpc.deadlines.dismiss.mutationOptions({
			onSuccess: async () => {
				await refreshDeadlines();
				toast.success("Prazo tirado da agenda: não é prazo seu.");
			},
			onError: () => toast.error("Não foi possível tirar o prazo da agenda. Tente de novo."),
		}),
	);

	const reschedule = useMutation(
		orpc.deadlines.reschedule.mutationOptions({
			onSuccess: async () => {
				await refreshDeadlines();
				toast.success("Data do prazo atualizada.");
			},
			onError: () => toast.error("Não foi possível alterar a data. Tente de novo."),
		}),
	);

	return { complete, dismiss, reschedule };
}
