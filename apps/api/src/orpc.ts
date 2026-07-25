import { createOrpcMiddleware } from "@juicerq/trail/orpc";
import { os } from "@orpc/server";
import type { Db, Tx } from "./db/client.ts";
import type { SessionLawyer } from "./features/auth/session.ts";
import { type AppEvent, obs } from "./observability.ts";

export type Context = { lawyer: SessionLawyer | null; access: boolean; db: Db | Tx };

const base = os.$context<Context>().errors({
	ACCESS_REQUIRED: { status: 401, message: "Acesso restrito" },
	UNAUTHORIZED: { status: 401, message: "Não autenticado" },
	FORBIDDEN: { status: 403, message: "Sem permissão" },
	NOT_FOUND: { status: 404, message: "Não encontrado" },
	CONFLICT: { status: 409, message: "Conflito" },
	RATE_LIMITED: { status: 429, message: "Muitas requisições" },
});

const trailMiddleware = createOrpcMiddleware<AppEvent>(obs, {
	slowRequestMs: 3000,
	expectedErrorCodes: [
		"ACCESS_REQUIRED",
		"UNAUTHORIZED",
		"FORBIDDEN",
		"NOT_FOUND",
		"CONFLICT",
		"BAD_REQUEST",
		"RATE_LIMITED",
	],
});

export const open = base.use(trailMiddleware);

export const pub = open.use(({ context, next, errors }) => {
	if (!context.access) {
		throw errors.ACCESS_REQUIRED();
	}

	return next();
});

export const authed = pub.use(({ context, next, errors }) => {
	if (!context.lawyer) {
		throw errors.UNAUTHORIZED();
	}

	return next({ context: { lawyer: context.lawyer } });
});
