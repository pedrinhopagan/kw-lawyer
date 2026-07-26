import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, PlugZapIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
	reconnectSyncProgress,
	type SyncEvent,
	syncProgressQueryOptions,
	syncStatusQueryOptions,
} from "../-shell/sync";
import {
	latestSyncSnapshot,
	SYNC_PHASE_COUNT,
	SYNC_PHASE_LABELS,
	syncRunningView,
} from "../-shell/sync-view";

type Counters = Pick<SyncEvent, "fetched" | "casesCreated" | "movementsCreated">;

const EMPTY_COUNTERS: Counters = { fetched: 0, casesCreated: 0, movementsCreated: 0 };

export function ComecarProgresso() {
	const queryClient = useQueryClient();
	const progress = useQuery(syncProgressQueryOptions(queryClient));
	const status = useQuery(syncStatusQueryOptions);

	const snapshot = latestSyncSnapshot(progress.data, status.data?.run);
	const running = syncRunningView(snapshot);
	const counters: Counters = snapshot ?? EMPTY_COUNTERS;

	const stats = [
		{ label: "publicações", value: counters.fetched },
		{ label: "processos", value: counters.casesCreated },
		{ label: "andamentos", value: counters.movementsCreated },
	];

	return (
		<div className="rounded-lg border border-border bg-card p-6">
			<div className="flex items-center gap-2">
				<RefreshCwIcon
					className={cn("size-3.5 shrink-0 text-primary", !progress.isError && "animate-spin")}
				/>
				<span
					role="status"
					className="min-w-0 flex-1 truncate text-2xs uppercase tracking-[0.16em] text-muted-foreground"
				>
					{running?.label ?? "Preparando a carga"}
				</span>
				{!!running && (
					<span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
						etapa {running.step} de {SYNC_PHASE_COUNT}
					</span>
				)}
			</div>

			<h1 className="mt-3 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em]">
				Baixando o seu histórico
			</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
				{running?.ratio === null &&
					"O tribunal responde por janelas de data e só diz o tamanho de cada uma ao abri-la: enquanto esta etapa corre, o total ainda está crescendo, e por isso ela mostra contagem em vez de fração."}
				{typeof running?.ratio === "number" &&
					"Esta etapa tem tamanho conhecido: a barra abaixo é a fração dela que já foi processada."}
				{!running && "Assim que a primeira etapa abrir, o andamento dela aparece aqui."}
			</p>

			<div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-border">
				{running?.ratio == null && (
					<div className="h-full w-1/3 animate-sweep rounded-full bg-primary" />
				)}
				{typeof running?.ratio === "number" && (
					<div
						className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
						style={{ width: `${running.ratio * 100}%` }}
					/>
				)}
			</div>

			{!!running && (
				<p className="mt-2 font-mono text-2xs tabular-nums text-muted-foreground">
					{running.detail}
				</p>
			)}

			<ol className="mt-5 flex flex-col gap-1.5">
				{SYNC_PHASE_LABELS.map((label, index) => {
					const step = index + 1;
					const done = !!running && step < running.step;
					const current = running?.step === step;

					return (
						<li key={label} className="flex items-center gap-2.5 text-2xs">
							<span
								className={cn(
									"flex size-4 shrink-0 items-center justify-center rounded-full border font-mono text-[0.5625rem] tabular-nums",
									done && "border-primary bg-primary text-primary-foreground",
									current && "border-primary text-primary",
									!done && !current && "border-border text-muted-foreground",
								)}
							>
								{done && <CheckIcon className="size-2.5" />}
								{!done && step}
							</span>
							<span
								className={cn(
									current && "font-medium text-foreground",
									!current && "text-muted-foreground",
								)}
							>
								{label}
							</span>
						</li>
					);
				})}
			</ol>

			<dl className="mt-5 grid grid-cols-3 gap-3">
				{stats.map((stat) => (
					<div
						key={stat.label}
						className="rounded-md border border-border bg-background px-3 py-2.5"
					>
						<dd className="font-mono text-lg leading-none font-semibold tabular-nums">
							{stat.value.toLocaleString("pt-BR")}
						</dd>
						<dt className="mt-1.5 text-2xs uppercase tracking-[0.12em] text-muted-foreground">
							{stat.label}
						</dt>
					</div>
				))}
			</dl>

			{!progress.isError && (
				<p className="mt-5 text-2xs leading-relaxed text-muted-foreground">
					A carga roda no servidor. Pode fechar a aba: quando voltar, esta tela mostra onde ela
					parou, e o painel abre sozinho assim que terminar.
				</p>
			)}

			{progress.isError && (
				<div className="mt-5 flex items-start gap-2.5 rounded-md border border-border bg-background px-3 py-2.5">
					<PlugZapIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0">
						<p className="text-2xs leading-relaxed text-muted-foreground">
							Esta tela perdeu a conexão com o andamento da carga. Ela continua rodando no servidor:
							o que está acima é a última coisa que chegou.
						</p>
						<Button
							variant="ghost"
							size="xs"
							className="mt-1 -ml-2 h-6 text-2xs"
							onClick={() => reconnectSyncProgress(queryClient)}
						>
							<RefreshCwIcon />
							Recarregar o progresso
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
