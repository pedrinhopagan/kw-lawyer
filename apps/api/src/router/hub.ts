import { type } from "arktype";
import { HubManager } from "../features/hub/manager.ts";
import { synced } from "../orpc.ts";

export const hubRouter = {
	forDeadline: synced
		.input(type({ "+": "delete", deadlineId: "string.uuid" }))
		.handler(({ input, context }) =>
			new HubManager(context.db).get({ ...input, lawyerId: context.lawyer.id }),
		),
};
