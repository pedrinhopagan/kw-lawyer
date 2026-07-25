import { cn } from "@/lib/cn";
import { groupByDueDate } from "./agenda-meta";
import {
	countdownLabel,
	dayNumber,
	monthLabel,
	urgencyOf,
	weekdayLabel,
} from "@/lib/deadline-meta";
import { DeadlineRow } from "./deadline-row";
import type { DeadlineItem } from "./queries";

function DayHeading({ dueAt }: { dueAt: string }) {
	return (
		<div className="flex items-baseline gap-3 border-b border-border bg-muted/30 px-4 py-1.5">
			<span
				className={cn(
					"font-mono text-sm font-semibold tabular-nums",
					urgencyOf(dueAt) === "vencido" && "text-destructive",
				)}
			>
				{dayNumber(dueAt)}
			</span>
			<span className="font-mono text-2xs tracking-wide text-muted-foreground uppercase">
				{monthLabel(dueAt)}
			</span>
			<span className="text-2xs text-muted-foreground">{weekdayLabel(dueAt)}</span>
			<span className="ml-auto text-2xs text-muted-foreground">{countdownLabel(dueAt)}</span>
		</div>
	);
}

export function AgendaList({
	items,
	onOpen,
}: {
	items: DeadlineItem[];
	onOpen: (item: DeadlineItem) => void;
}) {
	return (
		<>
			{groupByDueDate(items).map((group) => (
				<section key={group.dueAt}>
					<DayHeading dueAt={group.dueAt} />

					<ul className="divide-y divide-border border-b border-border">
						{group.items.map((item) => (
							<DeadlineRow key={item.id} item={item} onOpen={onOpen} />
						))}
					</ul>
				</section>
			))}
		</>
	);
}
