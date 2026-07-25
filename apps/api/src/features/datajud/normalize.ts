const AJUIZAMENTO_LENGTH = 14;
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

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

export function parseInstant(value: string | null | undefined) {
	if (!value?.trim()) {
		return null;
	}

	const parsed = new Date(value);

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
