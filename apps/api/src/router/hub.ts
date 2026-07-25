import { type } from "arktype";
import { HubManager } from "../features/hub/manager.ts";
import { authed } from "../orpc.ts";

export const hubRouter = {
	forDeadline: authed
		.input(type({ "+": "delete", deadlineId: "string.uuid" }))
		.handler(({ input, context }) =>
			new HubManager(context.db).get({ ...input, lawyerId: context.lawyer.id }),
		),
};
