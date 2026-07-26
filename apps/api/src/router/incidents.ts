import { type } from "arktype";
import { IncidentManager } from "../features/incidents/manager.ts";
import { synced } from "../orpc.ts";

export const incidentsRouter = {
	byCase: synced
		.input(type({ "+": "delete", cnjNumber: "string > 0" }))
		.handler(({ input, context }) =>
			new IncidentManager(context.db).listByCase({ ...input, lawyerId: context.lawyer.id }),
		),

	suspensions: synced.handler(({ context }) =>
		new IncidentManager(context.db).suspensions(context.lawyer.id),
	),

	dismiss: synced.input(type({ "+": "delete", id: "string.uuid" })).handler(({ input, context }) =>
		new IncidentManager(context.db).setDismissed({
			...input,
			lawyerId: context.lawyer.id,
			dismissed: true,
		}),
	),
};
