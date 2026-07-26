import { DJEN_HISTORY_START } from "@kw-lawyer/api/src/features/djen/client.ts";
import { planCollectionWindows } from "@kw-lawyer/api/src/features/sync/windows.ts";
import { expect, test } from "bun:test";

const TODAY = "2026-07-26";

test("sem marca d'água, o histórico inteiro é fatiado do mais recente para o mais antigo", () => {
	const windows = planCollectionWindows({ mark: undefined, today: TODAY });

	expect(windows[0]).toEqual({ from: "2026-06-27", through: TODAY });
	expect(windows.at(-1)?.from).toBe(DJEN_HISTORY_START);

	for (const [index, window] of windows.entries()) {
		expect(window.from <= window.through).toBe(true);

		const next = windows[index + 1];

		if (next) {
			expect(next.through < window.from).toBe(true);
		}
	}
});

test("com o histórico já coletado, sobra a janela incremental com dois dias de sobreposição", () => {
	const windows = planCollectionWindows({
		mark: { collectedFrom: DJEN_HISTORY_START, collectedThrough: "2026-07-20" },
		today: TODAY,
	});

	expect(windows).toEqual([{ from: "2026-07-18", through: TODAY }]);
});

test("sync interrompido no meio retoma o histórico de onde parou", () => {
	const windows = planCollectionWindows({
		mark: { collectedFrom: "2026-05-28", collectedThrough: "2026-07-20" },
		today: TODAY,
	});

	expect(windows[0]).toEqual({ from: "2026-07-18", through: TODAY });
	expect(windows[1]).toEqual({ from: "2026-04-28", through: "2026-05-27" });
	expect(windows.at(-1)?.from).toBe(DJEN_HISTORY_START);
});
