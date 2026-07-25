const CNJ_DIGITS_LENGTH = 20;

const HTML_NAMED_ENTITIES: Record<string, string> = {
	nbsp: " ",
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	lsquo: "'",
	rsquo: "'",
	ldquo: '"',
	rdquo: '"',
	ordm: "\u00BA",
	ordf: "\u00AA",
	sect: "\u00A7",
	deg: "\u00B0",
	middot: "\u00B7",
	bull: "\u2022",
	hellip: "\u2026",
	ndash: "\u2013",
	mdash: "\u2014",
	laquo: "\u00AB",
	raquo: "\u00BB",
	copy: "\u00A9",
	reg: "\u00AE",
	trade: "\u2122",
	euro: "\u20AC",
	pound: "\u00A3",
	cent: "\u00A2",
	aacute: "á",
	agrave: "à",
	acirc: "â",
	atilde: "ã",
	auml: "ä",
	eacute: "é",
	egrave: "è",
	ecirc: "ê",
	euml: "ë",
	iacute: "í",
	igrave: "ì",
	icirc: "î",
	iuml: "ï",
	oacute: "ó",
	ograve: "ò",
	ocirc: "ô",
	otilde: "õ",
	ouml: "ö",
	uacute: "ú",
	ugrave: "ù",
	ucirc: "û",
	uuml: "ü",
	yacute: "ý",
	ccedil: "ç",
	ntilde: "ñ",
};

function decodeCodePoint(code: number, entity: string) {
	if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) {
		return `&${entity};`;
	}

	return String.fromCodePoint(code);
}

function decodeEntity(entity: string) {
	if (entity.startsWith("#x") || entity.startsWith("#X")) {
		return decodeCodePoint(Number.parseInt(entity.slice(2), 16), entity);
	}

	if (entity.startsWith("#")) {
		return decodeCodePoint(Number(entity.slice(1)), entity);
	}

	const direct = HTML_NAMED_ENTITIES[entity];

	if (direct) {
		return direct;
	}

	const lowercase = HTML_NAMED_ENTITIES[entity.toLowerCase()];

	if (lowercase) {
		return lowercase.toUpperCase();
	}

	return `&${entity};`;
}

export function toCnjDigits(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const digits = value.replaceAll(/\D/gu, "");

	if (digits.length !== CNJ_DIGITS_LENGTH) {
		return null;
	}

	return digits;
}

export function formatCnj(digits: string) {
	if (digits.length !== CNJ_DIGITS_LENGTH) {
		throw new Error(`Número CNJ precisa ter ${CNJ_DIGITS_LENGTH} dígitos`);
	}

	const sequential = digits.slice(0, 7);
	const verifier = digits.slice(7, 9);
	const year = digits.slice(9, 13);
	const segment = digits.slice(13, 14);
	const court = digits.slice(14, 16);
	const origin = digits.slice(16, 20);

	return `${sequential}-${verifier}.${year}.${segment}.${court}.${origin}`;
}

export function htmlToPlainText(html: string) {
	const stripped = html
		.replaceAll(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
		.replaceAll(/<(?:br|hr)\s*\/?>/giu, "\n")
		.replaceAll(
			/<\/(?:p|div|section|article|header|footer|table|tr|li|ul|ol|h[1-6]|blockquote)>/giu,
			"\n",
		)
		.replaceAll(/<[^>]*>/gu, " ");

	return stripped
		.replaceAll(/&(#x?[0-9a-f]+|[a-z]+);/giu, (_match, entity: string) => decodeEntity(entity))
		.replaceAll(/\r\n?/gu, "\n")
		.replaceAll(/[^\S\n]+/gu, " ")
		.replaceAll(/ ?\n ?/gu, "\n")
		.replaceAll(/\n{2,}/gu, "\n")
		.trim();
}

const ACT_MARKERS = new Set([
	"acolheram",
	"acolho",
	"acórdão",
	"aguarde-se",
	"anote-se",
	"anularam",
	"abra-se",
	"arquive-se",
	"arquivem-se",
	"ato",
	"cadastre-se",
	"certidão",
	"certifico",
	"cite-se",
	"conheceram",
	"converteram",
	"converto",
	"cuida-se",
	"cumpra-se",
	"decisão",
	"defiro",
	"deram",
	"designo",
	"despacho",
	"despacho/decisão",
	"determinaram",
	"edital",
	"ementa",
	"encaminhe-se",
	"expeça-se",
	"expeçam-se",
	"fica",
	"ficam",
	"fl",
	"fls",
	"homologaram",
	"homologo",
	"indefiro",
	"intimação",
	"intime-se",
	"intimem-se",
	"julgaram",
	"julgo",
	"junte-se",
	"mantenho",
	"mantiveram",
	"manifeste-se",
	"negaram",
	"notificação",
	"providencie-se",
	"publique-se",
	"recebo",
	"rejeitaram",
	"relatório",
	"remetam-se",
	"sentença",
	"trata-se",
	"vistos",
]);

const ACT_HEADING_PATTERN =
	/^(?:DESPACHO(?:\s*\/\s*DECIS[ÃA]O)?|DECIS[ÃA]O|SENTEN[ÇC]A|AC[ÓO]RD[ÃA]O|ATO ORDINAT[ÓO]RIO|INTIMA[ÇC][ÃA]O|NOTIFICA[ÇC][ÃA]O|EMENTA|EDITAL|CERTID[ÃA]O|VOTO|RELAT[ÓO]RIO)\s*[:.]?$/u;
const LABEL_PATTERN =
	/(?:^|[^\S\n]|[\n(])((?:[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ().º°'-]*|[\d.\-/]{10,})(?:[^\S\n]+(?:do|da|de|dos|das|e)?[^\S\n]*(?:\([aA]\))?[^\S\n]*[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ().º°'-]*){0,3})[^\S\n]*:(?=\s|$)/gu;
const DJE_NOTICE_PATTERN =
	/Processo Digital\. Petições para juntada[\s\S]{0,140}?Res\. \d+\/\d+\s*[-;]\s*/gu;
const TJSP_HEADER_PATTERN =
	/^(?:ADV[^:\n]{0,15}:[^\n]*?)?Processo\s+[\d.\-/]{15,}(?:[^\S\n]*\([^)\n]*\))*/u;
const TJSP_LAWYERS_PATTERN = /\s+-\s+ADV[^:\n]{0,15}:\s[^\n]*$/u;
const PROCESS_ID_PATTERN = /\d{6,}/u;
const LOWERCASE_WORD_PATTERN = /^[a-zà-öø-ÿ]/u;
const UPPERCASE_WORD_PATTERN = /^\p{Lu}/u;
const SENTENCE_WORD_PATTERN = /^[A-ZÀ-ÖØ-Þ](?:[a-zà-öø-ÿ]|[^\p{L}]|$)/u;
const NAME_LINE_PATTERN = /^[^.!?]{1,90}$/u;
const WORD_PATTERN = /\S+/gu;

const PROSE_RUN = 3;
const PROSE_LOOKAHEAD = 8;
const MARKER_LOOKAHEAD = 5;
const MAX_LABEL_GAP = 200;
const BODY_SEARCH_WINDOW = 420;
const TJSP_SUBJECT_SEGMENTS = 2;
const MAX_STRIP_PASSES = 4;
const TJSP_SEGMENT_SEPARATOR = " - ";

interface TextWord {
	text: string;
	start: number;
}

function splitWords(text: string) {
	const matches = [...text.matchAll(WORD_PATTERN)];

	return matches.map((match) => ({ text: match[0], start: match.index }));
}

function hasProseRun(words: TextWord[], from: number, until: number) {
	let run = 0;

	for (let index = from; index < Math.min(words.length, until); index += 1) {
		run = LOWERCASE_WORD_PATTERN.test(words[index]?.text ?? "") ? run + 1 : 0;

		if (run >= PROSE_RUN) {
			return true;
		}
	}

	return false;
}

function hasProse(text: string) {
	const words = splitWords(text);

	return hasProseRun(words, 0, words.length);
}

function isActMarker(word: string) {
	const normalized = word.toLowerCase().replaceAll(/[,;.:]+$/gu, "");

	return ACT_MARKERS.has(normalized);
}

function findMarker(words: TextWord[], from: number) {
	for (let index = from; index < Math.min(words.length, from + MARKER_LOOKAHEAD); index += 1) {
		const word = words[index];

		if (word && UPPERCASE_WORD_PATTERN.test(word.text) && isActMarker(word.text)) {
			return word.start;
		}
	}

	return -1;
}

function findBodyStart(text: string, from: number) {
	const words = splitWords(text.slice(from, from + BODY_SEARCH_WINDOW));

	for (const [index, word] of words.entries()) {
		if (!UPPERCASE_WORD_PATTERN.test(word.text)) {
			continue;
		}

		if (isActMarker(word.text)) {
			return from + word.start;
		}

		if (!SENTENCE_WORD_PATTERN.test(word.text)) {
			continue;
		}

		if (!hasProseRun(words, index + 1, index + 1 + PROSE_LOOKAHEAD)) {
			continue;
		}

		const marker = findMarker(words, index + 1);

		return from + (marker === -1 ? word.start : marker);
	}

	return -1;
}

function findLabels(text: string) {
	const matches = [...text.matchAll(LABEL_PATTERN)];

	return matches.map((match) => ({
		start: match.index + match[0].indexOf(match[1] ?? ""),
		end: match.index + match[0].length,
	}));
}

function startOfLine(text: string, index: number) {
	return text.lastIndexOf("\n", index - 1) + 1;
}

function endOfLine(text: string, index: number) {
	const breakIndex = text.indexOf("\n", index);

	return breakIndex === -1 ? text.length : breakIndex;
}

function afterLabelLines(text: string, labels: { start: number; end: number }[]) {
	const labelLines = new Set(labels.map((label) => startOfLine(text, label.start)));

	let cut = endOfLine(text, labels[0]?.end ?? 0);

	while (cut < text.length) {
		const next = cut + 1;
		const line = text.slice(next, endOfLine(text, next));

		if (labelLines.has(next)) {
			cut = next + line.length;
			continue;
		}

		if (ACT_HEADING_PATTERN.test(line.trim())) {
			break;
		}

		if (!NAME_LINE_PATTERN.test(line) || hasProse(line)) {
			break;
		}

		cut = next + line.length;
	}

	if (!PROCESS_ID_PATTERN.test(text.slice(0, cut))) {
		return -1;
	}

	return cut + 1;
}

function afterLabelChain(text: string, labels: { start: number; end: number }[]) {
	let last = labels[0];

	if (!last) {
		return -1;
	}

	for (const label of labels.slice(1)) {
		const gap = text.slice(last.end, label.start);

		if (gap.length > MAX_LABEL_GAP || hasProse(gap)) {
			break;
		}

		last = label;
	}

	if (!PROCESS_ID_PATTERN.test(text.slice(0, last.end))) {
		return -1;
	}

	return findBodyStart(text, last.end);
}

function cutAfterLabels(text: string) {
	const labels = findLabels(text);
	const first = labels[0];

	if (!first || hasProse(text.slice(0, first.start))) {
		return -1;
	}

	if (text.includes("\n") && startOfLine(text, first.start) === first.start) {
		return afterLabelLines(text, labels);
	}

	return afterLabelChain(text, labels);
}

function cutAfterTjspParties(text: string) {
	const header = TJSP_HEADER_PATTERN.exec(text);

	if (!header) {
		return -1;
	}

	let index = 0;

	for (let cursor = header[0].length; text.startsWith(TJSP_SEGMENT_SEPARATOR, cursor); index += 1) {
		const from = cursor + TJSP_SEGMENT_SEPARATOR.length;
		const next = text.indexOf(TJSP_SEGMENT_SEPARATOR, from);
		const segment = text.slice(from, next === -1 ? text.length : next);

		if (findMarker(splitWords(segment), 0) !== -1) {
			return from;
		}

		if (index >= TJSP_SUBJECT_SEGMENTS && hasProse(segment)) {
			return from;
		}

		if (next === -1) {
			return -1;
		}

		cursor = next;
	}

	return -1;
}

function cutAtActHeading(text: string) {
	for (const word of splitWords(text).slice(1)) {
		if (!UPPERCASE_WORD_PATTERN.test(word.text) || !isActMarker(word.text)) {
			continue;
		}

		const header = text.slice(0, word.start);

		if (hasProse(header) || !PROCESS_ID_PATTERN.test(header)) {
			return -1;
		}

		return word.start;
	}

	return -1;
}

function stripOnce(text: string) {
	for (const cut of [cutAfterTjspParties, cutAfterLabels, cutAtActHeading]) {
		const index = cut(text);

		if (index > 0) {
			return text.slice(index).trim();
		}
	}

	return text;
}

export function extractActBody(plain: string) {
	let body = plain.replaceAll(DJE_NOTICE_PATTERN, "").replace(TJSP_LAWYERS_PATTERN, "").trim();

	if (!body) {
		return plain;
	}

	for (let pass = 0; pass < MAX_STRIP_PASSES; pass += 1) {
		const stripped = stripOnce(body);

		if (stripped === body || !stripped) {
			break;
		}

		body = stripped;
	}

	return body;
}

export function summarize(plain: string, max = 300) {
	const single = plain.replaceAll(/\s+/gu, " ").trim();

	if (single.length <= max) {
		return single;
	}

	const cut = single.slice(0, max);
	const lastSpace = cut.lastIndexOf(" ");

	if (lastSpace <= 0) {
		return `${cut.trimEnd()}...`;
	}

	return `${cut.slice(0, lastSpace).trimEnd()}...`;
}

export function contentHash(input: {
	source: string;
	cnj: string | null;
	availableAt: string;
	text: string;
}) {
	return new Bun.CryptoHasher("sha256")
		.update([input.source, input.cnj ?? "", input.availableAt, input.text].join("\n"))
		.digest("hex");
}
