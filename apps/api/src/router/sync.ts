import { type } from "arktype";
import { syncDb } from "../db/client.ts";
import { SyncManager } from "../features/sync/manager.ts";
import { obs } from "../observability.ts";
import { authed } from "../orpc.ts";

const syncStartInput = type({ force: "boolean = false" });

export const syncRouter = {
	start: authed.input(syncStartInput).handler(async ({ context, input }) => {
		const lawyerId = context.lawyer.id;
		const { runId, resumed } = await new SyncManager(context.db).start(lawyerId);

		if (resumed) {
			return { runId };
		}

		// O job sai da requisição e vai para o pool próprio: o crawl segura conexão por minutos, e as
		// dez da leitura são o que a primeira tela tem para responder enquanto ele roda.
		void obs
			.context({ type: "job", job_name: "sync.syncLawyer", user_id: lawyerId }, () =>
				new SyncManager(syncDb).syncLawyer(lawyerId, { runId, force: input.force }),
			)
			.catch((error: unknown) => {
				console.error(`[sync] sincronização ${runId} terminou com erro não tratado`, error);
			});

		return { runId };
	}),

	status: authed.handler(({ context }) => new SyncManager(context.db).status(context.lawyer.id)),

	progress: authed.handler(async function* ({ context, signal }) {
		yield* new SyncManager(context.db).events(context.lawyer.id, signal);
	}),
};
