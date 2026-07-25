import {
	addDays,
	assertDate,
	type ForensicCalendar,
	type NonBusinessDay,
	weekdayOf,
} from "./calendar.ts";

const MAX_SCAN_DAYS = 400;

export type CountingUnit = "uteis" | "corridos";

export interface CountingStep {
	date: string;
	counted: boolean;
	position: number | null;
	reason: string | null;
}

export interface DeadlineCalculation {
	availableAt: string;
	publishedAt: string;
	startsAt: string;
	dueAt: string;
	expectedDueAt: string;
	days: number;
	unit: CountingUnit;
	multiplier: number;
	steps: CountingStep[];
	warnings: string[];
}

function nonBusinessOn(calendar: ForensicCalendar, date: string, strict: boolean) {
	const weekday = weekdayOf(date);

	if (weekday === 0) {
		return { reason: "Domingo", certainty: "certa" } satisfies NonBusinessDay;
	}

	if (weekday === 6) {
		return { reason: "Sábado", certainty: "certa" } satisfies NonBusinessDay;
	}

	const suspension = calendar.suspensionOn(date);

	if (suspension && (!strict || suspension.certainty === "certa")) {
		return suspension;
	}

	const holiday = calendar.holidayOn(date);

	if (holiday && (!strict || holiday.certainty === "certa")) {
		return holiday;
	}

	return null;
}

function nextBusinessDay(calendar: ForensicCalendar, from: string, strict: boolean) {
	for (let offset = 0; offset < MAX_SCAN_DAYS; offset += 1) {
		const date = addDays(from, offset);

		if (!nonBusinessOn(calendar, date, strict)) {
			return date;
		}
	}

	throw new Error(`Não foi possível achar dia útil a partir de ${from}.`);
}

function countBusinessDays(input: {
	calendar: ForensicCalendar;
	startsAt: string;
	days: number;
	unit: CountingUnit;
	strict: boolean;
}) {
	const steps: CountingStep[] = [];
	let counted = 0;
	let cursor = input.startsAt;

	if (input.unit === "corridos") {
		const rawDue = addDays(input.startsAt, input.days - 1);
		const dueAt = nextBusinessDay(input.calendar, rawDue, input.strict);

		steps.push({ date: input.startsAt, counted: true, position: 1, reason: "Início da contagem" });

		if (dueAt !== rawDue) {
			steps.push({
				date: rawDue,
				counted: true,
				position: input.days,
				reason: `Vencimento em dia não útil, prorrogado para ${dueAt} (CPC, art. 224, parágrafo 1)`,
			});
		}

		steps.push({ date: dueAt, counted: true, position: input.days, reason: "Vencimento" });

		return { dueAt, steps };
	}

	for (let offset = 0; offset < MAX_SCAN_DAYS; offset += 1) {
		cursor = addDays(input.startsAt, offset);

		const blocked = nonBusinessOn(input.calendar, cursor, input.strict);

		if (blocked) {
			steps.push({ date: cursor, counted: false, position: null, reason: blocked.reason });
			continue;
		}

		counted += 1;
		steps.push({ date: cursor, counted: true, position: counted, reason: null });

		if (counted === input.days) {
			return { dueAt: cursor, steps };
		}
	}

	throw new Error(
		`Contagem de ${input.days} dias úteis a partir de ${input.startsAt} não terminou.`,
	);
}

export function calculateDeadline(input: {
	calendar: ForensicCalendar;
	availableAt: string;
	days: number;
	unit?: CountingUnit;
	multiplier?: number;
}): DeadlineCalculation {
	assertDate(input.availableAt);

	const unit = input.unit ?? "uteis";
	const multiplier = input.multiplier ?? 1;
	const days = input.days * multiplier;

	if (!Number.isInteger(days) || days < 1) {
		throw new Error(`Quantidade de dias inválida: ${input.days}.`);
	}

	const runScenario = (strict: boolean) => {
		const publishedAt = nextBusinessDay(input.calendar, addDays(input.availableAt, 1), strict);
		const startsAt = nextBusinessDay(input.calendar, addDays(publishedAt, 1), strict);
		const counted = countBusinessDays({ calendar: input.calendar, startsAt, days, unit, strict });

		return { publishedAt, startsAt, ...counted };
	};

	const strict = runScenario(true);
	const expected = runScenario(false);

	const warnings: string[] = [];

	if (strict.dueAt !== expected.dueAt) {
		warnings.push(
			`Feriado provável no caminho: a data limite pode ser ${expected.dueAt}, mas a agenda usa ${strict.dueAt} para não depender de calendário não confirmado.`,
		);
	}

	if (!input.calendar.profile.jurisdiction) {
		warnings.push(
			`Tribunal ${input.calendar.profile.tribunal ?? "desconhecido"} não tem calendário forense mapeado. Confira feriados locais.`,
		);
	} else if (!input.calendar.profile.stateCalendarChecked) {
		warnings.push(
			"Calendário estadual do tribunal não conferido. Feriado local pode alterar a data limite.",
		);
	}

	if (unit === "corridos") {
		warnings.push(
			"Prazo contado em dias corridos: a suspensão de 20/12 a 20/01 não foi aplicada. Confirme se o prazo é material.",
		);
	}

	return {
		availableAt: input.availableAt,
		publishedAt: strict.publishedAt,
		startsAt: strict.startsAt,
		dueAt: strict.dueAt,
		expectedDueAt: expected.dueAt,
		days,
		unit,
		multiplier,
		steps: strict.steps,
		warnings,
	};
}
