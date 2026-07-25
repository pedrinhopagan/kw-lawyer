import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { PAGE_SIZE, withPage } from "./search";

const PAGE_LINK_CLASS =
	"aria-disabled:pointer-events-none aria-disabled:opacity-40 [&_svg]:size-3.5";

export function InboxPagination({ page, total }: { page: number; total: number }) {
	const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
	const first = (page - 1) * PAGE_SIZE + 1;
	const last = Math.min(page * PAGE_SIZE, total);

	return (
		<nav className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
			<span className="text-2xs text-muted-foreground tabular-nums">
				{first} a {last} de {total}
			</span>

			<div className="flex items-center gap-1.5">
				<Link
					to="/publicacoes"
					search={(prev) => withPage(prev, page - 1)}
					disabled={page <= 1}
					className={cn(buttonVariants({ variant: "outline", size: "xs" }), PAGE_LINK_CLASS)}
				>
					<ChevronLeftIcon />
					Anterior
				</Link>

				<span className="px-1 text-2xs text-muted-foreground tabular-nums">
					Página {page} de {pages}
				</span>

				<Link
					to="/publicacoes"
					search={(prev) => withPage(prev, page + 1)}
					disabled={page >= pages}
					className={cn(buttonVariants({ variant: "outline", size: "xs" }), PAGE_LINK_CLASS)}
				>
					Próxima
					<ChevronRightIcon />
				</Link>
			</div>
		</nav>
	);
}
