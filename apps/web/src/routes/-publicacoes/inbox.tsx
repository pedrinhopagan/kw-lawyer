import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { orpc } from "@/lib/orpc";
import { InboxFilters } from "./inbox-filters";
import { InboxPagination } from "./inbox-pagination";
import { InboxEmpty, InboxError, InboxSkeleton, InboxStaleWarning } from "./inbox-states";
import { PublicationRow } from "./publication-row";
import { PublicationSheet } from "./publication-sheet";
import { type PublicationItem, useMarkPublicationRead } from "./queries";
import { hasFilters, listInputOf, pageOf, withFilters } from "./search";

const route = getRouteApi("/_app/publicacoes");

function countLabel(total: number, filtered: boolean) {
	if (filtered) {
		return `${total} com estes filtros`;
	}

	return `${total} publicações`;
}

export function Inbox() {
	const search = route.useSearch();
	const navigate = route.useNavigate();
	const [reading, setReading] = useState<PublicationItem | null>(null);
	const [readerOpen, setReaderOpen] = useState(false);
	const { mutate: markRead } = useMarkPublicationRead();

	const { data, isPending, isError, isFetching, refetch } = useQuery(
		orpc.publications.list.queryOptions({
			input: listInputOf(search),
			placeholderData: keepPreviousData,
		}),
	);

	function openPublication(item: PublicationItem) {
		setReading(item);
		setReaderOpen(true);

		if (item.readAt) {
			return;
		}

		markRead({ id: item.id });
	}

	return (
		<div className="mx-auto w-full max-w-5xl pb-16">
			<header className="sticky top-12 z-20 border-b border-border bg-background/95 backdrop-blur md:top-0">
				<div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
					<h1 className="text-[1.375rem] leading-none font-semibold tracking-[-0.02em]">
						Publicações
					</h1>

					{!!data?.unread && (
						<span className="rounded-full bg-primary px-1.5 font-mono text-2xs font-semibold text-primary-foreground tabular-nums">
							{data.unread}
						</span>
					)}

					{!!data && (
						<span className="ml-auto text-2xs text-muted-foreground tabular-nums">
							{countLabel(data.total, hasFilters(search))}
						</span>
					)}
				</div>

				<div className="px-4 pb-3">
					<InboxFilters
						search={search}
						onChange={(patch) => navigate({ search: (prev) => withFilters(prev, patch) })}
						onClear={() => navigate({ search: {} })}
					/>
				</div>
			</header>

			{isPending && <InboxSkeleton />}

			{isError && !data && <InboxError onRetry={() => refetch()} />}

			{isError && !!data && <InboxStaleWarning onRetry={() => refetch()} />}

			{!!data && data.items.length === 0 && (
				<InboxEmpty filtered={hasFilters(search)} onClear={() => navigate({ search: {} })} />
			)}

			{!!data && data.items.length > 0 && (
				<>
					<ul
						className={cn(
							"divide-y divide-border border-b border-border transition-opacity",
							isFetching && "opacity-55",
						)}
					>
						{data.items.map((item) => (
							<PublicationRow key={item.id} item={item} onOpen={openPublication} />
						))}
					</ul>

					<InboxPagination page={pageOf(search)} total={data.total} />
				</>
			)}

			<PublicationSheet publication={reading} open={readerOpen} onOpenChange={setReaderOpen} />
		</div>
	);
}
