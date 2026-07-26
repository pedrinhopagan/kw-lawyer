import { orpc } from "@/lib/orpc";

const TRIBUNAL_STALE_MS = 5 * 60 * 1000;

export const tribunaisQueryOptions = orpc.cases.tribunals.queryOptions({
	staleTime: TRIBUNAL_STALE_MS,
});
