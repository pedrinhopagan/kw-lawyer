import { useQuery } from "@tanstack/react-query";
import { GavelIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, DossierEntry, Quote, SectionRule, SourceLink } from "@/components/dossier";
import { cn } from "@/lib/cn";
import { actDate } from "@/lib/deadline-meta";
import { orpc } from "@/lib/orpc";
import {
	countLabel,
	EFFECT_LABELS,
	OUTCOME_LABELS,
	SPECIES_LABELS,
	SPECIES_READING_LABELS,
	SPECIES_SHORT,
} from "@/lib/legal-labels";
import { DeadlineTicket } from "./deadline-ticket";
import { FailureState } from "./feedback";
import { AxisEmpty, AxisSkeleton } from "./axis-states";
import type { CaseDecision } from "./queries";

const SPECIES_ORDER = ["sentenca", "acordao", "monocratica", "interlocutoria", "despacho"] as const;

function railOf(decision: CaseDecision) {
	if (decision.effects.includes("encerra_fase")) {
		return "accent" as const;
	}

	if (decision.effects.includes("abre_prazo")) {
		return "alert" as const;
	}

	return "neutral" as const;
}

export function AxisDecisions({ cnjNumber }: { cnjNumber: string }) {
	const query = useQuery(orpc.decisions.byCase.queryOptions({ input: { cnjNumber } }));
	const [species, setSpecies] = useState<string | null>(null);

	if (query.isPending) {
		return <AxisSkeleton />;
	}

	if (query.isError) {
		return (
			<FailureState
				title="Não foi possível carregar as decisões"
				description="A leitura vem do motor de classificação. Se a falha persistir, rode a sincronização e tente de novo."
				onRetry={() => void query.refetch()}
			/>
		);
	}

	const all = query.data.items;
	const present = SPECIES_ORDER.filter((entry) => all.some((item) => item.species === entry));
	const items = species ? all.filter((item) => item.species === species) : all;

	return (
		<section className="mt-5">
			<SectionRule title="Decisões" count={countLabel(all.length, "decisão", "decisões")}>
				<div className="flex flex-wrap gap-1">
					{present.map((entry) => (
						<Button
							key={entry}
							variant="ghost"
							size="xs"
							aria-pressed={species === entry}
							className={cn(
								"text-muted-foreground",
								species === entry && "bg-accent text-foreground",
							)}
							onClick={() => setSpecies((current) => (current === entry ? null : entry))}
						>
							{SPECIES_SHORT[entry]}
							<span className="font-mono tabular-nums">
								{all.filter((item) => item.species === entry).length}
							</span>
						</Button>
					))}
				</div>
			</SectionRule>

			{all.length === 0 && (
				<AxisEmpty
					icon={GavelIcon}
					title="Nenhuma decisão identificada"
					description="O motor lê o teor das publicações e os códigos do DataJud para separar o que decide do que é expediente. Neste processo ainda não achou ato decisório."
				/>
			)}

			<ol>
				{items.map((decision) => (
					<DossierEntry
						key={decision.id}
						rail={railOf(decision)}
						date={actDate(decision.publication?.availableAt ?? decision.decidedAt)}
					>
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="text-[0.8125rem] font-semibold">
								{SPECIES_LABELS[decision.species]}
							</span>
							{!!SPECIES_READING_LABELS[decision.speciesConfidence] && (
								<Chip tone="alert">{SPECIES_READING_LABELS[decision.speciesConfidence]}</Chip>
							)}
							{!!decision.outcome && <Chip tone="accent">{OUTCOME_LABELS[decision.outcome]}</Chip>}
							{decision.effects.map((effect) => (
								<Chip key={effect}>{EFFECT_LABELS[effect]}</Chip>
							))}
							{decision.origin === "manual" && <Chip tone="mute">corrigida por você</Chip>}
						</div>

						<div className="mt-2">
							<Quote>{decision.snippet}</Quote>
						</div>

						{decision.deadlines.length > 0 && (
							<ul className="mt-2.5 flex flex-col gap-1.5">
								{decision.deadlines.map((deadline) => (
									<DeadlineTicket key={deadline.id} deadline={deadline} />
								))}
							</ul>
						)}

						<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
							<SourceLink href={decision.publication?.link} label="Abrir a publicação" />
							{!!decision.publication?.orgName && (
								<span className="text-2xs text-muted-foreground">
									{decision.publication.orgName}
								</span>
							)}
						</div>
					</DossierEntry>
				))}
			</ol>
		</section>
	);
}
