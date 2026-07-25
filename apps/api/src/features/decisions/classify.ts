import { extractActBody, summarize } from "../djen/normalize.ts";
import type { CaseSource } from "../legal/case-scan.ts";
import { firstMatch, matchesAny, normalizeForMatch, snippetAround } from "../legal/text.ts";

export const DECISION_SPECIES = [
	"despacho",
	"interlocutoria",
	"sentenca",
	"acordao",
	"monocratica",
] as const;

export const DECISION_OUTCOMES = [
	"procedente",
	"improcedente",
	"parcialmente_procedente",
	"extincao_sem_merito",
	"extincao_execucao",
	"homologacao",
	"tutela_deferida",
	"tutela_indeferida",
	"recurso_provido",
	"recurso_desprovido",
	"embargos_acolhidos",
	"embargos_rejeitados",
] as const;

const DECISION_EFFECTS = [
	"encerra_fase",
	"resolve_incidente",
	"abre_prazo",
	"condena_verba",
] as const;

export type DecisionSpecies = (typeof DECISION_SPECIES)[number];

export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export type DecisionEffect = (typeof DECISION_EFFECTS)[number];

export type DecisionConfidence = "alta" | "media" | "baixa";

const SNIPPET_LENGTH = 520;

const SPECIES_BY_CODE: Record<string, DecisionSpecies> = {
	"193": "sentenca",
	"196": "sentenca",
	"218": "sentenca",
	"219": "sentenca",
	"220": "sentenca",
	"221": "sentenca",
	"466": "sentenca",
	"471": "sentenca",
	"12185": "interlocutoria",
	"12164": "interlocutoria",
	"12387": "interlocutoria",
	"12444": "interlocutoria",
	"12455": "interlocutoria",
	"332": "interlocutoria",
	"339": "interlocutoria",
	"785": "interlocutoria",
	"792": "interlocutoria",
	"11010": "despacho",
	"14093": "acordao",
	"239": "acordao",
};

const OUTCOME_BY_CODE: Record<string, DecisionOutcome> = {
	"219": "procedente",
	"220": "improcedente",
	"221": "parcialmente_procedente",
	"218": "extincao_sem_merito",
	"471": "extincao_sem_merito",
	"196": "extincao_execucao",
	"466": "homologacao",
	"239": "recurso_desprovido",
	"198": "embargos_acolhidos",
	"15162": "embargos_acolhidos",
	"15163": "embargos_acolhidos",
	"200": "embargos_rejeitados",
	"15164": "embargos_rejeitados",
	"12444": "tutela_deferida",
	"12455": "tutela_indeferida",
};

const SELF_EXPLANATORY_CODES = new Set([
	"193",
	"332",
	"339",
	"785",
	"792",
	"889",
	"12185",
	"12387",
	"14093",
]);

const SPECIES_PATTERNS: { species: DecisionSpecies; patterns: RegExp[] }[] = [
	{
		species: "acordao",
		patterns: [
			/vistos,? relatados e discutidos/u,
			/acordam,? (a|o|os|em)/u,
			/ata de sess(a|ã)o de julgamento/u,
			/(negaram|deram|julgaram|acolheram|rejeitaram|conheceram) (parcial |provimento|o|a|os|as|ao)/u,
		],
	},
	{
		species: "monocratica",
		patterns: [
			/decis(a|ã)o monocr(a|á)tica/u,
			/decido monocraticamente/u,
			/nego seguimento ao (recurso|agravo)/u,
			/relator[ai]?[,:]? monocraticamente/u,
		],
	},
	{
		species: "sentenca",
		patterns: [
			/julgo (parcialmente )?(procedente|improcedente|extint)/u,
			/julgo (o|a) (pedido|a(c|ç)(a|ã)o|demanda)/u,
			/julgo (extinto|extinta|prejudicad)/u,
			/homologo (o|a|e)/u,
			/extingo (o processo|o feito|a execu)/u,
			/(com|sem) resolu(c|ç)(a|ã)o (do|de) m(e|é)rito/u,
			/art(igo)?\.? ?(487|485|924|925)/u,
		],
	},
	{
		species: "interlocutoria",
		patterns: [
			/decis(a|ã)o interlocut(o|ó)ria/u,
			/(defiro|indefiro|concedo|denego|revogo|mantenho) (a|o|os|as|em|parcial)/u,
			/antecipa(c|ç)(a|ã)o (de|da) tutela/u,
			/tutela (de urg(e|ê)ncia|provis(o|ó)ria|antecipada)/u,
			/(defiro|indefiro|concedo|deferida|indeferida) a? ?liminar/u,
			/saneament/u,
			/(acolho|rejeito|conhe(c|ç)o) (os|o|as|a|parcial)/u,
			/recebo o (recurso|agravo)/u,
		],
	},
];

const MERIT_OUTCOME_PATTERNS: { outcome: DecisionOutcome; patterns: RegExp[] }[] = [
	{
		outcome: "parcialmente_procedente",
		patterns: [
			/julg(o|aram) parcialmente procedente/u,
			/proced(e|ê)ncia em parte/u,
			/procedente em parte/u,
			/parcialmente procedente/u,
		],
	},
	{
		outcome: "procedente",
		patterns: [/julg(o|aram) procedente/u, /procedente (a|o) (a(c|ç)(a|ã)o|pedido)/u],
	},
	{ outcome: "improcedente", patterns: [/julg(o|aram) improcedente/u, /improcedente (a|o)/u] },
	{
		outcome: "extincao_execucao",
		patterns: [/extin(c|ç)(a|ã)o (da|do) (execu(c|ç)(a|ã)o|cumprimento)/u, /extingo a execu/u],
	},
	{
		outcome: "extincao_sem_merito",
		patterns: [
			/sem resolu(c|ç)(a|ã)o (do|de) m(e|é)rito/u,
			/julgo extint[oa] (o processo|o feito|sem)/u,
			/art(igo)?\.? ?485/u,
			/prescri(c|ç)(a|ã)o|decad(e|ê)ncia/u,
		],
	},
	{
		outcome: "homologacao",
		patterns: [/homologo/u, /homologa(c|ç)(a|ã)o (do|de) (acordo|transa)/u],
	},
	{
		outcome: "tutela_deferida",
		patterns: [
			/(defiro|concedo) (a|o) (tutela|liminar|antecipa)/u,
			/(tutela|liminar) (deferida|concedida)/u,
		],
	},
	{
		outcome: "tutela_indeferida",
		patterns: [
			/(indefiro|denego) (a|o) (tutela|liminar|antecipa)/u,
			/(tutela|liminar) (indeferida|denegada)/u,
		],
	},
];

const APPEAL_OUTCOME_PATTERNS: { outcome: DecisionOutcome; patterns: RegExp[] }[] = [
	{
		outcome: "embargos_acolhidos",
		patterns: [/(acolho|acolheram) os embargos/u, /acolhimento (em parte )?(dos|de) embargos/u],
	},
	{
		outcome: "embargos_rejeitados",
		patterns: [
			/(rejeito|rejeitaram) os embargos/u,
			/n(a|ã)o (acolho|acolheram) os embargos/u,
			/n(a|ã)o[- ]acolhimento (dos|de) embargos/u,
		],
	},
	{
		outcome: "recurso_provido",
		patterns: [
			/(dou|deram|dar|d(a|á)-se) (parcial )?provimento/u,
			/provimento parcial/u,
			/(recurso|agravo|apela(c|ç)(a|ã)o) provid/u,
		],
	},
	{
		outcome: "recurso_desprovido",
		patterns: [
			/(nego|negaram|negar|nega-se) (parcial )?(provimento|seguimento)/u,
			/n(a|ã)o[- ]provimento/u,
			/(recurso|agravo|apela(c|ç)(a|ã)o) (des|im|n(a|ã)o )?provid/u,
			/mantenho a (senten(c|ç)a|decis(a|ã)o)/u,
		],
	},
];

const DISPOSITIVE_PATTERNS = [
	/(ante|isso) (o )?exposto/u,
	/julg(o|aram) (parcialmente )?(procedente|improcedente|extint)/u,
	/(dou|deram|nego|negaram) (parcial )?(provimento|seguimento)/u,
	/ementa/u,
	/(a|à) unanimidade/u,
	/conhece(u|ram)/u,
	/dispositivo/u,
	/homologo/u,
	/(defiro|indefiro|concedo|denego)/u,
	/(acolho|acolheram|rejeito|rejeitaram) os embargos/u,
	/acordam/u,
	/decido/u,
	/vistos/u,
];

const DEADLINE_EFFECT_PATTERNS = [
	/no prazo de \d/u,
	/prazo de \d/u,
	/manifeste[- ]se/u,
	/manifestem[- ]se/u,
	/apresente(m)? /u,
	/intime[- ]se.{0,80}prazo/u,
	/sob pena de/u,
];

const VERBA_EFFECT_PATTERNS = [
	/condeno/u,
	/honor(a|á)rios (advocat(i|í)cios|sucumbenciais|de sucumb)/u,
	/custas (processuais|e despesas)/u,
	/ao pagamento de/u,
];

const INCIDENT_EFFECT_PATTERNS = [
	/embargos/u,
	/impugna(c|ç)(a|ã)o/u,
	/exce(c|ç)(a|ã)o de/u,
	/incidente/u,
	/agravo/u,
	/reconven(c|ç)(a|ã)o/u,
];

const CLOSING_EFFECT_PATTERNS = [
	/extingo/u,
	/julgo extint/u,
	/arquive[-]se/u,
	/tr(a|â)nsito em julgado/u,
	/baixa definitiva/u,
];

export interface DecisionClassification {
	species: DecisionSpecies;
	outcome: DecisionOutcome | null;
	effects: DecisionEffect[];
	snippet: string;
	confidence: DecisionConfidence;
}

function headerOf(source: CaseSource) {
	const complements = (source.complements ?? [])
		.map((complement) => complement.nome ?? complement.descricao)
		.filter((value) => !!value)
		.join(" ");

	return normalizeForMatch(
		[
			source.publication?.documentType,
			source.publication?.communicationType,
			source.type,
			complements,
		]
			.filter((value) => !!value)
			.join(" "),
	);
}

function speciesFromHeader(header: string): DecisionSpecies | null {
	if (/ac(o|ó)rd(a|ã)o|ata de sess(a|ã)o/u.test(header)) {
		return "acordao";
	}

	if (/monocr(a|á)tica/u.test(header)) {
		return "monocratica";
	}

	if (/senten(c|ç)a/u.test(header)) {
		return "sentenca";
	}

	if (/decis(a|ã)o interlocut|outras decis(o|õ)es|saneament|tutela|liminar/u.test(header)) {
		return "interlocutoria";
	}

	if (/despacho|mero expediente|ato ordinat(o|ó)rio/u.test(header)) {
		return "despacho";
	}

	return null;
}

function speciesFromText(text: string): DecisionSpecies | null {
	for (const entry of SPECIES_PATTERNS) {
		if (matchesAny(text, entry.patterns)) {
			return entry.species;
		}
	}

	return null;
}

function outcomeFromText(text: string, species: DecisionSpecies): DecisionOutcome | null {
	const reviewsAppeal = species === "acordao" || species === "monocratica";
	const ordered = reviewsAppeal
		? [...APPEAL_OUTCOME_PATTERNS, ...MERIT_OUTCOME_PATTERNS]
		: [...MERIT_OUTCOME_PATTERNS, ...APPEAL_OUTCOME_PATTERNS];

	for (const entry of ordered) {
		if (matchesAny(text, entry.patterns)) {
			return entry.outcome;
		}
	}

	return null;
}

function effectsOf(input: {
	text: string;
	species: DecisionSpecies;
	outcome: DecisionOutcome | null;
}) {
	const effects: DecisionEffect[] = [];
	const decidesMerit = input.species === "sentenca" || input.species === "acordao";

	if ((decidesMerit && !!input.outcome) || matchesAny(input.text, CLOSING_EFFECT_PATTERNS)) {
		effects.push("encerra_fase");
	}

	if (!decidesMerit && matchesAny(input.text, INCIDENT_EFFECT_PATTERNS)) {
		effects.push("resolve_incidente");
	}

	if (matchesAny(input.text, DEADLINE_EFFECT_PATTERNS)) {
		effects.push("abre_prazo");
	}

	if (matchesAny(input.text, VERBA_EFFECT_PATTERNS)) {
		effects.push("condena_verba");
	}

	return effects;
}

function snippetOf(display: string, text: string) {
	const found = firstMatch(text, DISPOSITIVE_PATTERNS);

	if (!found) {
		return summarize(display, SNIPPET_LENGTH);
	}

	return snippetAround(display, found.index, SNIPPET_LENGTH);
}

function confidenceOf(input: {
	speciesFromCode: boolean;
	speciesFromHeader: boolean;
	outcomeFromCode: boolean;
	outcome: DecisionOutcome | null;
}): DecisionConfidence {
	if (input.outcomeFromCode || (input.speciesFromCode && !!input.outcome)) {
		return "alta";
	}

	if (input.speciesFromHeader && !!input.outcome) {
		return "alta";
	}

	if (input.speciesFromCode || input.speciesFromHeader || !!input.outcome) {
		return "media";
	}

	return "baixa";
}

export function classifyDecision(source: CaseSource): DecisionClassification | null {
	const code = source.externalCode ?? "";
	const header = headerOf(source);
	const display = source.publication
		? extractActBody(source.publication.textPlain).replaceAll(/\s+/gu, " ").trim()
		: source.summary;
	const text = normalizeForMatch(display);

	const codeSpecies = SPECIES_BY_CODE[code];
	const headerSpecies = speciesFromHeader(header);
	const species = codeSpecies ?? speciesFromText(text) ?? headerSpecies;

	if (!species) {
		return null;
	}

	const codeOutcome = OUTCOME_BY_CODE[code];
	const outcome = codeOutcome ?? outcomeFromText(text, species);
	const effects = effectsOf({ text, species, outcome });

	if (species === "despacho" && effects.length === 0) {
		return null;
	}

	if (!source.publication && !codeOutcome && !SELF_EXPLANATORY_CODES.has(code)) {
		return null;
	}

	return {
		species,
		outcome,
		effects,
		snippet: snippetOf(display, text),
		confidence: confidenceOf({
			speciesFromCode: !!codeSpecies,
			speciesFromHeader: !!headerSpecies,
			outcomeFromCode: !!codeOutcome,
			outcome,
		}),
	};
}
