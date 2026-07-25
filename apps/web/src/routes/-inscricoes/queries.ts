import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc, type RouterOutputs } from "@/lib/orpc";

export type WatchedOab = RouterOutputs["oabs"]["watched"]["extra"][number];

export const watchedOabsQueryOptions = orpc.oabs.watched.queryOptions();

function useOabInvalidation() {
	const queryClient = useQueryClient();

	return async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.oabs.key() });
		await queryClient.invalidateQueries({ queryKey: orpc.sync.key() });
	};
}

export function useAddOab() {
	const invalidate = useOabInvalidation();

	return useMutation(
		orpc.oabs.add.mutationOptions({
			onSuccess: async ({ oab, publishing }) => {
				await invalidate();

				if (publishing) {
					toast.success(
						`OAB/${oab.oabUf} ${oab.oabNumber} incluída. A próxima sincronização traz as publicações.`,
					);

					return;
				}

				toast.warning(
					`OAB/${oab.oabUf} ${oab.oabNumber} incluída, mas o DJEN não tem nenhuma comunicação nela hoje.`,
				);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
}

export function useRemoveOab() {
	const invalidate = useOabInvalidation();

	return useMutation(
		orpc.oabs.remove.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
}
