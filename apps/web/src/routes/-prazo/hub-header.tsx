import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { Chip, MetaList } from "@/components/dossier";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
	AUDIENCE_LABELS,
	CANCELED_PUBLICATION_LABEL,
	CONFIDENCE_LABELS,
	countdownLabel,
	daysUntil,
	fullDate,
	isCanceledPublicationWarning,
	STATUS_LABELS,
	UNIT_LABELS,
	urgencyOf,
	weekdayLabel,
} from "@/lib/deadline-meta";
import { formatCnj, formatPersonName } from "@/lib/format";
import { grauLabel, poloLabel } from "@/lib/legal-labels";
import type { HubData } from "./queries";

function Countdown({ dueAt, open }: { dueAt: string; open: boolean }) {
	const urgency = urgencyOf(dueAt);
	const distance = daysUntil(dueAt);

	return (
		<div className="flex items-baseline gap-2.5">
			{open && (
				<span
					className={cn(
						"font-mono text-[2.25rem] leading-none font-medium tracking-[-0.03em] tabular-nums",
						urgency === "vencido" && "text-destructive",
						urgency !== "vencido" && urgency !== "futuro" && "text-primary",
					)}
				>
					{Math.abs(distance)}
				</span>
			)}
			<span
				className={cn(
					"text-xs",
					open && urgency === "vencido" ? "font-medium text-destructive" : "text-muted-foreground",
				)}
			>
				{open && countdownLabel(dueAt)}
				{!open && "prazo fechado"}
			</span>
		</div>
	);
}

export function HubHeader({ data }: { data: HubData }) {
	const open = data.deadline.status === "pendente";

	return (
		<header className="border-b border-border pb-5">
			<Link
				to="/agenda"
				className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<ChevronLeftIcon className="size-3.5" />
				Agenda
			</Link>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				{!!data.case && <span className="tag-tribunal">{data.case.tribunal}</span>}
				<Chip>{STATUS_LABELS[data.deadline.status]}</Chip>
				{data.deadline.warnings.some(isCanceledPublicationWarning) && (
					<Chip tone="alert">{CANCELED_PUBLICATION_LABEL}</Chip>
				)}
				<Chip tone={data.deadline.confidence === "alta" ? "neutral" : "alert"}>
					{CONFIDENCE_LABELS[data.deadline.confidence]}
				</Chip>
				<span className="text-2xs text-muted-foreground">
					{AUDIENCE_LABELS[data.deadline.audience]}
				</span>
			</div>

			<h1 className="mt-2.5 text-[1.5rem] leading-tight font-semibold tracking-[-0.02em]">
				{data.deadline.title}
			</h1>

			<div className="mt-3">
				<Countdown dueAt={data.deadline.dueAt} open={open} />
			</div>

			<p className="mt-2.5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
				Vence em <span className="text-foreground">{fullDate(data.deadline.dueAt)}</span>,{" "}
				{weekdayLabel(data.deadline.dueAt)}. Contagem de {data.deadline.days}{" "}
				{UNIT_LABELS[data.deadline.unit]}
				{!!data.deadline.startsAt && ` a partir de ${fullDate(data.deadline.startsAt)}`}.
				{!!data.deadline.basis && ` Base: ${data.deadline.basis}.`}
			</p>

			{!!data.case && (
				<div className="mt-4 flex flex-col gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<Link
							to="/processos/$cnj"
							params={{ cnj: data.case.cnjNumber }}
							className={buttonVariants({ variant: "outline", size: "xs" })}
						>
							<span className="num-cnj">{formatCnj(data.case.cnjNumber)}</span>
						</Link>
						<span className="text-xs text-muted-foreground">
							<MetaList
								items={[
									data.case.className ? formatPersonName(data.case.className) : null,
									data.case.instance?.orgJudgingName ?? data.case.orgName,
									grauLabel(data.case.instance?.grau),
								].filter((value): value is string => !!value)}
							/>
						</span>
					</div>

					{data.parties.length > 0 && (
						<dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
							{data.parties.map((party) => (
								<div key={`${party.polo}-${party.name}`} className="contents">
									<dt className="text-2xs tracking-[0.1em] text-muted-foreground uppercase sm:pt-[3px]">
										{poloLabel(party.polo)}
									</dt>
									<dd className="text-[0.8125rem] leading-snug break-words">
										{formatPersonName(party.name)}
									</dd>
								</div>
							))}
						</dl>
					)}
				</div>
			)}
		</header>
	);
}
