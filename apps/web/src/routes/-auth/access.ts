import { orpc } from "@/lib/orpc";

const ACCESS_STALE_MS = 5 * 60 * 1000;

export const accessQueryOptions = orpc.access.status.queryOptions({ staleTime: ACCESS_STALE_MS });
