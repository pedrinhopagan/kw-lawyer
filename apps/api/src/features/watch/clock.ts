import type { Db } from "../../db/client.ts";
import { obs } from "../../observability.ts";
import { FORENSIC_TIME_ZONE } from "../deadlines/calendar.ts";
import { WatchManager } from "./manager.ts";

// O DJEN publica o caderno de madrugada e a contagem do prazo parte da data de disponibilização, não
// da hora em que o app viu a comunicação: varrer de hora em hora só multiplicaria 429.
export const COLLECT_HOURS = [6, 13];
export const ALERT_HOURS = [7];

const TICK_MS = 60_000;

const forensicClock = new Intl.DateTimeFormat("en-CA", {
	timeZone: FORENSIC_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	hourCycle: "h23",
});

export function forensicNow(now: Date) {
	const parts = forensicClock.formatToParts(now);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";

	return {
		day: `${value("year")}-${value("month")}-${value("day")}`,
		hour: Number(value("hour")),
	};
}

// O slot devido é o último horário da lista que já passou hoje. Container que sobe às 06:40 ainda faz
// a coleta das 06:00; container que sobe às 14:00 faz a das 13:00 e não repete a da manhã.
export function dueSlot(now: Date, hours: number[]) {
	const { day, hour } = forensicNow(now);
	const reached = hours.filter((candidate) => candidate <= hour);
	const latest = reached.at(-1);

	if (latest === undefined) {
		return null;
	}

	return { day, slot: `${day}T${String(latest).padStart(2, "0")}` };
}

async function runCollect(db: Db, now: Date) {
	const due = dueSlot(now, COLLECT_HOURS);

	if (!due) {
		return;
	}

	const cycleId = await new WatchManager(db).claim({ kind: "coleta", slot: due.slot });

	if (!cycleId) {
		return;
	}

	await obs.context({ type: "job", job_name: "watch.collect" }, async () => {
		const result = await new WatchManager(db).collect(cycleId);

		console.log(`[watch] coleta ${due.slot}: ${result.swept} advogados, ${result.status}`);
	});
}

async function runAlert(db: Db, now: Date) {
	const due = dueSlot(now, ALERT_HOURS);

	if (!due) {
		return;
	}

	const cycleId = await new WatchManager(db).claim({ kind: "alerta", slot: due.slot });

	if (!cycleId) {
		return;
	}

	await obs.context({ type: "job", job_name: "watch.alert" }, async () => {
		const result = await new WatchManager(db).alert({ cycleId, day: due.day });

		console.log(
			`[watch] alerta ${due.slot}: ${result.lawyers} advogados, ${result.delivered} entregas`,
		);
	});
}

async function tick(db: Db) {
	const now = new Date();

	await runCollect(db, now).catch((error: unknown) => {
		console.error("[watch] ciclo de coleta terminou com erro não tratado", error);
	});

	await runAlert(db, now).catch((error: unknown) => {
		console.error("[watch] ciclo de alerta terminou com erro não tratado", error);
	});
}

export function startWatchClock(db: Db) {
	void tick(db);

	return setInterval(() => void tick(db), TICK_MS);
}
