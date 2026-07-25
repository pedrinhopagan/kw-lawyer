import {
	addMonths,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	parseISO,
	startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const ISO_DATE = "yyyy-MM-dd";

export function groupByDueDate<Item extends { dueAt: string }>(items: Item[]) {
	const groups: { dueAt: string; items: Item[] }[] = [];

	for (const item of items) {
		const last = groups.at(-1);

		if (last?.dueAt === item.dueAt) {
			last.items.push(item);
			continue;
		}

		groups.push({ dueAt: item.dueAt, items: [item] });
	}

	return groups;
}

export const AUDIENCE_CHOICES = {
	partes: "Das partes",
	terceiro: "De terceiro",
	indefinido: "Não identificado",
} as const;

export const CONFIDENCE_CHOICES = {
	alta: "Alta",
	media: "Média",
	baixa: "Baixa",
} as const;

export const ORIGIN_CHOICES = {
	automatico: "Lida da publicação",
	manual: "Criada à mão",
} as const;

export const WEEKDAY_INITIALS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

export function pluralOf(total: number) {
	return total === 1 ? "" : "s";
}

export function monthTitle(month: string) {
	const first = parseISO(`${month}-01`);

	return format(first, "MMMM 'de' yyyy", { locale: ptBR });
}

export function shiftedMonth(month: string, delta: number) {
	const shifted = addMonths(parseISO(`${month}-01`), delta);

	return format(shifted, "yyyy-MM");
}

export function currentMonth() {
	const now = new Date();

	return format(now, "yyyy-MM");
}

function monthGridBounds(month: string) {
	const first = parseISO(`${month}-01`);

	return {
		start: startOfWeek(first, { locale: ptBR }),
		end: endOfWeek(endOfMonth(first), { locale: ptBR }),
	};
}

export function monthGridDays(month: string) {
	return eachDayOfInterval(monthGridBounds(month)).map((day) => format(day, ISO_DATE));
}

export function monthGridRange(month: string) {
	const { start, end } = monthGridBounds(month);

	return { from: format(start, ISO_DATE), to: format(end, ISO_DATE) };
}
