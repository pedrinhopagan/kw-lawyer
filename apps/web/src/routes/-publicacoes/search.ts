import { type } from "arktype";

export const PAGE_SIZE = 25;

const tribunalValue = type(/^[A-Z0-9]{2,10}$/u);
const dateValue = type(/^\d{4}-\d{2}-\d{2}$/u);
const pageValue = type("number.integer >= 2");

export interface InboxSearch {
	unread?: true;
	tribunal?: string;
	from?: string;
	to?: string;
	page?: number;
}

export type InboxFilterPatch = Partial<Omit<InboxSearch, "page">>;

export const inboxSearchSchema = type({
	"+": "delete",
	"unread?": "unknown",
	"tribunal?": "unknown",
	"from?": "unknown",
	"to?": "unknown",
	"page?": "unknown",
}).pipe(
	(raw): InboxSearch => ({
		unread: raw.unread === true ? true : undefined,
		tribunal: tribunalValue.allows(raw.tribunal) ? raw.tribunal : undefined,
		from: dateValue.allows(raw.from) ? raw.from : undefined,
		to: dateValue.allows(raw.to) ? raw.to : undefined,
		page: pageValue.allows(raw.page) ? raw.page : undefined,
	}),
);

export function hasFilters(search: InboxSearch) {
	const values = [search.unread, search.tribunal, search.from, search.to];

	return values.some((value) => !!value);
}

function filtersOf(search: InboxSearch): InboxSearch {
	return {
		unread: search.unread,
		tribunal: search.tribunal,
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

export function listInputOf(search: InboxSearch) {
	return {
		onlyUnread: !!search.unread,
		...(!!search.tribunal && { tribunal: search.tribunal }),
		...(!!search.from && { from: search.from }),
		...(!!search.to && { to: search.to }),
		limit: PAGE_SIZE,
		offset: (pageOf(search) - 1) * PAGE_SIZE,
	};
}
