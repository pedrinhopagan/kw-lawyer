import { Link } from "@tanstack/react-router";
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon, UsersRoundIcon } from "lucide-react";
import { CanceledPublicationMark } from "@/components/canceled-publication-mark";
import { cn } from "@/lib/cn";
import { formatCnj, formatPersonName } from "@/lib/format";
import {
	AUDIENCE_LABELS,
	CONFIDENCE_LABELS,
	daysLabel,
	isCanceledPublicationWarning,
	urgencyOf,
} from "@/lib/deadline-meta";
import type { DeadlineItem } from "./queries";

const URGENCY_RAIL = {
	vencido: "bg-destructive",
	hoje: "bg-primary",
	proximo: "bg-primary/45",
	futuro: "bg-transparent",
} as const;

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
			<UsersRoundIcon className="size-3" />
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
	const client = item.parties.at(0);
	const opponent = item.parties.at(1);
	const remaining = Math.max(item.parties.length - 2, 0);

	return (
		<li className="group relative flex flex-col gap-1 px-4 py-3 transition-colors focus-within:bg-accent/60 hover:bg-accent/60">
			<button
				type="button"
				className="absolute inset-0 cursor-pointer outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-ring/70"
				onClick={() => onOpen(item)}
			>
				<span className="sr-only">
					Abrir o prazo {item.title}
					{!!client && ` de ${formatPersonName(client.name)}`}
				</span>
			</button>

			<span
				aria-hidden
				className={cn("absolute inset-y-0 left-0 w-[2px]", URGENCY_RAIL[urgency])}
			/>

			<div className="pointer-events-none relative flex items-baseline gap-3">
				<span className="flex min-w-0 items-baseline gap-1.5">
					<span className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
						{!!client && formatPersonName(client.name)}
						{!client && item.title}
					</span>

					{!!opponent && (
						<span className="truncate text-xs text-muted-foreground">
							× {formatPersonName(opponent.name)}
						</span>
					)}

					{remaining > 0 && (
						<span className="shrink-0 text-2xs text-muted-foreground">+{remaining}</span>
					)}
				</span>

				<span className="ml-auto shrink-0 font-mono text-2xs tracking-wide text-muted-foreground uppercase">
					{daysLabel(item)}
				</span>
			</div>

			{(!!client || !!item.case?.className) && (
				<div className="pointer-events-none relative flex flex-wrap items-baseline gap-x-2 text-xs">
					{!!client && <span className="font-medium text-foreground/85">{item.title}</span>}

					{!!item.case?.className && (
						<span className="truncate text-muted-foreground">
							{formatPersonName(item.case.className)}
						</span>
					)}
				</div>
			)}

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
				{item.warnings.some(isCanceledPublicationWarning) && <CanceledPublicationMark />}

				<ConfidenceMark confidence={item.confidence} />

				<AudienceMark audience={item.audience} />

				{!!item.expectedDueAt && item.expectedDueAt !== item.dueAt && (
					<span className="text-2xs text-muted-foreground">
						limite provável {item.expectedDueAt.split("-").toReversed().join("/")}
					</span>
				)}
			</div>
		</li>
	);
}
