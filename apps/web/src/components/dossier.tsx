import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionRule({
	title,
	count,
	children,
}: {
	title: string;
	count?: string;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border pb-2">
			<h2 className="text-2xs font-semibold tracking-[0.14em] text-foreground uppercase">
				{title}
			</h2>
			{!!count && (
				<span className="font-mono text-2xs text-muted-foreground tabular-nums">{count}</span>
			)}
			<span aria-hidden className="h-px flex-1 bg-border" />
			{children}
		</div>
	);
}

export function Chip({
	children,
	tone = "neutral",
}: {
	children: ReactNode;
	tone?: "neutral" | "accent" | "alert" | "mute";
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-[3px] border px-[0.3125rem] font-mono text-2xs leading-[1.05rem] font-medium tracking-[0.08em] uppercase",
				tone === "neutral" && "border-border bg-muted text-muted-foreground",
				tone === "accent" && "border-primary/35 bg-primary/12 text-foreground",
				tone === "alert" && "border-destructive/35 bg-destructive/10 text-destructive",
				tone === "mute" && "border-transparent bg-transparent text-muted-foreground/80",
			)}
		>
			{children}
		</span>
	);
}

export function SourceLink({ href, label }: { href: string | null | undefined; label: string }) {
	if (!href) {
		return (
			<span className="inline-flex items-center gap-1 text-2xs text-destructive/85">
				Sem link para o documento original
			</span>
		);
	}

	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center gap-1 text-2xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
		>
			{label}
			<ExternalLinkIcon className="size-3" />
		</a>
	);
}

export function MetaList({ items }: { items: string[] }) {
	return (
		<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
			{items.map((item, index) => (
				<span key={item} className="inline-flex items-center gap-2">
					{index > 0 && <span aria-hidden className="size-[3px] rounded-full bg-border" />}
					{item}
				</span>
			))}
		</span>
	);
}

export function Quote({ children }: { children: ReactNode }) {
	return (
		<blockquote className="border-l-2 border-border pl-3 text-[0.8125rem] leading-relaxed text-foreground/80">
			{children}
		</blockquote>
	);
}

export function DossierEntry({
	rail = "neutral",
	date,
	children,
}: {
	rail?: "neutral" | "accent" | "alert";
	date: ReactNode;
	children: ReactNode;
}) {
	return (
		<li className="flex gap-3 py-3.5 first:pt-1">
			<span
				aria-hidden
				className={cn(
					"mt-1 w-[2px] shrink-0 self-stretch rounded-full",
					rail === "neutral" && "bg-border",
					rail === "accent" && "bg-primary",
					rail === "alert" && "bg-destructive/70",
				)}
			/>
			<div className="min-w-0 flex-1">
				<div className="mb-1 font-mono text-2xs text-muted-foreground tabular-nums">{date}</div>
				{children}
			</div>
		</li>
	);
}
