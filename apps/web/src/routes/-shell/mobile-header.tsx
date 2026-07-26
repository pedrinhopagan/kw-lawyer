import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SessionLawyer } from "../-auth/session";
import { AppSidebar } from "./app-sidebar";
import { Brand } from "./brand";

export function MobileHeader({ lawyer }: { lawyer: SessionLawyer }) {
	const [open, setOpen] = useState(false);

	return (
		<header className="sticky top-0 z-30 flex h-[var(--kw-mobile-header)] shrink-0 items-center gap-2 border-b border-border bg-background/90 px-2 pt-[var(--kw-safe-top)] backdrop-blur-sm md:hidden">
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetTrigger asChild>
					<Button variant="ghost" size="icon-sm" aria-label="Abrir navegação">
						<MenuIcon />
					</Button>
				</SheetTrigger>
				<SheetContent side="left" showCloseButton={false} className="w-[15.5rem] gap-0 p-0">
					<SheetTitle className="sr-only">Navegação</SheetTitle>
					<AppSidebar lawyer={lawyer} onNavigate={() => setOpen(false)} />
				</SheetContent>
			</Sheet>

			<Brand />
		</header>
	);
}
