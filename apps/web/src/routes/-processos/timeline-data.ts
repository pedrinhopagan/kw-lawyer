import { addMinutes, format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TimelineItem, TimelinePublication } from "./queries";

const MIDNIGHT = "00:00";

export interface TimelineDay {
	id: string;
	key: string;
	label: string;
	items: TimelineItem[];
}

export function isPublication(item: TimelineItem): item is TimelinePublication {
	return item.source === "publication";
}

export function dateOfSource(movement: { occurredAt: Date; source: string }) {
	if (movement.source !== "publication") {
		return movement.occurredAt;
	}

	return addMinutes(movement.occurredAt, movement.occurredAt.getTimezoneOffset());
}

export function dateOfItem(item: TimelineItem) {
	if (item.source === "publication") {
		return parseISO(item.publication.availableAt);
	}

	return item.occurredAt;
}

export function movementTime(occurredAt: Date) {
	const time = format(occurredAt, "HH:mm");

	if (time === MIDNIGHT) {
		return;
	}

	return time;
}

function dayLabel(date: Date) {
	if (isToday(date)) {
		return "Hoje";
	}

	if (isYesterday(date)) {
		return "Ontem";
	}

	return format(date, "EEE, d MMM yyyy", { locale: ptBR });
}

export function groupByDay(items: TimelineItem[]) {
	const days: TimelineDay[] = [];

	for (const item of items) {
		const date = dateOfItem(item);
		const key = format(date, "yyyy-MM-dd");
		const current = days.at(-1);

		if (current?.key === key) {
			current.items.push(item);
			continue;
		}

		days.push({ id: `${key}-${days.length}`, key, label: dayLabel(date), items: [item] });
	}

	return days;
}
