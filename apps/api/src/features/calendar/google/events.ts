import { type } from "arktype";
import { env } from "../../../env.ts";
import {
	GOOGLE_GONE_STATUSES,
	type GoogleClientOptions,
	GoogleRequestError,
	type GoogleRetryPolicy,
	googleRequest,
	googleRetryPolicy,
} from "./request.ts";

export interface GoogleEventPayload {
	summary: string;
	description: string;
	start: { date: string };
	end: { date: string };
	transparency: string;
	colorId: string;
	reminders: { useDefault: false; overrides: { method: string; minutes: number }[] };
}

const googleEventSchema = type({ id: "string > 0" }).pipe((raw) => ({ googleEventId: raw.id }));

interface GoogleCalendarClientOptions extends GoogleClientOptions {
	apiBaseUrl?: string;
}

export class GoogleCalendarClient {
	private readonly apiBaseUrl: string;
	private readonly policy: GoogleRetryPolicy;

	constructor(options: GoogleCalendarClientOptions) {
		this.apiBaseUrl = (options.apiBaseUrl ?? env.GOOGLE_API_BASE_URL).replaceAll(/\/+$/gu, "");
		this.policy = googleRetryPolicy(options);
	}

	async insertEvent(params: {
		accessToken: string;
		calendarId: string;
		event: GoogleEventPayload;
	}) {
		const created = googleEventSchema(
			await googleRequest({
				url: this.eventsUrl(params.calendarId),
				method: "POST",
				json: params.event,
				accessToken: params.accessToken,
				policy: this.policy,
			}),
		);

		if (created instanceof type.errors) {
			throw new TypeError(`Resposta de evento do Google em formato inesperado: ${created.summary}`);
		}

		return created;
	}

	async patchEvent(params: {
		accessToken: string;
		calendarId: string;
		googleEventId: string;
		event: GoogleEventPayload;
	}) {
		const patched = googleEventSchema(
			await googleRequest({
				url: this.eventUrl(params.calendarId, params.googleEventId),
				method: "PATCH",
				json: params.event,
				accessToken: params.accessToken,
				policy: this.policy,
			}),
		);

		if (patched instanceof type.errors) {
			throw new TypeError(`Resposta de evento do Google em formato inesperado: ${patched.summary}`);
		}

		return patched;
	}

	async deleteEvent(params: { accessToken: string; calendarId: string; googleEventId: string }) {
		try {
			await googleRequest({
				url: this.eventUrl(params.calendarId, params.googleEventId),
				method: "DELETE",
				accessToken: params.accessToken,
				policy: this.policy,
			});

			return { deleted: true };
		} catch (error) {
			if (error instanceof GoogleRequestError && GOOGLE_GONE_STATUSES.includes(error.status)) {
				return { deleted: false };
			}

			throw error;
		}
	}

	private eventsUrl(calendarId: string) {
		return new URL(
			`${this.apiBaseUrl}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
		);
	}

	private eventUrl(calendarId: string, googleEventId: string) {
		return new URL(
			`${this.apiBaseUrl}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
		);
	}
}
