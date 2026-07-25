import { Link } from "@tanstack/react-router";
import { FileTextIcon, GavelIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatCnj, formatEventDate, formatPersonName } from "@/lib/format";
import type { CaseListItem } from "./queries";
import { dateOfSource } from "./timeline-data";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

function movedAt(item: CaseListItem) {
	if (item.lastMovement) {
		return dateOfSource(item.lastMovement);
	}

	return item.lastMovementAt;
}

function CaseRow({ item }: { item: CaseListItem }) {
	const date = movedAt(item);
	const unread = item.unreadCount > 0;
	const MovementIcon = item.lastMovement?.source === "publication" ? FileTextIcon : GavelIcon;

	return (
		<li>
			<Link
				to="/processos/$cnj"
				params={{ cnj: item.formattedNumber }}
				className="group relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
			>
				{unread && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-primary" />}

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="tag-tribunal">{item.tribunal}</span>
						<span className="num-cnj truncate text-muted-foreground">
							{formatCnj(item.cnjNumber)}
						</span>
					</div>

					<p
						className={cn(
							"mt-1 truncate text-sm text-foreground/80",
							unread && "font-medium text-foreground",
						)}
					>
						{formatPersonName(item.className ?? "Classe não informada")}
					</p>

					{!!item.orgName && (
						<p className="mt-0.5 truncate text-xs text-muted-foreground">{item.orgName}</p>
					)}

					{!!item.lastMovement && (
						<p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground/85">
							<MovementIcon className="mt-[3px] size-3 shrink-0" />
							<span className="truncate">{item.lastMovement.summary}</span>
						</p>
					)}
				</div>

				<div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
					{!!date && (
						<span className="text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
							{formatEventDate(date)}
						</span>
					)}
					{unread && (
						<span className="rounded-full bg-primary px-1.5 font-mono text-2xs font-semibold text-primary-foreground tabular-nums">
							{item.unreadCount}
						</span>
					)}
				</div>
			</Link>
		</li>
	);
}

export function CaseList({ items }: { items: CaseListItem[] }) {
	return (
		<ul className="divide-y divide-border">
			{items.map((item) => (
				<CaseRow key={item.id} item={item} />
			))}
		</ul>
	);
}

export function CaseListSkeleton() {
	return (
		<ul className="divide-y divide-border">
			{SKELETON_ROWS.map((row) => (
				<li key={row} className="flex items-start gap-3 px-4 py-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<Skeleton className="h-4 w-11" />
							<Skeleton className="h-3.5 w-44" />
						</div>
						<Skeleton className="mt-2 h-4 w-56" />
						<Skeleton className="mt-1.5 h-3 w-72 max-w-full" />
						<Skeleton className="mt-2 h-3 w-full max-w-[26rem]" />
					</div>
					<Skeleton className="mt-1 h-3 w-16" />
				</li>
			))}
		</ul>
	);
}
