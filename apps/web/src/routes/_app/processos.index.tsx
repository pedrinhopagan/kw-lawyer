import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon, ScaleIcon, SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CaseList, CaseListSkeleton } from "../-processos/case-list";
import { CaseToolbar } from "../-processos/case-toolbar";
import { EmptyState, FailureState } from "../-processos/feedback";
import { countLabel } from "@/lib/legal-labels";
import { casesListQueryOptions } from "../-processos/queries";
import { CASES_PAGE_SIZE, type CasesSearch, parseCasesSearch } from "../-processos/search";

export const Route = createFileRoute("/_app/processos/")({
	validateSearch: parseCasesSearch,
	component: CasesPage,
});

function CasesPage() {
	const { q, tribunal, page = 1 } = Route.useSearch();
	const navigate = Route.useNavigate();
	const [term, setTerm] = useState(q ?? "");
	const cases = useQuery(casesListQueryOptions({ q, tribunal, page }));

	const filtered = !!q || !!tribunal;
	const total = cases.data?.total ?? 0;
	const pages = Math.max(Math.ceil(total / CASES_PAGE_SIZE), 1);
	const first = (page - 1) * CASES_PAGE_SIZE + 1;
	const last = Math.min(page * CASES_PAGE_SIZE, total);

	function updateSearch(next: Partial<CasesSearch>) {
		void navigate({ search: (current) => ({ ...current, ...next }), replace: true });
	}

	function goToPage(next: number) {
		void navigate({ search: (current) => ({ ...current, page: next }) });
	}

	function clearFilters() {
		setTerm("");
		updateSearch({ q: undefined, tribunal: undefined, page: undefined });
	}

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-6">
			<header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h1 className="text-[1.375rem] leading-tight font-semibold tracking-[-0.02em]">
					Processos
				</h1>
				{!cases.isPending && !cases.isError && (
					<p className="text-xs text-muted-foreground tabular-nums">
						{!filtered && countLabel(total, "processo no seu nome", "processos no seu nome")}
						{filtered && countLabel(total, "processo encontrado", "processos encontrados")}
					</p>
				)}
			</header>

			<p className="mt-1 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
				Tudo em que a sua OAB aparece nas publicações do DJEN, com o andamento mais recente de cada
				um.
			</p>

			<div className="mt-4">
				<CaseToolbar
					term={term}
					setTerm={setTerm}
					tribunal={tribunal}
					onChange={updateSearch}
					onClear={clearFilters}
				/>
			</div>

			<div className="-mx-4 mt-4 border-y border-border">
				{cases.isPending && <CaseListSkeleton />}

				{cases.isError && (
					<div className="p-4">
						<FailureState
							title="Não foi possível carregar seus processos"
							description="A lista vem do banco do painel. Se a falha persistir, verifique a conexão e tente de novo em instantes."
							onRetry={() => void cases.refetch()}
						/>
					</div>
				)}

				{!!cases.data && !cases.isError && cases.data.items.length === 0 && !filtered && (
					<EmptyState
						icon={ScaleIcon}
						title="Nenhum processo por aqui ainda"
						description="Os processos aparecem a partir das publicações em nome da sua OAB. Acompanhe a sincronização no rodapé do menu lateral: assim que ela terminar, eles surgem nesta lista."
					/>
				)}

				{!!cases.data && !cases.isError && cases.data.items.length === 0 && filtered && (
					<EmptyState
						icon={SearchXIcon}
						title="Nenhum processo com esses filtros"
						description="Busque pelo número do processo, com ou sem máscara, ou pelo nome de uma das partes. Você também pode limpar os filtros e ver todos."
					>
						<Button variant="outline" size="sm" className="mt-2" onClick={clearFilters}>
							Limpar filtros
						</Button>
					</EmptyState>
				)}

				{!!cases.data && !cases.isError && cases.data.items.length > 0 && (
					<div
						className={cn(
							"transition-opacity",
							cases.isPlaceholderData && "pointer-events-none opacity-55",
						)}
					>
						<CaseList items={cases.data.items} />
					</div>
				)}

				{!cases.isError && total > CASES_PAGE_SIZE && (
					<nav className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
						<p className="text-2xs text-muted-foreground tabular-nums">
							{first} a {last} de {total.toLocaleString("pt-BR")}
						</p>
						<div className="flex items-center gap-1">
							<Button
								variant="outline"
								size="xs"
								disabled={page <= 1}
								onClick={() => goToPage(page - 1)}
							>
								<ChevronLeftIcon />
								Anterior
							</Button>
							<span className="px-2 text-2xs text-muted-foreground tabular-nums">
								{page} de {pages}
							</span>
							<Button
								variant="outline"
								size="xs"
								disabled={page >= pages}
								onClick={() => goToPage(page + 1)}
							>
								Próxima
								<ChevronRightIcon />
							</Button>
						</div>
					</nav>
				)}
			</div>
		</div>
	);
}
