// Alimenta o `validateSearch` das rotas de processo, que fica fora do code splitting do TanStack
// Router: import de runtime aqui entra no grafo eager do entry. Por isso é TypeScript puro.

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

// Campo declarado com tipo errado derruba o parse inteiro e devolve `{}`, que é o que o schema
// arktype anterior fazia. Preservado de propósito: mudar isso muda o que a lista de processos
// mostra para uma URL malformada, e isso não é decisão de otimização.
function wrongType(raw: Record<string, unknown>, key: string, expected: "string" | "number") {
	return key in raw && typeof raw[key] !== expected;
}

export function parseCasesSearch(raw: Record<string, unknown>): CasesSearch {
	if (
		wrongType(raw, "q", "string") ||
		wrongType(raw, "tribunal", "string") ||
		wrongType(raw, "page", "number")
	) {
		return {};
	}

	const search: CasesSearch = {};
	const q = typeof raw.q === "string" ? raw.q.trim() : undefined;
	const tribunal = typeof raw.tribunal === "string" ? raw.tribunal.trim().toUpperCase() : undefined;

	if (q) {
		search.q = q;
	}

	if (tribunal && TRIBUNAL_PATTERN.test(tribunal)) {
		search.tribunal = tribunal;
	}

	if (typeof raw.page === "number" && raw.page > 1) {
		search.page = Math.floor(raw.page);
	}

	return search;
}

export function parseCaseSearch(raw: Record<string, unknown>): CaseSearch {
	if (wrongType(raw, "pub", "string") || wrongType(raw, "aba", "string")) {
		return {};
	}

	const search: CaseSearch = {};

	if (typeof raw.pub === "string" && UUID_PATTERN.test(raw.pub)) {
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
}

export function publicationIdFromHash(hash: string) {
	const id = hash.replace(/^#/u, "").replace(/^pub-/u, "");

	if (!UUID_PATTERN.test(id)) {
		return;
	}

	return id;
}
