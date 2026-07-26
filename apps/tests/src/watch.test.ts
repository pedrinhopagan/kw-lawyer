import { watchCycles } from "@kw-lawyer/api/src/db/schema/watch_cycles.ts";
import { WatchManager } from "@kw-lawyer/api/src/features/watch/manager.ts";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assertDefined } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";

test(
	"o segundo pedido do mesmo horário não abre ciclo, então a varredura não roda duas vezes",
	withRollback(async (tx) => {
		const watch = new WatchManager(tx);

		const first = await watch.claim({ kind: "coleta", slot: "2026-07-27T06" });
		const second = await watch.claim({ kind: "coleta", slot: "2026-07-27T06" });

		expect(first).not.toBeNull();
		expect(second).toBeNull();
	}),
);

test(
	"coleta e alerta do mesmo horário são ciclos independentes",
	withRollback(async (tx) => {
		const watch = new WatchManager(tx);

		expect(await watch.claim({ kind: "coleta", slot: "2026-07-28T07" })).not.toBeNull();
		expect(await watch.claim({ kind: "alerta", slot: "2026-07-28T07" })).not.toBeNull();
	}),
);

test(
	"ciclo interrompido por deploy é retomado depois da janela de órfão",
	withRollback(async (tx) => {
		const watch = new WatchManager(tx);
		const slot = "2026-07-30T06";
		const cycleId = await watch.claim({ kind: "coleta", slot });

		assertDefined(cycleId);
		expect(await watch.claim({ kind: "coleta", slot })).toBeNull();

		await tx
			.update(watchCycles)
			.set({ startedAt: new Date(Date.now() - 25 * 60 * 1000) })
			.where(eq(watchCycles.id, cycleId));

		expect(await watch.claim({ kind: "coleta", slot })).toBe(cycleId);
	}),
);

test(
	"ciclo que rodou até o fim e falhou não é repetido no mesmo horário",
	withRollback(async (tx) => {
		const watch = new WatchManager(tx);
		const slot = "2026-07-31T06";
		const cycleId = await watch.claim({ kind: "coleta", slot });

		assertDefined(cycleId);

		await tx
			.update(watchCycles)
			.set({
				status: "falhou",
				finishedAt: new Date(),
				startedAt: new Date(Date.now() - 25 * 60 * 1000),
			})
			.where(eq(watchCycles.id, cycleId));

		expect(await watch.claim({ kind: "coleta", slot })).toBeNull();
	}),
);

test(
	"o ciclo nasce em execução e a tela de configurações lê o último de cada tipo",
	withRollback(async (tx) => {
		const watch = new WatchManager(tx);
		const cycleId = await watch.claim({ kind: "coleta", slot: "2026-07-29T13" });

		assertDefined(cycleId);

		const [opened] = await tx.select().from(watchCycles).where(eq(watchCycles.id, cycleId));

		assertDefined(opened);
		expect(opened.status).toBe("em_execucao");
		expect(opened.finishedAt).toBeNull();

		const last = await watch.lastCycles();

		expect(last.collection?.id).toBe(cycleId);
	}),
);
