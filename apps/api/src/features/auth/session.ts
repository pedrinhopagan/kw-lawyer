import { type } from "arktype";
import type { CookieOptions } from "hono/utils/cookie";
import type { OnboardingState } from "../../db/schema/lawyers.ts";
import { env } from "../../env.ts";

export interface SessionLawyer {
	id: string;
	name: string;
	oabNumber: string;
	oabUf: string;
	historyCutoffAt: string;
	onboardingState: OnboardingState;
}

// O aparelho não carrega identidade própria em cookie: quem diz a qual grupo de sessões esta aba
// pertence é a sessão ativa. Um `device_id` viajando pelo navegador seria um segundo segredo, e
// adivinhar o de outra pessoa daria os painéis dela sem nenhuma OAB.
export interface SessionContext {
	lawyer: SessionLawyer;
	deviceId: string;
}

export interface SessionProfile {
	id: string;
	name: string;
	oabNumber: string;
	oabUf: string;
	onboardingState: OnboardingState;
	active: boolean;
}

export const SESSION_COOKIE_NAME = "kw_session";

// A advogada instala o PWA no celular e nunca mais toca no login: quem depende de push não pode ser
// deslogada por relógio. A validade é longa e volta ao topo em toda request, então a sessão só morre
// por ano inteiro sem abrir o app ou por "Sair".
export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const SESSION_ROW_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

const SESSION_TOKEN_BYTES = 32;

const rpcSessionBodySchema = type("string.json.parse").to({ json: { token: "string | null" } });

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

export function readSessionToken(body: string) {
	const parsed = rpcSessionBodySchema(body);

	if (parsed instanceof type.errors) {
		return null;
	}

	return parsed.json.token;
}
