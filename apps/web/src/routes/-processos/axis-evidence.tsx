import { useQuery } from "@tanstack/react-query";
import { MicroscopeIcon } from "lucide-react";
import { Chip, DossierEntry, Quote, SectionRule, SourceLink } from "@/components/dossier";
import {
	countLabel,
	EVIDENCE_KIND_LABELS,
	EVIDENCE_PRODUCER_LABELS,
	EVIDENCE_STAGE_LABELS,
} from "@/lib/legal-labels";
import { actDate } from "@/lib/deadline-meta";
import { orpc } from "@/lib/orpc";
import { AxisEmpty, AxisSkeleton } from "./axis-states";
import { DeadlineTicket } from "./deadline-ticket";
import { FailureState } from "./feedback";
import type { CaseEvidenceItem } from "./queries";

const KIND_ORDER = [
	"pericial",
	"documental",
	"testemunhal",
	"depoimento",
	"inspecao",
	"emprestada",
] as const;

function railOf(item: CaseEvidenceItem) {
	if (item.stage === "manifestacao_aberta") {
		return "alert" as const;
	}

	if (item.stage === "indeferida") {
		return "neutral" as const;
	}

	return "accent" as const;
}

export function AxisEvidence({ cnjNumber }: { cnjNumber: string }) {
	const query = useQuery(orpc.evidence.byCase.queryOptions({ input: { cnjNumber } }));

	if (query.isPending) {
		return <AxisSkeleton />;
	}

	if (query.isError) {
		return (
			<FailureState
				title="Não foi possível carregar o dossiê de provas"
				description="A classificação vem das publicações e dos movimentos já baixados. Se a falha persistir, tente de novo em instantes."
				onRetry={() => void query.refetch()}
			/>
		);
	}

	const groups = KIND_ORDER.map((kind) => ({
		kind,
		items: query.data.items.filter((item) => item.kind === kind),
	})).filter((group) => group.items.length > 0);

	return (
		<section className="mt-5">
			<SectionRule title="Provas" count={countLabel(query.data.items.length, "prova", "provas")} />

			{query.data.items.length === 0 && (
				<AxisEmpty
					icon={MicroscopeIcon}
					title="Nenhuma prova identificada neste processo"
					description="O dossiê é derivado: o app classifica laudo, perícia, testemunha, depoimento e documento a partir do teor das publicações e dos movimentos. Quando o material probatório não aparece no que os tribunais publicam, ele não aparece aqui. A timeline de andamentos continua completa."
				/>
			)}

			{groups.map((group) => (
				<div key={group.kind} className="mt-5 first:mt-4">
					<div className="flex items-center gap-2">
						<h3 className="text-2xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
							{EVIDENCE_KIND_LABELS[group.kind]}
						</h3>
						<span className="font-mono text-2xs text-muted-foreground/70 tabular-nums">
							{group.items.length}
						</span>
					</div>

					<ol>
						{group.items.map((item) => (
							<DossierEntry
								key={item.id}
								rail={railOf(item)}
								date={actDate(item.publication?.availableAt ?? item.occurredAt)}
							>
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-[0.8125rem] font-semibold">
										{EVIDENCE_STAGE_LABELS[item.stage]}
									</span>
									<Chip>{EVIDENCE_PRODUCER_LABELS[item.producedBy]}</Chip>
									{item.origin === "manual" && <Chip tone="mute">corrigida por você</Chip>}
								</div>

								<div className="mt-2">
									<Quote>{item.snippet}</Quote>
								</div>

								{item.deadlines.length > 0 && (
									<ul className="mt-2.5 flex flex-col gap-1.5">
										{item.deadlines.map((deadline) => (
											<DeadlineTicket key={deadline.id} deadline={deadline} />
										))}
									</ul>
								)}

								<div className="mt-2">
									<SourceLink href={item.publication?.link} label="Abrir o documento original" />
								</div>
							</DossierEntry>
						))}
					</ol>
				</div>
			))}
		</section>
	);
}
