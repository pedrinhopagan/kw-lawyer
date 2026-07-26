import {
	ArchiveIcon,
	CalendarClockIcon,
	GavelIcon,
	PauseIcon,
	SendIcon,
	ShuffleIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { actDate } from "@/lib/deadline-meta";
import type { CaseDetail } from "./queries";

type CaseSignals = CaseDetail["signals"];

type SignalKind = CaseSignals["signals"][number]["kind"];

const STATE_COPY: Record<CaseSignals["state"], { label: string; hint: string }> = {
	conclusao: {
		label: "Concluso",
		hint: "Está na mesa do juiz. Nada volta para você até sair a decisão.",
	},
	suspenso: {
		label: "Suspenso",
		hint: "Confirme se os seus prazos deste processo também estão suspensos.",
	},
	baixado: {
		label: "Baixado",
		hint: "O processo foi baixado definitivamente nesta instância.",
	},
	remetido: {
		label: "Remetido",
		hint: "Subiu de instância. O andamento passa a sair no tribunal de destino.",
	},
	redistribuido: {
		label: "Redistribuído",
		hint: "Mudou de vara ou de relator. Confira se a intimação virá no mesmo nome.",
	},
	tramitando: {
		label: "Em tramitação",
		hint: "Nenhum movimento de conclusão, remessa, suspensão ou baixa até agora.",
	},
};

const SIGNAL_META: Record<SignalKind, { label: string; icon: LucideIcon }> = {
	conclusao: { label: "Concluso ao juiz", icon: GavelIcon },
	suspenso: { label: "Suspensão", icon: PauseIcon },
	baixado: { label: "Baixa definitiva", icon: ArchiveIcon },
	remetido: { label: "Remessa", icon: SendIcon },
	redistribuido: { label: "Redistribuição", icon: ShuffleIcon },
};

const HEARING_LABELS = {
	designada: "Audiência designada",
	redesignada: "Audiência redesignada",
	cancelada: "Audiência cancelada",
	realizada: "Audiência realizada",
	indefinida: "Audiência registrada",
} as const;

function stateTone(state: CaseSignals["state"]) {
	if (state === "conclusao") {
		return "border-primary/40 bg-primary/8 text-foreground";
	}

	if (state === "suspenso") {
		return "border-primary/40 bg-primary/8 text-foreground";
	}

	if (state === "baixado") {
		return "border-border bg-muted/60 text-muted-foreground";
	}

	return "border-border bg-card text-foreground";
}

function HearingLine({ hearing }: { hearing: NonNullable<CaseSignals["hearing"]> }) {
	const pending = hearing.situation === "designada" || hearing.situation === "redesignada";

	return (
		<div className="flex items-start gap-2 border-t border-border px-3 py-2.5">
			<CalendarClockIcon
				className={cn(
					"mt-0.5 size-3.5 shrink-0",
					pending ? "text-primary" : "text-muted-foreground",
				)}
			/>

			<div className="min-w-0">
				<p className="text-xs font-medium">
					{HEARING_LABELS[hearing.situation]}
					{!!hearing.type && (
						<span className="font-normal text-muted-foreground"> de {hearing.type}</span>
					)}
					<span className="font-normal text-muted-foreground">
						{", registrada em "}
						{actDate(hearing.registeredAt)}
					</span>
				</p>

				{pending && (
					<p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
						O DataJud registra que a audiência existe, mas não publica o dia e a hora dela. A data
						vem na intimação: procure na publicação deste processo antes de reservar a agenda.
					</p>
				)}
			</div>
		</div>
	);
}

export function CaseSignalsBand({ signals }: { signals: CaseSignals }) {
	const state = STATE_COPY[signals.state];
	const others = signals.signals.filter((signal) => signal.kind !== signals.state);

	return (
		<div className={cn("mt-3 rounded-[3px] border", stateTone(signals.state))}>
			<div className="px-3 py-2.5">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<span className="text-[0.8125rem] font-semibold">{state.label}</span>

					{!!signals.stateSince && (
						<span className="font-mono text-2xs text-muted-foreground tabular-nums">
							desde {actDate(signals.stateSince)}
						</span>
					)}
				</div>

				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{state.hint}</p>
			</div>

			{others.length > 0 && (
				<ul className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5">
					{others.map((signal) => {
						const meta = SIGNAL_META[signal.kind];

						return (
							<li key={signal.kind} className="flex items-baseline gap-2 text-xs">
								<meta.icon className="size-3 shrink-0 translate-y-0.5 text-muted-foreground" />
								<span className="shrink-0 text-muted-foreground">{meta.label}</span>
								<span className="font-mono text-2xs text-muted-foreground tabular-nums">
									{actDate(signal.occurredAt)}
								</span>
							</li>
						);
					})}
				</ul>
			)}

			{!!signals.hearing && <HearingLine hearing={signals.hearing} />}
		</div>
	);
}
