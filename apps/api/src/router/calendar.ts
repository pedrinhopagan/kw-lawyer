import { type } from "arktype";
import { CalendarManager } from "../features/calendar/manager.ts";
import { deadlineFilterFields } from "../features/deadlines/filters.ts";
import { synced } from "../orpc.ts";

export const calendarRouter = {
	status: synced.handler(({ context }) =>
		new CalendarManager(context.db).status(context.lawyer.id),
	),

	disconnect: synced.handler(({ context }) =>
		new CalendarManager(context.db).disconnect(context.lawyer.id),
	),

	sync: synced
		.input(type({ "+": "delete", ...deadlineFilterFields }))
		.handler(({ input, context }) =>
			new CalendarManager(context.db).sync({
				lawyerId: context.lawyer.id,
				historyCutoffAt: context.lawyer.historyCutoffAt,
				filters: input,
			}),
		),
};
