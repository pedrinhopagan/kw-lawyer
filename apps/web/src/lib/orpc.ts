import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { InferClientInputs, InferClientOutputs } from "@orpc/client";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@api/router";

const LOGIN_PATH = "/login";
const ACCESS_PATH = "/entrar";
const SERVER_ERROR_STATUS = 500;
const MAX_RETRIES = 2;

const link = new RPCLink({
	url: `${window.location.origin}/orpc`,
	fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
});

export const orpcClient: RouterClient<AppRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(orpcClient);

function expireSession(error: unknown) {
	if (!(error instanceof ORPCError)) {
		return;
	}

	if (error.code !== "UNAUTHORIZED" && error.code !== "ACCESS_REQUIRED") {
		return;
	}

	const target = error.code === "ACCESS_REQUIRED" ? ACCESS_PATH : LOGIN_PATH;

	if (window.location.pathname === target) {
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
