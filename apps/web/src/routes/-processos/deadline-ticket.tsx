import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { countdownLabel, shortDate, STATUS_LABELS, urgencyOf } from "@/lib/deadline-meta";

export interface TicketDeadline {
	id: string;
	title: string;
	dueAt: string;
	status: keyof typeof STATUS_LABELS;
}

export function DeadlineTicket({ deadline }: { deadline: TicketDeadline }) {
	const open = deadline.status === "a_confirmar" || deadline.status === "confirmado";
	const urgency = urgencyOf(deadline.dueAt);

	return (
		<li>
			<Link
				to="/prazos/$deadlineId"
				params={{ deadlineId: deadline.id }}
				className={cn(
					"group flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[3px] border border-border bg-card px-2.5 py-1.5 transition-colors hover:border-primary/40 hover:bg-accent/40",
					open && urgency === "vencido" && "border-l-2 border-l-destructive",
					open && urgency !== "vencido" && urgency !== "futuro" && "border-l-2 border-l-primary",
					!open && "opacity-70",
				)}
			>
				<span className="text-[0.8125rem] font-medium">{deadline.title}</span>
				<span className="font-mono text-2xs text-muted-foreground tabular-nums">
					{shortDate(deadline.dueAt)}
				</span>
				<span
					className={cn(
						"text-2xs",
						open && urgency === "vencido"
							? "font-medium text-destructive"
							: "text-muted-foreground",
					)}
				>
					{open && countdownLabel(deadline.dueAt)}
					{!open && STATUS_LABELS[deadline.status].toLowerCase()}
				</span>
				<ArrowUpRightIcon className="ml-auto size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
			</Link>
		</li>
	);
}
