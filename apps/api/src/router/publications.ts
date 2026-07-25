import { type } from "arktype";
import { PublicationManager } from "../features/publications/manager.ts";
import { authed } from "../orpc.ts";

const publicationIdSchema = type({ "+": "delete", id: "string.uuid" });

export const publicationsRouter = {
	list: authed
		.input(
			type({
				"+": "delete",
				onlyUnread: "boolean = false",
				"tribunal?": "string",
				"from?": /^\d{4}-\d{2}-\d{2}$/u,
				"to?": /^\d{4}-\d{2}-\d{2}$/u,
				limit: "1 <= number.integer <= 100 = 20",
				offset: "number.integer >= 0 = 0",
			}),
		)
		.handler(({ input, context }) =>
			new PublicationManager(context.db).list({ ...input, lawyerId: context.lawyer.id }),
		),

	get: authed
		.input(publicationIdSchema)
		.handler(({ input, context }) =>
			new PublicationManager(context.db).get({ ...input, lawyerId: context.lawyer.id }),
		),

	read: authed
		.input(publicationIdSchema)
		.handler(({ input, context }) =>
			new PublicationManager(context.db).read({ ...input, lawyerId: context.lawyer.id }),
		),
};
