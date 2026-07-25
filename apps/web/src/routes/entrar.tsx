import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { LockKeyholeIcon } from "lucide-react";
import { accessQueryOptions } from "./-auth/access";
import { AccessForm } from "./-auth/access-form";
import { validateRedirectSearch } from "./-auth/redirect-search";
import { Brand } from "./-shell/brand";
import { ThemeToggle } from "./-shell/theme-toggle";

export const Route = createFileRoute("/entrar")({
	validateSearch: validateRedirectSearch,
	beforeLoad: async ({ context, search }) => {
		const { granted } = await context.queryClient.ensureQueryData(accessQueryOptions);

		if (!granted) {
			return;
		}

		redirect({ href: search.redirect ?? "/publicacoes", throw: true });
	},
	component: AccessPage,
});

function AccessPage() {
	const search = Route.useSearch();

	return (
		<main className="relative flex min-h-svh flex-col items-center justify-center px-5 py-12">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 grid-paper opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_45%,black,transparent)]"
			/>

			<ThemeToggle className="absolute right-4 top-4 text-muted-foreground" />

			<div className="relative flex w-full max-w-[24rem] flex-col gap-6">
				<Brand />

				<div className="rounded-lg border border-border bg-card p-6">
					<span className="tag-tribunal">
						<LockKeyholeIcon className="mr-1 size-3" />
						acesso restrito
					</span>

					<h1 className="mt-3 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em]">
						Área do painel
					</h1>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						O painel é aberto no código e fechado no uso. Entre com as credenciais combinadas para
						chegar até a tela da OAB.
					</p>

					<div className="my-5 h-px bg-border" />

					<AccessForm redirectTo={search.redirect ?? "/publicacoes"} />
				</div>

				<Link
					to="/"
					className="px-1 text-2xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
				>
					← conhecer o projeto
				</Link>
			</div>
		</main>
	);
}
