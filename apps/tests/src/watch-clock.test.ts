import {
	ALERT_HOURS,
	COLLECT_HOURS,
	dueSlot,
	forensicNow,
} from "@kw-lawyer/api/src/features/watch/clock.ts";
import { expect, test } from "bun:test";
import { assertDefined } from "./utils/assertions.ts";

// 09:30 em Brasília é 12:30 UTC. O relógio precisa raciocinar em horário forense, senão a coleta das
// 06:00 dispararia às 03:00 da manhã dela.
const MORNING_UTC = new Date("2026-07-27T12:30:00.000Z");

test("o horário forense é lido no fuso de Brasília, não em UTC", () => {
	expect(forensicNow(MORNING_UTC)).toEqual({ day: "2026-07-27", hour: 9 });
});

test("meia-noite forense é hora zero, não vinte e quatro", () => {
	expect(forensicNow(new Date("2026-07-27T03:10:00.000Z"))).toEqual({
		day: "2026-07-27",
		hour: 0,
	});
});

test("o dia vira no fuso forense, e não às 21h de Brasília", () => {
	expect(forensicNow(new Date("2026-07-28T02:00:00.000Z"))).toEqual({
		day: "2026-07-27",
		hour: 23,
	});
});

test("antes do primeiro horário do dia não há ciclo devido", () => {
	expect(dueSlot(new Date("2026-07-27T08:00:00.000Z"), COLLECT_HOURS)).toBeNull();
});

test("container que sobe depois do horário ainda faz o ciclo daquele horário", () => {
	const due = dueSlot(MORNING_UTC, COLLECT_HOURS);

	assertDefined(due);
	expect(due.slot).toBe("2026-07-27T06");
	expect(due.day).toBe("2026-07-27");
});

test("passado o segundo horário, o ciclo devido é o mais recente e não repete o da manhã", () => {
	const due = dueSlot(new Date("2026-07-27T18:00:00.000Z"), COLLECT_HOURS);

	assertDefined(due);
	expect(due.slot).toBe("2026-07-27T13");
});

test("o alerta tem slot próprio, então coleta e alerta do mesmo dia não colidem", () => {
	const collect = dueSlot(new Date("2026-07-27T18:00:00.000Z"), COLLECT_HOURS);
	const alert = dueSlot(new Date("2026-07-27T18:00:00.000Z"), ALERT_HOURS);

	assertDefined(collect);
	assertDefined(alert);
	expect(alert.slot).toBe("2026-07-27T07");
	expect(alert.slot).not.toBe(collect.slot);
});
