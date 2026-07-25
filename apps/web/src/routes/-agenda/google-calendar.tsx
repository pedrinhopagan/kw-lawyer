import { useQuery } from "@tanstack/react-query";
import {
	CalendarSyncIcon,
	CheckCircle2Icon,
	InfoIcon,
	Loader2Icon,
	TriangleAlertIcon,
	UnplugIcon,
	UserRoundIcon,
	XIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatEventDate } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { pluralOf } from "./agenda-meta";
import { type CalendarStatus, useCalendarActions } from "./queries";
import type { DeadlineFilterInput, GoogleFeedback } from "./search";

const START_PATH = "/auth/google/start";

const FEEDBACK = {
	conectado: {
		icon: CheckCircle2Icon,
		text: "Google Agenda conectado. Agora dá para mandar o recorte da agenda para lá.",
		tone: "border-primary/40 bg-primary/8 text-foreground",
		iconTone: "text-primary",
	},
	erro: {
		icon: TriangleAlertIcon,
		text: "A conexão com o Google não foi concluída. Tente conectar de novo.",
		tone: "border-destructive/40 bg-destructive/8 text-foreground",
		iconTone: "text-destructive",
	},
	nao_configurado: {
		icon: InfoIcon,
		text: "Este ambiente ainda não tem a credencial do Google configurada, então o envio para o Google Agenda está desligado.",
		tone: "border-border bg-muted/50 text-foreground",
		iconTone: "text-muted-foreground",
	},
} as const;

export function GoogleFeedbackBanner({
	feedback,
	onDismiss,
}: {
	feedback: GoogleFeedback;
	onDismiss: () => void;
}) {
	const { icon: Icon, text, tone, iconTone } = FEEDBACK[feedback];

	return (
		<div
			className={cn("flex items-start gap-2 border-b px-4 py-2.5", tone)}
			role={feedback === "erro" ? "alert" : "status"}
		>
			<Icon className={cn("mt-0.5 size-4 shrink-0", iconTone)} />

			<p className="text-xs leading-relaxed">{text}</p>

			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Fechar aviso"
				className="ml-auto shrink-0 text-muted-foreground"
				onClick={onDismiss}
			>
				<XIcon />
			</Button>
		</div>
	);
}

export function GoogleCalendarBlock({
	syncInput,
	total,
}: {
	syncInput: DeadlineFilterInput;
	total: number;
}) {
	const { data, isPending } = useQuery(orpc.calendar.status.queryOptions());

	if (isPending) {
		return <Skeleton className="h-8 w-40" />;
	}

	if (!data) {
		return null;
	}

	if (!data.configured) {
		return <NotConfigured />;
	}

	if (!data.connected) {
		return (
			<a href={START_PATH} className={buttonVariants({ variant: "outline", size: "sm" })}>
				<CalendarSyncIcon className="size-3.5" />
				<span className="hidden sm:inline">Conectar Google Agenda</span>
				<span className="sm:hidden">Conectar Google</span>
			</a>
		);
	}

	return <Connected status={data} syncInput={syncInput} total={total} />;
}

function NotConfigured() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					aria-label="Google Agenda"
					className="gap-1.5 text-muted-foreground"
				>
					<CalendarSyncIcon className="size-3.5" />
					<span className="hidden sm:inline">Google Agenda</span>
				</Button>
			</PopoverTrigger>

			<PopoverContent align="end" className="w-72">
				<p className="text-xs leading-relaxed text-muted-foreground">
					{FEEDBACK.nao_configurado.text} Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e
					TOKEN_ENCRYPTION_KEY na API para liberar o botão de sincronizar.
				</p>
			</PopoverContent>
		</Popover>
	);
}

function Connected({
	status,
	syncInput,
	total,
}: {
	status: CalendarStatus;
	syncInput: DeadlineFilterInput;
	total: number;
}) {
	const { sync, disconnect } = useCalendarActions();

	return (
		<div className="flex items-center gap-1.5">
			<Button
				size="sm"
				disabled={sync.isPending || total === 0}
				className="gap-1.5"
				onClick={() => sync.mutate(syncInput)}
			>
				{sync.isPending && <Loader2Icon className="size-3.5 animate-spin" />}
				{!sync.isPending && <CalendarSyncIcon className="size-3.5" />}
				{sync.isPending && "Sincronizando"}
				{!sync.isPending && "Sincronizar"}
				<span className="font-mono tabular-nums">{total}</span>
				<span className="hidden sm:inline">prazo{pluralOf(total)}</span>
			</Button>

			<Popover>
				<PopoverTrigger asChild>
					<Button variant="outline" size="icon-sm" aria-label="Conta do Google Agenda">
						<UserRoundIcon />
					</Button>
				</PopoverTrigger>

				<PopoverContent align="end" className="w-72">
					<div className="flex flex-col gap-1">
						<p className="text-2xs tracking-[0.12em] text-muted-foreground uppercase">
							Google Agenda
						</p>

						<p className="truncate text-xs font-medium">
							{status.accountEmail ?? "conta conectada"}
						</p>

						<p className="text-2xs text-muted-foreground">
							Agenda {status.calendarId ?? "primary"} · {status.syncedCount} prazo
							{pluralOf(status.syncedCount)} enviado{pluralOf(status.syncedCount)}
						</p>

						<p className="text-2xs text-muted-foreground">
							{!!status.lastSyncedAt && `Último envio ${formatEventDate(status.lastSyncedAt)}`}
							{!status.lastSyncedAt && "Nenhum envio ainda"}
						</p>
					</div>

					<Separator className="my-3" />

					<p className="text-2xs leading-relaxed text-muted-foreground">
						Desconectar apaga o vínculo aqui. Os eventos já criados continuam no seu Google Agenda.
					</p>

					<Button
						variant="ghost"
						size="sm"
						disabled={disconnect.isPending}
						className="mt-2 w-full gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
						onClick={() => disconnect.mutate({})}
					>
						<UnplugIcon className="size-3.5" />
						Desconectar
					</Button>
				</PopoverContent>
			</Popover>
		</div>
	);
}
