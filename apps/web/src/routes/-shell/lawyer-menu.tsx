import { ChevronsUpDownIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatOab, formatPersonName, initialsOf } from "@/lib/format";
import { type SessionLawyer, useLogout } from "../-auth/session";

export function LawyerMenu({ lawyer }: { lawyer: SessionLawyer }) {
	const { resolvedTheme, setTheme } = useTheme();
	const logout = useLogout();
	const isDark = resolvedTheme === "dark";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors outline-none hover:bg-sidebar-accent focus-visible:bg-sidebar-accent">
				<span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted font-mono text-2xs font-semibold text-muted-foreground">
					{initialsOf(lawyer.name)}
				</span>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-xs leading-tight font-medium">
						{formatPersonName(lawyer.name)}
					</span>
					<span className="mt-0.5 font-mono text-2xs leading-none text-muted-foreground">
						{formatOab(lawyer)}
					</span>
				</span>
				<ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" side="top" className="w-60">
				<DropdownMenuLabel className="flex flex-col gap-0.5">
					<span className="truncate text-xs font-medium">{formatPersonName(lawyer.name)}</span>
					<span className="font-mono text-2xs font-normal text-muted-foreground">
						{formatOab(lawyer)}
					</span>
				</DropdownMenuLabel>

				<DropdownMenuSeparator />

				<DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
					{isDark && <SunIcon />}
					{isDark && "Tema claro"}
					{!isDark && <MoonIcon />}
					{!isDark && "Tema escuro"}
				</DropdownMenuItem>

				<DropdownMenuItem
					variant="destructive"
					disabled={logout.isPending}
					onSelect={() => logout.mutate({})}
				>
					<LogOutIcon />
					Sair
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
