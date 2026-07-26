import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, BanIcon, ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Chip, Quote } from "@/components/dossier";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import {
	AUDIENCE_LABELS,
	CANCELED_PUBLICATION_LABEL,
	CONFIDENCE_LABELS,
	countdownLabel,
	dayNumber,
	daysLabel,
	fullDate,
	isCanceledPublicationWarning,
	shortDate,
	STATUS_LABELS,
	UNIT_LABELS,
	urgencyOf,
	weekdayLabel,
} from "@/lib/deadline-meta";
import { formatCnj, formatPersonName } from "@/lib/format";
import { ORIGIN_CHOICES, pluralOf } from "./agenda-meta";
import type { DeadlineItem } from "./queries";

function countingLine(item: DeadlineItem) {
	if (item.days < 1) {
		return "Prazo lançado à mão, sem contagem automática.";
	}

	const start = item.startsAt ? ` a partir de ${fullDate(item.startsAt)}` : "";

	return `Contagem de ${item.days} ${UNIT_LABELS[item.unit]}${start}.`;
}

function DeadlineFacts({ item }: { item: DeadlineItem }) {
	const facts = [
		{ label: "Disponibilizado", value: item.availableAt },
		{ label: "Publicado", value: item.publishedAt },
		{ label: "Contagem inicia", value: item.startsAt },
		{
			label: "Limite provável",
			value: item.expectedDueAt === item.dueAt ? null : item.expectedDueAt,
		},
	].filter((fact): fact is { label: string; value: string } => !!fact.value);

	if (facts.length === 0) {
		return null;
	}

	return (
		<dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
			{facts.map((fact) => (
				<div key={fact.label}>
					<dt className="text-2xs tracking-[0.12em] text-muted-foreground uppercase">
						{fact.label}
					</dt>
					<dd className="mt-1 font-mono text-xs tabular-nums">{shortDate(fact.value)}</dd>
				</div>
			))}
		</dl>
	);
}

function WarningLine({ warning }: { warning: string }) {
	if (isCanceledPublicationWarning(warning)) {
		return (
			<li className="flex gap-2 text-2xs leading-relaxed font-medium text-destructive">
				<BanIcon className="mt-px size-3 shrink-0" />
				{warning}
			</li>
		);
	}

	return (
		<li className="flex gap-2 text-2xs leading-relaxed text-muted-foreground">
			<TriangleAlertIcon className="mt-px size-3 shrink-0" />
			{warning}
		</li>
	);
}

function DeadlineDetail({
	item,
	onOpen,
}: {
	item: DeadlineItem;
	onOpen: (item: DeadlineItem) => void;
}) {
	return (
		<div className="pt-1 pr-5 pb-6 pl-12">
			<p className="max-w-[62ch] text-xs leading-loose text-muted-foreground">
				{countingLine(item)}{" "}
				<span className="inline-block first-letter:uppercase">
					{AUDIENCE_LABELS[item.audience]}
				</span>
				.{!!item.basis && ` Base: ${item.basis}.`}
			</p>

			<DeadlineFacts item={item} />

			{!!item.snippet && (
				<div className="mt-5">
					<Quote>{item.snippet}</Quote>
				</div>
			)}

			{!!item.note && (
				<p className="mt-5 max-w-[62ch] text-xs leading-loose">
					<span className="text-muted-foreground">Anotação: </span>
					{item.note}
				</p>
			)}

			{item.warnings.length > 0 && (
				<ul className="mt-5 flex flex-col gap-2">
					{item.warnings.map((warning) => (
						<WarningLine key={warning} warning={warning} />
					))}
				</ul>
			)}

			<div className="mt-6 flex flex-wrap items-center gap-4">
				<Button variant="outline" size="xs" onClick={() => onOpen(item)}>
					Abrir prazo
					<ArrowUpRightIcon />
				</Button>

				{!!item.case?.cnjNumber && (
					<Link
						to="/processos/$cnj"
						params={{ cnj: item.case.cnjNumber }}
						className="num-cnj text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
					>
						{formatCnj(item.case.cnjNumber)}
					</Link>
				)}
			</div>
		</div>
	);
}

function DeadlineEntry({
	item,
	open,
	onToggle,
	onOpen,
}: {
	item: DeadlineItem;
	open: boolean;
	onToggle: () => void;
	onOpen: (item: DeadlineItem) => void;
}) {
	const client = item.parties.at(0);
	const opponent = item.parties.at(1);
	const meta = [
		item.case?.cnjNumber ? formatCnj(item.case.cnjNumber) : null,
		item.case?.className,
		item.case?.orgName,
		ORIGIN_CHOICES[item.origin],
	].filter((entry) => !!entry);

	return (
		<li className={cn("border-b border-border last:border-b-0", open && "bg-muted/25")}>
			<button
				type="button"
				aria-expanded={open}
				className="flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
				onClick={onToggle}
			>
				<ChevronRightIcon
					aria-hidden
					className={cn(
						"mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-90 text-foreground",
					)}
				/>

				<span className="flex min-w-0 flex-1 flex-col gap-1.5">
					<span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						{!!item.case?.tribunal && <span className="tag-tribunal">{item.case.tribunal}</span>}

						<span className="text-sm leading-snug font-semibold tracking-[-0.01em] text-foreground">
							{!!client && formatPersonName(client.name)}
							{!client && item.title}
						</span>

						{!!opponent && (
							<span className="text-xs leading-snug text-muted-foreground">
								× {formatPersonName(opponent.name)}
							</span>
						)}

						{!!client && (
							<span className="text-xs leading-snug text-foreground/75">{item.title}</span>
						)}
					</span>

					<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
						{meta.map((entry, index) => (
							<span key={entry} className="inline-flex items-center gap-2">
								{index > 0 && <span aria-hidden className="size-[3px] rounded-full bg-border" />}
								<span className="truncate">{entry}</span>
							</span>
						))}
					</span>
				</span>

				<span className="flex shrink-0 flex-col items-end gap-1.5">
					<span className="font-mono text-2xs tracking-wide text-muted-foreground uppercase tabular-nums">
						{daysLabel(item)}
					</span>

					{item.status !== "pendente" && <Chip>{STATUS_LABELS[item.status]}</Chip>}

					{item.warnings.some(isCanceledPublicationWarning) && (
						<Chip tone="alert">{CANCELED_PUBLICATION_LABEL}</Chip>
					)}

					{item.confidence !== "alta" && (
						<Chip tone="alert">{CONFIDENCE_LABELS[item.confidence]}</Chip>
					)}
				</span>
			</button>

			{open && <DeadlineDetail item={item} onOpen={onOpen} />}
		</li>
	);
}

function DayBody({
	items,
	onOpen,
}: {
	items: DeadlineItem[];
	onOpen: (item: DeadlineItem) => void;
}) {
	const [openId, setOpenId] = useState(items.length === 1 ? items[0]?.id : undefined);

	if (items.length === 0) {
		return (
			<p className="px-5 py-14 text-center text-xs leading-relaxed text-muted-foreground">
				Nenhum prazo neste dia dentro do recorte atual.
				<br />
				Troque o filtro na barra da agenda para ver os prazos escondidos.
			</p>
		);
	}

	return (
		<ul>
			{items.map((item) => (
				<DeadlineEntry
					key={item.id}
					item={item}
					open={item.id === openId}
					onToggle={() => setOpenId(item.id === openId ? undefined : item.id)}
					onOpen={onOpen}
				/>
			))}
		</ul>
	);
}

export function AgendaDayDialog({
	day,
	items,
	onClose,
	onOpen,
}: {
	day: string | undefined;
	items: DeadlineItem[];
	onClose: () => void;
	onOpen: (item: DeadlineItem) => void;
}) {
	return (
		<Dialog open={!!day} onOpenChange={(open) => !open && onClose()}>
			{!!day && (
				<DialogContent className="max-h-[85svh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
					<DialogHeader className="border-b border-border py-5 pr-12 pl-5 text-left">
						<div className="flex items-center gap-4">
							<span
								className={cn(
									"font-mono text-[2.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums",
									urgencyOf(day) === "vencido" && "text-destructive",
									urgencyOf(day) === "hoje" && "text-primary",
								)}
							>
								{dayNumber(day)}
							</span>

							<div className="flex min-w-0 flex-col gap-1">
								<DialogTitle className="text-base font-semibold tracking-[-0.01em]">
									{fullDate(day)}
								</DialogTitle>

								<DialogDescription className="text-xs first-letter:uppercase">
									{weekdayLabel(day)}, {countdownLabel(day)}
								</DialogDescription>
							</div>
						</div>

						<p className="mt-1 text-2xs tracking-[0.12em] text-muted-foreground uppercase">
							{items.length} prazo{pluralOf(items.length)} neste dia
						</p>
					</DialogHeader>

					<div className="min-h-0 overflow-y-auto overscroll-contain">
						<DayBody key={day} items={items} onOpen={onOpen} />
					</div>
				</DialogContent>
			)}
		</Dialog>
	);
}
