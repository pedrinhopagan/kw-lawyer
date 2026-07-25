import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarXIcon, ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, FailureState } from "../-processos/feedback";
import { HubActions } from "../-prazo/hub-actions";
import { HubHeader } from "../-prazo/hub-header";
import {
	HubCalc,
	HubDecisionsBlock,
	HubEvidenceBlock,
	HubHistory,
	HubMotive,
	HubSatellites,
	HubWarnings,
} from "../-prazo/hub-material";
import { hubQueryOptions, isNotFound } from "../-prazo/queries";

export const Route = createFileRoute("/_app/prazos/$deadlineId")({
	component: HubPage,
});

function BackLink() {
	return (
		<Link
			to="/agenda"
			className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
		>
			<ChevronLeftIcon className="size-3.5" />
			Agenda
		</Link>
	);
}

function HubSkeleton() {
	return (
		<div>
			<Skeleton className="h-3 w-16" />
			<div className="mt-3 flex gap-2">
				<Skeleton className="h-4 w-11" />
				<Skeleton className="h-4 w-24" />
			</div>
			<Skeleton className="mt-3 h-7 w-80 max-w-full" />
			<Skeleton className="mt-3 h-9 w-40" />
			<Skeleton className="mt-3 h-4 w-96 max-w-full" />
			<Skeleton className="mt-8 h-32 w-full max-w-[44rem]" />
			<Skeleton className="mt-6 h-40 w-full max-w-[44rem]" />
		</div>
	);
}

function HubPage() {
	const { deadlineId } = Route.useParams();
	const hub = useQuery(hubQueryOptions(deadlineId));

	return (
		<div className="mx-auto w-full max-w-4xl px-4 py-6 pb-20">
			{hub.isPending && <HubSkeleton />}

			{isNotFound(hub.error) && (
				<div>
					<BackLink />
					<EmptyState
						icon={CalendarXIcon}
						title="Prazo não encontrado"
						description="Este prazo não existe mais ou não está entre os seus. Volte para a agenda e escolha outro."
					>
						<Button asChild variant="outline" size="sm" className="mt-2">
							<Link to="/agenda">Ver a agenda</Link>
						</Button>
					</EmptyState>
				</div>
			)}

			{hub.isError && !isNotFound(hub.error) && (
				<div>
					<BackLink />
					<div className="mt-4">
						<FailureState
							title="Não foi possível abrir o prazo"
							description="O hub monta prazo, decisão, provas e satélites em uma leitura. Se a falha persistir, tente de novo em instantes."
							onRetry={() => void hub.refetch()}
						/>
					</div>
				</div>
			)}

			{!!hub.data && (
				<>
					<HubHeader data={hub.data} />
					<HubWarnings warnings={hub.data.deadline.warnings} />

					<div className="mt-8 flex flex-col gap-8">
						<HubMotive data={hub.data} />
						<HubActions data={hub.data} />
						<HubEvidenceBlock data={hub.data} />
						<HubDecisionsBlock data={hub.data} />
						<HubSatellites data={hub.data} />
						<HubCalc data={hub.data} />
						<HubHistory data={hub.data} />
					</div>
				</>
			)}
		</div>
	);
}
