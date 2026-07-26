import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc, type RouterOutputs } from "@/lib/orpc";

type PublicationsPage = RouterOutputs["publications"]["list"];

export type PublicationItem = PublicationsPage["items"][number];

function withReadItem(page: PublicationsPage | undefined, id: string) {
	if (!page) {
		return page;
	}

	return {
		...page,
		unread: Math.max(page.unread - 1, 0),
		items: page.items.map((item) => {
			if (item.id !== id) {
				return item;
			}

			return { ...item, readAt: new Date() };
		}),
	};
}

export function useMarkPublicationRead() {
	const queryClient = useQueryClient();

	return useMutation(
		orpc.publications.read.mutationOptions({
			onSuccess: async (_result, input) => {
				queryClient.setQueriesData<PublicationsPage>(
					{ queryKey: orpc.publications.list.key() },
					(page) => withReadItem(page, input.id),
				);

				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.publications.key(),
						refetchType: "none",
					}),
					// A lista já foi corrigida na mão acima, mas o contador da barra lateral é consulta
					// própria: sem buscar de novo, ele continuaria mostrando a publicação que acabou de ser
					// aberta como não lida.
					queryClient.invalidateQueries({ queryKey: orpc.publications.unread.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.cases.key(), refetchType: "none" }),
				]);
			},
			onError: () => {
				toast.error("Não foi possível marcar a publicação como lida. Tente de novo.");
			},
		}),
	);
}

export function useMarkAllPublicationsRead() {
	const queryClient = useQueryClient();

	return useMutation(
		orpc.publications.readAll.mutationOptions({
			onSuccess: async (result) => {
				if (result.read === 0) {
					toast.info("Nenhuma publicação não lida por aqui.");
				}

				if (result.read > 0) {
					toast.success(
						result.read === 1
							? "1 publicação marcada como lida."
							: `${result.read} publicações marcadas como lidas.`,
					);
				}

				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.publications.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.cases.key(), refetchType: "none" }),
				]);
			},
			onError: () => {
				toast.error("Não foi possível marcar as publicações como lidas. Tente de novo.");
			},
		}),
	);
}
