import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { calendarEvents } from "@kw-lawyer/api/src/db/schema/calendar_events.ts";
import { calendarIntegrations } from "@kw-lawyer/api/src/db/schema/calendar_integrations.ts";
import { deadlines } from "@kw-lawyer/api/src/db/schema/deadlines.ts";
import { encryptToken } from "@kw-lawyer/api/src/features/calendar/crypto.ts";
import { CLOSED_STATUSES, OPEN_STATUSES } from "@kw-lawyer/api/src/features/deadlines/filters.ts";
import { GOOGLE_CALENDAR_SCOPES } from "@kw-lawyer/api/src/features/calendar/google/oauth.ts";
import { CalendarManager } from "@kw-lawyer/api/src/features/calendar/manager.ts";
import { ORPCError } from "@orpc/server";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assertDefined, assertIsInstanceOf } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { googleStubClients, startGoogleStub } from "./utils/google-stub.ts";
import { seedCase, seedDeadline, seedLawyer } from "./utils/seed.ts";

const HOUR_MS = 60 * 60 * 1000;

async function seedIntegration(tx: Tx, params: { lawyerId: string; expiresAt: Date }) {
	const [row] = await tx
		.insert(calendarIntegrations)
		.values({
			lawyerId: params.lawyerId,
			accountEmail: "advogada@example.com",
			accessToken: encryptToken("access-token-0"),
			refreshToken: encryptToken("refresh-token-0"),
			expiresAt: params.expiresAt,
			scope: GOOGLE_CALENDAR_SCOPES.join(" "),
		})
		.returning({ id: calendarIntegrations.id });

	assertDefined(row);

	return row.id;
}

async function seedAgenda(tx: Tx, oabNumber: string) {
	const lawyer = await seedLawyer(tx, oabNumber);
	const caseId = await seedCase(tx, {
		lawyerId: lawyer.id,
		cnjNumber: `1020457852023826020${oabNumber.slice(-1)}`,
		tribunal: "TJSP",
	});
	const dela = await seedDeadline(tx, {
		lawyerId: lawyer.id,
		caseId,
		title: "Contrarrazões de apelação",
		dueAt: "2026-08-03",
		audience: "partes",
	});

	await seedDeadline(tx, {
		lawyerId: lawyer.id,
		caseId,
		title: "Laudo do perito",
		dueAt: "2026-08-04",
		audience: "terceiro",
	});

	return { lawyer, dela };
}

test(
	"o recorte da ação dela vira evento no Google, não duplica no reenvio e some quando o prazo fecha",
	withRollback(async (tx) => {
		const stub = startGoogleStub();

		try {
			const { oauth, calendar } = googleStubClients(stub.url);
			const { lawyer, dela } = await seedAgenda(tx, "95101");

			await seedIntegration(tx, { lawyerId: lawyer.id, expiresAt: new Date(Date.now() + HOUR_MS) });

			const manager = new CalendarManager(tx, oauth, calendar);
			const primeiro = await manager.sync({ lawyerId: lawyer.id, filters: { actionable: true } });

			expect(primeiro).toEqual({ created: 1, updated: 0, unchanged: 0, removed: 0, pending: 0 });
			expect(stub.calendarCalls()).toEqual([
				{ method: "POST", path: "/calendar/v3/calendars/primary/events", grantType: null },
			]);

			const links = await tx
				.select({ googleEventId: calendarEvents.googleEventId })
				.from(calendarEvents)
				.where(eq(calendarEvents.deadlineId, dela));

			expect(links).toEqual([{ googleEventId: "evt-1" }]);

			expect(await manager.sync({ lawyerId: lawyer.id, filters: { actionable: true } })).toEqual({
				created: 0,
				updated: 0,
				unchanged: 1,
				removed: 0,
				pending: 0,
			});
			expect(stub.calendarCalls()).toHaveLength(1);

			await tx.update(deadlines).set({ dueAt: "2026-08-10" }).where(eq(deadlines.id, dela));

			expect(await manager.sync({ lawyerId: lawyer.id, filters: { actionable: true } })).toEqual({
				created: 0,
				updated: 1,
				unchanged: 0,
				removed: 0,
				pending: 0,
			});
			expect(stub.calendarCalls().at(-1)).toMatchObject({
				method: "PATCH",
				path: "/calendar/v3/calendars/primary/events/evt-1",
			});

			await tx.update(deadlines).set({ status: "cumprido" }).where(eq(deadlines.id, dela));

			expect(await manager.sync({ lawyerId: lawyer.id, filters: { actionable: true } })).toEqual({
				created: 0,
				updated: 0,
				unchanged: 0,
				removed: 1,
				pending: 0,
			});
			expect(stub.calendarCalls().at(-1)).toMatchObject({
				method: "DELETE",
				path: "/calendar/v3/calendars/primary/events/evt-1",
			});
			expect(
				await tx.select().from(calendarEvents).where(eq(calendarEvents.deadlineId, dela)),
			).toHaveLength(0);
		} finally {
			await stub.close();
		}
	}),
);

test(
	"o prazo de terceiro só vai para o Google quando ela pede o recorte sem filtro de ação",
	withRollback(async (tx) => {
		const stub = startGoogleStub();

		try {
			const { oauth, calendar } = googleStubClients(stub.url);
			const { lawyer } = await seedAgenda(tx, "95102");

			await seedIntegration(tx, { lawyerId: lawyer.id, expiresAt: new Date(Date.now() + HOUR_MS) });

			const manager = new CalendarManager(tx, oauth, calendar);

			expect(await manager.sync({ lawyerId: lawyer.id, filters: {} })).toMatchObject({
				created: 2,
			});
			expect(await manager.status(lawyer.id)).toMatchObject({
				connected: true,
				accountEmail: "advogada@example.com",
				calendarId: "primary",
				syncedCount: 2,
			});
		} finally {
			await stub.close();
		}
	}),
);

test(
	"token vencido é renovado antes de mandar o evento",
	withRollback(async (tx) => {
		const stub = startGoogleStub();

		try {
			const { oauth, calendar } = googleStubClients(stub.url);
			const { lawyer } = await seedAgenda(tx, "95103");
			const integrationId = await seedIntegration(tx, {
				lawyerId: lawyer.id,
				expiresAt: new Date(Date.now() - HOUR_MS),
			});

			await new CalendarManager(tx, oauth, calendar).sync({
				lawyerId: lawyer.id,
				filters: { actionable: true },
			});

			expect(stub.calls.filter((call) => call.path === "/token")).toEqual([
				{ method: "POST", path: "/token", grantType: "refresh_token" },
			]);

			const [integration] = await tx
				.select({ expiresAt: calendarIntegrations.expiresAt })
				.from(calendarIntegrations)
				.where(eq(calendarIntegrations.id, integrationId));

			assertDefined(integration);
			expect(integration.expiresAt.getTime()).toBeGreaterThan(Date.now());
		} finally {
			await stub.close();
		}
	}),
);

test(
	"evento apagado no Google é recriado no lugar do que sumiu",
	withRollback(async (tx) => {
		const stub = startGoogleStub();

		try {
			const { oauth, calendar } = googleStubClients(stub.url);
			const { lawyer, dela } = await seedAgenda(tx, "95104");

			await seedIntegration(tx, { lawyerId: lawyer.id, expiresAt: new Date(Date.now() + HOUR_MS) });

			const manager = new CalendarManager(tx, oauth, calendar);

			await manager.sync({ lawyerId: lawyer.id, filters: { actionable: true } });

			stub.state.goneEventIds.add("evt-1");

			await tx.update(deadlines).set({ dueAt: "2026-08-11" }).where(eq(deadlines.id, dela));

			expect(
				await manager.sync({ lawyerId: lawyer.id, filters: { actionable: true } }),
			).toMatchObject({ updated: 1 });

			const links = await tx
				.select({ googleEventId: calendarEvents.googleEventId })
				.from(calendarEvents)
				.where(eq(calendarEvents.deadlineId, dela));

			expect(links).toEqual([{ googleEventId: "evt-2" }]);
		} finally {
			await stub.close();
		}
	}),
);

test(
	"consentimento revogado no Google derruba a conexão e pede reconexão em pt-br",
	withRollback(async (tx) => {
		const stub = startGoogleStub();

		try {
			const { oauth, calendar } = googleStubClients(stub.url);
			const { lawyer } = await seedAgenda(tx, "95105");

			await seedIntegration(tx, { lawyerId: lawyer.id, expiresAt: new Date(Date.now() - HOUR_MS) });

			stub.state.tokenError = { status: 400, error: "invalid_grant" };

			const rejection = await new CalendarManager(tx, oauth, calendar)
				.sync({ lawyerId: lawyer.id, filters: { actionable: true } })
				.then(
					() => null,
					(reason: unknown) => reason,
				);

			assertIsInstanceOf(rejection, ORPCError);
			expect(rejection.code).toBe("UNAUTHORIZED");
			expect(rejection.message).toBe(
				"Conexão com o Google Agenda expirou. Conecte a conta novamente.",
			);
			expect(await new CalendarManager(tx, oauth, calendar).status(lawyer.id)).toMatchObject({
				connected: false,
			});
		} finally {
			await stub.close();
		}
	}),
);

test(
	"recorte com status fechado não ressuscita no Google o prazo cumprido",
	withRollback(async (tx) => {
		const stub = startGoogleStub();

		try {
			const { oauth, calendar } = googleStubClients(stub.url);
			const { lawyer, dela } = await seedAgenda(tx, "95106");

			await seedIntegration(tx, { lawyerId: lawyer.id, expiresAt: new Date(Date.now() + HOUR_MS) });

			const manager = new CalendarManager(tx, oauth, calendar);

			await manager.sync({ lawyerId: lawyer.id, filters: { actionable: true } });
			await tx.update(deadlines).set({ status: "cumprido" }).where(eq(deadlines.id, dela));

			const todosOsStatus = { status: [...OPEN_STATUSES, ...CLOSED_STATUSES], actionable: true };

			expect(await manager.sync({ lawyerId: lawyer.id, filters: todosOsStatus })).toEqual({
				created: 0,
				updated: 0,
				unchanged: 0,
				removed: 1,
				pending: 0,
			});
			expect(await manager.sync({ lawyerId: lawyer.id, filters: todosOsStatus })).toEqual({
				created: 0,
				updated: 0,
				unchanged: 0,
				removed: 0,
				pending: 0,
			});
			expect(
				await tx.select().from(calendarEvents).where(eq(calendarEvents.deadlineId, dela)),
			).toHaveLength(0);
			expect(stub.calendarCalls().filter((call) => call.method === "POST")).toHaveLength(1);
		} finally {
			await stub.close();
		}
	}),
);

test(
	"reconectar com outra conta Google não reaproveita o token de renovação da conta anterior",
	withRollback(async (tx) => {
		const stub = startGoogleStub();

		try {
			const { oauth, calendar } = googleStubClients(stub.url);
			const { lawyer } = await seedAgenda(tx, "95107");

			await seedIntegration(tx, { lawyerId: lawyer.id, expiresAt: new Date(Date.now() + HOUR_MS) });

			const manager = new CalendarManager(tx, oauth, calendar);

			stub.state.refreshToken = undefined;
			stub.state.accountEmail = "outra-conta@example.com";

			const rejection = await manager
				.connect({ lawyerId: lawyer.id, code: "code-1", redirectUri: "http://localhost/callback" })
				.then(
					() => null,
					(reason: unknown) => reason,
				);

			assertIsInstanceOf(rejection, ORPCError);
			expect(rejection.code).toBe("BAD_REQUEST");
			expect(await manager.status(lawyer.id)).toMatchObject({
				accountEmail: "advogada@example.com",
			});

			stub.state.accountEmail = "advogada@example.com";

			expect(
				await manager.connect({
					lawyerId: lawyer.id,
					code: "code-2",
					redirectUri: "http://localhost/callback",
				}),
			).toMatchObject({ accountEmail: "advogada@example.com" });
		} finally {
			await stub.close();
		}
	}),
);
