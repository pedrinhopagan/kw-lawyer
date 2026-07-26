import { type } from "arktype";
import { DEADLINE_DATE_PATTERN, deadlineFilterFields } from "../features/deadlines/filters.ts";
import { DeadlineManager } from "../features/deadlines/manager.ts";
import { synced } from "../orpc.ts";

const deadlineIdSchema = type({ "+": "delete", id: "string.uuid" });

export const deadlinesRouter = {
	list: synced
		.input(
			type({
				"+": "delete",
				...deadlineFilterFields,
				limit: "1 <= number.integer <= 200 = 50",
				offset: "number.integer >= 0 = 0",
			}),
		)
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).list({
				...input,
				lawyerId: context.lawyer.id,
				historyCutoffAt: context.lawyer.historyCutoffAt,
			}),
		),

	summary: synced
		.input(type({ "+": "delete", ...deadlineFilterFields, today: DEADLINE_DATE_PATTERN }))
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).summary({
				...input,
				lawyerId: context.lawyer.id,
				historyCutoffAt: context.lawyer.historyCutoffAt,
			}),
		),

	get: synced
		.input(deadlineIdSchema)
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).get({ ...input, lawyerId: context.lawyer.id }),
		),

	complete: synced.input(deadlineIdSchema).handler(({ input, context }) =>
		new DeadlineManager(context.db).setStatus({
			...input,
			lawyerId: context.lawyer.id,
			status: "cumprido",
		}),
	),

	dismiss: synced.input(deadlineIdSchema).handler(({ input, context }) =>
		new DeadlineManager(context.db).setStatus({
			...input,
			lawyerId: context.lawyer.id,
			status: "descartado",
		}),
	),

	reschedule: synced
		.input(
			type({ "+": "delete", id: "string.uuid", dueAt: DEADLINE_DATE_PATTERN, "note?": "string" }),
		)
		.handler(({ input, context }) =>
			new DeadlineManager(context.db).reschedule({ ...input, lawyerId: context.lawyer.id }),
		),

	create: synced
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

	triage: synced
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
