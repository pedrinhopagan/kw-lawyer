import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	CheckIcon,
	ChevronsUpDownIcon,
	LogOutIcon,
	MoonIcon,
	SunIcon,
	UserPlusIcon,
} from "lucide-react";
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
import {
	profilesQueryOptions,
	type SessionLawyer,
	useLogout,
	useSwitchProfile,
} from "../-auth/session";

export function LawyerMenu({ lawyer }: { lawyer: SessionLawyer }) {
	const { resolvedTheme, setTheme } = useTheme();
	const profiles = useQuery(profilesQueryOptions);
	const switchProfile = useSwitchProfile();
	const logout = useLogout();
	const isDark = resolvedTheme === "dark";
	const connected = profiles.data?.profiles ?? [];
	const busy = switchProfile.isPending || logout.isPending;

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
				{connected.length < 2 && (
					<DropdownMenuLabel className="flex flex-col gap-0.5">
						<span className="truncate text-xs font-medium">{formatPersonName(lawyer.name)}</span>
						<span className="font-mono text-2xs font-normal text-muted-foreground">
							{formatOab(lawyer)}
						</span>
					</DropdownMenuLabel>
				)}

				{connected.length > 1 && (
					<>
						<DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
							Conectados neste navegador
						</DropdownMenuLabel>

						{connected.map((profile) => (
							<DropdownMenuItem
								key={profile.id}
								disabled={busy}
								onSelect={() => {
									if (!profile.active) {
										switchProfile.mutate(profile.id);
									}
								}}
							>
								<span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted font-mono text-[0.625rem] font-semibold text-muted-foreground">
									{initialsOf(profile.name)}
								</span>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-xs leading-tight font-medium">
										{formatPersonName(profile.name)}
									</span>
									<span className="mt-0.5 font-mono text-2xs leading-none text-muted-foreground">
										{formatOab(profile)}
									</span>
								</span>
								{profile.active && <CheckIcon className="size-3.5 shrink-0 text-primary" />}
							</DropdownMenuItem>
						))}
					</>
				)}

				<DropdownMenuSeparator />

				<DropdownMenuItem asChild>
					<Link to="/login" search={{}}>
						<UserPlusIcon />
						Entrar com outra OAB
					</Link>
				</DropdownMenuItem>

				<DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
					{isDark && <SunIcon />}
					{isDark && "Tema claro"}
					{!isDark && <MoonIcon />}
					{!isDark && "Tema escuro"}
				</DropdownMenuItem>

				<DropdownMenuItem variant="destructive" disabled={busy} onSelect={() => logout.mutate()}>
					<LogOutIcon />
					{connected.length > 1 && "Sair desta OAB"}
					{connected.length < 2 && "Sair"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
