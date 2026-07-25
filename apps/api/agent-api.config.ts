import { defineOrpcConfig } from "@juicerq/agent-api/orpc";
import { db } from "./src/db/client.ts";
import { AuthManager } from "./src/features/auth/manager.ts";
import { appRouter } from "./src/router.ts";

export default defineOrpcConfig({
	router: appRouter,
	context: async (args) => ({
		lawyer: (await new AuthManager(db).me(args.as)).lawyer,
		access: true,
		db,
	}),
});
