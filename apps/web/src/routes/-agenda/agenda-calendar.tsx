import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { MD_BREAKPOINT, useMediaQuery } from "@/hooks/use-media-query";
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
import { formatPersonName } from "@/lib/format";
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
				"relative flex min-h-24 flex-col gap-1 border-r border-b border-border p-1.5 transition-colors last:border-r-0 hover:bg-accent/40",
				outside && "bg-muted/25 hover:bg-muted/40",
			)}
		>
			<button
				type="button"
				aria-label={`Ver os prazos de ${fullDate(day)}`}
				className="absolute inset-0 cursor-pointer outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-ring/70"
				onClick={() => onDay(day)}
			/>

			<span
				className={cn(
					"pointer-events-none relative flex size-5 shrink-0 items-center justify-center self-start rounded-full font-mono text-2xs tabular-nums",
					outside ? "text-muted-foreground/50" : "text-muted-foreground",
					today && "bg-primary font-semibold text-primary-foreground",
				)}
			>
				{day.slice(8)}
			</span>

			{items.slice(0, VISIBLE_PER_DAY).map((item) => {
				const client = item.parties.at(0);

				return (
					<button
						key={item.id}
						type="button"
						title={client ? `${formatPersonName(client.name)}: ${item.title}` : item.title}
						className="relative flex w-full cursor-pointer flex-col items-start rounded-sm px-1 py-0.5 text-left text-2xs leading-tight transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
						onClick={() => onOpen(item)}
					>
						<span className="flex w-full items-center gap-1.5">
							<span
								aria-hidden
								className={cn("size-1.5 shrink-0 rounded-full", DOT_TONE[urgencyOf(item.dueAt)])}
							/>
							<span className="truncate font-medium">
								{!!client && formatPersonName(client.name)}
								{!client && item.title}
							</span>
						</span>

						{!!client && (
							<span className="w-full truncate pl-3 text-muted-foreground">{item.title}</span>
						)}
					</button>
				);
			})}

			{hidden > 0 && (
				<span className="pointer-events-none relative px-1 text-2xs text-muted-foreground">
					mais {hidden}
				</span>
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
	const desktop = useMediaQuery(MD_BREAKPOINT);
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

			{/* Os dois ramos derivam do mesmo booleano, então exatamente um sempre renderiza: agenda
			    vazia por dessincronização de breakpoint é impossível aqui. */}
			{desktop && (
				<div>
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
			)}

			{!desktop && (
				<div>
					{items.length === 0 && (
						<p className="px-4 py-10 text-center text-xs leading-relaxed text-muted-foreground">
							Nenhum prazo em {monthTitle(month)} dentro do recorte atual.
						</p>
					)}

					{items.length > 0 && <AgendaList items={items} onOpen={onOpen} onDay={onDay} />}
				</div>
			)}
		</>
	);
}
