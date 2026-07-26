import { AlertsCard } from "./alerts-card";
import { WatchCard } from "./watch-card";

export function Configuracoes() {
	return (
		<div className="mx-auto w-full max-w-3xl pb-16">
			<header className="sticky top-[var(--kw-mobile-header)] z-20 border-b border-border bg-background/95 px-4 pt-4 pb-3 backdrop-blur md:top-0">
				<h1 className="text-[1.375rem] leading-none font-semibold tracking-[-0.02em]">
					Configurações
				</h1>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					O que o app faz sozinho e como ele te avisa.
				</p>
			</header>

			<section className="flex flex-col gap-4 px-4 py-5">
				<AlertsCard />
				<WatchCard />
			</section>
		</div>
	);
}
