import { type } from "arktype";
import { DECISION_OUTCOMES, DECISION_SPECIES } from "../features/decisions/classify.ts";
import { DecisionManager } from "../features/decisions/manager.ts";
import { authed } from "../orpc.ts";

const speciesSchema = type.enumerated(...DECISION_SPECIES);

const outcomeSchema = type.enumerated(...DECISION_OUTCOMES).or("null");

export const decisionsRouter = {
	byCase: authed
		.input(type({ "+": "delete", cnjNumber: "string > 0" }))
		.handler(({ input, context }) =>
			new DecisionManager(context.db).listByCase({ ...input, lawyerId: context.lawyer.id }),
		),

	correct: authed
		.input(
			type({
				"+": "delete",
				id: "string.uuid",
				"species?": speciesSchema,
				"outcome?": outcomeSchema,
				"note?": type("string <= 500").or("null"),
			}),
		)
		.handler(({ input, context }) =>
			new DecisionManager(context.db).correct({ ...input, lawyerId: context.lawyer.id }),
		),

	dismiss: authed.input(type({ "+": "delete", id: "string.uuid" })).handler(({ input, context }) =>
		new DecisionManager(context.db).setDismissed({
			...input,
			lawyerId: context.lawyer.id,
			dismissed: true,
		}),
	),

	restore: authed.input(type({ "+": "delete", id: "string.uuid" })).handler(({ input, context }) =>
		new DecisionManager(context.db).setDismissed({
			...input,
			lawyerId: context.lawyer.id,
			dismissed: false,
		}),
	),
};
