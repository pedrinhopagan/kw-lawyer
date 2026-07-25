import { accessRouter } from "./router/access.ts";
import { appealsRouter } from "./router/appeals.ts";
import { authRouter } from "./router/auth.ts";
import { calendarRouter } from "./router/calendar.ts";
import { casesRouter } from "./router/cases.ts";
import { deadlinesRouter } from "./router/deadlines.ts";
import { decisionsRouter } from "./router/decisions.ts";
import { evidenceRouter } from "./router/evidence.ts";
import { hubRouter } from "./router/hub.ts";
import { incidentsRouter } from "./router/incidents.ts";
import { oabsRouter } from "./router/oabs.ts";
import { publicationsRouter } from "./router/publications.ts";
import { syncRouter } from "./router/sync.ts";

export const appRouter = {
	access: accessRouter,
	auth: authRouter,
	sync: syncRouter,
	cases: casesRouter,
	deadlines: deadlinesRouter,
	decisions: decisionsRouter,
	evidence: evidenceRouter,
	appeals: appealsRouter,
	incidents: incidentsRouter,
	hub: hubRouter,
	oabs: oabsRouter,
	publications: publicationsRouter,
	calendar: calendarRouter,
};

export type AppRouter = typeof appRouter;
