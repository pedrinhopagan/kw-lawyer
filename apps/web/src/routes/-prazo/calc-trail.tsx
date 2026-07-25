import { cn } from "@/lib/cn";
import { fullDate, shortDate, UNIT_LABELS } from "@/lib/deadline-meta";
import type { HubCalculation } from "./queries";

function Stage({ label, date, note }: { label: string; date: string; note: string }) {
	return (
		<li className="relative pl-5">
			<span
				aria-hidden
				className="absolute top-1.5 left-0 size-1.5 rounded-full bg-primary/70 ring-4 ring-background"
			/>
			<p className="text-xs font-medium text-foreground">
				{label}
				<time dateTime={date} className="ml-2 font-mono text-2xs font-normal text-muted-foreground">
					{shortDate(date)}
				</time>
			</p>
			<p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">{note}</p>
		</li>
	);
}

export function CalcTrail({ calculation }: { calculation: HubCalculation }) {
	const counted = calculation.steps.filter((step) => step.counted);
	const skipped = calculation.steps.filter((step) => !step.counted);

	return (
		<section className="flex flex-col gap-5">
			<ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[0.1875rem] before:w-px before:bg-border">
				<Stage
					label="Disponibilização no diário"
					date={calculation.availableAt}
					note="Dia em que a comunicação entrou no DJEN. Não conta no prazo."
				/>
				<Stage
					label="Publicação"
					date={calculation.publishedAt}
					note="Primeiro dia útil seguinte à disponibilização (Lei 11.419/2006, art. 4º). É o dia do começo, excluído da contagem."
				/>
				<Stage
					label="Início da contagem"
					date={calculation.startsAt}
					note="Primeiro dia útil seguinte à publicação. Aqui começa o dia 1."
				/>
				<Stage
					label="Vencimento"
					date={calculation.dueAt}
					note={`Dia ${calculation.days} de ${calculation.days} contados em ${UNIT_LABELS[calculation.unit]}. ${fullDate(calculation.dueAt)}.`}
				/>
			</ol>

			<div className="flex flex-col gap-2">
				<p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
					Dias contados
				</p>

				<ol className="flex flex-wrap gap-1">
					{counted.map((step) => (
						<li
							key={step.date}
							className={cn(
								"flex min-w-[3.25rem] flex-col items-center rounded-sm border border-border px-1.5 py-1",
								step.position === calculation.days && "border-primary/60 bg-primary/8",
							)}
						>
							<span className="font-mono text-2xs text-muted-foreground tabular-nums">
								{step.position}
							</span>
							<time dateTime={step.date} className="font-mono text-2xs tabular-nums">
								{step.date.slice(8)}/{step.date.slice(5, 7)}
							</time>
						</li>
					))}
				</ol>
			</div>

			{skipped.length > 0 && (
				<div className="flex flex-col gap-2">
					<p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
						Dias pulados
					</p>

					<ul className="flex flex-col gap-1">
						{skipped.map((step) => (
							<li key={step.date} className="flex items-baseline gap-2 text-2xs">
								<time
									dateTime={step.date}
									className="w-20 shrink-0 font-mono text-muted-foreground tabular-nums"
								>
									{shortDate(step.date)}
								</time>
								<span className="text-muted-foreground">{step.reason}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
