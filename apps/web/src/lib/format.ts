import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const CNJ_LENGTH = 20;
const RELATIVE_WINDOW_DAYS = 6;
const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);
const NAME_INITIALS_PATTERN = /^(?:\p{L}\.)+$/u;

export function formatCnj(value: string) {
	const digits = value.replaceAll(/\D/gu, "");

	if (digits.length !== CNJ_LENGTH) {
		return value;
	}

	return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

export function formatEventDate(value: Date | string) {
	const date = typeof value === "string" ? parseISO(value) : value;
	const distance = differenceInCalendarDays(new Date(), date);

	if (distance >= 0 && distance <= RELATIVE_WINDOW_DAYS) {
		return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
	}

	return format(date, "d MMM yyyy", { locale: ptBR });
}

export function formatOab(lawyer: { oabNumber: string; oabUf: string }) {
	return `OAB/${lawyer.oabUf} ${lawyer.oabNumber}`;
}

export function formatPersonName(name: string) {
	return name
		.trim()
		.split(/\s+/u)
		.map((word, index) => {
			if (NAME_INITIALS_PATTERN.test(word)) {
				return word.toLocaleUpperCase("pt-BR");
			}

			const lower = word.toLocaleLowerCase("pt-BR");

			if (index > 0 && NAME_PARTICLES.has(lower)) {
				return lower;
			}

			return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
		})
		.join(" ");
}

export function initialsOf(name: string) {
	const words = name
		.trim()
		.split(/\s+/u)
		.filter((word) => word.length > 1);

	const first = words.at(0)?.charAt(0) ?? name.charAt(0);
	const last = words.length > 1 ? (words.at(-1)?.charAt(0) ?? "") : "";

	return `${first}${last}`.toUpperCase();
}
