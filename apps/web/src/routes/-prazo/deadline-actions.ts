import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";

export function useDeadlineActions() {
	const queryClient = useQueryClient();

	async function refreshDeadlines() {
		const namespaces = [orpc.deadlines.key(), orpc.hub.key()];

		await Promise.all(namespaces.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
	}

	const confirm = useMutation(
		orpc.deadlines.confirm.mutationOptions({
			onSuccess: refreshDeadlines,
			onError: () => toast.error("Não foi possível confirmar o prazo. Tente de novo."),
		}),
	);

	const complete = useMutation(
		orpc.deadlines.complete.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.deadlines.key() });
				toast.success("Prazo marcado como cumprido.");
			},
			onError: () => toast.error("Não foi possível marcar o prazo como cumprido. Tente de novo."),
		}),
	);

	const dismiss = useMutation(
		orpc.deadlines.dismiss.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.deadlines.key() });
				toast.success("Prazo descartado da agenda.");
			},
			onError: () => toast.error("Não foi possível descartar o prazo. Tente de novo."),
		}),
	);

	const reschedule = useMutation(
		orpc.deadlines.reschedule.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.deadlines.key() });
				toast.success("Data do prazo atualizada.");
			},
			onError: () => toast.error("Não foi possível alterar a data. Tente de novo."),
		}),
	);

	return { confirm, complete, dismiss, reschedule };
}
