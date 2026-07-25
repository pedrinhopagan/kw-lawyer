import { type } from "arktype";
import { addDays, format } from "date-fns";
import type { RouterInputs } from "@/lib/orpc";
import { monthGridRange } from "./agenda-meta";
import { todayIso } from "@/lib/deadline-meta";

const PAGE_SIZE = 50;

const VIEW_PAGE_SIZE = 200;
const WEEK_WINDOW_DAYS = 7;
const ISO_DATE = "yyyy-MM-dd";
const ISO_MONTH = "yyyy-MM";

type DeadlineListInput = RouterInputs["deadlines"]["list"];

type DeadlineSummaryInput = RouterInputs["deadlines"]["summary"];

export type DeadlineFilterInput = Omit<DeadlineListInput, "limit" | "offset">;

export type DeadlineStatus = NonNullable<DeadlineFilterInput["status"]>[number];

export type DeadlineAudience = NonNullable<DeadlineFilterInput["audience"]>[number];

export type DeadlineConfidence = NonNullable<DeadlineFilterInput["confidence"]>[number];

export type DeadlineOrigin = NonNullable<DeadlineFilterInput["origin"]>[number];

export type AgendaTab = "prazos" | "revisar";

export type AgendaView = "lista" | "calendario" | "situacao";

export type AgendaPreset = "acao" | "todos" | "vencidos" | "hoje" | "semana" | "confirmar";

export type GoogleFeedback = "conectado" | "erro" | "nao_configurado";

export const ALL_STATUSES: DeadlineStatus[] = [
	"a_confirmar",
	"confirmado",
	"cumprido",
	"descartado",
];

export const ALL_AUDIENCES: DeadlineAudience[] = ["partes", "terceiro", "indefinido"];

export const ALL_CONFIDENCES: DeadlineConfidence[] = ["alta", "media", "baixa"];

export const ALL_ORIGINS: DeadlineOrigin[] = ["automatico", "manual"];

export interface AgendaSearch {
	aba?: "revisar";
	vista?: Exclude<AgendaView, "lista">;
	filtro?: Exclude<AgendaPreset, "acao">;
	status?: DeadlineStatus[];
	audiencia?: DeadlineAudience[];
	confianca?: DeadlineConfidence[];
	origem?: DeadlineOrigin[];
	ato?: string[];
	tribunais?: string[];
	q?: string;
	de?: string;
	ate?: string;
	mes?: string;
	google?: GoogleFeedback;
}

export type AgendaSearchPatch = Partial<AgendaSearch>;

interface Member<Value> {
	allows: (data: unknown) => data is Value;
}

const dateValue = type(/^\d{4}-\d{2}-\d{2}$/u);
const monthValue = type(/^\d{4}-(?:0[1-9]|1[0-2])$/u);
const textValue = type("string <= 200");
const tribunalValue = type(/^[A-Z0-9]{2,10}$/u);
const actValue = type(/^[a-z][a-z_]{1,59}$/u);
const viewValue = type("'calendario' | 'situacao'");
const presetValue = type("'todos' | 'vencidos' | 'hoje' | 'semana' | 'confirmar'");
const statusValue = type("'a_confirmar' | 'confirmado' | 'cumprido' | 'descartado'");
const audienceValue = type("'partes' | 'terceiro' | 'indefinido'");
const confidenceValue = type("'alta' | 'media' | 'baixa'");
const originValue = type("'automatico' | 'manual'");
const googleValue = type("'conectado' | 'erro' | 'nao_configurado'");

function manyOf<Value>(raw: unknown, member: Member<Value>) {
	const picked = Array.isArray(raw) ? [...new Set(raw.filter((item) => member.allows(item)))] : [];

	return picked.length > 0 ? picked : undefined;
}

function trimmedOf(raw: unknown) {
	const text = textValue.allows(raw) ? raw.trim() : "";

	return text || undefined;
}

export const agendaSearchSchema = type({
	"+": "delete",
	"aba?": "unknown",
	"vista?": "unknown",
	"filtro?": "unknown",
	"status?": "unknown",
	"audiencia?": "unknown",
	"confianca?": "unknown",
	"origem?": "unknown",
	"ato?": "unknown",
	"tribunais?": "unknown",
	"q?": "unknown",
	"de?": "unknown",
	"ate?": "unknown",
	"mes?": "unknown",
	"google?": "unknown",
}).pipe(
	(raw): AgendaSearch => ({
		aba: raw.aba === "revisar" ? "revisar" : undefined,
		vista: viewValue.allows(raw.vista) ? raw.vista : undefined,
		filtro: presetValue.allows(raw.filtro) ? raw.filtro : undefined,
		status: manyOf(raw.status, statusValue),
		audiencia: manyOf(raw.audiencia, audienceValue),
		confianca: manyOf(raw.confianca, confidenceValue),
		origem: manyOf(raw.origem, originValue),
		ato: manyOf(raw.ato, actValue),
		tribunais: manyOf(raw.tribunais, tribunalValue),
		q: trimmedOf(raw.q),
		de: dateValue.allows(raw.de) ? raw.de : undefined,
		ate: dateValue.allows(raw.ate) ? raw.ate : undefined,
		mes: monthValue.allows(raw.mes) ? raw.mes : undefined,
		google: googleValue.allows(raw.google) ? raw.google : undefined,
	}),
);

export function tabOf(search: AgendaSearch): AgendaTab {
	return search.aba === "revisar" ? "revisar" : "prazos";
}

export function viewOf(search: AgendaSearch): AgendaView {
	return search.vista ?? "lista";
}

export function presetOf(search: AgendaSearch): AgendaPreset {
	return search.filtro ?? "acao";
}

export function monthOf(search: AgendaSearch) {
	return search.mes ?? format(new Date(), ISO_MONTH);
}

export function withSearch(search: AgendaSearch, patch: AgendaSearchPatch): AgendaSearch {
	return { ...search, google: undefined, ...patch };
}

export function withoutFilters(search: AgendaSearch): AgendaSearch {
	return { aba: search.aba, vista: search.vista, filtro: search.filtro, mes: search.mes };
}

export function toggled<Value extends string>(list: Value[] | undefined, item: Value) {
	const current = list ?? [];
	const next = current.includes(item)
		? current.filter((value) => value !== item)
		: [...current, item];

	return next.length > 0 ? next : undefined;
}

export function activeFilterCount(search: AgendaSearch) {
	const axes = [
		search.status,
		search.audiencia,
		search.confianca,
		search.origem,
		search.ato,
		search.tribunais,
		search.q,
		search.de,
		search.ate,
	];

	return axes.filter((axis) => (Array.isArray(axis) ? axis.length > 0 : !!axis)).length;
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
	};
}

function presetFilters(preset: AgendaPreset, audienceLocked: boolean): DeadlineFilterInput {
	const today = todayIso();
	const mine = audienceLocked ? {} : { actionable: true };

	if (preset === "todos") {
		return { status: ALL_STATUSES };
	}

	if (preset === "confirmar") {
		return { ...mine, status: ["a_confirmar"] };
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
