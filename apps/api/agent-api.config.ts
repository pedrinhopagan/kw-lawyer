import { defineOrpcConfig } from "@juicerq/agent-api/orpc";
import { db } from "./src/db/client.ts";
import { AuthManager } from "./src/features/auth/manager.ts";
import { appRouter } from "./src/router.ts";

export default defineOrpcConfig({
	router: appRouter,
	// Esta entrada não é um navegador: ela assume o advogado por parâmetro, sem sessão gravada. O
	// aparelho sintético mantém o contrato do contexto e deixa a troca de perfil sem alcance aqui,
	// que é o certo, já que não existe nenhuma sessão anterior para autorizá-la.
	context: async (args) => {
		const { lawyer } = await new AuthManager(db).me(args.as);

		if (!lawyer) {
			return { session: null, access: true, db };
		}

		return { session: { lawyer, deviceId: crypto.randomUUID() }, access: true, db };
	},
});
