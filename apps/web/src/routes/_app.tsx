import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { orpc, orpcClient } from "@/lib/orpc";
import { accessQueryOptions } from "./-auth/access";
import { sessionQueryOptions } from "./-auth/session";
import { AppSidebar } from "./-shell/app-sidebar";
import { MobileHeader } from "./-shell/mobile-header";
import { needsSync, syncStatusQueryOptions } from "./-shell/sync";

export const Route = createFileRoute("/_app")({
	beforeLoad: async ({ context, location }) => {
		const { granted } = await context.queryClient.ensureQueryData(accessQueryOptions);

		if (!granted) {
			redirect({ to: "/entrar", search: { redirect: location.href }, throw: true });
		}

		const { lawyer } = await context.queryClient.ensureQueryData(sessionQueryOptions);

		if (lawyer) {
			return;
		}

		redirect({ to: "/login", search: { redirect: location.href }, throw: true });
	},
	loader: async ({ context }) => {
		const status = await context.queryClient.ensureQueryData(syncStatusQueryOptions);

		if (!needsSync(status)) {
			return;
		}

		await orpcClient.sync.start({ force: false });
		await context.queryClient.invalidateQueries({ queryKey: orpc.sync.status.key() });
	},
	shouldReload: false,
	component: AppLayout,
});

function AppLayout() {
	const session = useQuery(sessionQueryOptions);
	const lawyer = session.data?.lawyer;

	if (!lawyer) {
		return null;
	}

	return (
		<div className="flex min-h-svh">
			<aside className="sticky top-0 hidden h-svh w-[15.5rem] shrink-0 border-r border-sidebar-border md:block">
				<AppSidebar lawyer={lawyer} />
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<MobileHeader lawyer={lawyer} />
				<main className="min-w-0 flex-1">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
