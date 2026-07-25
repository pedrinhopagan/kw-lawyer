import { type } from "arktype";
import { env } from "../../../env.ts";

const GOOGLE_DEFAULT_TIMEOUT_MS = 15_000;
const GOOGLE_DEFAULT_MAX_ATTEMPTS = 3;
const GOOGLE_DEFAULT_RETRY_DELAY_MS = 500;
const GOOGLE_MAX_RETRY_DELAY_MS = 8_000;
const GOOGLE_RATE_LIMIT_STATUS = 429;

export const GOOGLE_GONE_STATUSES = [404, 410];

export class GoogleRequestError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code?: string,
	) {
		super(message);
		this.name = "GoogleRequestError";
	}
}

export interface GoogleClientOptions {
	timeoutMs?: number;
	maxAttempts?: number;
	retryDelayMs?: number;
}

export interface GoogleRetryPolicy {
	timeoutMs: number;
	maxAttempts: number;
	retryDelayMs: number;
}

interface GoogleRequestInput {
	url: URL;
	method: "GET" | "POST" | "PATCH" | "DELETE";
	form?: URLSearchParams;
	json?: unknown;
	accessToken?: string;
	policy: GoogleRetryPolicy;
}

type GoogleAttempt =
	| { ok: true; payload: unknown }
	| { ok: false; error: GoogleRequestError; retryable: boolean; waitMs: number | null };

const googleErrorSchema = type({
	"error?": type("string").or({
		"code?": "number",
		"message?": "string",
		"status?": "string",
	}),
	"error_description?": "string",
});

export function googleRetryPolicy(options: GoogleClientOptions): GoogleRetryPolicy {
	return {
		timeoutMs: options.timeoutMs ?? GOOGLE_DEFAULT_TIMEOUT_MS,
		maxAttempts: options.maxAttempts ?? GOOGLE_DEFAULT_MAX_ATTEMPTS,
		retryDelayMs: options.retryDelayMs ?? GOOGLE_DEFAULT_RETRY_DELAY_MS,
	};
}

export function googleCredentials() {
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
		throw new Error(
			"GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configurados: a integração com o Google Agenda está indisponível.",
		);
	}

	return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

function parseJson(body: string): unknown {
	if (!body.trim()) {
		return null;
	}

	try {
		return JSON.parse(body);
	} catch {
		return null;
	}
}

function waitFromRateLimit(response: Response) {
	const retryAfterSeconds = Number(response.headers.get("retry-after"));

	if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
		return retryAfterSeconds * 1000;
	}

	return null;
}

function failureFrom(status: number, body: string) {
	const generic = `Google respondeu com status ${status}`;
	const parsed = googleErrorSchema(parseJson(body) ?? {});

	if (parsed instanceof type.errors) {
		return new GoogleRequestError(generic, status);
	}

	if (typeof parsed.error === "string") {
		return new GoogleRequestError(parsed.error_description ?? parsed.error, status, parsed.error);
	}

	return new GoogleRequestError(parsed.error?.message ?? generic, status, parsed.error?.status);
}

function headersFor(input: GoogleRequestInput) {
	const headers: Record<string, string> = { accept: "application/json" };

	if (input.accessToken) {
		headers.authorization = `Bearer ${input.accessToken}`;
	}

	if (input.form) {
		headers["content-type"] = "application/x-www-form-urlencoded";
	}

	if (input.json !== undefined) {
		headers["content-type"] = "application/json";
	}

	return headers;
}

async function attempt(input: GoogleRequestInput): Promise<GoogleAttempt> {
	try {
		const response = await fetch(input.url, {
			method: input.method,
			headers: headersFor(input),
			body: input.form ?? (input.json === undefined ? undefined : JSON.stringify(input.json)),
			signal: AbortSignal.timeout(input.policy.timeoutMs),
		});

		if (!response.ok) {
			return {
				ok: false,
				error: failureFrom(response.status, await response.text()),
				retryable: response.status === GOOGLE_RATE_LIMIT_STATUS || response.status >= 500,
				waitMs: waitFromRateLimit(response),
			};
		}

		return { ok: true, payload: parseJson(await response.text()) };
	} catch (error) {
		return {
			ok: false,
			error: new GoogleRequestError(`Falha ao falar com o Google: ${String(error)}`, 0),
			retryable: true,
			waitMs: null,
		};
	}
}

export async function googleRequest(input: GoogleRequestInput) {
	for (let tries = 1; tries <= input.policy.maxAttempts; tries++) {
		const result = await attempt(input);

		if (result.ok) {
			return result.payload;
		}

		if (!result.retryable || tries === input.policy.maxAttempts) {
			throw result.error;
		}

		const backoffMs = input.policy.retryDelayMs * 2 ** (tries - 1);

		await Bun.sleep(Math.min(result.waitMs ?? backoffMs, GOOGLE_MAX_RETRY_DELAY_MS));
	}

	throw new GoogleRequestError("Falha ao falar com o Google", 0);
}
