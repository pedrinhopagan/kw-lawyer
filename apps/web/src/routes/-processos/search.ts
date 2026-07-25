import { type } from "arktype";

export const CASES_PAGE_SIZE = 25;
export const SEARCH_DEBOUNCE_MS = 320;

const TRIBUNAL_PATTERN = /^[A-Z]{2,6}\d{0,3}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface CasesSearch {
	q?: string;
	tribunal?: string;
	page?: number;
}

const CASE_TABS = [
	"visao-geral",
	"andamentos",
	"provas",
	"decisoes",
	"recorrer",
	"incidentes",
] as const;

export type CaseTab = (typeof CASE_TABS)[number];

export interface CaseSearch {
	pub?: string;
	aba?: CaseTab;
}

const casesSearchSchema = type({
	"+": "delete",
	"q?": "string",
	"tribunal?": "string",
	"page?": "number",
}).pipe((raw): CasesSearch => {
	const search: CasesSearch = {};
	const q = raw.q?.trim();
	const tribunal = raw.tribunal?.trim().toUpperCase();

	if (q) {
		search.q = q;
	}

	if (tribunal && TRIBUNAL_PATTERN.test(tribunal)) {
		search.tribunal = tribunal;
	}

	if (raw.page && raw.page > 1) {
		search.page = Math.floor(raw.page);
	}

	return search;
});

const caseSearchSchema = type({ "+": "delete", "pub?": "string", "aba?": "string" }).pipe(
	(raw): CaseSearch => {
		const search: CaseSearch = {};

		if (raw.pub && UUID_PATTERN.test(raw.pub)) {
			search.pub = raw.pub;
		}

		const tab = CASE_TABS.find((entry) => entry === raw.aba);

		if (tab && tab !== "visao-geral") {
			search.aba = tab;
		}

		if (search.pub && !search.aba) {
			search.aba = "andamentos";
		}

		return search;
	},
);

export function parseCasesSearch(search: Record<string, unknown>): CasesSearch {
	const parsed = casesSearchSchema(search);

	if (parsed instanceof type.errors) {
		return {};
	}

	return parsed;
}

export function parseCaseSearch(search: Record<string, unknown>): CaseSearch {
	const parsed = caseSearchSchema(search);

	if (parsed instanceof type.errors) {
		return {};
	}

	return parsed;
}

export function publicationIdFromHash(hash: string) {
	const id = hash.replace(/^#/u, "").replace(/^pub-/u, "");

	if (!UUID_PATTERN.test(id)) {
		return;
	}

	return id;
}
