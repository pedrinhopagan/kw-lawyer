const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
export const FORENSIC_TIME_ZONE = "America/Sao_Paulo";

export type DayCertainty = "certa" | "provavel";

export type Jurisdiction =
	| "federal"
	| "superior"
	| "trabalho"
	| "estadual"
	| "eleitoral"
	| "militar";

export interface NonBusinessDay {
	reason: string;
	certainty: DayCertainty;
}

export interface CalendarProfile {
	tribunal: string | null;
	jurisdiction: Jurisdiction | null;
	ufs: string[];
	stateCalendarChecked: boolean;
}

const TRT_UFS: Record<string, string[]> = {
	"1": ["RJ"],
	"2": ["SP"],
	"3": ["MG"],
	"4": ["RS"],
	"5": ["BA"],
	"6": ["PE"],
	"7": ["CE"],
	"8": ["PA", "AP"],
	"9": ["PR"],
	"10": ["DF", "TO"],
	"11": ["AM", "RR"],
	"12": ["SC"],
	"13": ["PB"],
	"14": ["RO", "AC"],
	"15": ["SP"],
	"16": ["MA"],
	"17": ["ES"],
	"18": ["GO"],
	"19": ["AL"],
	"20": ["SE"],
	"21": ["RN"],
	"22": ["PI"],
	"23": ["MT"],
	"24": ["MS"],
};

const TRF_UFS: Record<string, string[]> = {
	"1": ["DF", "AC", "AM", "AP", "BA", "GO", "MA", "MG", "MT", "PA", "PI", "RO", "RR", "TO"],
	"2": ["RJ", "ES"],
	"3": ["SP", "MS"],
	"4": ["RS", "SC", "PR"],
	"5": ["AL", "CE", "PB", "PE", "RN", "SE"],
	"6": ["MG"],
};

const STATE_HOLIDAYS: Record<string, { day: string; name: string }[]> = {
	AC: [{ day: "06-15", name: "Aniversário do Acre" }],
	AL: [
		{ day: "06-24", name: "São João" },
		{ day: "09-16", name: "Emancipação política de Alagoas" },
	],
	AM: [{ day: "09-05", name: "Elevação do Amazonas a província" }],
	AP: [{ day: "09-13", name: "Criação do Território Federal do Amapá" }],
	BA: [{ day: "07-02", name: "Independência da Bahia" }],
	CE: [{ day: "03-25", name: "Abolição da escravidão no Ceará" }],
	DF: [{ day: "11-30", name: "Dia do Evangélico" }],
	ES: [],
	GO: [],
	MA: [{ day: "07-28", name: "Adesão do Maranhão à independência" }],
	MG: [],
	MS: [{ day: "10-11", name: "Criação do estado de Mato Grosso do Sul" }],
	MT: [],
	PA: [{ day: "08-15", name: "Adesão do Pará à independência" }],
	PB: [{ day: "08-05", name: "Fundação do estado da Paraíba" }],
	PE: [{ day: "03-06", name: "Revolução Pernambucana" }],
	PI: [{ day: "10-19", name: "Dia do Piauí" }],
	PR: [{ day: "12-19", name: "Emancipação política do Paraná" }],
	RJ: [{ day: "04-23", name: "São Jorge" }],
	RN: [{ day: "10-03", name: "Mártires de Cunhaú e Uruaçu" }],
	RO: [{ day: "01-04", name: "Criação do estado de Rondônia" }],
	RR: [{ day: "10-05", name: "Criação do estado de Roraima" }],
	RS: [{ day: "09-20", name: "Revolução Farroupilha" }],
	SC: [],
	SE: [{ day: "07-08", name: "Emancipação política de Sergipe" }],
	SP: [{ day: "07-09", name: "Revolução Constitucionalista" }],
	TO: [{ day: "10-05", name: "Criação do estado do Tocantins" }],
};

export function assertDate(date: string) {
	if (!DATE_PATTERN.test(date)) {
		throw new Error(`Data inválida: ${date}. Esperado YYYY-MM-DD.`);
	}

	return date;
}

function toTimestamp(date: string) {
	assertDate(date);

	const [year, month, day] = date.split("-").map(Number);

	return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export function toDateString(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
	const shifted = toTimestamp(date) + days * MS_PER_DAY;

	return toDateString(shifted);
}

export function weekdayOf(date: string) {
	const parsed = new Date(toTimestamp(date));

	return parsed.getUTCDay();
}

export function easterSunday(year: number) {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;

	return toDateString(Date.UTC(year, month - 1, day));
}

function nationalHolidays(year: number) {
	const easter = easterSunday(year);
	const fixed = [
		["01-01", "Confraternização Universal"],
		["04-21", "Tiradentes"],
		["05-01", "Dia do Trabalho"],
		["09-07", "Independência"],
		["10-12", "Nossa Senhora Aparecida"],
		["11-02", "Finados"],
		["11-15", "Proclamação da República"],
		["11-20", "Consciência Negra"],
		["12-25", "Natal"],
	] as const;

	const days = new Map<string, NonBusinessDay>();

	for (const [day, reason] of fixed) {
		days.set(`${year}-${day}`, { reason, certainty: "certa" });
	}

	days.set(addDays(easter, -2), { reason: "Sexta-feira Santa", certainty: "certa" });

	return days;
}

function carnivalDays(year: number) {
	const easter = easterSunday(year);

	return [
		{ date: addDays(easter, -48), reason: "Carnaval", forensic: true },
		{ date: addDays(easter, -47), reason: "Carnaval", forensic: true },
		{ date: addDays(easter, -46), reason: "Quarta-feira de Cinzas", forensic: false },
	];
}

function forensicHolidays(year: number) {
	const easter = easterSunday(year);

	return [
		{ date: addDays(easter, -3), reason: "Quarta-feira da Semana Santa (Lei 5.010/66, art. 62)" },
		{ date: `${year}-08-11`, reason: "Dia do Advogado (Lei 5.010/66, art. 62)" },
		{ date: `${year}-11-01`, reason: "Dia de Todos os Santos (Lei 5.010/66, art. 62)" },
		{ date: `${year}-12-08`, reason: "Dia da Justiça (Lei 5.010/66, art. 62)" },
		{ date: addDays(easter, 60), reason: "Corpus Christi" },
	];
}

export function profileOf(tribunal: string | null): CalendarProfile {
	const sigla = tribunal?.trim().toUpperCase() ?? "";

	if (!sigla) {
		return { tribunal: null, jurisdiction: null, ufs: [], stateCalendarChecked: false };
	}

	const trt = sigla.match(/^TRT[ -]?(\d{1,2})$/u);

	if (trt?.[1]) {
		const ufs = TRT_UFS[String(Number(trt[1]))] ?? [];

		return { tribunal: sigla, jurisdiction: "trabalho", ufs, stateCalendarChecked: ufs.length > 0 };
	}

	const trf = sigla.match(/^TRF[ -]?(\d)$/u);

	if (trf?.[1]) {
		const ufs = TRF_UFS[trf[1]] ?? [];

		return { tribunal: sigla, jurisdiction: "federal", ufs, stateCalendarChecked: false };
	}

	const tj = sigla.match(/^TJ([A-Z]{2})$/u);

	if (tj?.[1]) {
		const uf = tj[1];

		return {
			tribunal: sigla,
			jurisdiction: "estadual",
			ufs: [uf],
			stateCalendarChecked: uf in STATE_HOLIDAYS,
		};
	}

	if (sigla === "STF" || sigla === "STJ" || sigla === "TST" || sigla === "STM") {
		return { tribunal: sigla, jurisdiction: "superior", ufs: ["DF"], stateCalendarChecked: true };
	}

	if (sigla === "TSE" || /^TRE[A-Z]{2}$/u.test(sigla)) {
		return {
			tribunal: sigla,
			jurisdiction: "eleitoral",
			ufs: sigla === "TSE" ? ["DF"] : [sigla.slice(3)],
			stateCalendarChecked: false,
		};
	}

	if (/^TJM[A-Z]{2}$/u.test(sigla)) {
		return {
			tribunal: sigla,
			jurisdiction: "militar",
			ufs: [sigla.slice(3)],
			stateCalendarChecked: false,
		};
	}

	return { tribunal: sigla, jurisdiction: null, ufs: [], stateCalendarChecked: false };
}

const FEDERAL_REGIMES = new Set<Jurisdiction>(["federal", "superior", "eleitoral"]);

function holidaysFor(profile: CalendarProfile, year: number) {
	const days = nationalHolidays(year);
	const federalRegime = !!profile.jurisdiction && FEDERAL_REGIMES.has(profile.jurisdiction);

	for (const day of carnivalDays(year)) {
		days.set(day.date, {
			reason: day.reason,
			certainty: federalRegime && day.forensic ? "certa" : "provavel",
		});
	}

	for (const day of forensicHolidays(year)) {
		if (days.has(day.date)) {
			continue;
		}

		days.set(day.date, { reason: day.reason, certainty: federalRegime ? "certa" : "provavel" });
	}

	for (const uf of profile.ufs) {
		for (const holiday of STATE_HOLIDAYS[uf] ?? []) {
			const date = `${year}-${holiday.day}`;

			if (days.has(date)) {
				continue;
			}

			days.set(date, { reason: `${holiday.name} (${uf})`, certainty: "provavel" });
		}
	}

	return days;
}

export interface CuratedDay {
	date: string;
	reason: string;
	kind: "feriado" | "suspensao";
	certainty: DayCertainty;
}

export interface ForensicCalendar {
	profile: CalendarProfile;
	holidayOn: (date: string) => NonBusinessDay | null;
	suspensionOn: (date: string) => NonBusinessDay | null;
}

export function isRecessDay(date: string) {
	const monthDay = date.slice(5);

	return monthDay >= "12-20" || monthDay <= "01-20";
}

export function createForensicCalendar(input: {
	tribunal: string | null;
	curatedDays: CuratedDay[];
}): ForensicCalendar {
	const profile = profileOf(input.tribunal);
	const cache = new Map<number, Map<string, NonBusinessDay>>();
	const curatedHolidays = new Map<string, NonBusinessDay>();
	const curatedSuspensions = new Map<string, NonBusinessDay>();

	for (const day of input.curatedDays) {
		const target = day.kind === "suspensao" ? curatedSuspensions : curatedHolidays;

		target.set(assertDate(day.date), { reason: day.reason, certainty: day.certainty });
	}

	return {
		profile,
		holidayOn(date) {
			const curated = curatedHolidays.get(date);

			if (curated) {
				return curated;
			}

			const year = Number(date.slice(0, 4));
			const cached = cache.get(year) ?? holidaysFor(profile, year);

			cache.set(year, cached);

			const holiday = cached.get(date);

			return holiday ? holiday : null;
		},
		suspensionOn(date) {
			const curated = curatedSuspensions.get(date);

			if (curated) {
				return curated;
			}

			if (isRecessDay(date)) {
				return {
					reason: "Suspensão de 20/12 a 20/01 (CPC, art. 220)",
					certainty: "certa",
				};
			}

			return null;
		},
	};
}
