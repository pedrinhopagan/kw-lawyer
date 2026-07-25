import type { LucideIcon } from "lucide-react";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function FailureState({
	title,
	description,
	onRetry,
}: {
	title: string;
	description: string;
	onRetry: () => void;
}) {
	return (
		<div className="flex flex-col items-start gap-3 rounded-md border border-destructive/25 bg-destructive/5 px-4 py-4">
			<div className="flex items-center gap-2 text-destructive">
				<TriangleAlertIcon className="size-4 shrink-0" />
				<p className="text-sm font-medium">{title}</p>
			</div>
			<p className="max-w-[60ch] text-xs leading-relaxed text-muted-foreground">{description}</p>
			<Button variant="outline" size="sm" onClick={onRetry}>
				<RefreshCwIcon />
				Tentar de novo
			</Button>
		</div>
	);
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	children,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
			<span className="grid size-9 place-items-center rounded-full border border-border bg-muted/60">
				<Icon className="size-4 text-muted-foreground" />
			</span>
			<p className="mt-1 text-sm font-medium">{title}</p>
			<p className="max-w-[48ch] text-xs leading-relaxed text-muted-foreground">{description}</p>
			{children}
		</div>
	);
}
