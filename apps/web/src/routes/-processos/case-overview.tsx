import { useQuery } from "@tanstack/react-query";
import { CalendarCheckIcon, ShieldAlertIcon } from "lucide-react";
import { Chip, Quote, SectionRule, SourceLink } from "@/components/dossier";
import { Skeleton } from "@/components/ui/skeleton";
import { countLabel, EFFECT_LABELS, OUTCOME_LABELS, SPECIES_LABELS } from "@/lib/legal-labels";
import { actDate } from "@/lib/deadline-meta";
import { orpc } from "@/lib/orpc";
import { AxisEmpty } from "./axis-states";
import { DeadlineTicket } from "./deadline-ticket";
import type { CaseDetail } from "./queries";

const OPEN_STATUSES = ["a_confirmar", "confirmado"] as const;

function OpenDeadlines({ caseId }: { caseId: string }) {
	const query = useQuery(
		orpc.deadlines.list.queryOptions({
			input: { caseId, status: [...OPEN_STATUSES, "cumprido", "descartado"], limit: 100 },
		}),
	);

	if (query.isPending) {
		return (
			<div className="mt-3 flex flex-col gap-2">
				<Skeleton className="h-8 w-full max-w-[34rem]" />
				<Skeleton className="h-8 w-full max-w-[28rem]" />
			</div>
		);
	}

	if (query.isError) {
		return (
			<p className="mt-3 text-xs text-muted-foreground">
				Não foi possível carregar os prazos deste processo agora.
			</p>
		);
	}

	const all = query.data.items;
	const open = all.filter((item) => OPEN_STATUSES.some((status) => status === item.status));
	const mine = open.filter((item) => item.audience !== "terceiro");
	const others = open.filter((item) => item.audience === "terceiro");
	const closed = all.filter((item) => !OPEN_STATUSES.some((status) => status === item.status));

	if (open.length === 0) {
		return (
			<AxisEmpty
				icon={CalendarCheckIcon}
				title="Nenhum prazo em aberto neste processo"
				description={
					closed.length > 0
						? `${countLabel(closed.length, "prazo já fechado", "prazos já fechados")} neste processo. Nada pendente no momento.`
						: "O motor de prazos não achou prazo em aberto para você aqui. Ele releitura a cada sincronização."
				}
			/>
		);
	}

	return (
		<div className="mt-3 flex flex-col gap-4">
			{mine.length > 0 && (
				<ul className="flex flex-col gap-1.5">
					{mine.map((deadline) => (
						<DeadlineTicket key={deadline.id} deadline={deadline} />
					))}
				</ul>
			)}

			{others.length > 0 && (
				<div>
					<p className="text-2xs tracking-[0.1em] text-muted-foreground uppercase">
						Prazo de terceiro
					</p>
					<ul className="mt-2 flex flex-col gap-1.5">
						{others.map((deadline) => (
							<DeadlineTicket key={deadline.id} deadline={deadline} />
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

function LatestDecision({ cnjNumber }: { cnjNumber: string }) {
	const query = useQuery(orpc.decisions.byCase.queryOptions({ input: { cnjNumber } }));

	if (query.isPending) {
		return <Skeleton className="mt-3 h-20 w-full max-w-[44rem]" />;
	}

	const latest = query.data?.items.find((item) => item.species !== "despacho");

	if (!latest) {
		return (
			<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
				Ainda não há decisão classificada neste processo.
			</p>
		);
	}

	return (
		<div className="mt-3">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="font-mono text-2xs text-muted-foreground tabular-nums">
					{actDate(latest.publication?.availableAt ?? latest.decidedAt)}
				</span>
				<span className="text-[0.8125rem] font-semibold">{SPECIES_LABELS[latest.species]}</span>
				{!!latest.outcome && <Chip tone="accent">{OUTCOME_LABELS[latest.outcome]}</Chip>}
				{latest.effects.map((effect) => (
					<Chip key={effect}>{EFFECT_LABELS[effect]}</Chip>
				))}
			</div>

			<div className="mt-2">
				<Quote>{latest.snippet}</Quote>
			</div>

			<div className="mt-2">
				<SourceLink href={latest.publication?.link} label="Abrir a publicação" />
			</div>
		</div>
	);
}

function SuspensionNotice({ cnjNumber }: { cnjNumber: string }) {
	const query = useQuery(orpc.incidents.byCase.queryOptions({ input: { cnjNumber } }));
	const suspending = query.data?.items.filter((item) => item.suspensiveEffect === true) ?? [];

	if (suspending.length === 0) {
		return null;
	}

	return (
		<p className="mt-4 flex gap-2 rounded-[3px] border border-primary/35 bg-primary/8 p-3 text-xs leading-relaxed">
			<ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
			<span>
				Incidente com efeito suspensivo concedido. Confirme se os prazos deste processo estão
				suspensos antes de peticionar.
			</span>
		</p>
	);
}

export function CaseOverview({ detail }: { detail: CaseDetail }) {
	return (
		<div className="mt-5 flex flex-col gap-8">
			<section>
				<SectionRule
					title="O que fazer agora"
					count={countLabel(detail.counters.openDeadlines, "prazo em aberto", "prazos em aberto")}
				/>
				<SuspensionNotice cnjNumber={detail.case.cnjNumber} />
				<OpenDeadlines caseId={detail.case.id} />
			</section>

			<section>
				<SectionRule title="Onde o processo está" />
				<LatestDecision cnjNumber={detail.case.cnjNumber} />
			</section>
		</div>
	);
}
