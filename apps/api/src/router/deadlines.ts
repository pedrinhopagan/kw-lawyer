import { type } from "arktype";
import { DEADLINE_DATE_PATTERN, deadlineFilterFields } from "../features/deadlines/filters.ts";
import { DeadlineManager } from "../features/deadlines/manager.ts";
import { authed } from "../orpc.ts";

const deadlineIdSchema = type({ "+": "delete", id: "string.uuid" });

export const deadlinesRouter = {
	list: authed
		.input(
			type({
				"+": "delete",
				...deadlineFilterFields,
				limit: "1 <= number.integer <= 200 = 50",
				offset: "number.integer >= 0 = 0",
			}),
		)
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).list({ ...input, lawyerId: context.lawyer.id }),
		),

	summary: authed
		.input(type({ "+": "delete", ...deadlineFilterFields, today: DEADLINE_DATE_PATTERN }))
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).summary({ ...input, lawyerId: context.lawyer.id }),
		),

	get: authed
		.input(deadlineIdSchema)
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).get({ ...input, lawyerId: context.lawyer.id }),
		),

	confirm: authed.input(deadlineIdSchema).handler(({ input, context }) =>
		new DeadlineManager(context.db).setStatus({
			...input,
			lawyerId: context.lawyer.id,
			status: "confirmado",
		}),
	),

	complete: authed.input(deadlineIdSchema).handler(({ input, context }) =>
		new DeadlineManager(context.db).setStatus({
			...input,
			lawyerId: context.lawyer.id,
			status: "cumprido",
		}),
	),

	dismiss: authed.input(deadlineIdSchema).handler(({ input, context }) =>
		new DeadlineManager(context.db).setStatus({
			...input,
			lawyerId: context.lawyer.id,
			status: "descartado",
		}),
	),

	reschedule: authed
		.input(
			type({ "+": "delete", id: "string.uuid", dueAt: DEADLINE_DATE_PATTERN, "note?": "string" }),
		)
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).reschedule({ ...input, lawyerId: context.lawyer.id }),
		),

	create: authed
		.input(
			type({
				"+": "delete",
				"publicationId?": "string.uuid",
				"caseId?": "string.uuid",
				title: "1 <= string <= 200",
				dueAt: DEADLINE_DATE_PATTERN,
				"note?": "string",
			}),
		)
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).createManual({ ...input, lawyerId: context.lawyer.id }),
		),

	triage: authed
		.input(
			type({
				"+": "delete",
				limit: "1 <= number.integer <= 100 = 25",
				offset: "number.integer >= 0 = 0",
			}),
		)
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).triage({ ...input, lawyerId: context.lawyer.id }),
		),
};
