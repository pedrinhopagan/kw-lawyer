import { type } from "arktype";
import { RadarManager } from "../features/radar/manager.ts";
import { synced } from "../orpc.ts";

export const radarRouter = {
	silent: synced
		.input(type({ "+": "delete", "thresholdDays?": "15 <= number.integer <= 365" }))
		.handler(({ input, context }) =>
			new RadarManager(context.db).silent({ ...input, lawyerId: context.lawyer.id }),
		),

	uncovered: synced.handler(({ context }) =>
		new RadarManager(context.db).uncovered(context.lawyer.id),
	),
};
