import { InboxIcon, RefreshCwIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

export function InboxSkeleton() {
	return (
		<ul className="divide-y divide-border border-b border-border">
			{SKELETON_ROWS.map((row) => (
				<li key={row} className="flex flex-col gap-1.5 px-4 py-3">
					<div className="flex items-center gap-3">
						<Skeleton className="h-3.5 w-40" />
						<Skeleton className="ml-auto h-3 w-16" />
					</div>

					<div className="flex items-center gap-2">
						<Skeleton className="h-3.5 w-11" />
						<Skeleton className="h-3.5 w-44" />
					</div>

					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-4/5" />
				</li>
			))}
		</ul>
	);
}

export function InboxEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
	if (filtered) {
		return (
			<div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
				<SearchXIcon className="size-5 text-muted-foreground" />
				<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
					Nenhuma publicação com esses filtros. Amplie o período ou volte para todos os tribunais.
				</p>
				<Button variant="outline" size="sm" onClick={onClear}>
					Limpar filtros
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
			<InboxIcon className="size-5 text-muted-foreground" />
			<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
				Nada publicado nas suas inscrições até agora. A busca no DJEN roda sozinha sempre que você
				abre o painel, e o que sair no diário aparece aqui na manhã seguinte.
			</p>
		</div>
	);
}

export function InboxError({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
			<TriangleAlertIcon className="size-5 text-destructive" />
			<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
				Não foi possível carregar suas publicações agora. Pode ser uma queda momentânea da conexão
				com o servidor.
			</p>
			<Button variant="outline" size="sm" onClick={onRetry}>
				<RefreshCwIcon />
				Tentar de novo
			</Button>
		</div>
	);
}

export function InboxStaleWarning({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-destructive/25 bg-destructive/5 px-4 py-2">
			<span className="flex items-center gap-2 text-xs text-destructive">
				<TriangleAlertIcon className="size-3.5" />
				Não foi possível atualizar a lista. Você está vendo o último resultado carregado.
			</span>
			<Button variant="ghost" size="xs" className="text-destructive" onClick={onRetry}>
				Tentar de novo
			</Button>
		</div>
	);
}
