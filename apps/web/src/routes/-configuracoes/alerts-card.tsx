import { useQuery } from "@tanstack/react-query";
import {
	BellIcon,
	BellOffIcon,
	BellRingIcon,
	Loader2Icon,
	SendIcon,
	ShareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
import {
	deviceEndpointQueryOptions,
	needsInstallFirst,
	supportsPush,
	usePushActions,
} from "./push";

export function AlertsCard() {
	const status = useQuery(orpc.notifications.status.queryOptions());
	const device = useQuery(deviceEndpointQueryOptions);
	const { subscribe, unsubscribe, test } = usePushActions();

	if (status.isPending || device.isPending) {
		return <Skeleton className="h-32 w-full" />;
	}

	const vapidPublicKey = status.data?.vapidPublicKey;
	const active = !!device.data;
	const pending = subscribe.isPending || unsubscribe.isPending;
	const install = supportsPush() && needsInstallFirst();

	return (
		<div className="rounded-md border border-border bg-card">
			<div className="flex items-start gap-3 px-4 py-4">
				{active && <BellRingIcon className="mt-0.5 size-4 shrink-0 text-primary" />}
				{!active && <BellIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}

				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-semibold">Alertas neste celular</h3>

					<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
						{active &&
							"Este aparelho recebe publicação nova, prazo chegando e falha na coleta, mesmo com o app fechado."}
						{!active &&
							"Receba publicação nova e prazo chegando às 7h, mesmo sem abrir o app. O aviso não mostra número de processo nem nome de parte na tela bloqueada."}
					</p>

					{!!status.data && !status.data.available && (
						<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
							Este ambiente ainda não tem as chaves de notificação configuradas. Defina
							<span className="font-mono"> VAPID_PUBLIC_KEY</span> e
							<span className="font-mono"> VAPID_PRIVATE_KEY</span> na API para liberar o botão.
						</p>
					)}

					{!supportsPush() && (
						<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
							Este navegador não entrega notificações. Abra o painel pelo Chrome no Android ou pelo
							Safari no iPhone.
						</p>
					)}

					{install && (
						<div className="mt-3 flex items-start gap-2 rounded-md border border-primary/40 bg-primary/8 px-3 py-2.5">
							<ShareIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
							<p className="text-xs leading-relaxed">
								No iPhone o alerta só funciona com o app instalado. Toque em Compartilhar na barra
								do Safari, escolha{" "}
								<strong className="font-semibold">Adicionar à Tela de Início</strong> e abra o
								painel por aquele ícone. Depois volte aqui e ative.
							</p>
						</div>
					)}

					{active && (status.data?.devices ?? 0) > 1 && (
						<p className="mt-2 text-2xs text-muted-foreground">
							{status.data?.devices} aparelhos ativos nesta OAB.
						</p>
					)}
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
				{!active && (
					<Button
						type="button"
						size="sm"
						disabled={pending || !vapidPublicKey || !supportsPush() || install}
						onClick={() => vapidPublicKey && subscribe.mutate(vapidPublicKey)}
					>
						{subscribe.isPending && <Loader2Icon className="size-3.5 animate-spin" />}
						{!subscribe.isPending && <BellRingIcon className="size-3.5" />}
						Ativar alertas
					</Button>
				)}

				{active && (
					<>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={test.isPending}
							onClick={() => test.mutate({})}
						>
							{test.isPending && <Loader2Icon className="size-3.5 animate-spin" />}
							{!test.isPending && <SendIcon className="size-3.5" />}
							Enviar teste
						</Button>

						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={pending}
							className="text-muted-foreground"
							onClick={() => unsubscribe.mutate()}
						>
							{unsubscribe.isPending && <Loader2Icon className="size-3.5 animate-spin" />}
							{!unsubscribe.isPending && <BellOffIcon className="size-3.5" />}
							Desativar
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
