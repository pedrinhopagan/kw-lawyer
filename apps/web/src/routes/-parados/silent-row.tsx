import { Link } from "@tanstack/react-router";
import { GavelIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCnj, formatEventDate, formatPersonName } from "@/lib/format";
import { datajudStaleLabel, type SilentCase, STATE_LABELS } from "./queries";

// Conclusão é o silêncio que mais dói: o processo está na mesa do juiz e nada voltou. A linha diz
// isso com cor, não só com texto, porque a advogada varre a lista de cima para baixo.
function toneOf(item: SilentCase) {
	if (item.state === "conclusao") {
		return "text-destructive";
	}

	return "text-muted-foreground";
}

export function SilentRow({ item }: { item: SilentCase }) {
	// O silêncio só vale o que vale a última consulta: se o tribunal parou de responder, os dias sem
	// andamento são uma conta sobre dado velho, e a linha precisa dizer isso antes de acusar ninguém.
	const stale = datajudStaleLabel(item.datajudSyncedAt);

	return (
		<li>
			<Link
				to="/processos/$cnj"
				params={{ cnj: item.formattedNumber }}
				className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="tag-tribunal">{item.tribunal}</span>
						<span className="num-cnj truncate text-muted-foreground">
							{formatCnj(item.cnjNumber)}
						</span>
					</div>

					<p className="mt-1 truncate text-sm text-foreground/80">
						{formatPersonName(item.className ?? "Classe não informada")}
					</p>

					{!!item.orgName && (
						<p className="mt-0.5 truncate text-xs text-muted-foreground">{item.orgName}</p>
					)}

					<p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground/85">
						<GavelIcon className="mt-[3px] size-3 shrink-0" />
						<span className="truncate">{item.lastMovementSummary ?? STATE_LABELS[item.state]}</span>
					</p>

					{!!stale && (
						<p className="mt-1 flex items-start gap-1.5 text-2xs text-muted-foreground/85">
							<TriangleAlertIcon className="mt-[2px] size-3 shrink-0" />
							<span className="truncate">{stale}</span>
						</p>
					)}
				</div>

				<div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
					<span
						className={cn(
							"font-mono text-sm leading-none font-semibold tabular-nums",
							toneOf(item),
						)}
					>
						{item.daysSilent}d
					</span>
					<span className="text-2xs whitespace-nowrap text-muted-foreground">
						{STATE_LABELS[item.state]}
					</span>
					<span className="text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
						{formatEventDate(item.lastMovementAt)}
					</span>
				</div>
			</Link>
		</li>
	);
}
