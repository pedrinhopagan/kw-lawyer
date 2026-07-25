import { type } from "arktype";
import { CaseManager } from "../features/cases/manager.ts";
import { authed } from "../orpc.ts";

export const casesRouter = {
	list: authed
		.input(
			type({
				"+": "delete",
				"search?": "string",
				"tribunal?": "string",
				limit: "1 <= number.integer <= 100 = 20",
				offset: "number.integer >= 0 = 0",
			}),
		)
		.handler(({ input, context }) =>
			new CaseManager(context.db).list({ ...input, lawyerId: context.lawyer.id }),
		),

	get: authed
		.input(type({ "+": "delete", cnjNumber: "string > 0" }))
		.handler(({ input, context }) =>
			new CaseManager(context.db).get({ ...input, lawyerId: context.lawyer.id }),
		),
};
