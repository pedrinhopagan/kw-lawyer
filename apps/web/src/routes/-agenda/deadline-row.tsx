import { Link } from "@tanstack/react-router";
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon, UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCnj } from "@/lib/format";
import {
	AUDIENCE_LABELS,
	CONFIDENCE_LABELS,
	STATUS_LABELS,
	UNIT_LABELS,
	urgencyOf,
} from "@/lib/deadline-meta";
import type { DeadlineItem } from "./queries";

const URGENCY_RAIL = {
	vencido: "bg-destructive",
	hoje: "bg-primary",
	proximo: "bg-primary/45",
	futuro: "bg-transparent",
} as const;

function daysLabel(item: Pick<DeadlineItem, "days" | "unit">) {
	if (item.days < 1) {
		return "manual";
	}

	return `${item.days} ${UNIT_LABELS[item.unit]}`;
}

function ConfidenceMark({ confidence }: Pick<DeadlineItem, "confidence">) {
	return (
		<span
			className={cn(
				"flex items-center gap-1 text-2xs",
				confidence === "baixa" ? "text-destructive" : "text-muted-foreground",
			)}
		>
			{confidence === "alta" && <CircleCheckIcon className="size-3" />}
			{confidence === "media" && <CircleAlertIcon className="size-3" />}
			{confidence === "baixa" && <TriangleAlertIcon className="size-3" />}
			{CONFIDENCE_LABELS[confidence]}
		</span>
	);
}

function AudienceMark({ audience }: Pick<DeadlineItem, "audience">) {
	if (audience === "partes") {
		return null;
	}

	return (
		<span className="flex items-center gap-1 rounded-full border border-border px-1.5 text-2xs text-muted-foreground">
			<UserRoundIcon className="size-3" />
			{AUDIENCE_LABELS[audience]}
		</span>
	);
}

export function DeadlineRow({
	item,
	onOpen,
}: {
	item: DeadlineItem;
	onOpen: (item: DeadlineItem) => void;
}) {
	const urgency = urgencyOf(item.dueAt);
	const unconfirmed = item.status === "a_confirmar";

	return (
		<li className="group relative flex flex-col gap-1 px-4 py-3 transition-colors focus-within:bg-accent/60 hover:bg-accent/60">
			<button
				type="button"
				className="absolute inset-0 cursor-pointer outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-ring/70"
				onClick={() => onOpen(item)}
			>
				<span className="sr-only">Abrir o prazo {item.title}</span>
			</button>

			<span
				aria-hidden
				className={cn("absolute inset-y-0 left-0 w-[2px]", URGENCY_RAIL[urgency])}
			/>

			<div className="pointer-events-none relative flex items-baseline gap-3">
				<span className="truncate text-sm font-medium text-foreground">{item.title}</span>

				<span className="ml-auto shrink-0 font-mono text-2xs tracking-wide text-muted-foreground uppercase">
					{daysLabel(item)}
				</span>
			</div>

			<div className="pointer-events-none relative flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				{!!item.case?.tribunal && (
					<span className="tag-tribunal shrink-0">{item.case.tribunal}</span>
				)}

				{!!item.case?.cnjNumber && (
					<Link
						to="/processos/$cnj"
						params={{ cnj: item.case.cnjNumber }}
						className="num-cnj pointer-events-auto relative shrink-0 rounded-xs text-foreground/70 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						{formatCnj(item.case.cnjNumber)}
					</Link>
				)}

				{!!item.case?.orgName && <span className="truncate">{item.case.orgName}</span>}
			</div>

			{!!item.snippet && (
				<p className="pointer-events-none relative line-clamp-1 text-xs text-muted-foreground/75">
					{item.snippet}
				</p>
			)}

			<div className="pointer-events-none relative flex flex-wrap items-center gap-x-3 gap-y-1">
				<ConfidenceMark confidence={item.confidence} />

				<AudienceMark audience={item.audience} />

				{unconfirmed && (
					<span className="rounded-full border border-primary/40 px-1.5 text-2xs font-medium text-primary">
						{STATUS_LABELS.a_confirmar}
					</span>
				)}

				{!!item.expectedDueAt && item.expectedDueAt !== item.dueAt && (
					<span className="text-2xs text-muted-foreground">
						limite provável {item.expectedDueAt.split("-").toReversed().join("/")}
					</span>
				)}
			</div>
		</li>
	);
}
