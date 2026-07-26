import { type } from "arktype";
import { AuthManager } from "../features/auth/manager.ts";
import { authed, pub } from "../orpc.ts";

export const authRouter = {
	// A OAB nova entra no mesmo aparelho de quem já estava dentro: o advogado anterior continua
	// conectado e passa a ser mais um perfil do seletor.
	login: pub
		.input(type({ oabNumber: "string > 0", oabUf: "string > 0", "name?": "string > 0" }))
		.handler(({ input, context }) => {
			const current = context.session;

			return new AuthManager(context.db).loginWithOab({
				...input,
				deviceId: current && current.deviceId,
			});
		}),

	profiles: authed.handler(({ context }) => new AuthManager(context.db).profiles(context.session)),

	switch: authed
		.input(type({ lawyerId: "string.uuid" }))
		.handler(({ input, context }) =>
			new AuthManager(context.db).switchTo({ context: context.session, lawyerId: input.lawyerId }),
		),

	logout: authed
		.input(type({ "pushEndpoint?": "string > 0" }))
		.handler(({ input, context }) =>
			new AuthManager(context.db).logout({ context: context.session, ...input }),
		),

	// O middleware de /orpc já resolveu a sessão com um join em lawyers e trouxe estes mesmos
	// campos. Refazer o SELECT aqui é uma query por boot e por revalidação de aba.
	me: pub.handler(({ context }) => {
		if (!context.session) {
			return { lawyer: null };
		}

		return { lawyer: context.session.lawyer };
	}),
};
