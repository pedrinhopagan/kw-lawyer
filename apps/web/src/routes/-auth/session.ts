import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpc, type RouterOutputs } from "@/lib/orpc";

const SESSION_STALE_MS = 5 * 60 * 1000;

export type SessionLawyer = NonNullable<RouterOutputs["auth"]["me"]["lawyer"]>;

export const sessionQueryOptions = orpc.auth.me.queryOptions({ staleTime: SESSION_STALE_MS });

export function useLogout() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	return useMutation(
		orpc.auth.logout.mutationOptions({
			onSuccess: async () => {
				await navigate({ to: "/login" });
				queryClient.clear();
			},
			onError: () => {
				toast.error("Não foi possível encerrar a sessão agora. Tente de novo.");
			},
		}),
	);
}
