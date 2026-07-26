import { createFileRoute, redirect } from "@tanstack/react-router";
import { accessQueryOptions } from "./-auth/access";
import { sessionQueryOptions } from "./-auth/session";
import { Comecar } from "./-comecar/comecar";
import { ComecarPerfis } from "./-comecar/comecar-perfis";
import { Brand } from "./-shell/brand";
import { ThemeToggle } from "./-shell/theme-toggle";

export const Route = createFileRoute("/comecar")({
	beforeLoad: async ({ context, location }) => {
		const { granted } = await context.queryClient.ensureQueryData(accessQueryOptions);

		if (!granted) {
			redirect({ to: "/entrar", search: { redirect: location.href }, throw: true });
		}

		const { lawyer } = await context.queryClient.ensureQueryData(sessionQueryOptions);

		if (!lawyer) {
			redirect({ to: "/login", search: { redirect: location.href }, throw: true });

			return;
		}

		if (lawyer.onboardingState === "pronto") {
			redirect({ to: "/publicacoes", throw: true });
		}
	},
	component: ComecarPage,
});

function ComecarPage() {
	return (
		<main className="relative flex min-h-svh flex-col items-center justify-center px-5 py-12">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 grid-paper opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_45%,black,transparent)]"
			/>

			<ThemeToggle className="absolute right-4 top-4 text-muted-foreground" />

			<div className="relative flex w-full max-w-[28rem] flex-col gap-6">
				<Brand />

				<Comecar />

				<ComecarPerfis />
			</div>
		</main>
	);
}
