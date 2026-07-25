import { type } from "arktype";
import { env } from "../../../env.ts";
import {
	type GoogleClientOptions,
	type GoogleRetryPolicy,
	googleCredentials,
	googleRequest,
	googleRetryPolicy,
} from "./request.ts";

export const GOOGLE_CALENDAR_SCOPES = [
	"https://www.googleapis.com/auth/calendar.events",
	"https://www.googleapis.com/auth/userinfo.email",
];

const googleTokenSchema = type({
	access_token: "string > 0",
	expires_in: "number > 0",
	"refresh_token?": "string > 0",
	scope: "string > 0",
}).pipe((raw) => ({
	accessToken: raw.access_token,
	refreshToken: raw.refresh_token,
	expiresAt: new Date(Date.now() + raw.expires_in * 1000),
	scope: raw.scope,
}));

const googleUserInfoSchema = type({ email: "string.email" }).pipe((raw) => raw.email);

interface GoogleOAuthClientOptions extends GoogleClientOptions {
	accountsBaseUrl?: string;
	oauthBaseUrl?: string;
	apiBaseUrl?: string;
}

export class GoogleOAuthClient {
	private readonly accountsBaseUrl: string;
	private readonly oauthBaseUrl: string;
	private readonly apiBaseUrl: string;
	private readonly policy: GoogleRetryPolicy;

	constructor(options: GoogleOAuthClientOptions) {
		this.accountsBaseUrl = (options.accountsBaseUrl ?? env.GOOGLE_ACCOUNTS_BASE_URL).replaceAll(
			/\/+$/gu,
			"",
		);
		this.oauthBaseUrl = (options.oauthBaseUrl ?? env.GOOGLE_OAUTH_BASE_URL).replaceAll(
			/\/+$/gu,
			"",
		);
		this.apiBaseUrl = (options.apiBaseUrl ?? env.GOOGLE_API_BASE_URL).replaceAll(/\/+$/gu, "");
		this.policy = googleRetryPolicy(options);
	}

	authUrl(params: { state: string; redirectUri: string }) {
		const url = new URL(`${this.accountsBaseUrl}/o/oauth2/v2/auth`);

		url.searchParams.set("client_id", googleCredentials().clientId);
		url.searchParams.set("redirect_uri", params.redirectUri);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
		url.searchParams.set("access_type", "offline");
		url.searchParams.set("prompt", "consent");
		url.searchParams.set("include_granted_scopes", "true");
		url.searchParams.set("state", params.state);

		return url.toString();
	}

	async exchangeCode(params: { code: string; redirectUri: string }) {
		const { clientId, clientSecret } = googleCredentials();

		return this.assertToken(
			await googleRequest({
				url: new URL(`${this.oauthBaseUrl}/token`),
				method: "POST",
				form: new URLSearchParams({
					client_id: clientId,
					client_secret: clientSecret,
					code: params.code,
					grant_type: "authorization_code",
					redirect_uri: params.redirectUri,
				}),
				policy: this.policy,
			}),
		);
	}

	async refresh(params: { refreshToken: string }) {
		const { clientId, clientSecret } = googleCredentials();

		return this.assertToken(
			await googleRequest({
				url: new URL(`${this.oauthBaseUrl}/token`),
				method: "POST",
				form: new URLSearchParams({
					client_id: clientId,
					client_secret: clientSecret,
					refresh_token: params.refreshToken,
					grant_type: "refresh_token",
				}),
				policy: this.policy,
			}),
		);
	}

	async userEmail(params: { accessToken: string }) {
		const email = googleUserInfoSchema(
			await googleRequest({
				url: new URL(`${this.apiBaseUrl}/oauth2/v3/userinfo`),
				method: "GET",
				accessToken: params.accessToken,
				policy: this.policy,
			}),
		);

		if (email instanceof type.errors) {
			throw new TypeError(`Resposta de perfil do Google em formato inesperado: ${email.summary}`);
		}

		return email;
	}

	private assertToken(payload: unknown) {
		const token = googleTokenSchema(payload);

		if (token instanceof type.errors) {
			throw new TypeError(`Resposta de token do Google em formato inesperado: ${token.summary}`);
		}

		return token;
	}
}
