import { type } from "arktype";
import { openAccess } from "../features/access/gate.ts";
import { open } from "../orpc.ts";

export const accessRouter = {
	status: open.handler(({ context }) => ({ granted: context.access })),

	login: open
		.input(type({ user: "string > 0", password: "string > 0" }))
		.handler(({ input }) => openAccess(input)),

	logout: open.handler(() => ({ ok: true })),
};
