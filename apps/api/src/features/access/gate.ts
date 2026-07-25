import { createHmac, timingSafeEqual } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { CookieOptions } from "hono/utils/cookie";
import { accessGateConfigured, env } from "../../env.ts";
import { registerAttempt } from "../auth/attempts.ts";

export const ACCESS_COOKIE_NAME = "kw_access";
export const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ACCESS_ATTEMPT_LIMIT = 8;
const ACCESS_ATTEMPT_WINDOW_MS = 60_000;

function accessSecret() {
	if (!env.ACCESS_PASSWORD) {
		throw new Error("Gate de acesso sem ACCESS_PASSWORD");
	}

	return env.ACCESS_PASSWORD;
}

function sign(payload: string) {
	return createHmac("sha256", accessSecret()).update(payload).digest("base64url");
}

function matches(candidate: string, expected: string) {
	const left = Buffer.from(candidate);
	const right = Buffer.from(expected);

	if (left.length !== right.length) {
		return false;
	}

	return timingSafeEqual(left, right);
}

export function accessCookieOptions(): CookieOptions {
	return {
		httpOnly: true,
		sameSite: "Lax",
		path: "/",
		secure: env.NODE_ENV === "production",
		maxAge: ACCESS_TTL_MS / 1000,
	};
}

export function createAccessToken() {
	const payload = `${env.ACCESS_USER}.${Date.now() + ACCESS_TTL_MS}`;

	return `${payload}.${sign(payload)}`;
}

export function hasAccess(token?: string) {
	if (!accessGateConfigured) {
		return true;
	}

	if (!token) {
		return false;
	}

	const separator = token.lastIndexOf(".");
	const payload = token.slice(0, separator);
	const [user, expiresAt] = payload.split(".");

	if (user !== env.ACCESS_USER || Number(expiresAt) <= Date.now()) {
		return false;
	}

	return matches(token.slice(separator + 1), sign(payload));
}

function grantsAccess(input: { user: string; password: string }) {
	if (!matches(input.user.trim(), env.ACCESS_USER ?? "")) {
		return false;
	}

	return matches(input.password, env.ACCESS_PASSWORD ?? "");
}

export function openAccess(input: { user: string; password: string }) {
	if (!accessGateConfigured) {
		return { token: "" };
	}

	const attempts = registerAttempt(`access:${input.user.trim()}`, {
		windowMs: ACCESS_ATTEMPT_WINDOW_MS,
	});

	if (attempts > ACCESS_ATTEMPT_LIMIT) {
		throw new ORPCError("RATE_LIMITED", {
			message: "Muitas tentativas de entrada. Espere um minuto e tente de novo.",
		});
	}

	if (!grantsAccess(input)) {
		throw new ORPCError("UNAUTHORIZED", { message: "Usuário ou senha incorretos." });
	}

	return { token: createAccessToken() };
}
