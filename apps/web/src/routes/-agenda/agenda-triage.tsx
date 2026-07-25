import { Link } from "@tanstack/react-router";
import { formatCnj } from "@/lib/format";
import type { TriageItem } from "./queries";

export function AgendaTriage({ items }: { items: TriageItem[] }) {
	return (
		<>
			<p className="border-b border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
				Estas publicações são atos que costumam trazer prazo, mas o texto não disse quantos dias.
				Elas ficam aqui até você ler e decidir, em vez de sumirem da agenda.
			</p>

			<ul className="divide-y divide-border border-b border-border">
				{items.map((item) => (
					<li key={item.publicationId} className="flex flex-col gap-1 px-4 py-3">
						<div className="flex items-baseline gap-2">
							{!!item.tribunal && <span className="tag-tribunal">{item.tribunal}</span>}

							{!!item.case?.cnjNumber && (
								<Link
									to="/processos/$cnj"
									params={{ cnj: item.case.cnjNumber }}
									className="num-cnj text-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
								>
									{formatCnj(item.case.cnjNumber)}
								</Link>
							)}

							<time
								dateTime={item.availableAt}
								className="ml-auto font-mono text-2xs text-muted-foreground tabular-nums"
							>
								{item.availableAt.split("-").toReversed().join("/")}
							</time>
						</div>

						<p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
							{item.excerpt}
						</p>

						{item.reviewReasons.map((reason) => (
							<p key={reason} className="text-2xs text-muted-foreground/80">
								{reason}
							</p>
						))}
					</li>
				))}
			</ul>
		</>
	);
}
