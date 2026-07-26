import { Link } from "@tanstack/react-router";
import { CanceledPublicationMark } from "@/components/canceled-publication-mark";
import { cn } from "@/lib/cn";
import { CANCELED_PUBLICATION_LABEL } from "@/lib/deadline-meta";
import { formatCnj, formatEventDate, formatPersonName } from "@/lib/format";
import { isCanceledPublication } from "@api/features/djen/project";
import { fullDate, publicationTitle } from "./publication-meta";
import type { PublicationItem } from "./queries";

export function PublicationRow({
	item,
	onOpen,
}: {
	item: PublicationItem;
	onOpen: (item: PublicationItem) => void;
}) {
	const unread = !item.readAt;
	const canceled = isCanceledPublication(item);
	const client = item.parties.at(0);

	return (
		<li className="group relative flex flex-col gap-0.5 px-4 py-2.5 transition-colors focus-within:bg-accent/60 hover:bg-accent/60">
			<button
				type="button"
				className="absolute inset-0 cursor-pointer outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-ring/70"
				onClick={() => onOpen(item)}
			>
				<span className="sr-only">
					Abrir {publicationTitle(item)} de {fullDate(item.availableAt)}
					{canceled && `, ${CANCELED_PUBLICATION_LABEL}`}
				</span>
			</button>

			{(canceled || unread) && (
				<span
					aria-hidden
					className={cn(
						"absolute inset-y-0 left-0 w-[2px]",
						canceled ? "bg-destructive" : "bg-primary",
					)}
				/>
			)}

			<div className="pointer-events-none relative flex items-baseline gap-3">
				<span
					className={cn(
						"truncate text-sm",
						unread && "font-semibold text-foreground",
						!unread && "font-medium text-foreground/75",
					)}
				>
					{!!client && formatPersonName(client.name)}
					{!client && publicationTitle(item)}
				</span>

				{!!client && (
					<span className="shrink-0 text-xs text-foreground/70">{publicationTitle(item)}</span>
				)}

				<time
					dateTime={item.availableAt}
					title={fullDate(item.availableAt)}
					className="ml-auto shrink-0 text-2xs text-muted-foreground tabular-nums"
				>
					{formatEventDate(item.availableAt)}
				</time>
			</div>

			<div className="pointer-events-none relative flex items-center gap-2 text-xs text-muted-foreground">
				{canceled && <CanceledPublicationMark />}

				{!!item.tribunal && <span className="tag-tribunal shrink-0">{item.tribunal}</span>}

				{!!item.cnjNumber && (
					<Link
						to="/processos/$cnj"
						params={{ cnj: item.cnjNumber }}
						search={{ pub: item.id }}
						className="num-cnj pointer-events-auto relative shrink-0 rounded-xs text-foreground/70 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						{formatCnj(item.cnjNumber)}
					</Link>
				)}

				{!!item.orgName && <span className="truncate">{item.orgName}</span>}
			</div>

			<p className="pointer-events-none relative mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground/75">
				{item.excerpt}
			</p>
		</li>
	);
}
