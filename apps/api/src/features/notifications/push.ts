import webpush from "web-push";
import { vapid } from "../../env.ts";

export interface PushPayload {
	title: string;
	body: string;
	url: string;
	tag: string;
}

export interface PushTarget {
	endpoint: string;
	p256dh: string;
	auth: string;
	expirationTime: number | null;
}

export type PushDelivery = "entregue" | "expirada" | "falhou";

if (vapid) {
	webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
}

function statusCode(error: unknown) {
	if (typeof error !== "object" || error === null || !("statusCode" in error)) {
		return null;
	}

	return typeof error.statusCode === "number" ? error.statusCode : null;
}

// A Apple e a Google respondem 404 ou 410 quando o navegador já descartou a assinatura: aquele
// endpoint nunca mais entrega e a linha tem de sair do banco, senão todo ciclo tenta de novo.
export async function deliverPush(target: PushTarget, payload: PushPayload): Promise<PushDelivery> {
	if (!vapid) {
		return "falhou";
	}

	try {
		await webpush.sendNotification(
			{
				endpoint: target.endpoint,
				...(target.expirationTime === null ? {} : { expirationTime: target.expirationTime }),
				keys: { p256dh: target.p256dh, auth: target.auth },
			},
			JSON.stringify(payload),
		);

		return "entregue";
	} catch (error) {
		const status = statusCode(error);

		if (status === 404 || status === 410) {
			return "expirada";
		}

		return "falhou";
	}
}
