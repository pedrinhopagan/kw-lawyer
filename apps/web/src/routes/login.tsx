import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { formatPersonName } from "@/lib/format";
import { Brand } from "./-shell/brand";
import { ThemeToggle } from "./-shell/theme-toggle";
import { accessQueryOptions } from "./-auth/access";
import { LoginForm } from "./-auth/login-form";
import { validateRedirectSearch } from "./-auth/redirect-search";
import { sessionQueryOptions } from "./-auth/session";

export const Route = createFileRoute("/login")({
	validateSearch: validateRedirectSearch,
	beforeLoad: async ({ context, location }) => {
		const { granted } = await context.queryClient.ensureQueryData(accessQueryOptions);

		if (granted) {
			return;
		}

		redirect({ to: "/entrar", search: { redirect: location.href }, throw: true });
	},
	component: LoginPage,
});

function LoginPage() {
	const search = Route.useSearch();
	const connected = useQuery(sessionQueryOptions).data?.lawyer;

	return (
		<main className="relative flex min-h-svh flex-col items-center justify-center px-5 py-12">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 grid-paper opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_45%,black,transparent)]"
			/>

			<ThemeToggle className="absolute right-4 top-4 text-muted-foreground" />

			<div className="relative flex w-full max-w-[27rem] flex-col gap-6">
				<Brand />

				<div className="rounded-lg border border-border bg-card p-6">
					<h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.02em]">
						Entre com a sua OAB
					</h1>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						O painel reúne tudo que foi publicado no seu nome e o andamento dos processos em que
						você aparece. Não existe senha porque só lemos fonte pública do CNJ: o seu número de
						inscrição já é o suficiente para encontrar as publicações.
					</p>

					{connected && (
						<p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
							{formatPersonName(connected.name)} continua conectado neste navegador. A OAB que você
							informar agora entra ao lado, e você alterna entre as duas pelo menu do rodapé.
						</p>
					)}

					<div className="my-5 h-px bg-border" />

					<LoginForm redirectTo={search.redirect ?? "/publicacoes"} />
				</div>

				<div className="flex items-start gap-2 px-1 text-2xs leading-relaxed text-muted-foreground">
					<span className="tag-tribunal shrink-0">CNJ</span>
					<p>
						Publicações e intimações vêm do DJEN. Os movimentos processuais vêm do DataJud. Nenhum
						dado sigiloso é acessado e nada é gravado em seu nome.
					</p>
				</div>
			</div>
		</main>
	);
}
