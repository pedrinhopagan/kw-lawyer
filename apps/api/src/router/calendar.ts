import { type } from "arktype";
import { CalendarManager } from "../features/calendar/manager.ts";
import { deadlineFilterFields } from "../features/deadlines/filters.ts";
import { authed } from "../orpc.ts";

export const calendarRouter = {
	status: authed.handler(({ context }) =>
		new CalendarManager(context.db).status(context.lawyer.id),
	),

	disconnect: authed.handler(({ context }) =>
		new CalendarManager(context.db).disconnect(context.lawyer.id),
	),

	sync: authed
		.input(type({ "+": "delete", ...deadlineFilterFields }))
		.handler(({ input, context }) =>
			new CalendarManager(context.db).sync({ lawyerId: context.lawyer.id, filters: input }),
		),
};
