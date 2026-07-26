import { addDays, format } from "date-fns";
import { todayIso } from "@/lib/deadline-meta";
import type { RouterInputs } from "@/lib/orpc";
import { monthGridRange } from "./agenda-meta";
import {
	ALL_STATUSES,
	type AgendaPreset,
	type AgendaSearch,
	type DeadlineFilterInput,
	presetOf,
	viewOf,
} from "./search";

// Separado de `search.ts` porque este módulo importa date-fns e o locale pt-BR. Em `search.ts`
// eles entrariam no grafo eager do entry junto com o `validateSearch` da rota.

const PAGE_SIZE = 50;

const VIEW_PAGE_SIZE = 200;
const WEEK_WINDOW_DAYS = 7;
const ISO_DATE = "yyyy-MM-dd";
const ISO_MONTH = "yyyy-MM";

type DeadlineListInput = RouterInputs["deadlines"]["list"];

type DeadlineSummaryInput = RouterInputs["deadlines"]["summary"];

export function monthOf(search: AgendaSearch) {
	return search.mes ?? format(new Date(), ISO_MONTH);
}

function manualFilters(search: AgendaSearch): DeadlineFilterInput {
	return {
		...(!!search.status?.length && { status: search.status }),
		...(!!search.audiencia?.length && { audience: search.audiencia }),
		...(!!search.confianca?.length && { confidence: search.confianca }),
		...(!!search.origem?.length && { origin: search.origem }),
		...(!!search.ato?.length && { actKeys: search.ato }),
		...(!!search.tribunais?.length && { tribunals: search.tribunais }),
		...(!!search.q && { query: search.q }),
		...(!!search.de && { from: search.de }),
		...(!!search.ate && { to: search.ate }),
		...(!!search.historico && { includeHistory: true }),
	};
}

function presetFilters(preset: AgendaPreset, audienceLocked: boolean): DeadlineFilterInput {
	const today = todayIso();
	const mine = audienceLocked ? {} : { actionable: true };

	if (preset === "todos") {
		return { status: ALL_STATUSES };
	}

	if (preset === "vencidos") {
		return { ...mine, to: format(addDays(new Date(), -1), ISO_DATE) };
	}

	if (preset === "hoje") {
		return { ...mine, from: today, to: today };
	}

	if (preset === "semana") {
		return { ...mine, from: today, to: format(addDays(new Date(), WEEK_WINDOW_DAYS), ISO_DATE) };
	}

	return mine;
}

function narrowedRange(bounds: { from?: string; to?: string }[]) {
	const from = bounds
		.map((bound) => bound.from)
		.filter((value) => typeof value === "string")
		.sort()
		.at(-1);
	const to = bounds
		.map((bound) => bound.to)
		.filter((value) => typeof value === "string")
		.sort()
		.at(0);

	return { ...(!!from && { from }), ...(!!to && { to }) };
}

function mergedFilters(search: AgendaSearch): DeadlineFilterInput {
	const preset = presetFilters(presetOf(search), !!search.audiencia?.length);
	const manual = manualFilters(search);

	return { ...preset, ...manual, ...narrowedRange([preset, manual]) };
}

export function viewFiltersOf(search: AgendaSearch): DeadlineFilterInput {
	const filters = mergedFilters(search);
	const view = viewOf(search);

	if (view === "calendario") {
		return { ...filters, ...narrowedRange([filters, monthGridRange(monthOf(search))]) };
	}

	if (view === "situacao") {
		return { ...filters, status: filters.status ?? ALL_STATUSES };
	}

	return filters;
}

export function groupStatusesOf(search: AgendaSearch) {
	return viewFiltersOf(search).status ?? ALL_STATUSES;
}

function pageSizeOf(search: AgendaSearch) {
	return viewOf(search) === "lista" ? PAGE_SIZE : VIEW_PAGE_SIZE;
}

export function listInputOf(search: AgendaSearch, offset: number): DeadlineListInput {
	return { ...viewFiltersOf(search), limit: pageSizeOf(search), offset };
}

export function summaryInputOf(search: AgendaSearch): DeadlineSummaryInput {
	return {
		...manualFilters(search),
		...(!search.audiencia?.length && { actionable: true }),
		today: todayIso(),
	};
}

export function groupSummaryInputOf(search: AgendaSearch): DeadlineSummaryInput {
	return { ...viewFiltersOf(search), today: todayIso() };
}
