import { type } from "arktype";
import { PublicationManager } from "../features/publications/manager.ts";
import { synced } from "../orpc.ts";

const publicationIdSchema = type({ "+": "delete", id: "string.uuid" });

const publicationFilterFields = {
	includeHistory: "boolean = false",
	"tribunal?": "string",
	"from?": /^\d{4}-\d{2}-\d{2}$/u,
	"to?": /^\d{4}-\d{2}-\d{2}$/u,
	"query?": "1 <= string <= 200",
} as const;

export const publicationsRouter = {
	list: synced
		.input(
			type({
				"+": "delete",
				...publicationFilterFields,
				onlyUnread: "boolean = false",
				limit: "1 <= number.integer <= 100 = 20",
				offset: "number.integer >= 0 = 0",
			}),
		)
		.handler(({ input, context }) =>
			new PublicationManager(context.db).list({
				...input,
				lawyerId: context.lawyer.id,
				historyCutoffAt: context.lawyer.historyCutoffAt,
			}),
		),

	unread: synced.handler(({ context }) =>
		new PublicationManager(context.db).unread({
			lawyerId: context.lawyer.id,
			historyCutoffAt: context.lawyer.historyCutoffAt,
		}),
	),

	get: synced
		.input(publicationIdSchema)
		.handler(({ input, context }) =>
			new PublicationManager(context.db).get({ ...input, lawyerId: context.lawyer.id }),
		),

	read: synced
		.input(publicationIdSchema)
		.handler(({ input, context }) =>
			new PublicationManager(context.db).read({ ...input, lawyerId: context.lawyer.id }),
		),

	readAll: synced
		.input(type({ "+": "delete", ...publicationFilterFields }))
		.handler(({ input, context }) =>
			new PublicationManager(context.db).readAll({
				...input,
				lawyerId: context.lawyer.id,
				historyCutoffAt: context.lawyer.historyCutoffAt,
			}),
		),
};
