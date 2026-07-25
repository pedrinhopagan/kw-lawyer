import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className={className}
			aria-label={isDark ? "Usar tema claro" : "Usar tema escuro"}
			onClick={() => setTheme(isDark ? "light" : "dark")}
		>
			{isDark && <SunIcon />}
			{!isDark && <MoonIcon />}
		</Button>
	);
}
