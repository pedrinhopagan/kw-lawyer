import { type } from "arktype";
import { NotificationsManager } from "../features/notifications/manager.ts";
import { WatchManager } from "../features/watch/manager.ts";
import { synced } from "../orpc.ts";

const subscriptionInput = type({
	endpoint: "string > 0",
	"expirationTime?": "number | null",
	keys: { p256dh: "string > 0", auth: "string > 0" },
	"userAgent?": "string > 0",
});

export const notificationsRouter = {
	status: synced.handler(({ context }) =>
		new NotificationsManager(context.db).status(context.lawyer.id),
	),

	subscribe: synced
		.input(subscriptionInput)
		.handler(({ context, input }) =>
			new NotificationsManager(context.db).subscribe(context.lawyer.id, input),
		),

	unsubscribe: synced.input(type({ endpoint: "string > 0" })).handler(({ context, input }) =>
		new NotificationsManager(context.db).unsubscribe({
			lawyerId: context.lawyer.id,
			endpoint: input.endpoint,
		}),
	),

	test: synced.handler(({ context }) =>
		new NotificationsManager(context.db).test(context.lawyer.id),
	),

	watch: synced.handler(({ context }) => new WatchManager(context.db).lastCycles()),
};
