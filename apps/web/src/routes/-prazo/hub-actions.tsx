import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ScaleIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Chip, SectionRule } from "@/components/dossier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UNIT_LABELS } from "@/lib/deadline-meta";
import { APPEAL_CHOICE_LABELS } from "@/lib/legal-labels";
import { orpc } from "@/lib/orpc";
import { useDeadlineActions } from "./deadline-actions";
import type { HubData } from "./queries";

function AppealBlock({ appeal }: { appeal: NonNullable<HubData["appeal"]> }) {
	const queryClient = useQueryClient();
	const [selected, setSelected] = useState<string | null>(appeal.choiceActKey);

	const choose = useMutation(
		orpc.appeals.choose.mutationOptions({
			onSuccess: async () => {
				toast.success("Recurso escolhido. O prazo entrou na agenda com a memória de cálculo.");

				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.hub.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.appeals.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.deadlines.key() }),
				]);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (appeal.advice.options.length === 0) {
		return null;
	}

	return (
		<section>
			<SectionRule title="Recorrer desta decisão">
				{!!appeal.choice && <Chip tone="accent">{APPEAL_CHOICE_LABELS[appeal.choice]}</Chip>}
			</SectionRule>

			<ul className="mt-3 flex flex-col gap-1.5">
				{appeal.advice.options.map((option) => (
					<li key={option.actKey}>
						<button
							type="button"
							aria-pressed={selected === option.actKey}
							onClick={() =>
								setSelected((current) => (current === option.actKey ? null : option.actKey))
							}
							className={
								selected === option.actKey
									? "w-full rounded-[3px] border border-primary/50 bg-primary/8 px-2.5 py-2 text-left"
									: "w-full rounded-[3px] border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-accent/40"
							}
						>
							<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
								<span className="text-[0.8125rem] font-medium">{option.label}</span>
								<span className="font-mono text-2xs tabular-nums">
									{option.days} {UNIT_LABELS[option.unit]}
								</span>
								<span className="font-mono text-2xs text-muted-foreground">
									{option.admissibilityBasis}
								</span>
								{option.needsPreparo && <Chip>exige preparo</Chip>}
							</div>
							{!!option.condition && (
								<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
									{option.condition}
								</p>
							)}
						</button>
					</li>
				))}
			</ul>

			<Button
				size="xs"
				className="mt-2.5"
				disabled={!selected || choose.isPending}
				onClick={() => {
					if (!selected) {
						return;
					}

					choose.mutate({
						decisionId: appeal.decisionId,
						choice: "recorrer",
						actKey: selected,
					});
				}}
			>
				<ScaleIcon />
				Abrir o prazo do recurso
			</Button>
		</section>
	);
}

export function HubActions({ data }: { data: HubData }) {
	const { confirm, complete, dismiss, reschedule } = useDeadlineActions();
	const [newDueAt, setNewDueAt] = useState(data.deadline.dueAt);

	return (
		<div className="flex flex-col gap-8">
			{!!data.appeal && <AppealBlock appeal={data.appeal} />}

			<section>
				<SectionRule title="Dar baixa neste prazo" />

				<div className="mt-3 flex flex-wrap gap-2">
					{data.deadline.status === "a_confirmar" && (
						<Button
							size="sm"
							disabled={confirm.isPending}
							onClick={() => confirm.mutate({ id: data.deadline.id })}
						>
							<CheckIcon />
							Confirmar prazo
						</Button>
					)}

					{data.deadline.status !== "cumprido" && (
						<Button
							variant="outline"
							size="sm"
							disabled={complete.isPending}
							onClick={() => complete.mutate({ id: data.deadline.id })}
						>
							Marcar cumprido
						</Button>
					)}

					{data.deadline.status !== "descartado" && (
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground"
							disabled={dismiss.isPending}
							onClick={() => dismiss.mutate({ id: data.deadline.id })}
						>
							<XIcon />
							Não é meu prazo
						</Button>
					)}
				</div>

				<div className="mt-4 flex items-end gap-2">
					<label className="flex max-w-56 flex-1 flex-col gap-1 text-2xs text-muted-foreground">
						Corrigir a data à mão
						<Input
							type="date"
							value={newDueAt}
							onChange={(event) => setNewDueAt(event.target.value)}
							className="h-8"
						/>
					</label>

					<Button
						variant="outline"
						size="sm"
						disabled={reschedule.isPending || newDueAt === data.deadline.dueAt}
						onClick={() => reschedule.mutate({ id: data.deadline.id, dueAt: newDueAt })}
					>
						Salvar data
					</Button>
				</div>

				{!!data.deadline.note && (
					<p className="mt-3 text-xs text-muted-foreground">Anotação: {data.deadline.note}</p>
				)}
			</section>
		</div>
	);
}
