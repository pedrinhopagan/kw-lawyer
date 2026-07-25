import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROWS = [0, 1, 2, 3];

export function AxisSkeleton() {
	return (
		<section className="mt-5">
			<Skeleton className="h-3 w-32" />
			<div className="mt-5 flex flex-col gap-5">
				{SKELETON_ROWS.map((row) => (
					<div key={row} className="flex flex-col gap-2">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-4 w-1/2" />
						<Skeleton className="h-12 w-full max-w-[46rem]" />
					</div>
				))}
			</div>
		</section>
	);
}

export function AxisEmpty({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="flex flex-col items-start gap-2 border-b border-border py-8">
			<span className="grid size-8 place-items-center rounded-full border border-border bg-muted/60">
				<Icon className="size-3.5 text-muted-foreground" />
			</span>
			<p className="mt-0.5 text-sm font-medium">{title}</p>
			<p className="max-w-[62ch] text-xs leading-relaxed text-muted-foreground">{description}</p>
		</div>
	);
}
