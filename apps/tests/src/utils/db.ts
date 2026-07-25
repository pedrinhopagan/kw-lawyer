import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { db } from "@kw-lawyer/api/src/db/client.ts";

class RollbackSignal extends Error {
	constructor() {
		super("rollback");
	}
}

export function withRollback(fn: (tx: Tx) => Promise<void>) {
	return async () => {
		try {
			await db.transaction(async (tx) => {
				await fn(tx);
				throw new RollbackSignal();
			});
		} catch (err) {
			if (err instanceof RollbackSignal) return;
			throw err;
		}
	};
}
