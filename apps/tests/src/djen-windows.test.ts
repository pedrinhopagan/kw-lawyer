import { daysBetween } from "@kw-lawyer/api/src/features/deadlines/calendar.ts";
import {
	DJEN_COUNT_CEILING,
	DjenClient,
	type DjenWindow,
} from "@kw-lawyer/api/src/features/djen/client.ts";
import { expect, test } from "bun:test";

const OAB = { oabNumber: "950001", oabUf: "SP" };

interface StubItem {
	id: number;
	availableAt: string;
}

// O DJEN satura o `count` em 10000 sem dizer que truncou. O stub reproduz isso: janela mais larga que
// `saturateOverDays` devolve o teto, janela estreita devolve o número real.
function djenStub(input: { items: StubItem[]; saturateOverDays: number }) {
	const requests: DjenWindow[] = [];

	const server = Bun.serve({
		port: 0,
		fetch(request) {
			const url = new URL(request.url);
			const from = url.searchParams.get("dataDisponibilizacaoInicio");
			const through = url.searchParams.get("dataDisponibilizacaoFim");

			if (!from || !through) {
				return Response.json({ message: "janela ausente", count: 0, items: [] }, { status: 400 });
			}

			requests.push({ from, through });

			const inWindow = input.items.filter(
				(item) => item.availableAt >= from && item.availableAt <= through,
			);

			const pageSize = Number(url.searchParams.get("itensPorPagina"));
			const offset = (Number(url.searchParams.get("pagina")) - 1) * pageSize;
			const saturated = daysBetween(from, through) > input.saturateOverDays;

			return Response.json({
				status: "success",
				count: saturated ? DJEN_COUNT_CEILING : inWindow.length,
				items: inWindow.slice(offset, offset + pageSize).map((item) => ({
					id: item.id,
					data_disponibilizacao: item.availableAt,
					texto: "<p>Manifeste-se a parte autora, no prazo de 5 (cinco) dias.</p>",
					siglaTribunal: "TJSP",
					tipoComunicacao: "Intimação",
					numero_processo: "10025874520248260100",
				})),
			});
		},
	});

	return { server, requests, baseUrl: server.url.origin };
}

const JANUARY = [
	"2026-01-01",
	"2026-01-02",
	"2026-01-03",
	"2026-01-04",
	"2026-01-05",
	"2026-01-06",
	"2026-01-07",
	"2026-01-08",
];

test("janela saturada é dividida até caber e o histórico volta inteiro", async () => {
	const stub = djenStub({
		items: JANUARY.map((availableAt, index) => ({ id: (index + 1) * 100, availableAt })),
		saturateOverDays: 2,
	});

	try {
		const client = new DjenClient({ baseUrl: stub.baseUrl, maxAttempts: 1 });
		const collected: number[] = [];
		const collectedWindows: DjenWindow[] = [];

		const totals = await client.fetchAll(
			{ ...OAB, window: { from: "2026-01-01", through: "2026-01-08" } },
			async (page) => {
				collected.push(...page.items.map((item) => item.id));
				collectedWindows.push(page.window);

				await Promise.resolve();
			},
		);

		expect(stub.requests[0]).toEqual({ from: "2026-01-01", through: "2026-01-08" });
		expect(stub.requests.length).toBeGreaterThan(1);

		expect(collectedWindows).toEqual([
			{ from: "2026-01-07", through: "2026-01-08" },
			{ from: "2026-01-05", through: "2026-01-06" },
			{ from: "2026-01-03", through: "2026-01-04" },
			{ from: "2026-01-01", through: "2026-01-02" },
		]);

		expect(collected.toSorted()).toEqual(JANUARY.map((_, index) => (index + 1) * 100));
		expect(totals).toEqual({ total: 8, invalid: 0, counted: 8 });

		// Sem este número, uma divisão que repetisse a mesma janela passaria despercebida: três consultas
		// saturadas (a raiz e as duas metades) mais uma por janela estreita.
		expect(stub.requests).toHaveLength(7);
	} finally {
		await stub.server.stop(true);
	}
});

test("dia único saturado coleta o que dá e para, em vez de dividir para sempre", async () => {
	const stub = djenStub({
		items: [100, 101, 102].map((id) => ({ id, availableAt: "2026-03-10" })),
		saturateOverDays: -1,
	});

	try {
		const client = new DjenClient({ baseUrl: stub.baseUrl, maxAttempts: 1, pageSize: 2 });
		const collected: number[] = [];

		const totals = await client.fetchAll(
			{ ...OAB, window: { from: "2026-03-10", through: "2026-03-10" } },
			async (page) => {
				collected.push(...page.items.map((item) => item.id));

				await Promise.resolve();
			},
		);

		expect(collected).toEqual([100, 101, 102]);
		expect(totals).toEqual({ total: 3, invalid: 0, counted: 0 });
		expect(stub.requests).toHaveLength(3);
		expect(new Set(stub.requests.map((window) => window.from))).toEqual(new Set(["2026-03-10"]));
	} finally {
		await stub.server.stop(true);
	}
});
