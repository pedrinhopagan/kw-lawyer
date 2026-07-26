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

function DayHeading({ dueAt, onDay }: { dueAt: string; onDay?: (day: string) => void }) {
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
			{!onDay && (
				<span className="ml-auto text-2xs text-muted-foreground">{countdownLabel(dueAt)}</span>
			)}

			{!!onDay && (
				<button
					type="button"
					className="ml-auto cursor-pointer text-2xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
					onClick={() => onDay(dueAt)}
				>
					{countdownLabel(dueAt)}, ver o dia
				</button>
			)}
		</div>
	);
}

export function AgendaList({
	items,
	onOpen,
	onDay,
}: {
	items: DeadlineItem[];
	onOpen: (item: DeadlineItem) => void;
	onDay?: (day: string) => void;
}) {
	return (
		<>
			{groupByDueDate(items).map((group) => (
				<section key={group.dueAt}>
					<DayHeading dueAt={group.dueAt} onDay={onDay} />

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
