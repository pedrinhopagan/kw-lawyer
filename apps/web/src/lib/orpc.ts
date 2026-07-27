import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { InferClientInputs, InferClientOutputs } from "@orpc/client";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@api/router";
import { ACCESS_PATH, GATE_ORDER, LOGIN_PATH, ONBOARDING_PATH } from "./gates";

const SERVER_ERROR_STATUS = 500;
const MAX_RETRIES = 2;

const link = new RPCLink({
	url: `${window.location.origin}/orpc`,
	fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
});

export const orpcClient: RouterClient<AppRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(orpcClient);

function gatePathOf(code: string) {
	if (code === "ACCESS_REQUIRED") {
		return ACCESS_PATH;
	}

	if (code === "UNAUTHORIZED") {
		return LOGIN_PATH;
	}

	if (code === "SYNC_REQUIRED") {
		return ONBOARDING_PATH;
	}

	return null;
}

function expireSession(error: unknown) {
	if (!(error instanceof ORPCError)) {
		return;
	}

	const target = gatePathOf(error.code);

	if (!target) {
		return;
	}

	// Senha do gate recusada em /entrar chega como UNAUTHORIZED, o mesmo código de sessão vencida.
	// Tratar isso como expiração recarregava a página inteira, engolia o aviso do erro e devolvia a
	// advogada para /entrar com o endereço aninhado dentro dele mesmo a cada tentativa.
	const current = GATE_ORDER.indexOf(window.location.pathname);

	if (current >= 0 && GATE_ORDER.indexOf(target) >= current) {
		return;
	}

	// A primeira carga termina no painel inteiro, não na tela de onde a advogada veio: guardar um
	// redirect aqui só a devolveria para uma rota que ainda não tem dado nenhum.
	if (target === ONBOARDING_PATH) {
		window.location.assign(target);

		return;
	}

	const destination = encodeURIComponent(window.location.pathname + window.location.search);

	window.location.assign(`${target}?redirect=${destination}`);
}

export function isClientError(error: unknown) {
	return error instanceof ORPCError && error.status < SERVER_ERROR_STATUS;
}

function retryUnlessClientError(failureCount: number, error: Error) {
	if (isClientError(error)) {
		return false;
	}

	return failureCount < MAX_RETRIES;
}

export const queryClient = new QueryClient({
	queryCache: new QueryCache({ onError: expireSession }),
	mutationCache: new MutationCache({ onError: expireSession }),
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: retryUnlessClientError,
			staleTime: 30_000,
		},
	},
});

export type RouterInputs = InferClientInputs<typeof orpcClient>;
export type RouterOutputs = InferClientOutputs<typeof orpcClient>;
