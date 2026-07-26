import { db, syncDb } from "./db/client.ts";
import { seedDev } from "./db/seed-dev.ts";
import { env } from "./env.ts";
import { FORENSIC_TIME_ZONE } from "./features/deadlines/calendar.ts";
import { ALERT_HOURS, COLLECT_HOURS, startWatchClock } from "./features/watch/clock.ts";
import { createApiApp } from "./http.ts";
import { obs } from "./observability.ts";

const app = createApiApp({ db });

if (env.NODE_ENV === "development") {
	await seedDev(db)
		.then((result) => {
			console.log(`[api] advogada de referência disponível (${result.lawyerId})`);
		})
		.catch((error: unknown) => {
			console.error("[api] seed de desenvolvimento falhou", error);
		});
}

setInterval(() => void obs.cleanup(), 60 * 60 * 1000);

// O relógio roda dentro deste processo, no mesmo lugar do cleanup: serviço separado no compose
// duplicaria imagem, env e deploy para uma advogada. Vale enquanto o compose tiver uma réplica de
// api; com duas, a coleta segue protegida pelo advisory lock e o disparo pelo unique de watch_cycles.
if (env.WATCH_CLOCK === "on") {
	startWatchClock(syncDb);

	console.log(
		`[watch] relógio ativo: coleta ${COLLECT_HOURS.map((hour) => `${hour}h`).join(" e ")}, alerta ${ALERT_HOURS.map((hour) => `${hour}h`).join(" e ")} (${FORENSIC_TIME_ZONE})`,
	);
}

console.log(`[api] Ouvindo em http://localhost:${env.PORT}`);

export default { port: env.PORT, fetch: app.fetch };
