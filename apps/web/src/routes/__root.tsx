import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/orpc";

export interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
});

function RootComponent() {
	return (
		<ThemeProvider>
			<QueryClientProvider client={queryClient}>
				<Outlet />
				<Toaster position="bottom-right" />
				{import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
				{import.meta.env.DEV && <ReactQueryDevtools />}
			</QueryClientProvider>
		</ThemeProvider>
	);
}

function NotFoundComponent() {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
			<span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
				404
			</span>
			<p className="max-w-sm text-sm text-muted-foreground">
				Esta página não existe. Volte para as publicações pelo menu lateral.
			</p>
		</div>
	);
}
