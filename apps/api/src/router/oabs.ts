import { type } from "arktype";
import { LawyerOabManager } from "../features/oabs/manager.ts";
import { authed } from "../orpc.ts";

export const oabsRouter = {
	watched: authed.handler(({ context }) =>
		new LawyerOabManager(context.db).watched(context.lawyer.id),
	),

	add: authed
		.input(type({ oabNumber: "string > 0", oabUf: "string > 0" }))
		.handler(({ input, context }) =>
			new LawyerOabManager(context.db).add(context.lawyer.id, input),
		),

	remove: authed
		.input(type({ id: "string > 0" }))
		.handler(({ input, context }) =>
			new LawyerOabManager(context.db).remove(context.lawyer.id, input),
		),
};
