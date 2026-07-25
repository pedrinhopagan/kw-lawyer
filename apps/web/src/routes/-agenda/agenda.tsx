import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import { orpc } from "@/lib/orpc";
import { AgendaCalendar } from "./agenda-calendar";
import { AgendaList } from "./agenda-list";
import { AgendaSituacao } from "./agenda-situacao";
import { AgendaEmpty, AgendaError, AgendaMore, AgendaSkeleton, TriageEmpty } from "./agenda-states";
import { AgendaToolbar } from "./agenda-toolbar";
import { AgendaTriage } from "./agenda-triage";
import { GoogleCalendarBlock, GoogleFeedbackBanner } from "./google-calendar";
import {
	activeFilterCount,
	type AgendaSearch,
	type AgendaSearchPatch,
	listInputOf,
	monthOf,
	presetOf,
	summaryInputOf,
	tabOf,
	viewFiltersOf,
	viewOf,
	withoutFilters,
	withSearch,
} from "./search";

const route = getRouteApi("/_app/agenda");

const TRIAGE_LIMIT = 25;

export function Agenda() {
	const search = route.useSearch();
	const navigate = route.useNavigate();
	const tab = tabOf(search);
	const view = viewOf(search);

	const { data: summary } = useQuery(
		orpc.deadlines.summary.queryOptions({ input: summaryInputOf(search) }),
	);

	const {
		data: list,
		isPending: listPending,
		isError: listError,
		isFetching: listFetching,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
		refetch: refetchList,
	} = useInfiniteQuery(
		orpc.deadlines.list.infiniteOptions({
			input: (offset: number) => listInputOf(search, offset),
			initialPageParam: 0,
			getNextPageParam: (lastPage, pages) => {
				const loaded = pages.reduce((total, page) => total + page.items.length, 0);

				return loaded < lastPage.total ? loaded : undefined;
			},
			placeholderData: keepPreviousData,
			enabled: tab === "prazos",
		}),
	);

	const {
		data: triage,
		isPending: triagePending,
		isError: triageError,
		refetch: refetchTriage,
	} = useQuery(
		orpc.deadlines.triage.queryOptions({
			input: { limit: TRIAGE_LIMIT },
			enabled: tab === "revisar",
		}),
	);

	function patchSearch(patch: AgendaSearchPatch) {
		const nextSearch = (prev: AgendaSearch) => withSearch(prev, patch);

		return navigate({ search: nextSearch });
	}

	const items = list?.pages.flatMap((page) => page.items) ?? [];
	const total = list?.pages[0]?.total ?? 0;

	return (
		<div className="mx-auto w-full max-w-5xl pb-16">
			<header className="sticky top-12 z-20 border-b border-border bg-background/95 backdrop-blur md:top-0">
				<div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
					<h1 className="text-[1.375rem] leading-none font-semibold tracking-[-0.02em]">Agenda</h1>

					{!!summary?.overdue && (
						<span
							aria-label={`${summary.overdue} prazos vencidos sem baixa`}
							className="rounded-full bg-destructive px-1.5 font-mono text-2xs font-semibold text-white tabular-nums"
						>
							{summary.overdue}
						</span>
					)}

					{tab === "prazos" && !!list && (
						<span className="text-2xs text-muted-foreground tabular-nums">{total} no recorte</span>
					)}

					{tab === "prazos" && (
						<div className="ml-auto">
							<GoogleCalendarBlock syncInput={viewFiltersOf(search)} total={total} />
						</div>
					)}
				</div>

				<AgendaToolbar
					search={search}
					summary={summary}
					onChange={patchSearch}
					onClear={() => navigate({ search: (prev) => withoutFilters(prev) })}
				/>
			</header>

			{!!search.google && (
				<GoogleFeedbackBanner
					feedback={search.google}
					onDismiss={() => patchSearch({ google: undefined })}
				/>
			)}

			{tab === "prazos" && (
				<>
					{listPending && <AgendaSkeleton />}

					{listError && <AgendaError onRetry={() => refetchList()} />}

					{!!list && items.length === 0 && view !== "calendario" && (
						<AgendaEmpty
							filtered={presetOf(search) !== "acao" || activeFilterCount(search) > 0}
							onClear={() => navigate({ search: {} })}
						/>
					)}

					<div
						className={cn(
							"transition-opacity",
							listFetching && !isFetchingNextPage && "opacity-55",
						)}
					>
						{view === "lista" && (
							<AgendaList
								items={items}
								onOpen={(item) =>
									navigate({ to: "/prazos/$deadlineId", params: { deadlineId: item.id } })
								}
							/>
						)}

						{view === "calendario" && (
							<AgendaCalendar
								items={items}
								month={monthOf(search)}
								onMonth={(mes) => patchSearch({ mes })}
								onDay={(day) => patchSearch({ vista: undefined, de: day, ate: day })}
								onOpen={(item) =>
									navigate({ to: "/prazos/$deadlineId", params: { deadlineId: item.id } })
								}
							/>
						)}

						{view === "situacao" && (
							<AgendaSituacao
								search={search}
								items={items}
								onOpen={(item) =>
									navigate({ to: "/prazos/$deadlineId", params: { deadlineId: item.id } })
								}
							/>
						)}
					</div>

					{hasNextPage && (
						<AgendaMore
							loaded={items.length}
							total={total}
							loading={isFetchingNextPage}
							onMore={() => fetchNextPage()}
						/>
					)}
				</>
			)}

			{tab === "revisar" && (
				<>
					{triagePending && <AgendaSkeleton />}

					{triageError && <AgendaError onRetry={() => refetchTriage()} />}

					{!!triage && triage.items.length === 0 && <TriageEmpty />}

					{!!triage && triage.items.length > 0 && <AgendaTriage items={triage.items} />}
				</>
			)}
		</div>
	);
}
