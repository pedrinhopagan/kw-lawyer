import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { test as base } from "@playwright/test";
import type { AppRouter } from "@kw-lawyer/api/src/router.ts";
import { truncateAll } from "./truncate.ts";

const SEED_SCRIPT = resolve(import.meta.dirname, "seed-scenario.ts");

type Fixtures = {
	cleanDb: void;
	api: RouterClient<AppRouter>;
	scenario: void;
};

export const test = base.extend<Fixtures>({
	cleanDb: [
		// oxlint-disable-next-line no-empty-pattern -- Playwright fixture requires destructuring pattern
		async ({}, use) => {
			await truncateAll();
			await use();
		},
		{ auto: true },
	],
	api: async ({ baseURL }, use) => {
		const link = new RPCLink({ url: `${baseURL}/orpc` });
		const client: RouterClient<AppRouter> = createORPCClient(link);
		await use(client);
	},
	scenario: async ({ cleanDb: _cleanDb }, use) => {
		const seed = spawnSync("bun", [SEED_SCRIPT], { encoding: "utf8", env: process.env });

		if (seed.status !== 0) {
			throw new Error(`[e2e] seed do cenário falhou:\n${seed.stderr}`);
		}

		await use();
	},
});

export { expect } from "@playwright/test";
