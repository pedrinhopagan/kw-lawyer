import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { CalendarClockIcon, InboxIcon, ScaleIcon } from "lucide-react";
import { orpc } from "@/lib/orpc";

const ITEM_CLASS =
	"group relative flex items-center gap-2.5 rounded-md px-2.5 py-[0.4375rem] text-sm text-muted-foreground transition-colors before:absolute before:inset-y-1.5 before:-left-3 before:w-[2px] before:rounded-r-full before:bg-primary before:opacity-0 hover:bg-sidebar-accent hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:before:opacity-100";

export function NavItems({ onNavigate }: { onNavigate?: () => void }) {
	const unread = useQuery(
		orpc.publications.list.queryOptions({
			input: { limit: 1 },
			select: (data) => data.unread,
		}),
	);
	const agenda = useQuery(
		orpc.deadlines.summary.queryOptions({
			input: { today: format(new Date(), "yyyy-MM-dd") },
			select: (data) => data.today,
		}),
	);

	return (
		<nav className="flex flex-col gap-0.5 px-3">
			<Link to="/publicacoes" className={ITEM_CLASS} onClick={onNavigate}>
				<InboxIcon className="size-4 shrink-0" />
				<span className="flex-1">Publicações</span>
				{!!unread.data && (
					<span
						aria-label={
							unread.data === 1 ? "1 publicação não lida" : `${unread.data} publicações não lidas`
						}
						className="rounded-full bg-primary px-1.5 font-mono text-2xs font-semibold tabular-nums text-primary-foreground"
					>
						{unread.data}
					</span>
				)}
			</Link>

			<Link to="/agenda" className={ITEM_CLASS} onClick={onNavigate}>
				<CalendarClockIcon className="size-4 shrink-0" />
				<span className="flex-1">Agenda</span>
				{!!agenda.data && (
					<span
						aria-label={
							agenda.data === 1 ? "1 prazo vence hoje" : `${agenda.data} prazos vencem hoje`
						}
						className="rounded-full bg-destructive px-1.5 font-mono text-2xs font-semibold tabular-nums text-white"
					>
						{agenda.data}
					</span>
				)}
			</Link>

			<Link to="/processos" className={ITEM_CLASS} onClick={onNavigate}>
				<ScaleIcon className="size-4 shrink-0" />
				<span className="flex-1">Processos</span>
			</Link>
		</nav>
	);
}
