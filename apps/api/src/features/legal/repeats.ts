import { normalizeForMatch } from "./text.ts";

const REPUBLICATION_PREFIX = /^(texto )?republica\w*[^.]{0,120}\./u;
const ADDRESSEE_TAIL = /(citado\(s\)|intimado\(s\)|advs?\.?:|adv\.?:|destinatario)/u;
const KEY_LENGTH = 140;

export function actKeyOf(input: {
	occurredAt: Date;
	traits: (string | null | undefined)[];
	snippet: string;
}) {
	const act = normalizeForMatch(input.snippet).replace(REPUBLICATION_PREFIX, "");
	const tail = ADDRESSEE_TAIL.exec(act);
	const body = act
		.slice(0, tail?.index)
		.replaceAll(/[^a-z0-9]/gu, "")
		.slice(0, KEY_LENGTH);

	return [
		input.occurredAt.toISOString().slice(0, 10),
		...input.traits.map((trait) => trait ?? ""),
		body,
	].join("|");
}

export function withoutRepeatedActs<T>(rows: T[], keyOf: (row: T) => string) {
	const seen = new Set<string>();
	const kept: T[] = [];

	for (const row of rows) {
		const key = keyOf(row);

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		kept.push(row);
	}

	return kept;
}
