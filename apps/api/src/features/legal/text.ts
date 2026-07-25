import { toCnjDigits } from "../djen/normalize.ts";

const CNJ_TEXT_PATTERN = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/gu;
const SNIPPET_RADIUS = 240;

export function normalizeForMatch(text: string) {
	const collapsed = text.replaceAll(/\s+/gu, " ");

	return collapsed
		.normalize("NFD")
		.replaceAll(/[\u0300-\u036F]/gu, "")
		.toLowerCase();
}

export function snippetAround(display: string, start: number, radius = SNIPPET_RADIUS) {
	const from = Math.max(0, start - Math.floor(radius / 4));
	const to = Math.min(display.length, start + radius);
	const prefix = from > 0 ? "..." : "";
	const suffix = to < display.length ? "..." : "";

	return `${prefix}${display.slice(from, to).trim()}${suffix}`;
}

export function citedCnjNumbers(text: string, exclude?: string) {
	const found = new Set<string>();

	for (const match of text.matchAll(CNJ_TEXT_PATTERN)) {
		const digits = toCnjDigits(match[0]);

		if (!digits || digits === exclude) {
			continue;
		}

		found.add(digits);
	}

	return [...found];
}

export function firstMatch(text: string, patterns: RegExp[]) {
	for (const pattern of patterns) {
		const match = pattern.exec(text);

		if (match) {
			return { pattern, index: match.index };
		}
	}

	return null;
}

export function matchesAny(text: string, patterns: RegExp[]) {
	for (const pattern of patterns) {
		if (pattern.test(text)) {
			return true;
		}
	}

	return false;
}
