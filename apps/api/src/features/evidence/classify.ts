import { extractActBody, summarize } from "../djen/normalize.ts";
import type { CaseSource } from "../legal/case-scan.ts";
import { firstMatch, matchesAny, normalizeForMatch, snippetAround } from "../legal/text.ts";

export const EVIDENCE_KINDS = [
	"documental",
	"pericial",
	"testemunhal",
	"depoimento",
	"inspecao",
	"emprestada",
] as const;

export const EVIDENCE_STAGES = [
	"juntada",
	"deferida",
	"indeferida",
	"manifestacao_aberta",
] as const;

export const EVIDENCE_PRODUCERS = ["autor", "reu", "oficio", "indefinido"] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type EvidenceStage = (typeof EVIDENCE_STAGES)[number];

export type EvidenceProducer = (typeof EVIDENCE_PRODUCERS)[number];

export type EvidenceConfidence = "alta" | "media" | "baixa";

const SNIPPET_LENGTH = 420;

const PROCEDURAL_NOISE_PATTERNS = [
	/certid(a|ã)o/u,
	/aviso de recebimento/u,
	/\bar\b/u,
	/mandado/u,
	/carta prec/u,
	/guia de (recolhimento|dep(o|ó)sito)/u,
	/of(i|í)cio expedido/u,
	/publica(c|ç)(a|ã)o no di(a|á)rio/u,
];

const KIND_PATTERNS: { kind: EvidenceKind; patterns: RegExp[] }[] = [
	{ kind: "emprestada", patterns: [/prova emprestada/u] },
	{
		kind: "pericial",
		patterns: [
			/per(i|í)cia/u,
			/laudo/u,
			/perit(o|a)/u,
			/quesito/u,
			/honor(a|á)rios periciais/u,
			/assistente t(e|é)cnico/u,
			/vistoria t(e|é)cnica/u,
			/exame de dna/u,
			/estudo (social|psicol(o|ó)gico)/u,
		],
	},
	{
		kind: "depoimento",
		patterns: [/depoimento pessoal/u, /interrogat(o|ó)rio/u, /depoimento especial/u],
	},
	{
		kind: "testemunhal",
		patterns: [
			/testemunh/u,
			/rol de testemunhas/u,
			/oitiva/u,
			/audi(e|ê)ncia de instru(c|ç)(a|ã)o/u,
		],
	},
	{ kind: "inspecao", patterns: [/inspe(c|ç)(a|ã)o judicial/u] },
	{
		kind: "documental",
		patterns: [
			/prova documental/u,
			/documentos? (novos?|juntados?|acostados?)/u,
			/junt(ada|ado|e|em|ou) .{0,40}(contrato|extrato|nota fiscal|comprovante|planilha|recibo|holerite|prontu(a|á)rio|escritura|matr(i|í)cula|boletim de ocorr(e|ê)ncia|cnis)/u,
			/(extrato banc(a|á)rio|nota fiscal|planilha de c(a|á)lculo|prontu(a|á)rio m(e|é)dico|boletim de ocorr(e|ê)ncia|cnis|holerite)/u,
		],
	},
];

const STAGE_PATTERNS: { stage: EvidenceStage; patterns: RegExp[] }[] = [
	{
		stage: "indeferida",
		patterns: [
			/indefiro (a|o|os|as) (produ(c|ç)(a|ã)o|per(i|í)cia|prova|oitiva)/u,
			/(prova|per(i|í)cia|oitiva) (foi )?indeferida/u,
			/desnecess(a|á)ri[ao] (a|o) (prova|per(i|í)cia|dilaç)/u,
			/dispenso (a|o) (prova|per(i|í)cia)/u,
			/indefiro a produ(c|ç)(a|ã)o/u,
		],
	},
	{
		stage: "manifestacao_aberta",
		patterns: [
			/manifest\w* .{0,60}(sobre|acerca d\w+) .{0,40}(laudo|per(i|í)cia|documento|prova|c(a|á)lculo)/u,
			/(vista|ci(e|ê)ncia) .{0,40}(do|ao) laudo/u,
			/impugn\w* .{0,40}(laudo|documento|c(a|á)lculo)/u,
			/manifestem[- ]se .{0,60}(laudo|documento|prova)/u,
		],
	},
	{
		stage: "deferida",
		patterns: [
			/defiro (a|o|os|as) (produ(c|ç)(a|ã)o|per(i|í)cia|prova|oitiva)/u,
			/determino (a realiza(c|ç)(a|ã)o|a produ(c|ç)(a|ã)o)/u,
			/nomeio (o|a|como) perit/u,
			/designo .{0,40}audi(e|ê)ncia de instru/u,
			/apresentem .{0,30}(quesitos|rol de testemunhas)/u,
			/(prova|per(i|í)cia) (foi )?deferida/u,
		],
	},
	{
		stage: "juntada",
		patterns: [/junt(ada|ado|ou|em|e)/u, /acostad/u, /apresentou/u, /aportad/u],
	},
];

const PRODUCER_PATTERNS: { producer: EvidenceProducer; patterns: RegExp[] }[] = [
	{ producer: "oficio", patterns: [/de of(i|í)cio/u, /determino de of(i|í)cio/u] },
	{
		producer: "autor",
		patterns: [
			/(pel[ao]|d[ao]) (parte )?(autor|autora|requerente|exequente|reclamante|apelante)/u,
			/(autor|autora|requerente|exequente|reclamante) (juntou|apresentou|acostou|requereu)/u,
		],
	},
	{
		producer: "reu",
		patterns: [
			/(pel[ao]|d[ao]) (parte )?(r(e|é)u|r(e|é)|requerid[ao]|executad[ao]|reclamad[ao])/u,
			/(r(e|é)u|requerid[ao]|executad[ao]|reclamad[ao]) (juntou|apresentou|acostou|requereu)/u,
		],
	},
];

export interface EvidenceClassification {
	kind: EvidenceKind;
	stage: EvidenceStage;
	producedBy: EvidenceProducer;
	title: string;
	snippet: string;
	confidence: EvidenceConfidence;
}

const KIND_TITLES: Record<EvidenceKind, string> = {
	documental: "Prova documental",
	pericial: "Prova pericial",
	testemunhal: "Prova testemunhal",
	depoimento: "Depoimento pessoal",
	inspecao: "Inspeção judicial",
	emprestada: "Prova emprestada",
};

function movementText(source: CaseSource) {
	const complements = (source.complements ?? [])
		.map((complement) => complement.nome ?? complement.descricao)
		.filter((value) => !!value)
		.join(" ");

	return [source.type, source.summary, complements].filter((value) => !!value).join(" ");
}

function kindOf(text: string): EvidenceKind | null {
	for (const entry of KIND_PATTERNS) {
		if (matchesAny(text, entry.patterns)) {
			return entry.kind;
		}
	}

	return null;
}

function stageOf(text: string): EvidenceStage | null {
	for (const entry of STAGE_PATTERNS) {
		if (matchesAny(text, entry.patterns)) {
			return entry.stage;
		}
	}

	return null;
}

function producedByOf(text: string): EvidenceProducer {
	for (const entry of PRODUCER_PATTERNS) {
		if (matchesAny(text, entry.patterns)) {
			return entry.producer;
		}
	}

	return "indefinido";
}

function confidenceOf(input: {
	fromPublication: boolean;
	kind: EvidenceKind;
	stage: EvidenceStage;
}) {
	if (!input.fromPublication) {
		return "media" as const;
	}

	if (input.stage === "juntada" && input.kind === "documental") {
		return "baixa" as const;
	}

	return "alta" as const;
}

export function classifyEvidence(source: CaseSource): EvidenceClassification | null {
	const display = source.publication
		? extractActBody(source.publication.textPlain).replaceAll(/\s+/gu, " ").trim()
		: movementText(source);
	const text = normalizeForMatch(display);
	const kind = kindOf(text);

	if (!kind) {
		return null;
	}

	if (kind === "documental" && matchesAny(text, PROCEDURAL_NOISE_PATTERNS)) {
		return null;
	}

	const stage = stageOf(text);

	if (!stage) {
		return null;
	}

	const found = firstMatch(
		text,
		KIND_PATTERNS.find((entry) => entry.kind === kind)?.patterns ?? [],
	);

	return {
		kind,
		stage,
		producedBy: producedByOf(text),
		title: KIND_TITLES[kind],
		snippet: found
			? snippetAround(display, found.index, SNIPPET_LENGTH)
			: summarize(display, SNIPPET_LENGTH),
		confidence: confidenceOf({ fromPublication: !!source.publication, kind, stage }),
	};
}
