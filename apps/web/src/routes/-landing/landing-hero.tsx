import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, CodeXmlIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { REPO_URL } from "./landing-meta";

const SAMPLE_ROWS = [
	{ label: "publicação", value: "intimação do TJSP, vara cível" },
	{ label: "processo", value: "0000000-00.0000.0.00.0000" },
	{ label: "prazo", value: "15 dias úteis, calendário do tribunal" },
	{ label: "eixo", value: "recorrer, apelação cabível" },
];

export function LandingHero() {
	return (
		<section className="relative overflow-hidden border-b border-border">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 grid-paper opacity-70 [mask-image:radial-gradient(ellipse_75%_60%_at_30%_35%,black,transparent)]"
			/>

			<div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center lg:gap-16 lg:pb-28 lg:pt-24">
				<div className="animate-rise">
					<span className="tag-tribunal">DJEN · DataJud · CNJ</span>

					<h1 className="mt-6 max-w-[16ch] text-balance text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[3.5rem]">
						O processo já disse o que fazer.
						<span className="block text-muted-foreground">Falta alguém organizar.</span>
					</h1>

					<p className="mt-6 max-w-[52ch] text-base leading-relaxed text-muted-foreground">
						O kw-lawyer lê as publicações do diário eletrônico e os movimentos do processo, conta o
						prazo pelo calendário do tribunal e entrega cada ato como uma ação a tomar, com a
						decisão, a prova e o documento original já reunidos.
					</p>

					<div className="mt-9 flex flex-wrap items-center gap-3">
						<Link to="/entrar" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
							Entrar no painel
							<ArrowRightIcon className="size-4" />
						</Link>

						<a
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
							className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
						>
							<CodeXmlIcon className="size-4" />
							Código no GitHub
						</a>
					</div>

					<p className="mt-5 text-2xs uppercase tracking-[0.16em] text-muted-foreground">
						fonte pública · nada sigiloso · nada escrito em nome de ninguém
					</p>
				</div>

				<div className="animate-rise [animation-delay:150ms]">
					<div className="relative rounded-lg border border-border bg-card shadow-[0_1px_0_0_var(--border),0_18px_40px_-32px_oklch(0_0_0/0.55)]">
						<div className="relative h-1 overflow-hidden rounded-t-lg bg-muted">
							<span className="absolute inset-y-0 w-1/4 animate-sweep bg-primary/70" />
						</div>

						<div className="flex items-center justify-between border-b border-border px-4 py-3">
							<span className="font-mono text-2xs uppercase tracking-[0.16em] text-muted-foreground">
								o que chega
							</span>
							<span className="tag-tribunal">hoje</span>
						</div>

						<dl className="divide-y divide-border">
							{SAMPLE_ROWS.map((row) => (
								<div key={row.label} className="flex flex-col gap-1 px-4 py-3">
									<dt className="font-mono text-2xs uppercase tracking-[0.16em] text-muted-foreground">
										{row.label}
									</dt>
									<dd className="num-cnj text-foreground">{row.value}</dd>
								</div>
							))}
						</dl>

						<div className="border-t border-border px-4 py-3">
							<p className="text-xs leading-relaxed text-muted-foreground">
								Cada linha carrega o rastro: de qual publicação veio, por qual regra o prazo foi
								contado e com que confiança.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
