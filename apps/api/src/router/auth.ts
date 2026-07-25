import { type } from "arktype";
import { AuthManager } from "../features/auth/manager.ts";
import { authed, pub } from "../orpc.ts";

export const authRouter = {
	login: pub
		.input(type({ oabNumber: "string > 0", oabUf: "string > 0", "name?": "string > 0" }))
		.handler(({ input, context }) => new AuthManager(context.db).loginWithOab(input)),

	logout: authed.handler(({ context }) => new AuthManager(context.db).logout(context.lawyer.id)),

	me: pub.handler(({ context }) => new AuthManager(context.db).me(context.lawyer?.id)),
};
