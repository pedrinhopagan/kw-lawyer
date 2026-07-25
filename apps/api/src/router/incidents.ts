import { type } from "arktype";
import { IncidentManager } from "../features/incidents/manager.ts";
import { authed } from "../orpc.ts";

export const incidentsRouter = {
	byCase: authed
		.input(type({ "+": "delete", cnjNumber: "string > 0" }))
		.handler(({ input, context }) =>
			new IncidentManager(context.db).listByCase({ ...input, lawyerId: context.lawyer.id }),
		),

	suspensions: authed.handler(({ context }) =>
		new IncidentManager(context.db).suspensions(context.lawyer.id),
	),

	dismiss: authed.input(type({ "+": "delete", id: "string.uuid" })).handler(({ input, context }) =>
		new IncidentManager(context.db).setDismissed({
			...input,
			lawyerId: context.lawyer.id,
			dismissed: true,
		}),
	),
};
