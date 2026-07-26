import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc, orpcClient } from "@/lib/orpc";

const DEVICE_ENDPOINT_KEY = ["push", "device-endpoint"] as const;

const APPLE_UA_PATTERN = /iphone|ipad|ipod/iu;

function standaloneDisplay() {
	return window.matchMedia("(display-mode: standalone)").matches;
}

export function supportsPush() {
	if (!("Notification" in window) || !("serviceWorker" in navigator)) {
		return false;
	}

	return "PushManager" in window;
}

// O Safari entrega Web Push só para PWA adicionado à Tela de Início, iOS 16.4 ou superior. Sem
// reconhecer esse caso, a advogada toca em ativar, nada acontece e a feature morre no primeiro contato.
export function needsInstallFirst() {
	if (!APPLE_UA_PATTERN.test(navigator.userAgent)) {
		return false;
	}

	return !standaloneDisplay();
}

function applicationServerKey(value: string) {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");

	return Uint8Array.from(atob(base64), (character) => character.codePointAt(0) ?? 0);
}

export async function currentPushSubscription() {
	if (!supportsPush()) {
		return null;
	}

	// `serviceWorker.ready` nunca resolve quando nada foi registrado, e em desenvolvimento nada é.
	// Checar o registro antes evita a query pendurada para sempre.
	const registered = await navigator.serviceWorker.getRegistration();

	if (!registered) {
		return null;
	}

	const registration = await navigator.serviceWorker.ready;

	return await registration.pushManager.getSubscription();
}

export const deviceEndpointQueryOptions = queryOptions({
	queryKey: DEVICE_ENDPOINT_KEY,
	queryFn: async () => {
		const subscription = await currentPushSubscription();

		if (!subscription) {
			return null;
		}

		return subscription.endpoint;
	},
	staleTime: Number.POSITIVE_INFINITY,
	retry: false,
});

export function usePushActions() {
	const queryClient = useQueryClient();

	const refresh = async () => {
		await queryClient.invalidateQueries({ queryKey: DEVICE_ENDPOINT_KEY });
		await queryClient.invalidateQueries({ queryKey: orpc.notifications.key() });
	};

	const subscribe = useMutation({
		mutationFn: async (vapidPublicKey: string) => {
			const permission = await Notification.requestPermission();

			if (permission !== "granted") {
				throw new Error("Permita as notificações nas configurações do navegador.");
			}

			const registration = await navigator.serviceWorker.ready;
			const subscription =
				(await registration.pushManager.getSubscription()) ??
				(await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: applicationServerKey(vapidPublicKey),
				}));

			const json = subscription.toJSON();

			if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
				throw new Error("O navegador devolveu uma assinatura incompleta.");
			}

			await orpcClient.notifications.subscribe({
				endpoint: json.endpoint,
				expirationTime: json.expirationTime,
				keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
				userAgent: navigator.userAgent.slice(0, 200),
			});
		},
		onSuccess: async () => {
			await refresh();
			toast.success("Alertas ativados neste celular.");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Não foi possível ativar os alertas agora.",
			);
		},
	});

	const unsubscribe = useMutation({
		mutationFn: async () => {
			const subscription = await currentPushSubscription();

			if (!subscription) {
				return;
			}

			const { endpointInUse } = await orpcClient.notifications.unsubscribe({
				endpoint: subscription.endpoint,
			});

			// Cancelar a inscrição é um ato do navegador inteiro. Enquanto outro advogado conectado
			// aqui ainda espera alerta, desligar os meus apagaria os prazos dele junto.
			if (!endpointInUse) {
				await subscription.unsubscribe();
			}
		},
		onSuccess: async () => {
			await refresh();
			toast.success("Alertas desativados neste celular.");
		},
		onError: () => {
			toast.error("Não foi possível desativar os alertas agora.");
		},
	});

	const test = useMutation(
		orpc.notifications.test.mutationOptions({
			onSuccess: ({ delivered }) => {
				if (delivered > 0) {
					toast.success("Notificação de teste enviada.");

					return;
				}

				toast.error("Nenhum dispositivo aceitou a notificação de teste.");
			},
			onError: () => {
				toast.error("Não foi possível enviar a notificação de teste.");
			},
		}),
	);

	return { subscribe, unsubscribe, test };
}
