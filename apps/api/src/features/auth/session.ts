import { type } from "arktype";
import type { CookieOptions } from "hono/utils/cookie";
import { env } from "../../env.ts";

export interface SessionLawyer {
	id: string;
	name: string;
	oabNumber: string;
	oabUf: string;
}

export const SESSION_COOKIE_NAME = "kw_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_RENEWAL_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

const SESSION_TOKEN_BYTES = 32;

const rpcLoginBodySchema = type("string.json.parse").to({ json: { token: "string" } });

export function createSessionToken() {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES))).toString(
		"base64url",
	);
}

export function sessionCookieOptions(): CookieOptions {
	return {
		httpOnly: true,
		sameSite: "Lax",
		path: "/",
		secure: env.NODE_ENV === "production",
		maxAge: SESSION_TTL_MS / 1000,
	};
}

export function readLoginToken(body: string) {
	const parsed = rpcLoginBodySchema(body);

	if (parsed instanceof type.errors) {
		return null;
	}

	return parsed.json.token;
}
