const AJUIZAMENTO_LENGTH = 14;
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const BRASILIA_OFFSET = "-03:00";
const TIMEZONE_PATTERN = /(z|[+-]\d{2}:?\d{2})$/iu;
const SHORT_OFFSET_PATTERN = /[+-]\d{2}$/u;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function parseAjuizamento(value: string | null | undefined) {
	const digits = value?.trim() ?? "";

	if (digits.length !== AJUIZAMENTO_LENGTH || !/^\d+$/u.test(digits)) {
		return null;
	}

	const year = Number(digits.slice(0, 4));
	const month = Number(digits.slice(4, 6));
	const day = Number(digits.slice(6, 8));
	const hour = Number(digits.slice(8, 10));
	const minute = Number(digits.slice(10, 12));
	const second = Number(digits.slice(12, 14));
	const brasilia = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

	if (
		brasilia.getUTCFullYear() !== year ||
		brasilia.getUTCMonth() !== month - 1 ||
		brasilia.getUTCDate() !== day ||
		brasilia.getUTCHours() !== hour ||
		brasilia.getUTCMinutes() !== minute ||
		brasilia.getUTCSeconds() !== second
	) {
		return null;
	}

	return new Date(brasilia.getTime() + BRASILIA_OFFSET_MS);
}

function withBrasiliaOffset(text: string) {
	if (DATE_ONLY_PATTERN.test(text)) {
		return `${text}T00:00:00${BRASILIA_OFFSET}`;
	}

	if (TIMEZONE_PATTERN.test(text)) {
		return text;
	}

	// "+03" é fuso válido em ISO 8601 e o JavaScript não lê: sem completar os minutos, o carimbo
	// viraria data inválida e o movimento seria descartado por engano.
	if (SHORT_OFFSET_PATTERN.test(text)) {
		return `${text}:00`;
	}

	return `${text}${BRASILIA_OFFSET}`;
}

// O DataJud também devolve carimbo sem fuso, e aí o JS leria como hora do servidor: em Brasília o
// ato andaria até 3h e um movimento da madrugada mudaria de dia, o que muda a contagem do prazo.
export function parseInstant(value: string | null | undefined) {
	const text = value?.trim().replace(" ", "T");

	if (!text) {
		return null;
	}

	const parsed = new Date(withBrasiliaOffset(text));

	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed;
}

export function toCodeText(value: string | number | null | undefined) {
	if (value === null || value === undefined) {
		return null;
	}

	const text = String(value).trim();

	if (!text) {
		return null;
	}

	return text;
}

export function toLabel(value: string | null | undefined) {
	const label = value?.trim();

	if (!label) {
		return null;
	}

	return label;
}
