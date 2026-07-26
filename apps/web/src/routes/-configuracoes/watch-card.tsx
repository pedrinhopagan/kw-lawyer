import { useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, ClockIcon, TriangleAlertIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEventDate } from "@/lib/format";
import { orpc, type RouterOutputs } from "@/lib/orpc";
import { pluralOf } from "../-agenda/agenda-meta";

type WatchCycle = RouterOutputs["notifications"]["watch"]["collection"];

function CycleLine({ label, cycle }: { label: string; cycle: WatchCycle }) {
	const failed = cycle?.status === "falhou";

	return (
		<div className="flex items-baseline gap-2">
			<span className="w-16 shrink-0 text-2xs tracking-[0.12em] text-muted-foreground uppercase">
				{label}
			</span>

			{!cycle && <span className="text-xs text-muted-foreground">nenhum ciclo ainda</span>}

			{!!cycle && (
				<span className="flex min-w-0 flex-1 items-baseline gap-1.5">
					{failed && (
						<TriangleAlertIcon className="size-3 shrink-0 translate-y-0.5 text-destructive" />
					)}
					{!failed && (
						<CheckCircle2Icon className="size-3 shrink-0 translate-y-0.5 text-muted-foreground" />
					)}

					<span className="min-w-0 text-xs">
						{formatEventDate(cycle.startedAt)}
						<span className="text-muted-foreground">
							{", "}
							{cycle.lawyers} advogado{pluralOf(cycle.lawyers)}
						</span>
					</span>
				</span>
			)}
		</div>
	);
}

export function WatchCard() {
	const watch = useQuery(orpc.notifications.watch.queryOptions());

	if (!watch.data) {
		return <Skeleton className="h-32 w-full" />;
	}

	const { collection, alert } = watch.data;

	return (
		<div className="rounded-md border border-border bg-card">
			<div className="flex items-start gap-3 px-4 py-4">
				<ClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-semibold">Vigilância automática</h3>

					<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
						O servidor busca as publicações às 6h e às 13h e manda os alertas às 7h, horário de
						Brasília. Você não precisa abrir o app para o prazo entrar na agenda.
					</p>

					{collection?.status === "falhou" && (
						<p className="mt-2 text-xs leading-relaxed text-destructive">
							{collection.errorMessage}
						</p>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-2 border-t border-border px-4 py-3">
				<CycleLine label="Coleta" cycle={collection} />
				<CycleLine label="Alerta" cycle={alert} />
			</div>
		</div>
	);
}
