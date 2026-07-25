import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { calendarEvents } from "../../db/schema/calendar_events.ts";
import { calendarIntegrations } from "../../db/schema/calendar_integrations.ts";
import { cases } from "../../db/schema/cases.ts";
import { deadlines } from "../../db/schema/deadlines.ts";
import { googleCalendarConfigured } from "../../env.ts";
import { FORENSIC_TIME_ZONE } from "../deadlines/calendar.ts";
import {
	CLOSED_STATUSES,
	type DeadlineFilters,
	OPEN_STATUSES,
	deadlineWhere,
} from "../deadlines/filters.ts";
import { encryptToken, decryptToken } from "./crypto.ts";
import { buildDeadlineEvent } from "./event.ts";
import { GoogleCalendarClient } from "./google/events.ts";
import { GoogleOAuthClient } from "./google/oauth.ts";
import { GOOGLE_GONE_STATUSES, GoogleRequestError } from "./google/request.ts";

const SYNC_BATCH_SIZE = 200;
const SYNC_WRITE_LIMIT = 200;
const TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000;
const GOOGLE_INVALID_GRANT = "invalid_grant";

type IntegrationTokens = Pick<
	typeof calendarIntegrations.$inferSelect,
	"id" | "accessToken" | "refreshToken" | "expiresAt"
>;

interface SyncInput {
	lawyerId: string;
	filters: DeadlineFilters;
}

export class CalendarManager {
	constructor(
		private readonly db: Db | Tx,
		private readonly oauth = new GoogleOAuthClient({}),
		private readonly calendar = new GoogleCalendarClient({}),
	) {}

	async status(lawyerId: string) {
		const [integration] = await this.db
			.select({
				id: calendarIntegrations.id,
				accountEmail: calendarIntegrations.accountEmail,
				calendarId: calendarIntegrations.calendarId,
				lastSyncedAt: calendarIntegrations.lastSyncedAt,
			})
			.from(calendarIntegrations)
			.where(eq(calendarIntegrations.lawyerId, lawyerId))
			.limit(1);

		if (!integration) {
			return {
				configured: googleCalendarConfigured,
				connected: false,
				accountEmail: null,
				calendarId: null,
				lastSyncedAt: null,
				syncedCount: 0,
			};
		}

		const [synced] = await this.db
			.select({ total: count() })
			.from(calendarEvents)
			.where(eq(calendarEvents.integrationId, integration.id));

		return {
			configured: googleCalendarConfigured,
			connected: true,
			accountEmail: integration.accountEmail,
			calendarId: integration.calendarId,
			lastSyncedAt: integration.lastSyncedAt,
			syncedCount: synced?.total ?? 0,
		};
	}

	async connect(params: { lawyerId: string; code: string; redirectUri: string }) {
		this.assertConfigured();

		const token = await this.oauth.exchangeCode({
			code: params.code,
			redirectUri: params.redirectUri,
		});
		const accountEmail = await this.oauth.userEmail({ accessToken: token.accessToken });
		const refreshToken = token.refreshToken
			? encryptToken(token.refreshToken)
			: await this.storedRefreshToken({ lawyerId: params.lawyerId, accountEmail });

		if (!refreshToken) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"O Google não devolveu o token de renovação. Remova o acesso do app na sua Conta Google e conecte novamente.",
			});
		}

		const values = {
			accountEmail,
			accessToken: encryptToken(token.accessToken),
			refreshToken,
			expiresAt: token.expiresAt,
			scope: token.scope,
		};

		const [integration] = await this.db
			.insert(calendarIntegrations)
			.values({ lawyerId: params.lawyerId, ...values })
			.onConflictDoUpdate({ target: calendarIntegrations.lawyerId, set: values })
			.returning({
				accountEmail: calendarIntegrations.accountEmail,
				calendarId: calendarIntegrations.calendarId,
			});

		if (!integration) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Não foi possível salvar a conexão com o Google Agenda.",
			});
		}

		return integration;
	}

	async disconnect(lawyerId: string) {
		const [deleted] = await this.db
			.delete(calendarIntegrations)
			.where(eq(calendarIntegrations.lawyerId, lawyerId))
			.returning({ id: calendarIntegrations.id });

		return { disconnected: !!deleted };
	}

	async sync(input: SyncInput) {
		this.assertConfigured();

		const integration = await this.requireIntegration(input.lawyerId);
		const accessToken = await this.freshAccessToken(integration);
		const today = new Date().toLocaleDateString("en-CA", { timeZone: FORENSIC_TIME_ZONE });
		const result = { created: 0, updated: 0, unchanged: 0, removed: 0, pending: 0 };

		while (result.removed < SYNC_WRITE_LIMIT) {
			const links = await this.closedLinks(integration.id, SYNC_WRITE_LIMIT - result.removed);

			if (links.length === 0) {
				break;
			}

			for (const link of links) {
				await this.calendar.deleteEvent({
					accessToken,
					calendarId: integration.calendarId,
					googleEventId: link.googleEventId,
				});
				await this.db.delete(calendarEvents).where(eq(calendarEvents.id, link.id));

				result.removed += 1;
			}
		}

		if (result.removed >= SYNC_WRITE_LIMIT) {
			result.pending += await this.closedLinksTotal(integration.id);
		}

		let writes = result.removed;
		let offset = 0;

		for (;;) {
			const rows = await this.scopedDeadlines(input, integration.id, offset);

			if (rows.length === 0) {
				break;
			}

			offset += rows.length;

			for (const row of rows) {
				const { event, contentHash } = buildDeadlineEvent({
					deadline: row,
					case: row.case,
					today,
				});

				if (row.link?.contentHash === contentHash) {
					result.unchanged += 1;
					continue;
				}

				if (writes >= SYNC_WRITE_LIMIT) {
					result.pending += 1;
					continue;
				}

				writes += 1;

				if (!row.link) {
					const created = await this.calendar.insertEvent({
						accessToken,
						calendarId: integration.calendarId,
						event,
					});

					await this.db.insert(calendarEvents).values({
						integrationId: integration.id,
						deadlineId: row.id,
						googleEventId: created.googleEventId,
						contentHash,
					});

					result.created += 1;
					continue;
				}

				const patched = await this.patchOrRecreate({
					accessToken,
					calendarId: integration.calendarId,
					googleEventId: row.link.googleEventId,
					event,
				});

				await this.db
					.update(calendarEvents)
					.set({
						googleEventId: patched.googleEventId,
						contentHash,
						lastSyncedAt: new Date(),
					})
					.where(eq(calendarEvents.id, row.link.id));

				result.updated += 1;
			}

			if (rows.length < SYNC_BATCH_SIZE) {
				break;
			}
		}

		await this.db
			.update(calendarIntegrations)
			.set({ lastSyncedAt: new Date() })
			.where(eq(calendarIntegrations.id, integration.id));

		return result;
	}

	private assertConfigured() {
		if (googleCalendarConfigured) {
			return;
		}

		throw new ORPCError("BAD_REQUEST", {
			message:
				"Integração com o Google Agenda indisponível: o servidor está sem GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e TOKEN_ENCRYPTION_KEY.",
		});
	}

	private async readToken(integration: IntegrationTokens, field: "accessToken" | "refreshToken") {
		try {
			return decryptToken(integration[field]);
		} catch {
			await this.db.delete(calendarIntegrations).where(eq(calendarIntegrations.id, integration.id));

			throw new ORPCError("UNAUTHORIZED", {
				message:
					"Não foi possível ler os tokens salvos do Google Agenda. Conecte a conta novamente.",
			});
		}
	}

	private async storedRefreshToken(params: { lawyerId: string; accountEmail: string }) {
		const [integration] = await this.db
			.select({
				accountEmail: calendarIntegrations.accountEmail,
				refreshToken: calendarIntegrations.refreshToken,
			})
			.from(calendarIntegrations)
			.where(eq(calendarIntegrations.lawyerId, params.lawyerId))
			.limit(1);

		if (integration?.accountEmail !== params.accountEmail) {
			return;
		}

		return integration.refreshToken;
	}

	private async requireIntegration(lawyerId: string) {
		const [integration] = await this.db
			.select({
				id: calendarIntegrations.id,
				calendarId: calendarIntegrations.calendarId,
				accessToken: calendarIntegrations.accessToken,
				refreshToken: calendarIntegrations.refreshToken,
				expiresAt: calendarIntegrations.expiresAt,
			})
			.from(calendarIntegrations)
			.where(eq(calendarIntegrations.lawyerId, lawyerId))
			.limit(1);

		if (!integration) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Google Agenda não conectado. Conecte a conta antes de sincronizar.",
			});
		}

		return integration;
	}

	private async freshAccessToken(integration: IntegrationTokens) {
		if (integration.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_WINDOW_MS) {
			return await this.readToken(integration, "accessToken");
		}

		const token = await this.refreshed(integration);

		await this.db
			.update(calendarIntegrations)
			.set({
				accessToken: encryptToken(token.accessToken),
				refreshToken: token.refreshToken
					? encryptToken(token.refreshToken)
					: integration.refreshToken,
				expiresAt: token.expiresAt,
				scope: token.scope,
			})
			.where(eq(calendarIntegrations.id, integration.id));

		return token.accessToken;
	}

	private async refreshed(integration: IntegrationTokens) {
		const refreshToken = await this.readToken(integration, "refreshToken");

		try {
			return await this.oauth.refresh({ refreshToken });
		} catch (error) {
			if (!(error instanceof GoogleRequestError) || error.code !== GOOGLE_INVALID_GRANT) {
				throw error;
			}

			await this.db.delete(calendarIntegrations).where(eq(calendarIntegrations.id, integration.id));

			throw new ORPCError("UNAUTHORIZED", {
				message: "Conexão com o Google Agenda expirou. Conecte a conta novamente.",
			});
		}
	}

	private async patchOrRecreate(params: {
		accessToken: string;
		calendarId: string;
		googleEventId: string;
		event: Parameters<GoogleCalendarClient["insertEvent"]>[0]["event"];
	}) {
		try {
			return await this.calendar.patchEvent(params);
		} catch (error) {
			if (error instanceof GoogleRequestError && GOOGLE_GONE_STATUSES.includes(error.status)) {
				return await this.calendar.insertEvent(params);
			}

			throw error;
		}
	}

	private closedLinksConditions(integrationId: string) {
		return [
			eq(calendarEvents.integrationId, integrationId),
			inArray(deadlines.status, CLOSED_STATUSES),
		];
	}

	private async closedLinks(integrationId: string, limit: number) {
		return await this.db
			.select({ id: calendarEvents.id, googleEventId: calendarEvents.googleEventId })
			.from(calendarEvents)
			.innerJoin(deadlines, eq(deadlines.id, calendarEvents.deadlineId))
			.where(and(...this.closedLinksConditions(integrationId)))
			.limit(limit);
	}

	private async closedLinksTotal(integrationId: string) {
		const [row] = await this.db
			.select({ total: count() })
			.from(calendarEvents)
			.innerJoin(deadlines, eq(deadlines.id, calendarEvents.deadlineId))
			.where(and(...this.closedLinksConditions(integrationId)));

		return row?.total ?? 0;
	}

	private async scopedDeadlines(input: SyncInput, integrationId: string, offset: number) {
		return await this.db
			.select({
				id: deadlines.id,
				title: deadlines.title,
				days: deadlines.days,
				unit: deadlines.unit,
				dueAt: deadlines.dueAt,
				basis: deadlines.basis,
				snippet: deadlines.snippet,
				warnings: deadlines.warnings,
				case: {
					formattedNumber: cases.formattedNumber,
					tribunal: cases.tribunal,
					orgName: cases.orgName,
				},
				link: {
					id: calendarEvents.id,
					googleEventId: calendarEvents.googleEventId,
					contentHash: calendarEvents.contentHash,
				},
			})
			.from(deadlines)
			.leftJoin(cases, eq(cases.id, deadlines.caseId))
			.leftJoin(
				calendarEvents,
				and(
					eq(calendarEvents.deadlineId, deadlines.id),
					eq(calendarEvents.integrationId, integrationId),
				),
			)
			.where(
				and(
					deadlineWhere({ lawyerId: input.lawyerId, filters: input.filters }),
					inArray(deadlines.status, OPEN_STATUSES),
				),
			)
			.orderBy(asc(deadlines.dueAt), asc(deadlines.createdAt))
			.limit(SYNC_BATCH_SIZE)
			.offset(offset);
	}
}
