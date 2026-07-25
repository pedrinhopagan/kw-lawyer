import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { AgendaList } from "./agenda-list";
import {
	currentMonth,
	monthGridDays,
	monthTitle,
	shiftedMonth,
	WEEKDAY_INITIALS,
} from "./agenda-meta";
import { fullDate, todayIso, urgencyOf } from "@/lib/deadline-meta";
import type { DeadlineItem } from "./queries";

const VISIBLE_PER_DAY = 3;

const DOT_TONE = {
	vencido: "bg-destructive",
	hoje: "bg-primary",
	proximo: "bg-primary/50",
	futuro: "bg-muted-foreground/40",
} as const;

function itemsByDay(items: DeadlineItem[]) {
	const byDay = new Map<string, DeadlineItem[]>();

	for (const item of items) {
		const list = byDay.get(item.dueAt) ?? [];

		list.push(item);
		byDay.set(item.dueAt, list);
	}

	return byDay;
}

function DayCell({
	day,
	month,
	items,
	onOpen,
	onDay,
}: {
	day: string;
	month: string;
	items: DeadlineItem[];
	onOpen: (item: DeadlineItem) => void;
	onDay: (day: string) => void;
}) {
	const outside = !day.startsWith(month);
	const today = day === todayIso();
	const hidden = items.length - VISIBLE_PER_DAY;

	return (
		<li
			className={cn(
				"flex min-h-24 flex-col gap-1 border-r border-b border-border p-1.5 last:border-r-0",
				outside && "bg-muted/25",
			)}
		>
			<button
				type="button"
				aria-label={`Ver prazos de ${fullDate(day)}`}
				className={cn(
					"size-5 shrink-0 cursor-pointer self-start rounded-full font-mono text-2xs tabular-nums transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
					outside ? "text-muted-foreground/50" : "text-muted-foreground",
					today && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
				)}
				onClick={() => onDay(day)}
			>
				{day.slice(8)}
			</button>

			{items.slice(0, VISIBLE_PER_DAY).map((item) => (
				<button
					key={item.id}
					type="button"
					className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-2xs leading-tight transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
					onClick={() => onOpen(item)}
				>
					<span
						aria-hidden
						className={cn("size-1.5 shrink-0 rounded-full", DOT_TONE[urgencyOf(item.dueAt)])}
					/>
					<span className="truncate">{item.title}</span>
				</button>
			))}

			{hidden > 0 && (
				<button
					type="button"
					className="cursor-pointer px-1 text-left text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
					onClick={() => onDay(day)}
				>
					mais {hidden}
				</button>
			)}
		</li>
	);
}

export function AgendaCalendar({
	items,
	month,
	onMonth,
	onDay,
	onOpen,
}: {
	items: DeadlineItem[];
	month: string;
	onMonth: (month: string) => void;
	onDay: (day: string) => void;
	onOpen: (item: DeadlineItem) => void;
}) {
	const byDay = itemsByDay(items);

	return (
		<>
			<div className="flex items-center gap-2 border-b border-border px-4 py-2">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Mês anterior"
					onClick={() => onMonth(shiftedMonth(month, -1))}
				>
					<ChevronLeftIcon />
				</Button>

				<p className="text-sm font-medium first-letter:uppercase">{monthTitle(month)}</p>

				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Próximo mês"
					onClick={() => onMonth(shiftedMonth(month, 1))}
				>
					<ChevronRightIcon />
				</Button>

				{month !== currentMonth() && (
					<Button
						variant="outline"
						size="xs"
						className="ml-auto"
						onClick={() => onMonth(currentMonth())}
					>
						Este mês
					</Button>
				)}
			</div>

			<div className="hidden md:block">
				<ul aria-hidden className="grid grid-cols-7 border-b border-border">
					{WEEKDAY_INITIALS.map((weekday) => (
						<li
							key={weekday}
							className="px-1.5 py-1 text-2xs tracking-wide text-muted-foreground uppercase"
						>
							{weekday}
						</li>
					))}
				</ul>

				<ol className="grid grid-cols-7 border-b border-border">
					{monthGridDays(month).map((day) => (
						<DayCell
							key={day}
							day={day}
							month={month}
							items={byDay.get(day) ?? []}
							onOpen={onOpen}
							onDay={onDay}
						/>
					))}
				</ol>
			</div>

			<div className="md:hidden">
				{items.length === 0 && (
					<p className="px-4 py-10 text-center text-xs leading-relaxed text-muted-foreground">
						Nenhum prazo em {monthTitle(month)} dentro do recorte atual.
					</p>
				)}

				{items.length > 0 && <AgendaList items={items} onOpen={onOpen} />}
			</div>
		</>
	);
}
