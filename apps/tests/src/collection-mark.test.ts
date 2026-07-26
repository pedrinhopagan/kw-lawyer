import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { oabCollections } from "@kw-lawyer/api/src/db/schema/oab_collections.ts";
import { addDays, forensicToday } from "@kw-lawyer/api/src/features/deadlines/calendar.ts";
import type { DatajudClient } from "@kw-lawyer/api/src/features/datajud/client.ts";
import { DJEN_HISTORY_START, type DjenClient } from "@kw-lawyer/api/src/features/djen/client.ts";
import { LawyerOabManager } from "@kw-lawyer/api/src/features/oabs/manager.ts";
import { SyncManager } from "@kw-lawyer/api/src/features/sync/manager.ts";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { assertDefined } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";

const TODAY = forensicToday();
const UF = "SP";

const DATAJUD_EMPTY: Pick<DatajudClient, "findCases"> = {
	findCases: (params) =>
		Promise.resolve({ status: "ok" as const, alias: params.tribunal.toLowerCase(), documents: [] }),
};

interface RecordedWindow {
	oabNumber: string;
	from: string;
	through: string;
}

function recordingDjen(recorded: RecordedWindow[]): Pick<DjenClient, "fetchAll"> {
	return {
		fetchAll: (params) => {
			recorded.push({ oabNumber: params.oabNumber, ...params.window });

			return Promise.resolve({ total: 0, invalid: 0, counted: 0 });
		},
	};
}

async function createLawyer(tx: Tx, oabNumber: string) {
	const [lawyer] = await tx
		.insert(lawyers)
		.values({ name: `ADVOGADA ${oabNumber}`, oabNumber, oabUf: UF })
		.returning({ id: lawyers.id });

	assertDefined(lawyer);

	return lawyer.id;
}

async function sync(tx: Tx, lawyerId: string, recorded: RecordedWindow[]) {
	const manager = new SyncManager(tx, recordingDjen(recorded), DATAJUD_EMPTY);
	const { runId } = await manager.start(lawyerId);

	await manager.syncLawyer(lawyerId, { runId, force: false });
}

async function markOf(tx: Tx, oabNumber: string) {
	return await tx
		.select({
			collectedFrom: oabCollections.collectedFrom,
			collectedThrough: oabCollections.collectedThrough,
		})
		.from(oabCollections)
		.where(and(eq(oabCollections.oabNumber, oabNumber), eq(oabCollections.oabUf, UF)));
}

const windowsOf = (recorded: RecordedWindow[], oabNumber: string) =>
	recorded
		.filter((entry) => entry.oabNumber === oabNumber)
		.map((entry) => ({ from: entry.from, through: entry.through }));

test(
	"a primeira coleta grava a marca d'água e a segunda pede só o incremento",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx, "940001");
		const first: RecordedWindow[] = [];

		await sync(tx, lawyerId, first);

		expect(first[0]).toEqual({
			oabNumber: "940001",
			from: addDays(TODAY, -29),
			through: TODAY,
		});
		expect(first.at(-1)?.from).toBe(DJEN_HISTORY_START);

		expect(await markOf(tx, "940001")).toEqual([
			{ collectedFrom: DJEN_HISTORY_START, collectedThrough: TODAY },
		]);

		const second: RecordedWindow[] = [];

		await sync(tx, lawyerId, second);

		expect(windowsOf(second, "940001")).toEqual([{ from: addDays(TODAY, -2), through: TODAY }]);
	}),
);

test(
	"duas advogadas que acompanham a mesma inscrição não crawleiam o histórico duas vezes",
	withRollback(async (tx) => {
		const shared = "940009";
		const primeira = await createLawyer(tx, "940002");
		const segunda = await createLawyer(tx, "940003");

		const oabs = new LawyerOabManager(tx, {
			findLawyer: () => Promise.resolve({ name: "JOSE ROBERTO SOCIO", djenAdvogadoId: 42 }),
		});

		await oabs.add(primeira, { oabNumber: shared, oabUf: UF });
		await oabs.add(segunda, { oabNumber: shared, oabUf: UF });

		const doPrimeiro: RecordedWindow[] = [];

		await sync(tx, primeira, doPrimeiro);

		expect(windowsOf(doPrimeiro, shared).length).toBeGreaterThan(1);

		const doSegundo: RecordedWindow[] = [];

		await sync(tx, segunda, doSegundo);

		expect(windowsOf(doSegundo, shared)).toEqual([{ from: addDays(TODAY, -2), through: TODAY }]);
		expect(windowsOf(doSegundo, "940003").length).toBeGreaterThan(1);

		expect(await markOf(tx, shared)).toEqual([
			{ collectedFrom: DJEN_HISTORY_START, collectedThrough: TODAY },
		]);
	}),
);
