import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, GitBranchIcon, ShieldAlertIcon } from "lucide-react";
import { Chip, Quote, SectionRule } from "@/components/dossier";
import { cn } from "@/lib/cn";
import { formatCnj } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { countLabel, RELATION_KIND_LABELS, RELATION_STATE_LABELS } from "@/lib/legal-labels";
import { AxisEmpty, AxisSkeleton } from "./axis-states";
import { FailureState } from "./feedback";
import type { CaseRelationItem } from "./queries";

function RelationCard({ item }: { item: CaseRelationItem }) {
	const suspends = item.suspensiveEffect === true;

	return (
		<li
			className={cn(
				"rounded-[3px] border border-border bg-card px-3 py-2.5",
				suspends && "border-l-2 border-l-primary",
			)}
		>
			<div className="flex flex-wrap items-center gap-1.5">
				<Chip tone="accent">{RELATION_KIND_LABELS[item.kind]}</Chip>
				<span className="text-2xs text-muted-foreground">
					{item.role === "satelite" && "satélite deste processo"}
					{item.role === "principal" && "processo principal"}
				</span>
				{!!item.state && <Chip>{RELATION_STATE_LABELS[item.state]}</Chip>}
				{item.suspensiveEffect === true && <Chip tone="accent">efeito suspensivo</Chip>}
				{item.suspensiveEffect === false && <Chip tone="mute">sem efeito suspensivo</Chip>}
			</div>

			<div className="mt-2 flex flex-wrap items-center gap-2">
				{item.counterpart.inScope && (
					<Link
						to="/processos/$cnj"
						params={{ cnj: item.counterpart.cnjNumber }}
						className="group inline-flex items-center gap-1.5"
					>
						<span className="num-cnj font-medium underline decoration-border underline-offset-2 transition-colors group-hover:decoration-foreground">
							{formatCnj(item.counterpart.cnjNumber)}
						</span>
						<ArrowUpRightIcon className="size-3 text-muted-foreground" />
					</Link>
				)}

				{!item.counterpart.inScope && (
					<span className="num-cnj text-muted-foreground">
						{formatCnj(item.counterpart.cnjNumber)}
					</span>
				)}

				{!!item.counterpart.className && (
					<span className="text-2xs text-muted-foreground">{item.counterpart.className}</span>
				)}

				{!item.counterpart.inScope && (
					<span className="text-2xs text-muted-foreground/80">
						fora dos processos ligados à sua OAB
					</span>
				)}
			</div>

			{!!item.snippet && (
				<div className="mt-2">
					<Quote>{item.snippet}</Quote>
				</div>
			)}
		</li>
	);
}

export function AxisIncidents({ cnjNumber }: { cnjNumber: string }) {
	const query = useQuery(orpc.incidents.byCase.queryOptions({ input: { cnjNumber } }));

	if (query.isPending) {
		return <AxisSkeleton />;
	}

	if (query.isError) {
		return (
			<FailureState
				title="Não foi possível carregar os incidentes"
				description="O vínculo é descoberto pelo número CNJ citado nas publicações e pelos movimentos do DataJud. Tente de novo em instantes."
				onRetry={() => void query.refetch()}
			/>
		);
	}

	const satellites = query.data.items.filter((item) => item.role === "satelite");
	const principals = query.data.items.filter((item) => item.role === "principal");
	const suspending = query.data.items.filter((item) => item.suspensiveEffect === true);

	return (
		<section className="mt-5">
			<SectionRule
				title="Agravos e incidentes"
				count={countLabel(query.data.items.length, "vínculo", "vínculos")}
			/>

			{suspending.length > 0 && (
				<p className="mt-3 flex gap-2 rounded-[3px] border border-primary/35 bg-primary/8 p-3 text-xs leading-relaxed">
					<ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
					<span>
						{suspending.length === 1 && "Há incidente com efeito suspensivo concedido."}
						{suspending.length > 1 &&
							`Há ${suspending.length} incidentes com efeito suspensivo concedido.`}{" "}
						Confira se os prazos deste processo estão suspensos antes de peticionar.
					</span>
				</p>
			)}

			{query.data.items.length === 0 && (
				<AxisEmpty
					icon={GitBranchIcon}
					title="Nenhum satélite identificado"
					description="O app amarra agravo, embargos, cumprimento de sentença e precatória ao principal quando o número CNJ aparece citado na publicação ou nos movimentos. Citação ambígua entre dois processos comuns não gera vínculo, para não inventar relação."
				/>
			)}

			{principals.length > 0 && (
				<div className="mt-4">
					<SectionRule title="Este processo é incidente de" />
					<ul className="mt-3 flex flex-col gap-2">
						{principals.map((item) => (
							<RelationCard key={item.id} item={item} />
						))}
					</ul>
				</div>
			)}

			{satellites.length > 0 && (
				<div className="mt-5">
					<SectionRule title="Satélites deste processo" count={String(satellites.length)} />
					<ul className="mt-3 flex flex-col gap-2">
						{satellites.map((item) => (
							<RelationCard key={item.id} item={item} />
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
