import {
	CalendarCheckIcon,
	ChevronDownIcon,
	Loader2Icon,
	RefreshCwIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

export function AgendaMore({
	loaded,
	total,
	loading,
	onMore,
}: {
	loaded: number;
	total: number;
	loading: boolean;
	onMore: () => void;
}) {
	return (
		<div className="flex items-center justify-center gap-2.5 border-b border-border px-4 py-3">
			<Button variant="outline" size="sm" disabled={loading} className="gap-1.5" onClick={onMore}>
				{loading && <Loader2Icon className="size-3.5 animate-spin" />}
				{!loading && <ChevronDownIcon className="size-3.5" />}
				Carregar mais
			</Button>

			<span className="font-mono text-2xs text-muted-foreground tabular-nums">
				{loaded} de {total}
			</span>
		</div>
	);
}

export function AgendaSkeleton() {
	return (
		<ul className="divide-y divide-border border-b border-border">
			{SKELETON_ROWS.map((row) => (
				<li key={row} className="flex flex-col gap-1.5 px-4 py-3">
					<div className="flex items-center gap-3">
						<Skeleton className="h-3.5 w-52" />
						<Skeleton className="ml-auto h-3 w-20" />
					</div>
					<div className="flex items-center gap-2">
						<Skeleton className="h-3.5 w-11" />
						<Skeleton className="h-3.5 w-48" />
					</div>
					<Skeleton className="h-3 w-32" />
				</li>
			))}
		</ul>
	);
}

export function AgendaEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
	if (filtered) {
		return (
			<div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
				<CalendarCheckIcon className="size-5 text-muted-foreground" />
				<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
					Nenhum prazo neste recorte. Volte para a agenda inteira para ver o que está por vir.
				</p>
				<Button variant="outline" size="sm" onClick={onClear}>
					Ver toda a agenda
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
			<CalendarCheckIcon className="size-5 text-muted-foreground" />
			<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
				Nenhum prazo em aberto. Cada publicação nova é lida na sincronização e, quando traz prazo,
				ele aparece aqui já contado a partir da data de publicação.
			</p>
		</div>
	);
}

export function AgendaError({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
			<TriangleAlertIcon className="size-5 text-destructive" />
			<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
				Não foi possível carregar a agenda. Como prazo não pode ficar invisível, tente de novo antes
				de confiar na tela vazia.
			</p>
			<Button variant="outline" size="sm" onClick={onRetry}>
				<RefreshCwIcon />
				Tentar de novo
			</Button>
		</div>
	);
}

export function TriageEmpty() {
	return (
		<div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
			<CalendarCheckIcon className="size-5 text-muted-foreground" />
			<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
				Nenhuma publicação pendente de leitura humana. Tudo que chegou virou prazo ou foi lido como
				comunicação sem prazo.
			</p>
		</div>
	);
}
