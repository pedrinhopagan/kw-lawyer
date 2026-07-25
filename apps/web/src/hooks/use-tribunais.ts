import { queryOptions } from "@tanstack/react-query";
import { orpc, orpcClient } from "@/lib/orpc";

const TRIBUNAL_PAGE_SIZE = 100;
const TRIBUNAL_MAX_PAGES = 10;
const TRIBUNAL_STALE_MS = 5 * 60 * 1000;

const [casesListPath] = orpc.cases.list.key();

export const tribunaisQueryOptions = queryOptions({
	queryKey: [[...casesListPath, "tribunais"], {}],
	staleTime: TRIBUNAL_STALE_MS,
	queryFn: async ({ signal }) => {
		const head = await orpcClient.cases.list({ limit: TRIBUNAL_PAGE_SIZE }, { signal });
		const pages = Math.min(Math.ceil(head.total / TRIBUNAL_PAGE_SIZE), TRIBUNAL_MAX_PAGES);

		const tail = await Promise.all(
			Array.from({ length: Math.max(pages - 1, 0) }, (_page, index) =>
				orpcClient.cases.list(
					{ limit: TRIBUNAL_PAGE_SIZE, offset: (index + 1) * TRIBUNAL_PAGE_SIZE },
					{ signal },
				),
			),
		);

		const siglas = new Set(
			[head, ...tail].flatMap((page) => page.items.map((item) => item.tribunal)),
		);

		return [...siglas].sort();
	},
});
