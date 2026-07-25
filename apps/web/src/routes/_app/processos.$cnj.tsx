import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { ChevronLeftIcon, FileQuestionIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCnj } from "@/lib/format";
import { AxisAppeals } from "../-processos/axis-appeals";
import { AxisDecisions } from "../-processos/axis-decisions";
import { AxisEvidence } from "../-processos/axis-evidence";
import { AxisIncidents } from "../-processos/axis-incidents";
import { CaseHeader } from "../-processos/case-header";
import { CaseOverview } from "../-processos/case-overview";
import { type CaseTabDefinition, CaseTabs } from "../-processos/case-tabs";
import { CaseTimeline } from "../-processos/case-timeline";
import { EmptyState, FailureState } from "../-processos/feedback";
import { type CaseDetail, caseQueryOptions, isNotFound } from "../-processos/queries";
import { parseCaseSearch, publicationIdFromHash } from "../-processos/search";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const Route = createFileRoute("/_app/processos/$cnj")({
	validateSearch: parseCaseSearch,
	component: CasePage,
});

function BackLink() {
	return (
		<Link
			to="/processos"
			className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
		>
			<ChevronLeftIcon className="size-3.5" />
			Processos
		</Link>
	);
}

function CaseSkeleton() {
	return (
		<div>
			<div className="border-b border-border pb-5">
				<Skeleton className="h-3 w-20" />
				<div className="mt-3 flex items-center gap-2">
					<Skeleton className="h-4 w-11" />
					<Skeleton className="h-4 w-52" />
				</div>
				<Skeleton className="mt-3 h-6 w-72 max-w-full" />
				<Skeleton className="mt-2 h-4 w-96 max-w-full" />
				<Skeleton className="mt-5 h-4 w-80 max-w-full" />
			</div>

			<div className="mt-6 space-y-2 border-l border-border pt-3 pl-4">
				{SKELETON_ROWS.map((row) => (
					<Skeleton key={row} className="h-4 w-full max-w-[32rem]" />
				))}
			</div>
		</div>
	);
}

function tabsOf(detail: CaseDetail): CaseTabDefinition[] {
	return [
		{ key: "visao-geral", label: "Visão geral" },
		{ key: "andamentos", label: "Andamentos", count: detail.timeline.length },
		{ key: "provas", label: "Provas", count: detail.counters.evidence },
		{ key: "decisoes", label: "Decisões", count: detail.counters.decisions },
		{ key: "recorrer", label: "Recorrer", count: detail.counters.appealable },
		{ key: "incidentes", label: "Incidentes", count: detail.counters.relations },
	];
}

function CasePage() {
	const { cnj } = Route.useParams();
	const { pub, aba } = Route.useSearch();
	const hash = useLocation({ select: (location) => location.hash });
	const detail = useQuery(caseQueryOptions(cnj));
	const anchorId = pub ?? publicationIdFromHash(hash);
	const active = aba ?? (anchorId ? "andamentos" : "visao-geral");

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-6">
			{detail.isPending && <CaseSkeleton />}

			{isNotFound(detail.error) && (
				<div>
					<BackLink />
					<EmptyState
						icon={FileQuestionIcon}
						title="Processo não encontrado"
						description={`Não encontramos ${formatCnj(cnj)} entre os processos ligados à sua OAB. Confira o número ou volte para a lista.`}
					>
						<Button asChild variant="outline" size="sm" className="mt-2">
							<Link to="/processos">Ver todos os processos</Link>
						</Button>
					</EmptyState>
				</div>
			)}

			{detail.isError && !isNotFound(detail.error) && (
				<div>
					<BackLink />
					<div className="mt-4">
						<FailureState
							title="Não foi possível abrir o processo"
							description="O andamento vem do banco do painel. Se a falha persistir, verifique a conexão e tente de novo em instantes."
							onRetry={() => void detail.refetch()}
						/>
					</div>
				</div>
			)}

			{!!detail.data && (
				<>
					<CaseHeader detail={detail.data} />
					<CaseTabs cnj={cnj} active={active} tabs={tabsOf(detail.data)} />

					{active === "visao-geral" && <CaseOverview detail={detail.data} />}

					{active === "andamentos" && (
						<CaseTimeline
							key={anchorId}
							cnjNumber={detail.data.case.cnjNumber}
							timeline={detail.data.timeline}
							anchorId={anchorId}
						/>
					)}

					{active === "provas" && <AxisEvidence cnjNumber={detail.data.case.cnjNumber} />}
					{active === "decisoes" && <AxisDecisions cnjNumber={detail.data.case.cnjNumber} />}
					{active === "recorrer" && <AxisAppeals cnjNumber={detail.data.case.cnjNumber} />}
					{active === "incidentes" && <AxisIncidents cnjNumber={detail.data.case.cnjNumber} />}
				</>
			)}
		</div>
	);
}
