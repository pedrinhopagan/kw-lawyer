import { LogoMark } from "@/components/logo-mark";
import { cn } from "@/lib/cn";

export function Brand({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<LogoMark className="size-7 text-foreground" />
			<span className="flex min-w-0 flex-col">
				<span className="font-mono text-sm font-semibold leading-none tracking-[-0.03em]">
					kw-lawyer
				</span>
				<span className="mt-1 text-2xs uppercase leading-none tracking-[0.16em] text-muted-foreground">
					Painel do advogado
				</span>
			</span>
		</div>
	);
}
