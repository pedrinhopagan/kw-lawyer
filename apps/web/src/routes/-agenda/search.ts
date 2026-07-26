import type { RouterInputs } from "@/lib/orpc";

// Este módulo alimenta o `validateSearch` da rota, que o TanStack Router mantém fora do code
// splitting: tudo que for importado aqui entra no grafo eager do entry e é avaliado antes do
// primeiro pixel de qualquer rota, inclusive da landing e do login. Manter sem import de runtime.

const TEXT_MAX = 200;

export type DeadlineFilterInput = Omit<RouterInputs["deadlines"]["list"], "limit" | "offset">;

export type DeadlineStatus = NonNullable<DeadlineFilterInput["status"]>[number];

export type DeadlineAudience = NonNullable<DeadlineFilterInput["audience"]>[number];

export type DeadlineConfidence = NonNullable<DeadlineFilterInput["confidence"]>[number];

export type DeadlineOrigin = NonNullable<DeadlineFilterInput["origin"]>[number];

export type AgendaTab = "prazos" | "revisar";

export type AgendaView = "lista" | "calendario" | "situacao";

export type AgendaPreset = "acao" | "todos" | "vencidos" | "hoje" | "semana";

export type GoogleFeedback = "conectado" | "erro" | "nao_configurado";

export const ALL_STATUSES: DeadlineStatus[] = ["pendente", "cumprido", "descartado"];

export const ALL_AUDIENCES: DeadlineAudience[] = ["partes", "terceiro", "indefinido"];

export const ALL_CONFIDENCES: DeadlineConfidence[] = ["alta", "media", "baixa"];

export const ALL_ORIGINS: DeadlineOrigin[] = ["automatico", "manual"];

export interface AgendaSearch {
	aba?: "revisar";
	vista?: Exclude<AgendaView, "calendario">;
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
	historico?: true;
	mes?: string;
	dia?: string;
	google?: GoogleFeedback;
}

export type AgendaSearchPatch = Partial<AgendaSearch>;

type Guard<Value> = (raw: unknown) => raw is Value;

// A guarda de `typeof` vem antes do regex de propósito: `RegExp.test` coage o argumento com
// `String()`, então `?de=x&de=y` (que chega como array) passaria e iria parar no input do oRPC.
function matching<Value extends string>(pattern: RegExp): Guard<Value> {
	return (raw): raw is Value => typeof raw === "string" && pattern.test(raw);
}

function oneOf<Value extends string>(values: readonly Value[]): Guard<Value> {
	return (raw): raw is Value =>
		typeof raw === "string" && (values as readonly string[]).includes(raw);
}

const isDate = matching(/^\d{4}-\d{2}-\d{2}$/u);
const isMonth = matching(/^\d{4}-(?:0[1-9]|1[0-2])$/u);
const isTribunal = matching(/^[A-Z0-9]{2,10}$/u);
const isAct = matching(/^[a-z][a-z_]{1,59}$/u);
const isView = oneOf(["lista", "situacao"] as const);
const isPreset = oneOf(["todos", "vencidos", "hoje", "semana"] as const);
const isStatus = oneOf(ALL_STATUSES);
const isAudience = oneOf(ALL_AUDIENCES);
const isConfidence = oneOf(ALL_CONFIDENCES);
const isOrigin = oneOf(ALL_ORIGINS);
const isGoogle = oneOf(["conectado", "erro", "nao_configurado"] as const);

function manyOf<Value>(raw: unknown, member: Guard<Value>) {
	const picked = Array.isArray(raw) ? [...new Set(raw.filter((item) => member(item)))] : [];

	return picked.length > 0 ? picked : undefined;
}

function trimmedOf(raw: unknown) {
	const text = typeof raw === "string" && raw.length <= TEXT_MAX ? raw.trim() : "";

	return text || undefined;
}

// Devolve as 16 chaves explicitamente, inclusive as `undefined`: é isso que descarta chave
// desconhecida da URL antes que ela vaze para os links gerados por `withSearch`.
export function agendaSearchSchema(raw: Record<string, unknown>): AgendaSearch {
	return {
		aba: raw.aba === "revisar" ? "revisar" : undefined,
		vista: isView(raw.vista) ? raw.vista : undefined,
		filtro: isPreset(raw.filtro) ? raw.filtro : undefined,
		status: manyOf(raw.status, isStatus),
		audiencia: manyOf(raw.audiencia, isAudience),
		confianca: manyOf(raw.confianca, isConfidence),
		origem: manyOf(raw.origem, isOrigin),
		ato: manyOf(raw.ato, isAct),
		tribunais: manyOf(raw.tribunais, isTribunal),
		q: trimmedOf(raw.q),
		de: isDate(raw.de) ? raw.de : undefined,
		ate: isDate(raw.ate) ? raw.ate : undefined,
		historico: raw.historico === true ? true : undefined,
		mes: isMonth(raw.mes) ? raw.mes : undefined,
		dia: isDate(raw.dia) ? raw.dia : undefined,
		google: isGoogle(raw.google) ? raw.google : undefined,
	};
}

export function tabOf(search: AgendaSearch): AgendaTab {
	return search.aba === "revisar" ? "revisar" : "prazos";
}

export function viewOf(search: AgendaSearch): AgendaView {
	return search.vista ?? "calendario";
}

export function presetOf(search: AgendaSearch): AgendaPreset {
	return search.filtro ?? "acao";
}

export function withSearch(search: AgendaSearch, patch: AgendaSearchPatch): AgendaSearch {
	return { ...search, google: undefined, ...patch };
}

export function withoutFilters(search: AgendaSearch): AgendaSearch {
	return {
		aba: search.aba,
		vista: search.vista,
		filtro: search.filtro,
		mes: search.mes,
		dia: search.dia,
	};
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
		search.historico,
	];

	return axes.filter((axis) => (Array.isArray(axis) ? axis.length > 0 : !!axis)).length;
}
