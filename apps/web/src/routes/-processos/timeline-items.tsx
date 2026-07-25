import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import type { Ref } from "react";
import { cn } from "@/lib/cn";
import type { TimelineMovement, TimelinePublication } from "./queries";
import { movementTime } from "./timeline-data";

export function MovementRow({ item }: { item: TimelineMovement }) {
	const time = movementTime(item.occurredAt);

	return (
		<li className="relative py-[3px]">
			<span
				aria-hidden
				className="absolute top-[0.5625rem] -left-[1.1875rem] size-[5px] rounded-full border border-border bg-background"
			/>
			<div className="flex items-baseline gap-3">
				<p className="min-w-0 flex-1 text-[0.8125rem] leading-[1.375rem] text-foreground/75">
					{item.summary}
				</p>
				{!!time && (
					<span className="shrink-0 font-mono text-2xs text-muted-foreground/80 tabular-nums">
						{time}
					</span>
				)}
			</div>
		</li>
	);
}

function documentLabel(item: TimelinePublication) {
	if (!item.publication.documentType) {
		return;
	}

	if (
		item.publication.documentType.toLowerCase() ===
		item.publication.communicationType?.toLowerCase()
	) {
		return;
	}

	return item.publication.documentType;
}

export function PublicationCard({
	item,
	expanded,
	anchored,
	onToggle,
	cardRef,
}: {
	item: TimelinePublication;
	expanded: boolean;
	anchored: boolean;
	onToggle: () => void;
	cardRef?: Ref<HTMLElement>;
}) {
	const unread = !item.publication.readAt;
	const documentTag = documentLabel(item);

	return (
		<li className="relative py-2">
			<span
				aria-hidden
				className={cn(
					"absolute top-[1.0625rem] -left-[1.25rem] size-[7px] rounded-full bg-muted-foreground/45 ring-4 ring-background",
					unread && "bg-primary",
				)}
			/>
			<article
				id={`pub-${item.publication.id}`}
				ref={cardRef}
				className={cn(
					"scroll-mt-24 rounded-md border border-border bg-card",
					unread && "border-l-2 border-l-primary",
					anchored && "ring-2 ring-primary/30",
				)}
			>
				<button
					type="button"
					onClick={onToggle}
					aria-expanded={expanded}
					className="flex w-full items-start gap-2 rounded-t-md px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
				>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span className="text-2xs font-semibold tracking-[0.08em] uppercase">
								{item.publication.communicationType ?? "Publicação"}
							</span>
							{!!documentTag && <span className="tag-tribunal">{documentTag}</span>}
							{unread && (
								<span className="text-2xs font-medium tracking-[0.08em] text-primary uppercase">
									não lida
								</span>
							)}
						</div>

						{!!item.publication.orgName && (
							<p className="mt-1 truncate text-xs text-muted-foreground">
								{item.publication.orgName}
							</p>
						)}

						{!expanded && (
							<p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-foreground/70">
								{item.publication.excerpt}
							</p>
						)}
					</div>

					<ChevronDownIcon
						className={cn(
							"mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
							expanded && "rotate-180",
						)}
					/>
				</button>

				{expanded && (
					<div className="border-t border-border px-3 py-3">
						<p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-line text-foreground/90">
							{item.publication.textPlain}
						</p>

						{!!item.publication.link && (
							<a
								href={item.publication.link}
								target="_blank"
								rel="noreferrer"
								className="mt-3 inline-flex items-center gap-1 text-2xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
							>
								Abrir no diário oficial
								<ExternalLinkIcon className="size-3" />
							</a>
						)}
					</div>
				)}
			</article>
		</li>
	);
}
