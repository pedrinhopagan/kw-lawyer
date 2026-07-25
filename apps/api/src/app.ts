import { db } from "./db/client.ts";
import { seedDev } from "./db/seed-dev.ts";
import { env } from "./env.ts";
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

console.log(`[api] Ouvindo em http://localhost:${env.PORT}`);

export default { port: env.PORT, fetch: app.fetch };
