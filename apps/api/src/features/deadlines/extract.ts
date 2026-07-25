import { normalizeForMatch } from "../legal/text.ts";
import { LEGAL_DEADLINES } from "./catalog.ts";
import type { CountingUnit } from "./counting.ts";

const WRITTEN_NUMBERS: Record<string, number> = {
	um: 1,
	uma: 1,
	dois: 2,
	duas: 2,
	tres: 3,
	quatro: 4,
	cinco: 5,
	seis: 6,
	sete: 7,
	oito: 8,
	nove: 9,
	dez: 10,
	onze: 11,
	doze: 12,
	treze: 13,
	quatorze: 14,
	catorze: 15,
	quinze: 15,
	dezesseis: 16,
	dezessete: 17,
	dezoito: 18,
	dezenove: 19,
	vinte: 20,
	"vinte e quatro": 24,
	trinta: 30,
	quarenta: 40,
	"quarenta e cinco": 45,
	cinquenta: 50,
	sessenta: 60,
	noventa: 90,
	"cento e vinte": 120,
	"cento e oitenta": 180,
};

const THIRD_PARTY_TERMS = [
	"perito",
	"perita",
	"contador",
	"contadoria",
	"contabilidade",
	"oficial de justica",
	"serventia",
	"cartorio",
	"secretaria",
	"escrivania",
	"central de mandados",
	"leiloeiro",
	"depositario",
	"ministerio publico",
	"curador",
	"defensoria",
	"instituto nacional do seguro social",
	"inss",
];

const NOTICE_TERMS = [
	"intime",
	"intimad",
	"intimacao",
	"manifeste",
	"manifestem",
	"apresente",
	"apresentem",
	"requeira",
	"requeiram",
	"comprove",
	"comprovem",
	"cumpra",
	"junte",
	"juntem",
	"impugne",
	"conteste",
	"recolha",
	"providencie",
	"esclareca",
	"fica ciente",
	"fica a parte",
	"sob pena",
];

const PARTY_TERMS = [
	"as partes",
	"a parte autora",
	"parte autora",
	"o autor",
	"a autora",
	"o exequente",
	"a exequente",
	"o requerente",
	"a requerente",
	"o agravante",
	"o apelante",
	"o embargante",
	"o recorrente",
	"a parte re",
	"o reu",
	"a re ",
	"o executado",
	"a executada",
	"o requerido",
	"a requerida",
	"o apelado",
	"o agravado",
	"o recorrido",
];

const NUMERIC_PATTERN =
	/(\d{1,3})\s*(?:\(\s*([a-z ]{3,25}?)\s*\))?\s*(dias? uteis|dias? corridos|dias?|horas?|meses|mes)\b/gu;

const WRITTEN_PATTERN =
	/\b([a-z]+(?: e [a-z]+)?)\s*(?:\(\s*\d{1,3}\s*\))?\s*(dias? uteis|dias? corridos|dias?|horas?|meses|mes)\b/gu;

export type CandidateAudience = "partes" | "terceiro" | "indefinido";

export type CandidateUnit = "dias" | "horas" | "meses";

export interface DeadlineCandidate {
	days: number;
	unit: CandidateUnit;
	counting: CountingUnit;
	actKey: string | null;
	actLabel: string;
	basis: string | null;
	audience: CandidateAudience;
	snippet: string;
	offset: number;
	notes: string[];
}

function unitOf(raw: string): CandidateUnit {
	if (raw.startsWith("hora")) {
		return "horas";
	}

	if (raw.startsWith("mes")) {
		return "meses";
	}

	return "dias";
}

function countingOf(raw: string, unit: CandidateUnit): CountingUnit {
	if (unit !== "dias") {
		return "corridos";
	}

	if (raw.includes("corridos")) {
		return "corridos";
	}

	return "uteis";
}

function audienceOf(window: string): CandidateAudience {
	if (THIRD_PARTY_TERMS.some((term) => window.includes(term))) {
		return "terceiro";
	}

	if (PARTY_TERMS.some((term) => window.includes(term))) {
		return "partes";
	}

	return "indefinido";
}

function hasDeadlineCue(before: string) {
	if (before.includes("prazo")) {
		return true;
	}

	return NOTICE_TERMS.some((term) => before.includes(term));
}

function snippetOf(display: string, start: number, end: number) {
	const from = Math.max(0, start - 140);
	const to = Math.min(display.length, end + 140);
	const prefix = from > 0 ? "..." : "";
	const suffix = to < display.length ? "..." : "";

	return `${prefix}${display.slice(from, to).trim()}${suffix}`;
}

function pushCandidate(input: {
	text: string;
	display: string;
	candidates: DeadlineCandidate[];
	days: number;
	rawUnit: string;
	start: number;
	end: number;
	notes: string[];
}) {
	const before = input.text.slice(Math.max(0, input.start - 200), input.start);

	if (!hasDeadlineCue(before)) {
		return;
	}

	const unit = unitOf(input.rawUnit);
	const window = input.text.slice(Math.max(0, input.start - 260), input.end + 120);
	const act = LEGAL_DEADLINES.find((entry) =>
		entry.patterns.some((pattern) => pattern.test(window)),
	);
	const notes = [...input.notes];

	if (act && act.days !== input.days && unit === "dias") {
		notes.push(
			`Texto indica ${input.days} dias, mas o ato reconhecido (${act.label}) tem prazo legal de ${act.days} dias (${act.basis}).`,
		);
	}

	input.candidates.push({
		days: input.days,
		unit,
		counting: countingOf(input.rawUnit, unit),
		actKey: act ? act.key : null,
		actLabel: act ? act.label : "Prazo indicado na publicação",
		basis: act ? act.basis : null,
		audience: audienceOf(window),
		snippet: snippetOf(input.display, input.start, input.end),
		offset: input.start,
		notes,
	});
}

export function extractDeadlineCandidates(textPlain: string) {
	const display = textPlain.replaceAll(/\s+/gu, " ");
	const text = normalizeForMatch(textPlain);
	const candidates: DeadlineCandidate[] = [];
	const claimed: { start: number; end: number }[] = [];

	NUMERIC_PATTERN.lastIndex = 0;

	for (const match of text.matchAll(NUMERIC_PATTERN)) {
		const [full, digits, written, rawUnit] = match;

		if (!digits || !rawUnit) {
			continue;
		}

		const notes: string[] = [];
		const numeric = Number(digits);
		const spelled = written ? WRITTEN_NUMBERS[written.trim()] : undefined;
		let days = numeric;

		if (spelled !== undefined && spelled !== numeric) {
			days = Math.min(spelled, numeric);
			notes.push(
				`Divergência no texto: ${numeric} em algarismo e ${spelled} por extenso. A agenda usa o menor.`,
			);
		}

		claimed.push({ start: match.index, end: match.index + full.length });
		pushCandidate({
			text,
			display,
			candidates,
			days,
			rawUnit,
			start: match.index,
			end: match.index + full.length,
			notes,
		});
	}

	WRITTEN_PATTERN.lastIndex = 0;

	for (const match of text.matchAll(WRITTEN_PATTERN)) {
		const [full, word, rawUnit] = match;
		const days = word ? WRITTEN_NUMBERS[word.trim()] : undefined;

		if (days === undefined || !rawUnit) {
			continue;
		}

		const start = match.index;
		const overlaps = claimed.some(
			(range) => start < range.end && start + full.length > range.start,
		);

		if (overlaps) {
			continue;
		}

		pushCandidate({
			text,
			display,
			candidates,
			days,
			rawUnit,
			start: match.index,
			end: match.index + full.length,
			notes: [],
		});
	}

	return candidates.sort((left, right) => left.offset - right.offset);
}

export interface DeadlineDetection {
	primary: DeadlineCandidate | null;
	others: DeadlineCandidate[];
	confidence: "alta" | "media" | "baixa";
	needsReview: boolean;
	reviewReasons: string[];
}

export function detectDeadline(input: {
	textPlain: string;
	documentType: string | null;
	communicationType: string | null;
}): DeadlineDetection {
	const candidates = extractDeadlineCandidates(input.textPlain);
	const reviewReasons: string[] = [];

	if (candidates.length === 0) {
		const header = normalizeForMatch(
			`${input.documentType ?? ""} ${input.communicationType ?? ""}`,
		);
		const actLike = /sentenca|acordao|decisao|despacho|intimacao/u.test(header);

		return {
			primary: null,
			others: [],
			confidence: "baixa",
			needsReview: actLike,
			reviewReasons: actLike
				? ["Ato com potencial de prazo, mas nenhum prazo foi encontrado no texto."]
				: [],
		};
	}

	const usable = candidates.filter(
		(candidate) => candidate.unit === "dias" && candidate.audience !== "terceiro",
	);
	const pool = usable.length > 0 ? usable : candidates;
	const primary = pool.reduce((shortest, candidate) =>
		candidate.days < shortest.days ? candidate : shortest,
	);
	const others = candidates.filter((candidate) => candidate !== primary);

	if (usable.length === 0) {
		reviewReasons.push(
			"Todos os prazos encontrados são de terceiro ou não são contados em dias. Confirme se há prazo seu.",
		);
	}

	if (others.some((candidate) => candidate.days !== primary.days)) {
		reviewReasons.push(
			"A publicação traz mais de um prazo. A agenda marcou o mais curto; confira os demais.",
		);
	}

	if (primary.audience === "indefinido") {
		reviewReasons.push("Não foi possível identificar a quem o prazo se dirige.");
	}

	if (primary.unit !== "dias") {
		reviewReasons.push(`Prazo em ${primary.unit}: a contagem automática não se aplica.`);
	}

	reviewReasons.push(...primary.notes);

	const matchesCatalog =
		!!primary.actKey && primary.notes.length === 0 && others.every((c) => c.days === primary.days);
	const confidence =
		matchesCatalog && primary.audience === "partes" && primary.unit === "dias"
			? "alta"
			: primary.audience === "terceiro" || primary.unit !== "dias"
				? "baixa"
				: "media";

	return {
		primary,
		others,
		confidence,
		needsReview: confidence !== "alta" || reviewReasons.length > 0,
		reviewReasons,
	};
}
