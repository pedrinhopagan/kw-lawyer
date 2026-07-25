import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LandingAgenda } from "./-landing/landing-agenda";
import { LandingEixos } from "./-landing/landing-eixos";
import { LandingEsteira } from "./-landing/landing-esteira";
import { LandingHero } from "./-landing/landing-hero";
import { REPO_URL } from "./-landing/landing-meta";
import { LandingStack } from "./-landing/landing-stack";
import { Brand } from "./-shell/brand";
import { ThemeToggle } from "./-shell/theme-toggle";

export const Route = createFileRoute("/")({
	component: LandingPage,
});

function LandingPage() {
	return (
		<div className="min-h-svh">
			<header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
				<div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
					<Brand />

					<div className="flex items-center gap-1.5">
						<ThemeToggle className="text-muted-foreground" />
						<Link to="/entrar" className={cn(buttonVariants({ size: "sm" }))}>
							Entrar
						</Link>
					</div>
				</div>
			</header>

			<main>
				<LandingHero />
				<LandingEsteira />
				<LandingEixos />
				<LandingAgenda />
				<LandingStack />
			</main>

			<footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-2xs uppercase tracking-[0.16em] text-muted-foreground">
				<span>kw-lawyer · painel de acompanhamento processual</span>

				<a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
					github
				</a>
			</footer>
		</div>
	);
}
