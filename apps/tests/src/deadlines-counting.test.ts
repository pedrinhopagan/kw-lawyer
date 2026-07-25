import { createForensicCalendar } from "@kw-lawyer/api/src/features/deadlines/calendar.ts";
import { calculateDeadline } from "@kw-lawyer/api/src/features/deadlines/counting.ts";
import { detectDeadline } from "@kw-lawyer/api/src/features/deadlines/extract.ts";
import { expect, test } from "bun:test";

const tjsp = createForensicCalendar({ tribunal: "TJSP", curatedDays: [] });
const trf3 = createForensicCalendar({ tribunal: "TRF3", curatedDays: [] });

test("publicação é o dia útil seguinte à disponibilização e a contagem começa no dia seguinte", () => {
	const calculation = calculateDeadline({
		calendar: tjsp,
		availableAt: "2026-07-24",
		days: 15,
	});

	expect(calculation.publishedAt).toBe("2026-07-27");
	expect(calculation.startsAt).toBe("2026-07-28");
	expect(calculation.dueAt).toBe("2026-08-17");
});

test("feriado forense provável não encurta a agenda, só aparece como data limite provável", () => {
	const calculation = calculateDeadline({
		calendar: tjsp,
		availableAt: "2026-07-24",
		days: 15,
	});

	expect(calculation.expectedDueAt).toBe("2026-08-18");
	expect(calculation.warnings.some((warning) => warning.includes("2026-08-18"))).toBe(true);
});

test("na Justiça Federal o Dia do Advogado é feriado certo e entra na data da agenda", () => {
	const calculation = calculateDeadline({
		calendar: trf3,
		availableAt: "2026-08-03",
		days: 8,
	});

	expect(calculation.publishedAt).toBe("2026-08-04");
	expect(calculation.startsAt).toBe("2026-08-05");
	expect(calculation.dueAt).toBe("2026-08-17");
	expect(calculation.expectedDueAt).toBe("2026-08-17");
});

test("suspensão de 20/12 a 20/01 não conta e o prazo retoma depois", () => {
	const calculation = calculateDeadline({
		calendar: tjsp,
		availableAt: "2025-12-18",
		days: 15,
	});

	expect(calculation.publishedAt).toBe("2025-12-19");
	expect(calculation.startsAt).toBe("2026-01-21");
	expect(calculation.dueAt).toBe("2026-02-10");
});

test("publicação dentro da suspensão protrai o termo inicial para depois de 20 de janeiro", () => {
	const calculation = calculateDeadline({
		calendar: tjsp,
		availableAt: "2025-12-26",
		days: 5,
	});

	expect(calculation.publishedAt).toBe("2026-01-21");
	expect(calculation.startsAt).toBe("2026-01-22");
	expect(calculation.dueAt).toBe("2026-01-28");
});

test("feriado nacional no meio da contagem é pulado com o motivo registrado", () => {
	const calculation = calculateDeadline({
		calendar: tjsp,
		availableAt: "2026-08-28",
		days: 5,
	});

	expect(calculation.dueAt).toBe("2026-09-08");
	expect(calculation.steps.find((step) => step.date === "2026-09-07")).toEqual({
		date: "2026-09-07",
		counted: false,
		position: null,
		reason: "Independência",
	});
});

test("prazo em dobro conta o dobro de dias, não o dobro da data", () => {
	const calculation = calculateDeadline({
		calendar: tjsp,
		availableAt: "2026-07-24",
		days: 15,
		multiplier: 2,
	});

	expect(calculation.days).toBe(30);
	expect(calculation.dueAt).toBe("2026-09-08");
});

test("a memória de cálculo conta exatamente os dias do prazo", () => {
	const calculation = calculateDeadline({
		calendar: tjsp,
		availableAt: "2026-07-24",
		days: 15,
	});
	const counted = calculation.steps.filter((step) => step.counted);

	expect(counted).toHaveLength(15);
	expect(counted.at(0)?.date).toBe(calculation.startsAt);
	expect(counted.at(-1)?.date).toBe(calculation.dueAt);
});

test("data inválida não vira prazo silencioso", () => {
	expect(() => calculateDeadline({ calendar: tjsp, availableAt: "24/07/2026", days: 5 })).toThrow();
	expect(() => calculateDeadline({ calendar: tjsp, availableAt: "2026-07-24", days: 0 })).toThrow();
});

test("tribunal sem calendário mapeado avisa em vez de fingir certeza", () => {
	const unknown = calculateDeadline({
		calendar: createForensicCalendar({ tribunal: "ABC", curatedDays: [] }),
		availableAt: "2026-07-24",
		days: 5,
	});

	expect(unknown.warnings.some((warning) => warning.includes("Confira feriados locais"))).toBe(
		true,
	);

	const uncheckedState = calculateDeadline({
		calendar: createForensicCalendar({ tribunal: "TJXX", curatedDays: [] }),
		availableAt: "2026-07-24",
		days: 5,
	});

	expect(uncheckedState.warnings.some((warning) => warning.includes("Calendário estadual"))).toBe(
		true,
	);
});

test("dia curado no banco entra no calendário do tribunal", () => {
	const calculation = calculateDeadline({
		calendar: createForensicCalendar({
			tribunal: "TJSP",
			curatedDays: [
				{
					date: "2026-07-30",
					reason: "Suspensão de expediente (Portaria 1/2026)",
					kind: "suspensao",
					certainty: "certa",
				},
			],
		}),
		availableAt: "2026-07-24",
		days: 5,
	});

	expect(calculation.dueAt).toBe("2026-08-04");
	expect(calculation.steps.find((step) => step.date === "2026-07-30")?.reason).toBe(
		"Suspensão de expediente (Portaria 1/2026)",
	);
});

test("prazo escrito em algarismo e por extenso divergentes usa o menor", () => {
	const detection = detectDeadline({
		textPlain: "Manifeste-se a parte autora, no prazo de 15 (cinco) dias, sobre a certidão.",
		documentType: "Despacho",
		communicationType: "Intimação",
	});

	expect(detection.primary?.days).toBe(5);
	expect(detection.reviewReasons.some((reason) => reason.includes("Divergência"))).toBe(true);
});

test("publicação com mais de um prazo marca o mais curto e avisa", () => {
	const detection = detectDeadline({
		textPlain:
			"Intime-se o exequente para, no prazo de 15 (quinze) dias, juntar planilha. Após, manifeste-se o executado no prazo de 5 (cinco) dias.",
		documentType: "Despacho",
		communicationType: "Intimação",
	});

	expect(detection.primary?.days).toBe(5);
	expect(detection.reviewReasons.some((reason) => reason.includes("mais de um prazo"))).toBe(true);
});

test("prazo de perito é reconhecido como de terceiro", () => {
	const detection = detectDeadline({
		textPlain: "Fixo o prazo de 60 dias para que o perito contábil apresente o laudo.",
		documentType: "Despacho",
		communicationType: "Intimação",
	});

	expect(detection.primary?.audience).toBe("terceiro");
	expect(detection.confidence).toBe("baixa");
});

test("prazo por extenso sem algarismo é detectado", () => {
	const detection = detectDeadline({
		textPlain: "Intimem-se as partes para manifestação em quinze dias.",
		documentType: "Despacho",
		communicationType: "Intimação",
	});

	expect(detection.primary?.days).toBe(15);
	expect(detection.primary?.audience).toBe("partes");
});

test("ato conhecido sem número de dias não inventa prazo", () => {
	const detection = detectDeadline({
		textPlain: "Vistos. Recebo a apelação nos efeitos devolutivo e suspensivo.",
		documentType: "Despacho",
		communicationType: "Intimação",
	});

	expect(detection.primary).toBeNull();
	expect(detection.needsReview).toBe(true);
});

test("número solto sem contexto de prazo não vira prazo", () => {
	const detection = detectDeadline({
		textPlain: "O infante conta atualmente com 06 meses, conforme certidão de nascimento à fl. 17.",
		documentType: "Sentença",
		communicationType: "Intimação",
	});

	expect(detection.primary).toBeNull();
});

test("prazo em horas não entra na contagem em dias", () => {
	const detection = detectDeadline({
		textPlain: "Cumpra-se no prazo de 48 horas, sob pena de multa.",
		documentType: "Decisão",
		communicationType: "Intimação",
	});

	expect(detection.primary?.unit).toBe("horas");
	expect(detection.confidence).toBe("baixa");
	expect(detection.needsReview).toBe(true);
});
