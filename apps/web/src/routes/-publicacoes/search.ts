// Alimenta o `validateSearch` da rota, que fica fora do code splitting do TanStack Router: import
// de runtime aqui entra no grafo eager do entry e é avaliado antes do primeiro pixel de qualquer
// rota. Por isso a validação é TypeScript puro, sem arktype.

export const PAGE_SIZE = 25;

const TEXT_MIN = 1;
const TEXT_MAX = 200;
const MIN_PAGE = 2;

const TRIBUNAL_PATTERN = /^[A-Z0-9]{2,10}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

// `typeof` antes do regex: `RegExp.test` coage o argumento, então `?from=a&from=b` (array) passaria.
function matching(raw: unknown, pattern: RegExp): raw is string {
	return typeof raw === "string" && pattern.test(raw);
}

export interface InboxSearch {
	unread?: true;
	historico?: true;
	tribunal?: string;
	q?: string;
	from?: string;
	to?: string;
	page?: number;
}

function trimmedOf(raw: unknown) {
	const inRange = typeof raw === "string" && raw.length >= TEXT_MIN && raw.length <= TEXT_MAX;
	const text = inRange ? raw.trim() : "";

	return text || undefined;
}

function pageOfRaw(raw: unknown) {
	if (typeof raw !== "number" || !Number.isInteger(raw) || raw < MIN_PAGE) {
		return;
	}

	return raw;
}

export type InboxFilterPatch = Partial<Omit<InboxSearch, "page">>;

// Devolve as 7 chaves explicitamente, inclusive as `undefined`: é isso que descarta chave
// desconhecida da URL antes que ela vaze para os links gerados por `withFilters`.
export function inboxSearchSchema(raw: Record<string, unknown>): InboxSearch {
	return {
		unread: raw.unread === true ? true : undefined,
		historico: raw.historico === true ? true : undefined,
		tribunal: matching(raw.tribunal, TRIBUNAL_PATTERN) ? raw.tribunal : undefined,
		q: trimmedOf(raw.q),
		from: matching(raw.from, DATE_PATTERN) ? raw.from : undefined,
		to: matching(raw.to, DATE_PATTERN) ? raw.to : undefined,
		page: pageOfRaw(raw.page),
	};
}

export function hasFilters(search: InboxSearch) {
	const values = [
		search.unread,
		search.historico,
		search.tribunal,
		search.q,
		search.from,
		search.to,
	];

	return values.some((value) => !!value);
}

function filtersOf(search: InboxSearch): InboxSearch {
	return {
		unread: search.unread,
		historico: search.historico,
		tribunal: search.tribunal,
		q: search.q,
		from: search.from,
		to: search.to,
	};
}

export function withFilters(search: InboxSearch, patch: InboxFilterPatch): InboxSearch {
	return { ...filtersOf(search), ...patch };
}

export function withPage(search: InboxSearch, page: number): InboxSearch {
	return { ...filtersOf(search), page: page > 1 ? page : undefined };
}

export function pageOf(search: InboxSearch) {
	return search.page ?? 1;
}

export function filterInputOf(search: InboxSearch) {
	return {
		includeHistory: !!search.historico,
		...(!!search.tribunal && { tribunal: search.tribunal }),
		...(!!search.q && { query: search.q }),
		...(!!search.from && { from: search.from }),
		...(!!search.to && { to: search.to }),
	};
}

export function listInputOf(search: InboxSearch) {
	return {
		...filterInputOf(search),
		onlyUnread: !!search.unread,
		limit: PAGE_SIZE,
		offset: (pageOf(search) - 1) * PAGE_SIZE,
	};
}
