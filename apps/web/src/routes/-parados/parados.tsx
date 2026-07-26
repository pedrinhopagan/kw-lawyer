import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RadarIcon, SatelliteDishIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCnj, formatPersonName } from "@/lib/format";
import { countLabel } from "@/lib/legal-labels";
import { EmptyState, FailureState } from "../-processos/feedback";
import { silentCasesQueryOptions, uncoveredCasesQueryOptions, uncoveredLabel } from "./queries";
import { SilentRow } from "./silent-row";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

export function Parados() {
	const silent = useQuery(silentCasesQueryOptions);
	const uncovered = useQuery(uncoveredCasesQueryOptions);

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-6 pb-16">
			<header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h1 className="text-[1.375rem] leading-tight font-semibold tracking-[-0.02em]">Parados</h1>

				{!!silent.data && (
					<p className="text-xs text-muted-foreground tabular-nums">
						{countLabel(
							silent.data.items.length,
							"processo sem andamento",
							"processos sem andamento",
						)}
					</p>
				)}
			</header>

			<p className="mt-1 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
				O resto do painel fala do que aconteceu. Esta tela fala do que não aconteceu: processos seus
				sem nenhum andamento no DataJud há mais de {silent.data?.thresholdDays ?? 60} dias, do mais
				esquecido para o menos. Processo concluso ao juiz pesa mais, porque ali o silêncio é do
				gabinete.
			</p>

			<div className="-mx-4 mt-4 border-y border-border">
				{silent.isPending && (
					<ul className="divide-y divide-border">
						{SKELETON_ROWS.map((row) => (
							<li key={row} className="flex items-start gap-3 px-4 py-3">
								<div className="min-w-0 flex-1">
									<Skeleton className="h-4 w-52" />
									<Skeleton className="mt-2 h-4 w-56" />
									<Skeleton className="mt-2 h-3 w-72 max-w-full" />
								</div>
								<Skeleton className="mt-1 h-4 w-12" />
							</li>
						))}
					</ul>
				)}

				{silent.isError && (
					<div className="p-4">
						<FailureState
							title="Não foi possível montar o radar"
							description="A lista compara a data do último andamento de cada processo com o dia de hoje. Tente de novo em instantes."
							onRetry={() => void silent.refetch()}
						/>
					</div>
				)}

				{!!silent.data && silent.data.items.length === 0 && (
					<EmptyState
						icon={RadarIcon}
						title="Nenhum processo esquecido"
						description="Todos os processos com cobertura do DataJud tiveram andamento recente. Quando um deles ficar em silêncio além do limiar, ele aparece aqui."
					/>
				)}

				{!!silent.data && silent.data.items.length > 0 && (
					<ul className="divide-y divide-border">
						{silent.data.items.map((item) => (
							<SilentRow key={item.id} item={item} />
						))}
					</ul>
				)}
			</div>

			{!!uncovered.data && uncovered.data.items.length > 0 && (
				<section className="mt-8">
					<h2 className="flex items-center gap-2 text-2xs tracking-[0.16em] text-muted-foreground uppercase">
						<SatelliteDishIcon className="size-3.5" />
						Sem cobertura do DataJud
					</h2>

					<p className="mt-2 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
						Destes o app não sabe o andamento, então não sabe dizer se estão parados. Eles ficam
						fora da conta acima de propósito: contar como esquecido o que nunca foi lido faria o
						radar mentir.
					</p>

					<ul className="mt-3 divide-y divide-border border-y border-border">
						{uncovered.data.items.map((item) => (
							<li key={item.id}>
								<Link
									to="/processos/$cnj"
									params={{ cnj: item.formattedNumber }}
									className="flex w-full items-baseline gap-3 py-2.5 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
								>
									<span className="tag-tribunal">{item.tribunal}</span>
									<span className="num-cnj shrink-0 text-muted-foreground">
										{formatCnj(item.cnjNumber)}
									</span>
									<span className="min-w-0 flex-1 truncate text-xs text-foreground/80">
										{formatPersonName(item.className ?? "Classe não informada")}
									</span>
									<span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">
										{uncoveredLabel(item.datajudStatus)}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
