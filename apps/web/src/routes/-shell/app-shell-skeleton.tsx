import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { Brand } from "./brand";

const NAV_ROWS = [
	"w-[5.25rem]",
	"w-[3.75rem]",
	"w-[4.5rem]",
	"w-[3.5rem]",
	"w-[4.75rem]",
	"w-[6rem]",
];

function NavSkeleton() {
	return (
		<nav className="flex flex-col gap-0.5 px-3">
			{NAV_ROWS.map((width) => (
				<div key={width} className="flex items-center gap-2.5 px-2.5 py-[0.4375rem]">
					<Skeleton className="size-4 shrink-0 rounded-sm" />
					<Skeleton className={cn("h-3.5", width)} />
				</div>
			))}
		</nav>
	);
}

function SidebarSkeleton() {
	return (
		<div className="flex h-full flex-col bg-sidebar">
			<div className="px-3 py-3.5">
				<Brand />
			</div>

			<NavSkeleton />

			<div className="flex-1" />

			<div className="flex items-center justify-between gap-2 border-t border-sidebar-border py-1.5 pr-2 pl-3">
				<Skeleton className="h-3 w-28" />
				<Skeleton className="size-6 shrink-0 rounded-md" />
			</div>

			<div className="border-t border-sidebar-border p-2">
				<div className="flex items-center gap-2 px-1 py-1">
					<Skeleton className="size-7 shrink-0 rounded-full" />
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-2.5 w-16" />
					</div>
				</div>
			</div>
		</div>
	);
}

export function AppShellSkeleton() {
	return (
		<div className="flex min-h-svh">
			<aside className="sticky top-0 hidden h-svh w-[15.5rem] shrink-0 border-r border-sidebar-border md:block">
				<SidebarSkeleton />
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="sticky top-0 z-30 flex h-[var(--kw-mobile-header)] shrink-0 items-center gap-2 border-b border-border bg-background/90 px-2 pt-[var(--kw-safe-top)] backdrop-blur-sm md:hidden">
					<Skeleton className="size-8 shrink-0 rounded-md" />
					<Brand />
				</header>

				<main className="min-w-0 flex-1 pb-[var(--kw-safe-bottom)]" />
			</div>
		</div>
	);
}
