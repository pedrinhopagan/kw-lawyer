import { createHmac } from "node:crypto";
import { createHonoMiddleware } from "@juicerq/trail/hono";
import { RPCHandler } from "@orpc/server/fetch";
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Db, Tx } from "./db/client.ts";
import {
	ACCESS_COOKIE_NAME,
	accessCookieOptions,
	createAccessToken,
	hasAccess,
} from "./features/access/gate.ts";
import { AuthManager } from "./features/auth/manager.ts";
import {
	readSessionToken,
	SESSION_COOKIE_NAME,
	sessionCookieOptions,
} from "./features/auth/session.ts";
import { CalendarManager } from "./features/calendar/manager.ts";
import { GoogleOAuthClient } from "./features/calendar/google/oauth.ts";
import { accessGateConfigured, env, googleCalendarConfigured } from "./env.ts";
import { obs } from "./observability.ts";
import { appRouter } from "./router.ts";

const ORPC_PREFIX = "/orpc";
const ORPC_LOGIN_PATH = "/orpc/auth/login";
const ORPC_LOGOUT_PATH = "/orpc/auth/logout";
const ORPC_SWITCH_PATH = "/orpc/auth/switch";
const ORPC_ACCESS_LOGIN_PATH = "/orpc/access/login";
const ORPC_ACCESS_LOGOUT_PATH = "/orpc/access/logout";

// Entrar, trocar de advogado e sair respondem com o token que passa a valer nesta aba, então o
// cookie sai da resposta e não da renovação automática logo abaixo.
const SESSION_TOKEN_PATHS = new Set([ORPC_LOGIN_PATH, ORPC_SWITCH_PATH, ORPC_LOGOUT_PATH]);

const COOKIE_OWNED_PATHS = new Set([
	...SESSION_TOKEN_PATHS,
	ORPC_ACCESS_LOGIN_PATH,
	ORPC_ACCESS_LOGOUT_PATH,
]);

const GOOGLE_STATE_COOKIE_NAME = "kw_google_state";
const GOOGLE_STATE_TTL_S = 600;
const GOOGLE_STATE_BYTES = 32;
const GOOGLE_REDIRECT_URI = `${env.APP_BASE_URL}/auth/google/callback`;

type CreateApiAppOptions = {
	db: Db | Tx;
};

function agendaRedirect(feedback: "conectado" | "erro" | "nao_configurado") {
	return `${env.APP_BASE_URL}/agenda?google=${feedback}`;
}

function stateSignature(params: { state: string; sessionToken: string }) {
	return createHmac("sha256", params.sessionToken).update(params.state).digest("base64url");
}

async function currentSession(c: Context, db: Db | Tx) {
	const token = getCookie(c, SESSION_COOKIE_NAME);

	if (!token) {
		return null;
	}

	return await new AuthManager(db).resolveSession(token);
}

export function createApiApp(options: CreateApiAppOptions) {
	const app = new Hono();

	app.use(
		"*",
		createHonoMiddleware(obs, {
			slowRequestMs: 3000,
			maxFieldBytes: 512,
		}),
	);

	const handler = new RPCHandler(appRouter);

	app.get("/auth/google/start", async (c) => {
		if (!googleCalendarConfigured) {
			return c.redirect(agendaRedirect("nao_configurado"));
		}

		const session = await currentSession(c, options.db);

		if (!session) {
			return c.redirect(agendaRedirect("erro"));
		}

		const sessionToken = getCookie(c, SESSION_COOKIE_NAME);

		if (!sessionToken) {
			return c.redirect(agendaRedirect("erro"));
		}

		const state = Buffer.from(crypto.getRandomValues(new Uint8Array(GOOGLE_STATE_BYTES))).toString(
			"base64url",
		);

		setCookie(c, GOOGLE_STATE_COOKIE_NAME, stateSignature({ state, sessionToken }), {
			httpOnly: true,
			sameSite: "Lax",
			path: "/",
			secure: env.NODE_ENV === "production",
			maxAge: GOOGLE_STATE_TTL_S,
		});

		return c.redirect(
			new GoogleOAuthClient({}).authUrl({ state, redirectUri: GOOGLE_REDIRECT_URI }),
		);
	});

	app.get("/auth/google/callback", async (c) => {
		const signature = getCookie(c, GOOGLE_STATE_COOKIE_NAME);

		deleteCookie(c, GOOGLE_STATE_COOKIE_NAME, { path: "/" });

		if (!googleCalendarConfigured) {
			return c.redirect(agendaRedirect("nao_configurado"));
		}

		const code = c.req.query("code");
		const state = c.req.query("state");
		const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
		const session = await currentSession(c, options.db);

		if (!session || !sessionToken || !code || !state || !signature) {
			return c.redirect(agendaRedirect("erro"));
		}

		if (signature !== stateSignature({ state, sessionToken })) {
			return c.redirect(agendaRedirect("erro"));
		}

		const connected = await new CalendarManager(options.db)
			.connect({ lawyerId: session.lawyer.id, code, redirectUri: GOOGLE_REDIRECT_URI })
			.catch((error: unknown) => {
				obs.escalate("error");
				obs.enrich({
					error_code: "google_connect_failed",
					error_message: error instanceof Error ? error.message : String(error),
				});

				return null;
			});

		if (!connected) {
			return c.redirect(agendaRedirect("erro"));
		}

		return c.redirect(agendaRedirect("conectado"));
	});

	app.use("/orpc/*", async (c, next) => {
		const currentToken = getCookie(c, SESSION_COOKIE_NAME);
		const session = currentToken
			? await new AuthManager(options.db).resolveSession(currentToken)
			: null;
		const access = hasAccess(getCookie(c, ACCESS_COOKIE_NAME));

		// Cookie emitido só no login expira sozinho e desloga quem depende de push. Toda request de
		// quem já entrou devolve a validade ao topo; os caminhos de login e de saída cuidam do próprio
		// cookie logo abaixo.
		if (!COOKIE_OWNED_PATHS.has(c.req.path)) {
			if (currentToken && session) {
				setCookie(c, SESSION_COOKIE_NAME, currentToken, sessionCookieOptions());
			}

			if (access && accessGateConfigured) {
				setCookie(c, ACCESS_COOKIE_NAME, createAccessToken(), accessCookieOptions());
			}
		}

		const { matched, response } = await handler.handle(c.req.raw, {
			prefix: ORPC_PREFIX,
			context: { session, access, db: options.db },
		});

		if (!matched) return next();

		if (c.req.path === ORPC_ACCESS_LOGOUT_PATH) {
			deleteCookie(c, ACCESS_COOKIE_NAME, { path: "/" });
			deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });

			return c.newResponse(response.body, response);
		}

		if (!response.ok) {
			if (c.req.path === ORPC_LOGOUT_PATH) {
				deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
			}

			return c.newResponse(response.body, response);
		}

		if (c.req.path === ORPC_ACCESS_LOGIN_PATH) {
			const body = await response.text();
			const accessToken = readSessionToken(body);

			if (accessToken) {
				setCookie(c, ACCESS_COOKIE_NAME, accessToken, accessCookieOptions());
			}

			return c.newResponse(body, response);
		}

		if (!SESSION_TOKEN_PATHS.has(c.req.path)) {
			return c.newResponse(response.body, response);
		}

		const body = await response.text();
		const sessionToken = readSessionToken(body);

		// Sair do último perfil é o único caso legítimo de resposta sem token: os outros dois caminhos
		// existem justamente para dizer qual sessão passa a valer.
		if (!sessionToken) {
			if (c.req.path !== ORPC_LOGOUT_PATH) {
				throw new Error(`${c.req.path} respondeu sem token de sessão`);
			}

			deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });

			return c.newResponse(body, response);
		}

		setCookie(c, SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());

		return c.newResponse(body, response);
	});

	return app;
}
