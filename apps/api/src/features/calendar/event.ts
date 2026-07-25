import { createHash } from "node:crypto";
import type { cases } from "../../db/schema/cases.ts";
import type { deadlines } from "../../db/schema/deadlines.ts";
import { env } from "../../env.ts";
import { addDays } from "../deadlines/calendar.ts";
import type { GoogleEventPayload } from "./google/events.ts";

const EVENT_COLOR_OVERDUE = "11";
const EVENT_COLOR_URGENT = "6";
const EVENT_COLOR_SOON = "5";
const EVENT_COLOR_PLANNED = "9";
const EVENT_URGENT_WINDOW_DAYS = 3;
const EVENT_SOON_WINDOW_DAYS = 7;
const EVENT_REMINDER_MINUTES = [3 * 24 * 60, 24 * 60];
const EVENT_SNIPPET_MAX_LENGTH = 900;

export interface DeadlineEventInput {
	deadline: Pick<
		typeof deadlines.$inferSelect,
		"title" | "days" | "unit" | "dueAt" | "basis" | "snippet" | "warnings"
	>;
	case: Pick<typeof cases.$inferSelect, "formattedNumber" | "tribunal" | "orgName"> | null;
	today: string;
}

function colorIdFor(params: { dueAt: string; today: string }) {
	if (params.dueAt <= params.today) {
		return EVENT_COLOR_OVERDUE;
	}

	if (params.dueAt <= addDays(params.today, EVENT_URGENT_WINDOW_DAYS)) {
		return EVENT_COLOR_URGENT;
	}

	if (params.dueAt <= addDays(params.today, EVENT_SOON_WINDOW_DAYS)) {
		return EVENT_COLOR_SOON;
	}

	return EVENT_COLOR_PLANNED;
}

function countingLabel(deadline: Pick<typeof deadlines.$inferSelect, "days" | "unit">) {
	if (deadline.days <= 0) {
		return null;
	}

	const unit = deadline.unit === "corridos" ? "corridos" : "úteis";

	return `Prazo: ${deadline.days} ${deadline.days === 1 ? "dia" : "dias"} ${unit}`;
}

function truncate(text: string) {
	if (text.length <= EVENT_SNIPPET_MAX_LENGTH) {
		return text;
	}

	return `${text.slice(0, EVENT_SNIPPET_MAX_LENGTH).trimEnd()}...`;
}

function descriptionFor(input: DeadlineEventInput) {
	const warnings = input.deadline.warnings.map((warning) => `- ${warning}`);

	return [
		countingLabel(input.deadline),
		input.deadline.basis ? `Fundamento: ${input.deadline.basis}` : null,
		input.case?.tribunal ? `Tribunal: ${input.case.tribunal}` : null,
		input.case?.orgName ? `Órgão: ${input.case.orgName}` : null,
		input.deadline.snippet ? `\nPublicação:\n${truncate(input.deadline.snippet)}` : null,
		warnings.length ? `\nAvisos:\n${warnings.join("\n")}` : null,
		`\nAbrir na agenda: ${env.APP_BASE_URL}/agenda`,
	]
		.filter((line) => !!line)
		.join("\n");
}

export function buildDeadlineEvent(input: DeadlineEventInput) {
	const event: GoogleEventPayload = {
		summary: [input.deadline.title, input.case?.formattedNumber]
			.filter((part) => !!part?.trim())
			.join(" - "),
		description: descriptionFor(input),
		start: { date: input.deadline.dueAt },
		end: { date: addDays(input.deadline.dueAt, 1) },
		transparency: "transparent",
		colorId: colorIdFor({ dueAt: input.deadline.dueAt, today: input.today }),
		reminders: {
			useDefault: false,
			overrides: EVENT_REMINDER_MINUTES.map((minutes) => ({ method: "popup", minutes })),
		},
	};

	return {
		event,
		contentHash: createHash("sha256").update(JSON.stringify(event)).digest("hex"),
	};
}
