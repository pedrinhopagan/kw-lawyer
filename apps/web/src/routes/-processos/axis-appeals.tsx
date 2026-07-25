import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ScaleIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Chip, DossierEntry, Quote, SectionRule } from "@/components/dossier";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import {
	APPEAL_CHOICE_LABELS,
	countLabel,
	OUTCOME_LABELS,
	SPECIES_LABELS,
} from "@/lib/legal-labels";
import { actDate, UNIT_LABELS } from "@/lib/deadline-meta";
import { orpc } from "@/lib/orpc";
import { AxisEmpty, AxisSkeleton } from "./axis-states";
import { DeadlineTicket } from "./deadline-ticket";
import { FailureState } from "./feedback";
import type { CaseAppealItem } from "./queries";

function useAppealChoice(cnjNumber: string) {
	const queryClient = useQueryClient();

	return useMutation(
		orpc.appeals.choose.mutationOptions({
			onSuccess: async (_result, variables) => {
				toast.success(
					variables.choice === "recorrer"
						? "Recurso escolhido. O prazo entrou na agenda com a memória de cálculo."
						: "Escolha registrada no processo.",
				);

				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.appeals.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.deadlines.key() }),
					queryClient.invalidateQueries({
						queryKey: orpc.cases.get.queryKey({ input: { cnjNumber } }),
					}),
				]);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
}

function AppealCard({ item, cnjNumber }: { item: CaseAppealItem; cnjNumber: string }) {
	const choose = useAppealChoice(cnjNumber);
	const [selected, setSelected] = useState<string>();
	const [reason, setReason] = useState("");
	const [declining, setDeclining] = useState(false);
	const decided = item.choice?.choice;

	return (
		<DossierEntry
			rail={decided === "recorrer" ? "accent" : "neutral"}
			date={actDate(item.decision.publication?.availableAt ?? item.decision.decidedAt)}
		>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-[0.8125rem] font-semibold">
					{SPECIES_LABELS[item.decision.species]}
				</span>
				{!!item.decision.outcome && (
					<Chip tone="accent">{OUTCOME_LABELS[item.decision.outcome]}</Chip>
				)}
				{!!decided && (
					<Chip tone={decided === "recorrer" ? "accent" : "mute"}>
						{APPEAL_CHOICE_LABELS[decided]}
					</Chip>
				)}
			</div>

			<div className="mt-2">
				<Quote>{item.decision.snippet}</Quote>
			</div>

			{!!item.advice.blocked && (
				<p className="mt-2.5 flex gap-2 rounded-[3px] border border-border bg-muted/40 p-2.5 text-xs leading-relaxed">
					<TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
					<span>
						{item.advice.blocked.reason}{" "}
						<span className="font-mono text-2xs text-muted-foreground">
							{item.advice.blocked.basis}
						</span>
					</span>
				</p>
			)}

			<ul className="mt-3 flex flex-col gap-1.5">
				{item.advice.options.map((option) => {
					const isChoice = item.choice?.actKey === option.actKey;
					const isSelected = selected === option.actKey;

					return (
						<li key={option.actKey}>
							<button
								type="button"
								aria-pressed={isSelected}
								onClick={() => {
									setDeclining(false);
									setSelected((current) => (current === option.actKey ? undefined : option.actKey));
								}}
								className={cn(
									"w-full rounded-[3px] border px-2.5 py-2 text-left transition-colors",
									isSelected
										? "border-primary/50 bg-primary/8"
										: "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
								)}
							>
								<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
									<span className="text-[0.8125rem] font-medium">{option.label}</span>
									<span className="font-mono text-2xs text-foreground tabular-nums">
										{option.days} {UNIT_LABELS[option.unit]}
									</span>
									<span className="font-mono text-2xs text-muted-foreground">
										{option.admissibilityBasis}
									</span>
									{option.needsPreparo && <Chip>exige preparo</Chip>}
									{isChoice && <Chip tone="accent">escolhido</Chip>}
								</div>

								{!!option.condition && (
									<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
										{option.condition}
									</p>
								)}
							</button>
						</li>
					);
				})}
			</ul>

			{!!item.choice?.deadlineId && !!item.choice.deadline && (
				<ul className="mt-2.5">
					<DeadlineTicket
						deadline={{
							id: item.choice.deadlineId,
							title: item.choice.deadline.title,
							dueAt: item.choice.deadline.dueAt,
							status: item.choice.deadline.status,
						}}
					/>
				</ul>
			)}

			{!!item.choice?.reason && (
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					Motivo registrado: {item.choice.reason}
				</p>
			)}

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<Button
					size="xs"
					disabled={!selected || choose.isPending}
					onClick={() => {
						if (!selected) {
							return;
						}

						choose.mutate({
							decisionId: item.decision.id,
							choice: "recorrer",
							actKey: selected,
						});
					}}
				>
					<CheckIcon />
					Recorrer e abrir o prazo
				</Button>

				<Button
					variant="outline"
					size="xs"
					disabled={choose.isPending}
					onClick={() =>
						choose.mutate({
							decisionId: item.decision.id,
							choice: "recorrido",
							actKey: selected,
						})
					}
				>
					Já recorri
				</Button>

				<Button
					variant="ghost"
					size="xs"
					className="text-muted-foreground"
					onClick={() => setDeclining((current) => !current)}
				>
					Não recorrer
				</Button>
			</div>

			{declining && (
				<div className="mt-2 flex flex-col gap-2">
					<Textarea
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						placeholder="Por que não recorrer? O motivo fica registrado no processo."
						className="min-h-16 text-xs"
					/>
					<div className="flex gap-2">
						<Button
							size="xs"
							variant="outline"
							disabled={!reason.trim() || choose.isPending}
							onClick={() =>
								choose.mutate({
									decisionId: item.decision.id,
									choice: "nao_recorrer",
									reason: reason.trim(),
								})
							}
						>
							Registrar a decisão
						</Button>
						<Button
							size="xs"
							variant="ghost"
							className="text-muted-foreground"
							onClick={() => setDeclining(false)}
						>
							Cancelar
						</Button>
					</div>
				</div>
			)}
		</DossierEntry>
	);
}

export function AxisAppeals({ cnjNumber }: { cnjNumber: string }) {
	const query = useQuery(orpc.appeals.byCase.queryOptions({ input: { cnjNumber } }));

	if (query.isPending) {
		return <AxisSkeleton />;
	}

	if (query.isError) {
		return (
			<FailureState
				title="Não foi possível calcular o cabimento"
				description="O mapa de cabimento cruza a espécie da decisão com o catálogo de prazos. Tente de novo em instantes."
				onRetry={() => void query.refetch()}
			/>
		);
	}

	const { items, transitedAt } = query.data;

	return (
		<section className="mt-5">
			<SectionRule
				title="Recorrer"
				count={countLabel(items.length, "decisão recorrível", "decisões recorríveis")}
			/>

			{!!transitedAt && (
				<p className="mt-3 flex gap-2 rounded-[3px] border border-border bg-muted/40 p-3 text-xs leading-relaxed">
					<TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
					<span>
						Trânsito em julgado certificado em{" "}
						<span className="font-mono tabular-nums">
							{new Date(transitedAt).toLocaleDateString("pt-BR")}
						</span>
						. Não corre mais prazo recursal neste processo.
					</span>
				</p>
			)}

			{items.length === 0 && !transitedAt && (
				<AxisEmpty
					icon={ScaleIcon}
					title="Nenhuma decisão recorrível no momento"
					description="A aba lista sentença, acórdão, decisão monocrática e interlocutória. Despacho de expediente não é recorrível e por isso fica de fora."
				/>
			)}

			<ol>
				{items.map((item) => (
					<AppealCard key={item.decision.id} item={item} cnjNumber={cnjNumber} />
				))}
			</ol>
		</section>
	);
}
