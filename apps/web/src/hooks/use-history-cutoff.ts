import { addDays } from "@api/features/deadlines/calendar";
import { PUBLICATION_BACKFILL_DAYS } from "@api/features/publications/window";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "@/routes/-auth/session";

export function useHistoryCutoff() {
	const { data } = useQuery(sessionQueryOptions);

	return data?.lawyer?.historyCutoffAt;
}

export function usePublicationFloor() {
	const cutoff = useHistoryCutoff();

	if (!cutoff) {
		return;
	}

	return addDays(cutoff, -PUBLICATION_BACKFILL_DAYS);
}
