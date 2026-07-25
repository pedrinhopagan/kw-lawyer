import type { CaseSource } from "../legal/case-scan.ts";
import { citedCnjNumbers, normalizeForMatch, snippetAround } from "../legal/text.ts";

const RELATION_KINDS = [
	"agravo_instrumento",
	"agravo_interno",
	"agravo_execucao_penal",
	"embargos_declaracao",
	"recurso",
	"cumprimento_sentenca",
	"execucao",
	"precatoria",
	"desconsideracao",
	"incidente",
] as const;

const RELATION_STATES = [
	"distribuido",
	"com_relator",
	"liminar_deferida",
	"liminar_indeferida",
	"julgado",
	"baixado",
] as const;

export type RelationKind = (typeof RELATION_KINDS)[number];

export type RelationState = (typeof RELATION_STATES)[number];

const SNIPPET_LENGTH = 320;

const PRINCIPAL_MARKER = /processo principal (\d[\d.\-/]{15,})/u;

const KIND_BY_CLASS: { kind: RelationKind; pattern: RegExp }[] = [
	{ kind: "agravo_execucao_penal", pattern: /agravo de execu(c|ç)(a|ã)o penal/u },
	{ kind: "agravo_instrumento", pattern: /agravo de instrumento/u },
	{ kind: "agravo_interno", pattern: /agravo (interno|regimental|em recurso)/u },
	{ kind: "embargos_declaracao", pattern: /embargos de declara(c|ç)(a|ã)o/u },
	{ kind: "desconsideracao", pattern: /desconsidera(c|ç)(a|ã)o/u },
	{
		kind: "cumprimento_sentenca",
		pattern: /cumprimento (de|provis(o|ó)rio de|definitivo de) senten(c|ç)a/u,
	},
	{ kind: "execucao", pattern: /execu(c|ç)(a|ã)o (de t(i|í)tulo|fiscal|provis|contra)/u },
	{ kind: "precatoria", pattern: /(carta )?precat(o|ó)ria/u },
	{
		kind: "recurso",
		pattern:
			/(apela(c|ç)(a|ã)o|recurso (em sentido estrito|inominado|especial|extraordin(a|á)rio|ordin(a|á)rio))/u,
	},
	{
		kind: "incidente",
		pattern: /(incidente|impugna(c|ç)(a|ã)o ao cumprimento|embargos (a|à) execu)/u,
	},
];

export interface CaseIdentity {
	cnjNumber: string;
	className: string | null;
	grau: string | null;
}

export interface DiscoveredRelation {
	incidentCnjNumber: string;
	principalCnjNumber: string;
	kind: RelationKind;
	snippet: string;
}

function relationKindOfClass(className: string | null | undefined): RelationKind | null {
	if (!className) {
		return null;
	}

	const normalized = normalizeForMatch(className);
	const found = KIND_BY_CLASS.find((entry) => entry.pattern.test(normalized));

	if (!found) {
		return null;
	}

	return found.kind;
}

function displayOf(source: CaseSource) {
	if (!source.publication) {
		return source.summary;
	}

	return source.publication.textPlain.replaceAll(/\s+/gu, " ").trim();
}

function relationOf(input: {
	self: CaseIdentity;
	cited: string;
	known: CaseIdentity | undefined;
	display: string;
	offset: number;
	declaredPrincipal: string | undefined;
}): DiscoveredRelation | null {
	const selfKind = relationKindOfClass(input.self.className);
	const citedKind = relationKindOfClass(input.known?.className);
	const snippet = snippetAround(input.display, input.offset, SNIPPET_LENGTH);

	if (input.declaredPrincipal === input.cited && selfKind) {
		return {
			incidentCnjNumber: input.self.cnjNumber,
			principalCnjNumber: input.cited,
			kind: selfKind,
			snippet,
		};
	}

	if (citedKind && !selfKind) {
		return {
			incidentCnjNumber: input.cited,
			principalCnjNumber: input.self.cnjNumber,
			kind: citedKind,
			snippet,
		};
	}

	if (selfKind && !citedKind && input.known) {
		return {
			incidentCnjNumber: input.self.cnjNumber,
			principalCnjNumber: input.cited,
			kind: selfKind,
			snippet,
		};
	}

	return null;
}

export function classifyRelations(input: {
	self: CaseIdentity;
	source: CaseSource;
	known: (cnjNumber: string) => CaseIdentity | undefined;
}): DiscoveredRelation[] {
	const display = displayOf(input.source);

	if (!display) {
		return [];
	}

	const text = normalizeForMatch(display);
	const cited = citedCnjNumbers(display, input.self.cnjNumber);

	if (!cited.length) {
		return [];
	}

	const marker = PRINCIPAL_MARKER.exec(text);
	const declaredPrincipal = marker?.[1]?.replaceAll(/\D/gu, "");
	const found: DiscoveredRelation[] = [];

	for (const number of cited) {
		const offset = Math.max(0, display.indexOf(number.slice(0, 7)));
		const relation = relationOf({
			self: input.self,
			cited: number,
			known: input.known(number),
			display,
			offset,
			declaredPrincipal,
		});

		if (relation) {
			found.push(relation);
		}
	}

	return found;
}
