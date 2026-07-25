import { ORPCError } from "@orpc/client";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { isClientError, orpc, orpcClient, type RouterInputs, type RouterOutputs } from "@/lib/orpc";
import { CASES_PAGE_SIZE } from "./search";

const FACET_PAGE_SIZE = 100;
const FACET_MAX_PAGES = 10;
const FACET_STALE_MS = 300_000;
const LIST_TOAST_ID = "processos-lista";
const CASE_TOAST_ID = "processo-detalhe";

export type CaseListItem = RouterOutputs["cases"]["list"]["items"][number];
export type CaseDetail = RouterOutputs["cases"]["get"];
export type CaseParty = CaseDetail["parties"][number];
export type TimelineItem = CaseDetail["timeline"][number];
export type TimelinePublication = Extract<TimelineItem, { source: "publication" }>;
export type TimelineMovement = Extract<TimelineItem, { source: "datajud" }>;

export interface TribunalOption {
	tribunal: string;
	total: number;
}

interface CaseListVariables {
	q?: string;
	tribunal?: string;
	page: number;
}

export function isNotFound(error: unknown) {
	if (!(error instanceof ORPCError)) {
		return false;
	}

	return error.code === "NOT_FOUND";
}

function reportFailure(error: unknown, options: { id: string; fallback: string }): never {
	if (isNotFound(error)) {
		throw error;
	}

	if (error instanceof ORPCError && isClientError(error)) {
		toast.error(error.message, { id: options.id });
		throw error;
	}

	toast.error(options.fallback, { id: options.id });
	throw error;
}

export function casesListQueryOptions(variables: CaseListVariables) {
	const input: RouterInputs["cases"]["list"] = {
		limit: CASES_PAGE_SIZE,
		offset: (variables.page - 1) * CASES_PAGE_SIZE,
	};

	if (variables.q) {
		input.search = variables.q;
	}

	if (variables.tribunal) {
		input.tribunal = variables.tribunal;
	}

	return queryOptions({
		queryKey: orpc.cases.list.queryKey({ input }),
		queryFn: () =>
			orpcClient.cases.list(input).catch((error: unknown) =>
				reportFailure(error, {
					id: LIST_TOAST_ID,
					fallback: "Não foi possível carregar seus processos agora.",
				}),
			),
		placeholderData: keepPreviousData,
	});
}

export type CaseDecision = RouterOutputs["decisions"]["byCase"]["items"][number];
export type CaseEvidenceItem = RouterOutputs["evidence"]["byCase"]["items"][number];
export type CaseAppealItem = RouterOutputs["appeals"]["byCase"]["items"][number];
export type CaseRelationItem = RouterOutputs["incidents"]["byCase"]["items"][number];

export function caseQueryOptions(cnj: string) {
	const digits = cnj.replaceAll(/\D/gu, "");
	const input = { cnjNumber: digits || cnj };

	return queryOptions({
		queryKey: orpc.cases.get.queryKey({ input }),
		queryFn: () =>
			orpcClient.cases.get(input).catch((error: unknown) =>
				reportFailure(error, {
					id: CASE_TOAST_ID,
					fallback: "Não foi possível carregar o processo agora.",
				}),
			),
	});
}

async function fetchTribunalOptions() {
	const first = await orpcClient.cases.list({ limit: FACET_PAGE_SIZE, offset: 0 });
	const pages = Math.min(Math.ceil(first.total / FACET_PAGE_SIZE), FACET_MAX_PAGES);
	const rest = await Promise.all(
		Array.from({ length: Math.max(pages - 1, 0) }, (_value, index) =>
			orpcClient.cases.list({
				limit: FACET_PAGE_SIZE,
				offset: (index + 1) * FACET_PAGE_SIZE,
			}),
		),
	);

	const totals = new Map<string, number>();

	for (const item of [first, ...rest].flatMap((page) => page.items)) {
		totals.set(item.tribunal, (totals.get(item.tribunal) ?? 0) + 1);
	}

	return [...totals]
		.map(([tribunal, total]): TribunalOption => ({ tribunal, total }))
		.sort((left, right) => right.total - left.total);
}

export const tribunalOptionsQueryOptions = queryOptions({
	queryKey: [...orpc.cases.list.key(), "tribunais"],
	queryFn: fetchTribunalOptions,
	staleTime: FACET_STALE_MS,
});
