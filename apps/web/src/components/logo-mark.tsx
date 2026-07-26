import { cn } from "@/lib/cn";

// A margem da petição em âmbar e as linhas encurtando: o prazo que corre, não a balança de sempre.
export function LogoMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			aria-hidden="true"
			className={cn("size-7 shrink-0", className)}
		>
			<rect x="4" y="4.5" width="3.25" height="23" rx="1.625" className="fill-primary" />
			<rect x="11.5" y="6" width="16.5" height="3.25" rx="1.625" fill="currentColor" />
			<rect x="11.5" y="14.375" width="11.5" height="3.25" rx="1.625" fill="currentColor" />
			<rect x="11.5" y="22.75" width="6.5" height="3.25" rx="1.625" fill="currentColor" />
		</svg>
	);
}
