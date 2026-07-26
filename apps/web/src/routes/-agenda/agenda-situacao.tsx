import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { STATUS_LABELS } from "@/lib/deadline-meta";
import { DeadlineRow } from "./deadline-row";
import type { DeadlineItem, DeadlineSummary } from "./queries";
import { groupStatusesOf, groupSummaryInputOf } from "./query-input";
import type { AgendaSearch, DeadlineStatus } from "./search";

const GROUP_ORDER: DeadlineStatus[] = ["pendente", "cumprido", "descartado"];

const COUNT_KEYS: Record<DeadlineStatus, keyof DeadlineSummary> = {
	pendente: "pending",
	cumprido: "done",
	descartado: "dismissed",
};

const GROUP_NOTES: Record<DeadlineStatus, string> = {
	pendente: "Correndo na sua agenda, ainda sem baixa.",
	cumprido: "Já protocolados ou resolvidos.",
	descartado: "Tirados da sua agenda por não serem prazo seu.",
};

export function AgendaSituacao({
	search,
	items,
	onOpen,
}: {
	search: AgendaSearch;
	items: DeadlineItem[];
	onOpen: (item: DeadlineItem) => void;
}) {
	const { data } = useQuery(
		orpc.deadlines.summary.queryOptions({ input: groupSummaryInputOf(search) }),
	);
	const visible = groupStatusesOf(search);

	return (
		<>
			{GROUP_ORDER.filter((status) => visible.includes(status)).map((status) => {
				const group = items.filter((item) => item.status === status);
				const total = data?.[COUNT_KEYS[status]];

				return (
					<section key={status}>
						<div className="flex items-baseline gap-2 border-b border-border bg-muted/30 px-4 py-1.5">
							<h2 className="text-xs font-semibold">{STATUS_LABELS[status]}</h2>

							{total !== undefined && (
								<span className="font-mono text-2xs text-muted-foreground tabular-nums">
									{total}
								</span>
							)}

							<span className="ml-auto hidden text-2xs text-muted-foreground sm:inline">
								{GROUP_NOTES[status]}
							</span>
						</div>

						{group.length === 0 && (
							<p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
								{!total && "Nenhum prazo neste grupo dentro do recorte atual."}
								{!!total &&
									"Nenhum prazo deste grupo entre os já carregados. Use Carregar mais no fim da lista."}
							</p>
						)}

						{group.length > 0 && (
							<ul className="divide-y divide-border border-b border-border">
								{group.map((item) => (
									<DeadlineRow key={item.id} item={item} onOpen={onOpen} />
								))}
							</ul>
						)}
					</section>
				);
			})}
		</>
	);
}
