import { GoogleCalendarClient } from "@kw-lawyer/api/src/features/calendar/google/events.ts";
import {
	GOOGLE_CALENDAR_SCOPES,
	GoogleOAuthClient,
} from "@kw-lawyer/api/src/features/calendar/google/oauth.ts";

const TOKEN_LIFETIME_SECONDS = 3600;

export interface GoogleStubCall {
	method: string;
	path: string;
	grantType: string | null;
}

export interface GoogleStubState {
	accountEmail: string;
	accessToken: string;
	refreshToken: string | undefined;
	tokenError: { status: number; error: string } | null;
	goneEventIds: Set<string>;
}

const notFound = () =>
	Response.json(
		{ error: { code: 404, message: "Not Found", status: "NOT_FOUND" } },
		{ status: 404 },
	);

async function grantTypeOf(request: Request) {
	if (!request.headers.get("content-type")?.includes("x-www-form-urlencoded")) {
		return null;
	}

	return new URLSearchParams(await request.text()).get("grant_type");
}

export function startGoogleStub() {
	const calls: GoogleStubCall[] = [];
	const state: GoogleStubState = {
		accountEmail: "advogada@example.com",
		accessToken: "access-token-1",
		refreshToken: "refresh-token-1",
		tokenError: null,
		goneEventIds: new Set(),
	};

	let insertedEvents = 0;

	const server = Bun.serve({
		port: 0,
		async fetch(request) {
			const { pathname } = new URL(request.url);
			const grantType = await grantTypeOf(request);

			calls.push({ method: request.method, path: pathname, grantType });

			if (pathname === "/token") {
				if (state.tokenError) {
					return Response.json(
						{ error: state.tokenError.error, error_description: "token recusado pelo stub" },
						{ status: state.tokenError.status },
					);
				}

				return Response.json({
					access_token: state.accessToken,
					expires_in: TOKEN_LIFETIME_SECONDS,
					refresh_token: state.refreshToken,
					scope: GOOGLE_CALENDAR_SCOPES.join(" "),
				});
			}

			if (pathname === "/oauth2/v3/userinfo") {
				return Response.json({ email: state.accountEmail });
			}

			const eventsMatch = /\/calendar\/v3\/calendars\/[^/]+\/events(?:\/([^/]+))?$/u.exec(pathname);

			if (!eventsMatch) {
				return notFound();
			}

			const googleEventId = eventsMatch[1];

			if (!googleEventId) {
				insertedEvents += 1;

				return Response.json({ id: `evt-${insertedEvents}` });
			}

			if (state.goneEventIds.has(googleEventId)) {
				return notFound();
			}

			if (request.method === "DELETE") {
				return new Response(null, { status: 204 });
			}

			return Response.json({ id: googleEventId });
		},
	});

	return {
		state,
		calls,
		url: server.url.origin,
		calendarCalls: () => calls.filter((call) => call.path.includes("/calendar/v3/")),
		close: () => server.stop(true),
	};
}

export function googleStubClients(url: string) {
	return {
		oauth: new GoogleOAuthClient({ oauthBaseUrl: url, apiBaseUrl: url, maxAttempts: 1 }),
		calendar: new GoogleCalendarClient({ apiBaseUrl: url, maxAttempts: 1 }),
	};
}
