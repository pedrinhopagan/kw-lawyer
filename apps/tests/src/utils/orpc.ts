import type { Db, Tx } from "@kw-lawyer/api/src/db/client.ts";
import type { Context } from "@kw-lawyer/api/src/orpc.ts";
import { appRouter } from "@kw-lawyer/api/src/router.ts";
import { createRouterClient } from "@orpc/server";

export function createTestClient(db: Db | Tx, lawyer: Context["lawyer"] = null) {
	const context: Context = { lawyer, access: true, db };

	return createRouterClient(appRouter, { context });
}
