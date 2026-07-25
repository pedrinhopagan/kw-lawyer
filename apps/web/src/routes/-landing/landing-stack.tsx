import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, CodeXmlIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { REPO_URL } from "./landing-meta";

const STACK = [
	"Bun",
	"Hono",
	"oRPC",
	"Arktype",
	"Drizzle",
	"Postgres",
	"React 19",
	"TanStack Router",
	"TanStack Query",
	"Tailwind v4",
];

export function LandingStack() {
	return (
		<section className="border-b border-border bg-sidebar/40">
			<div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2 lg:items-center lg:gap-16">
				<div>
					<span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
						código aberto
					</span>

					<h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em]">
						Aberto para ler, fechado para entrar
					</h2>

					<p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
						O repositório é público: dá para ver como o prazo é contado, como a publicação é
						normalizada e como cada eixo é classificado. O painel em si pede credencial, porque quem
						entra vê processo de gente real.
					</p>

					<div className="mt-8 flex flex-wrap items-center gap-3">
						<a
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
							className={cn(buttonVariants({ size: "lg" }), "gap-2")}
						>
							<CodeXmlIcon className="size-4" />
							Ver o repositório
						</a>

						<Link
							to="/entrar"
							className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
						>
							Entrar no painel
							<ArrowRightIcon className="size-4" />
						</Link>
					</div>
				</div>

				<ul className="flex flex-wrap gap-1.5">
					{STACK.map((item) => (
						<li key={item} className="tag-tribunal">
							{item}
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
