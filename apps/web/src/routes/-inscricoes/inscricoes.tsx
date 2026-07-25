import { useQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEventDate, formatPersonName } from "@/lib/format";
import { OabForm } from "./oab-form";
import { useRemoveOab, watchedOabsQueryOptions } from "./queries";

const SKELETON_ROWS = [0, 1];

function syncLabel(lastSyncedAt: Date | null) {
	if (!lastSyncedAt) {
		return "ainda não sincronizada";
	}

	return `sincronizada em ${formatEventDate(lastSyncedAt)}`;
}

export function Inscricoes() {
	const watched = useQuery(watchedOabsQueryOptions);
	const remove = useRemoveOab();

	return (
		<div className="mx-auto w-full max-w-3xl pb-16">
			<header className="sticky top-12 z-20 border-b border-border bg-background/95 px-4 pt-4 pb-3 backdrop-blur md:top-0">
				<h1 className="text-[1.375rem] leading-none font-semibold tracking-[-0.02em]">
					Inscrições
				</h1>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					A busca de publicações é feita por inscrição na OAB. Quando a intimação sai no nome de
					outro advogado do escritório, o processo só aparece aqui se aquela inscrição também for
					acompanhada.
				</p>
			</header>

			<section className="border-b border-border px-4 py-5">
				<h2 className="text-2xs uppercase tracking-[0.16em] text-muted-foreground">
					Sua inscrição
				</h2>

				{watched.isPending && <Skeleton className="mt-3 h-11 w-full" />}

				{!!watched.data && (
					<div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
						<span className="tag-tribunal">
							OAB/{watched.data.own.oabUf} {watched.data.own.oabNumber}
						</span>
						<span className="min-w-0 flex-1 truncate text-sm">
							{formatPersonName(watched.data.own.holderName)}
						</span>
						<span className="text-2xs text-muted-foreground">
							{syncLabel(watched.data.own.lastSyncedAt)}
						</span>
					</div>
				)}
			</section>

			<section className="px-4 py-5">
				<h2 className="text-2xs uppercase tracking-[0.16em] text-muted-foreground">
					Inscrições que você também acompanha
				</h2>

				{watched.isPending && (
					<ul className="mt-3 flex flex-col gap-2">
						{SKELETON_ROWS.map((row) => (
							<li key={row}>
								<Skeleton className="h-11 w-full" />
							</li>
						))}
					</ul>
				)}

				{watched.data?.extra.length === 0 && (
					<p className="mt-3 text-sm text-muted-foreground">
						Nenhuma por enquanto. Só as publicações da sua inscrição chegam ao painel.
					</p>
				)}

				{!!watched.data?.extra.length && (
					<ul className="mt-3 flex flex-col gap-2">
						{watched.data.extra.map((oab) => (
							<li
								key={oab.id}
								className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
							>
								<span className="tag-tribunal">
									OAB/{oab.oabUf} {oab.oabNumber}
								</span>
								<span className="min-w-0 flex-1 truncate text-sm">
									{!!oab.holderName && formatPersonName(oab.holderName)}
									{!oab.holderName && "titular não identificado"}
								</span>
								<span className="hidden text-2xs text-muted-foreground sm:inline">
									{syncLabel(oab.lastSyncedAt)}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={`Parar de acompanhar a OAB/${oab.oabUf} ${oab.oabNumber}`}
									disabled={remove.isPending}
									onClick={() => remove.mutate({ id: oab.id })}
								>
									<Trash2Icon />
								</Button>
							</li>
						))}
					</ul>
				)}

				<div className="mt-6 border-t border-border pt-5">
					<OabForm />
				</div>
			</section>
		</div>
	);
}
