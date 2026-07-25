import { queryOptions } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { toast } from "sonner";
import { isClientError, orpc, orpcClient, type RouterOutputs } from "@/lib/orpc";

const HUB_TOAST_ID = "prazo-hub";

export type HubData = RouterOutputs["hub"]["forDeadline"];
export type HubCalculation = NonNullable<HubData["deadline"]["calculation"]>;

export function isNotFound(error: unknown) {
	if (!(error instanceof ORPCError)) {
		return false;
	}

	return error.code === "NOT_FOUND";
}

export function hubQueryOptions(deadlineId: string) {
	const input = { deadlineId };

	return queryOptions({
		queryKey: orpc.hub.forDeadline.queryKey({ input }),
		queryFn: () =>
			orpcClient.hub.forDeadline(input).catch((error: unknown) => {
				if (isNotFound(error)) {
					throw error;
				}

				toast.error(
					error instanceof ORPCError && isClientError(error)
						? error.message
						: "Não foi possível abrir o prazo agora.",
					{ id: HUB_TOAST_ID },
				);

				throw error;
			}),
	});
}
