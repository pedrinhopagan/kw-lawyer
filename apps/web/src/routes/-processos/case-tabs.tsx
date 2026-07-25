import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import type { CaseTab } from "./search";

export interface CaseTabDefinition {
	key: CaseTab;
	label: string;
	count?: number;
}

export function CaseTabs({
	cnj,
	active,
	tabs,
}: {
	cnj: string;
	active: CaseTab;
	tabs: CaseTabDefinition[];
}) {
	return (
		<nav className="sticky top-12 z-20 -mx-4 mt-5 border-b border-border bg-background/95 px-4 backdrop-blur-sm md:top-0">
			<ul className="scrollbar-none -mb-px flex gap-0.5 overflow-x-auto">
				{tabs.map((tab) => {
					const current = tab.key === active;

					return (
						<li key={tab.key} className="shrink-0">
							<Link
								to="/processos/$cnj"
								params={{ cnj }}
								search={tab.key === "visao-geral" ? {} : { aba: tab.key }}
								aria-current={current ? "page" : undefined}
								className={cn(
									"inline-flex items-baseline gap-1.5 border-b-2 px-2.5 py-2.5 text-2xs font-medium tracking-[0.08em] uppercase transition-colors",
									current
										? "border-primary text-foreground"
										: "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
								)}
							>
								{tab.label}
								{tab.count !== undefined && tab.count > 0 && (
									<span
										className={cn(
											"font-mono text-2xs tabular-nums",
											current ? "text-primary" : "text-muted-foreground/70",
										)}
									>
										{tab.count}
									</span>
								)}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
