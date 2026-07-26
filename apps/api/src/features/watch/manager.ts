import { and, asc, desc, eq, lt } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { lawyers } from "../../db/schema/lawyers.ts";
import {
	type WatchCycleKind,
	type WatchCycleStatus,
	watchCycles,
} from "../../db/schema/watch_cycles.ts";
import { NotificationsManager } from "../notifications/manager.ts";
import { ORPHAN_HEARTBEAT_MS, SyncManager } from "../sync/manager.ts";

// Maior que a janela de batimento com que o SyncManager derruba run órfão: o ciclo só volta depois
// que a coleta interrompida lá dentro já pôde ser marcada como falha. Sai do mesmo valor para que
// afrouxar uma das duas janelas não deixe a outra para trás.
const ORPHAN_CYCLE_MS = 4 * ORPHAN_HEARTBEAT_MS;

function errorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export class WatchManager {
	constructor(private readonly db: Db | Tx) {}

	// Quem consegue inserir o par (kind, slot) é dono do ciclo. Uma segunda réplica da api, ou o mesmo
	// container reiniciado no minuto seguinte, bate no unique e não repete a varredura.
	async claim(input: { kind: WatchCycleKind; slot: string }) {
		const [claimed] = await this.db
			.insert(watchCycles)
			.values({ kind: input.kind, slot: input.slot, status: "em_execucao" })
			.onConflictDoNothing()
			.returning({ id: watchCycles.id });

		if (claimed) {
			return claimed.id;
		}

		// Deploy no meio do ciclo deixaria a linha em execução para sempre e o slot travado até o
		// horário seguinte. Passada a janela de órfão o ciclo é retomado uma vez: o que foi interrompido
		// volta, e o que rodou até o fim e falhou não repete, porque a falha já virou alerta.
		const [resumed] = await this.db
			.update(watchCycles)
			.set({ status: "em_execucao", startedAt: new Date(), finishedAt: null, errorMessage: null })
			.where(
				and(
					eq(watchCycles.kind, input.kind),
					eq(watchCycles.slot, input.slot),
					eq(watchCycles.status, "em_execucao"),
					lt(watchCycles.startedAt, new Date(Date.now() - ORPHAN_CYCLE_MS)),
				),
			)
			.returning({ id: watchCycles.id });

		if (!resumed) {
			return null;
		}

		return resumed.id;
	}

	async collect(cycleId: string) {
		const targets = await this.db
			.select({ id: lawyers.id })
			.from(lawyers)
			.orderBy(asc(lawyers.createdAt));

		const failures: string[] = [];

		for (const target of targets) {
			// Um advogado por vez, de propósito: paralelizar multiplicaria a pressão sobre o DJEN sem
			// ganho para uma base de uma advogada e as inscrições que ela acompanha. Um que falha não
			// derruba os outros do ciclo.
			await this.sweep(target.id).catch((error: unknown) => {
				failures.push(errorMessage(error));
			});
		}

		const status = failures.length ? ("falhou" as const) : ("concluido" as const);

		await this.finish({
			cycleId,
			status,
			lawyers: targets.length - failures.length,
			errorMessage: failures.join(" | ") || null,
		});

		return { swept: targets.length - failures.length, status };
	}

	async alert(input: { cycleId: string; day: string }) {
		const notifications = new NotificationsManager(this.db);
		const targets = await notifications.subscribedLawyers();

		let delivered = 0;

		for (const target of targets) {
			delivered += await notifications.alert({ lawyerId: target.id, day: input.day });
		}

		await this.finish({
			cycleId: input.cycleId,
			status: "concluido",
			lawyers: targets.length,
			errorMessage: null,
		});

		return { lawyers: targets.length, delivered };
	}

	async lastCycles() {
		const [collection, alerting] = await Promise.all([
			this.lastCycle("coleta"),
			this.lastCycle("alerta"),
		]);

		return { collection, alert: alerting };
	}

	private async lastCycle(kind: WatchCycleKind) {
		const [cycle] = await this.db
			.select()
			.from(watchCycles)
			.where(eq(watchCycles.kind, kind))
			.orderBy(desc(watchCycles.startedAt))
			.limit(1);

		if (!cycle) {
			return null;
		}

		return cycle;
	}

	private async sweep(lawyerId: string) {
		const sync = new SyncManager(this.db);
		const { runId, resumed } = await sync.start(lawyerId);

		if (resumed) {
			return;
		}

		const result = await sync.syncLawyer(lawyerId, { runId, force: false });

		if (result.status === "falhou") {
			throw new Error(`Coleta do advogado ${lawyerId} falhou.`);
		}
	}

	private async finish(input: {
		cycleId: string;
		status: WatchCycleStatus;
		lawyers: number;
		errorMessage: string | null;
	}) {
		await this.db
			.update(watchCycles)
			.set({
				status: input.status,
				lawyers: input.lawyers,
				finishedAt: new Date(),
				errorMessage: input.errorMessage,
			})
			.where(eq(watchCycles.id, input.cycleId));
	}
}
