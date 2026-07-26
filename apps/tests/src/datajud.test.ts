import { DatajudClient } from "@kw-lawyer/api/src/features/datajud/client.ts";
import { parseInstant } from "@kw-lawyer/api/src/features/datajud/normalize.ts";
import { expect, test } from "bun:test";
import { assertDefined } from "./utils/assertions.ts";
import { datajudElasticsearch } from "./utils/datajud-stub.ts";

const CNJ_GRANDE = "40117908520258260114";
const CNJ_PEQUENO = "10025874520248260100";

test("lote truncado é refeito em pedaços menores em vez de sumir com o processo", async () => {
	const { calls, server } = datajudElasticsearch({
		documentsByCnj: { [CNJ_GRANDE]: 12, [CNJ_PEQUENO]: 1 },
		declaredByCnj: { [CNJ_GRANDE]: 12, [CNJ_PEQUENO]: 1 },
		withTotal: true,
	});

	try {
		const client = new DatajudClient({ baseUrl: server.url.origin, apiKey: "teste" });
		const found = await client.findCases({
			tribunal: "TJSP",
			cnjNumbers: [CNJ_GRANDE, CNJ_PEQUENO],
		});

		expect(found.status).toBe("ok");
		expect(found.status === "ok" && found.documents).toHaveLength(13);
		expect(
			found.status === "ok" && new Set(found.documents.map((document) => document.cnjNumber)).size,
		).toBe(2);

		// O lote de dois não coube, então virou uma consulta por processo, e o processo com doze
		// documentos foi buscado de novo com folga: nenhum CNJ pedido pode virar "sem registro".
		expect(calls.length).toBeGreaterThan(1);
		expect(calls.at(-1)?.cnjNumbers).toEqual([CNJ_PEQUENO]);
		expect(calls.some((call) => call.cnjNumbers.length === 1 && call.size >= 12)).toBe(true);
	} finally {
		await server.stop(true);
	}
});

test("processo acima do teto de documentos não derruba o lote dos outros", async () => {
	const { server } = datajudElasticsearch({
		documentsByCnj: { [CNJ_GRANDE]: 3, [CNJ_PEQUENO]: 1 },
		declaredByCnj: { [CNJ_GRANDE]: 1_500 },
		withTotal: true,
	});

	try {
		const client = new DatajudClient({ baseUrl: server.url.origin, apiKey: "teste" });
		const found = await client.findCases({
			tribunal: "TJSP",
			cnjNumbers: [CNJ_GRANDE, CNJ_PEQUENO],
		});

		expect(found.status).toBe("ok");

		// O processo patológico fica sem documento nenhum neste ciclo, e não com metade deles: meio
		// conjunto apagaria instância viva na reconciliação. O outro processo do lote passa normalmente.
		expect(found.status === "ok" && found.documents.map((document) => document.cnjNumber)).toEqual([
			CNJ_PEQUENO,
		]);
	} finally {
		await server.stop(true);
	}
});

// O servidor de produção não roda no fuso de Brasília, e é justamente lá que `new Date` cru lia o
// carimbo como hora local: o teste força um fuso estrangeiro para que o defeito apareça em qualquer
// máquina, inclusive na da advogada, que roda em -03:00.
function comFusoDoServidor<T>(timeZone: string, run: () => T) {
	const original = process.env.TZ;

	process.env.TZ = timeZone;

	try {
		return run();
	} finally {
		process.env.TZ = original;
	}
}

test("carimbo sem fuso é lido como horário de Brasília, e não do fuso do servidor", () => {
	for (const timeZone of ["UTC", "Asia/Tokyo"]) {
		const madrugada = comFusoDoServidor(timeZone, () => parseInstant("2026-05-02T00:30:00"));

		assertDefined(madrugada);

		expect(madrugada).toEqual(new Date("2026-05-02T03:30:00.000Z"));

		// O ato da madrugada não pode andar para o dia anterior: o dia é o que abre a contagem do prazo.
		expect(madrugada.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })).toBe(
			"02/05/2026",
		);

		expect(comFusoDoServidor(timeZone, () => parseInstant("2026-05-02 00:30:00"))).toEqual(
			new Date("2026-05-02T03:30:00.000Z"),
		);
		expect(comFusoDoServidor(timeZone, () => parseInstant("2026-05-02"))).toEqual(
			new Date("2026-05-02T03:00:00.000Z"),
		);
		expect(comFusoDoServidor(timeZone, () => parseInstant("2026-05-02T00:30:00Z"))).toEqual(
			new Date("2026-05-02T00:30:00.000Z"),
		);
		expect(comFusoDoServidor(timeZone, () => parseInstant("2026-05-02T00:30:00-03:00"))).toEqual(
			new Date("2026-05-02T03:30:00.000Z"),
		);

		// Fuso de duas casas é ISO 8601 válido e o JavaScript devolve data inválida: sem completar os
		// minutos, o movimento seria descartado como se o carimbo fosse lixo.
		expect(comFusoDoServidor(timeZone, () => parseInstant("2026-05-02T00:30:00-03"))).toEqual(
			new Date("2026-05-02T03:30:00.000Z"),
		);
	}

	expect(parseInstant(" ")).toBeNull();
	expect(parseInstant("ontem")).toBeNull();
});
