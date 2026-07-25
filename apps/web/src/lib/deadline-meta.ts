import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const ISO_DATE = "yyyy-MM-dd";

export type UrgencyLevel = "vencido" | "hoje" | "proximo" | "futuro";

export function todayIso() {
	const now = new Date();

	return format(now, ISO_DATE);
}

export function daysUntil(dueAt: string) {
	const due = parseISO(dueAt);

	return differenceInCalendarDays(due, new Date());
}

export function urgencyOf(dueAt: string): UrgencyLevel {
	const distance = daysUntil(dueAt);

	if (distance < 0) {
		return "vencido";
	}

	if (distance === 0) {
		return "hoje";
	}

	if (distance <= 3) {
		return "proximo";
	}

	return "futuro";
}

export function countdownLabel(dueAt: string) {
	const distance = daysUntil(dueAt);

	if (distance < -1) {
		return `venceu há ${Math.abs(distance)} dias`;
	}

	if (distance === -1) {
		return "venceu ontem";
	}

	if (distance === 0) {
		return "vence hoje";
	}

	if (distance === 1) {
		return "vence amanhã";
	}

	return `faltam ${distance} dias`;
}

export function fullDate(value: string) {
	const date = parseISO(value);

	return format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function dayNumber(value: string) {
	const date = parseISO(value);

	return format(date, "dd");
}

export function monthLabel(value: string) {
	const date = parseISO(value);

	return format(date, "MMM", { locale: ptBR }).replace(".", "");
}

export function weekdayLabel(value: string) {
	const date = parseISO(value);

	return format(date, "EEEE", { locale: ptBR });
}

export function shortDate(value: string) {
	const date = parseISO(value);

	return format(date, "dd/MM/yyyy");
}

export function actDate(value: string | Date) {
	if (typeof value === "string") {
		return format(parseISO(value), "dd/MM/yyyy");
	}

	return format(value, "dd/MM/yyyy");
}

export const STATUS_LABELS = {
	a_confirmar: "A confirmar",
	confirmado: "Confirmado",
	cumprido: "Cumprido",
	descartado: "Descartado",
} as const;

export const CONFIDENCE_LABELS = {
	alta: "Leitura segura",
	media: "Confira o texto",
	baixa: "Leitura frágil",
} as const;

export const UNIT_LABELS = {
	uteis: "dias úteis",
	corridos: "dias corridos",
} as const;

export const AUDIENCE_LABELS = {
	partes: "prazo das partes",
	terceiro: "prazo de terceiro",
	indefinido: "destinatário não identificado",
} as const;
