import { and, count, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { deadlines } from "../../db/schema/deadlines.ts";
import { lawyers } from "../../db/schema/lawyers.ts";
import { type NotificationTrigger, notificationSends } from "../../db/schema/notification_sends.ts";
import { publicationLinks } from "../../db/schema/publication_links.ts";
import { pushSubscriptions } from "../../db/schema/push_subscriptions.ts";
import { syncRuns } from "../../db/schema/sync_runs.ts";
import { vapid } from "../../env.ts";
import { addDays } from "../deadlines/calendar.ts";
import { OPEN_STATUSES, THIRD_PARTY_AUDIENCE } from "../deadlines/filters.ts";
import { deliverPush, type PushPayload } from "./push.ts";
import { collectionFailureAlert, deadlinesAlert, publicationsAlert } from "./triggers.ts";

export interface PushSubscriptionInput {
	endpoint: string;
	expirationTime?: number | null;
	keys: { p256dh: string; auth: string };
	userAgent?: string;
}

const FAILED_CYCLES_TO_ALERT = 2;

export class NotificationsManager {
	constructor(private readonly db: Db | Tx) {}

	async status(lawyerId: string) {
		if (!vapid) {
			return { available: false, vapidPublicKey: null, devices: 0 };
		}

		const [devices] = await this.db
			.select({ total: count() })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.lawyerId, lawyerId));

		return {
			available: true,
			vapidPublicKey: vapid.publicKey,
			devices: devices ? devices.total : 0,
		};
	}

	async subscribe(lawyerId: string, input: PushSubscriptionInput) {
		// O endpoint é o aparelho, e o aparelho atende mais de um advogado. A assinatura é gravada por
		// par: assinar como o segundo advogado não tira o primeiro, que continua avisando os prazos
		// dele neste mesmo celular.
		await this.db
			.insert(pushSubscriptions)
			.values({
				lawyerId,
				endpoint: input.endpoint,
				p256dh: input.keys.p256dh,
				auth: input.keys.auth,
				expirationTime: input.expirationTime,
				userAgent: input.userAgent,
			})
			.onConflictDoUpdate({
				target: [pushSubscriptions.lawyerId, pushSubscriptions.endpoint],
				set: {
					p256dh: input.keys.p256dh,
					auth: input.keys.auth,
					expirationTime: input.expirationTime,
					userAgent: input.userAgent,
				},
			});

		return { subscribed: true };
	}

	// `endpointInUse` diz à tela se ainda existe outro advogado esperando alerta neste aparelho.
	// Cancelar a inscrição no navegador é um ato do navegador inteiro: fazer isso enquanto o sócio
	// ainda depende dela apagaria os prazos dele sem que ninguém pedisse.
	async unsubscribe(input: { lawyerId: string; endpoint: string }) {
		await this.db
			.delete(pushSubscriptions)
			.where(
				and(
					eq(pushSubscriptions.lawyerId, input.lawyerId),
					eq(pushSubscriptions.endpoint, input.endpoint),
				),
			);

		const [remaining] = await this.db
			.select({ total: count() })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, input.endpoint));

		return { subscribed: false, endpointInUse: !!remaining?.total };
	}

	async test(lawyerId: string) {
		return {
			delivered: await this.send(lawyerId, {
				title: "Alertas ativados",
				body: "Este celular vai avisar quando entrar publicação nova ou um prazo chegar.",
				url: "/configuracoes",
				tag: "kw-lawyer-teste",
			}),
		};
	}

	async send(lawyerId: string, payload: PushPayload) {
		const targets = await this.db
			.select({
				endpoint: pushSubscriptions.endpoint,
				p256dh: pushSubscriptions.p256dh,
				auth: pushSubscriptions.auth,
				expirationTime: pushSubscriptions.expirationTime,
			})
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.lawyerId, lawyerId));

		const results = await Promise.all(
			targets.map(async (target) => ({
				endpoint: target.endpoint,
				delivery: await deliverPush(target, payload),
			})),
		);

		const expired = results
			.filter((result) => result.delivery === "expirada")
			.map((result) => result.endpoint);

		// Aqui o endpoint some para todos os advogados de propósito, e não só para este: 404 ou 410 do
		// serviço de push significa que a inscrição morreu no navegador, então a linha do sócio também
		// já não entrega nada.
		if (expired.length) {
			await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, expired));
		}

		return results.filter((result) => result.delivery === "entregue").length;
	}

	async alert(input: { lawyerId: string; day: string }) {
		const failure = await this.fire({
			...input,
			trigger: "coleta_falhou",
			payload: await this.collectionFailure(input.lawyerId),
		});
		const inbox = await this.fire({
			...input,
			trigger: "publicacoes",
			payload: await this.newPublications(input),
		});
		const due = await this.fire({
			...input,
			trigger: "prazos",
			payload: await this.dueDeadlines(input),
		});

		return failure + inbox + due;
	}

	// Advogado sem nenhum dispositivo ativo não entra no ciclo de alerta: gravaria linha em
	// notification_sends e queimaria o disparo do dia sem entregar nada.
	async subscribedLawyers() {
		return await this.db
			.select({ id: lawyers.id })
			.from(lawyers)
			.innerJoin(pushSubscriptions, eq(pushSubscriptions.lawyerId, lawyers.id))
			.groupBy(lawyers.id);
	}

	private async fire(input: {
		lawyerId: string;
		day: string;
		trigger: NotificationTrigger;
		payload: PushPayload | null;
	}) {
		if (!input.payload) {
			return 0;
		}

		const [claimed] = await this.db
			.insert(notificationSends)
			.values({
				lawyerId: input.lawyerId,
				trigger: input.trigger,
				day: input.day,
				title: input.payload.title,
				body: input.payload.body,
				url: input.payload.url,
			})
			.onConflictDoNothing()
			.returning({ id: notificationSends.id });

		if (!claimed) {
			return 0;
		}

		const delivered = await this.send(input.lawyerId, input.payload);

		await this.db
			.update(notificationSends)
			.set({ delivered })
			.where(eq(notificationSends.id, claimed.id));

		return delivered;
	}

	private async newPublications(input: { lawyerId: string; day: string }) {
		// Só o que entrou na inbox depois do último aviso e continua sem leitura: o caderno de ontem
		// não vira alerta de hoje, e o que ela já abriu não vira alerta nenhum.
		const [previous] = await this.db
			.select({ createdAt: notificationSends.createdAt })
			.from(notificationSends)
			.where(
				and(
					eq(notificationSends.lawyerId, input.lawyerId),
					eq(notificationSends.trigger, "publicacoes"),
				),
			)
			.orderBy(desc(notificationSends.createdAt))
			.limit(1);

		const [fresh] = await this.db
			.select({ total: count() })
			.from(publicationLinks)
			.where(
				and(
					eq(publicationLinks.lawyerId, input.lawyerId),
					isNull(publicationLinks.readAt),
					previous ? gte(publicationLinks.createdAt, previous.createdAt) : undefined,
				),
			);

		return publicationsAlert(fresh ? fresh.total : 0);
	}

	private async dueDeadlines(input: { lawyerId: string; day: string }) {
		const tomorrow = addDays(input.day, 1);
		const inThreeDays = addDays(input.day, 3);

		const rows = await this.db
			.select({ id: deadlines.id, dueAt: deadlines.dueAt })
			.from(deadlines)
			.where(
				and(
					eq(deadlines.lawyerId, input.lawyerId),
					inArray(deadlines.status, OPEN_STATUSES),
					ne(deadlines.audience, THIRD_PARTY_AUDIENCE),
					lte(deadlines.dueAt, inThreeDays),
				),
			);

		// D-3, D-1, D0 e vencido não cumprido. D-2 fica fora de propósito: avisar todo dia da mesma
		// semana transforma o alerta em ruído e a advogada desliga.
		const alerted = rows.filter(
			(row) => row.dueAt <= input.day || row.dueAt === tomorrow || row.dueAt === inThreeDays,
		);

		const counts = {
			overdue: alerted.filter((row) => row.dueAt < input.day).length,
			today: alerted.filter((row) => row.dueAt === input.day).length,
			tomorrow: alerted.filter((row) => row.dueAt === tomorrow).length,
			inThreeDays: alerted.filter((row) => row.dueAt === inThreeDays).length,
		};

		const single = alerted.length === 1 ? alerted[0] : undefined;

		return deadlinesAlert(counts, single ? single.id : null);
	}

	private async collectionFailure(lawyerId: string) {
		const recent = await this.db
			.select({ status: syncRuns.status })
			.from(syncRuns)
			.where(and(eq(syncRuns.lawyerId, lawyerId), ne(syncRuns.status, "em_execucao")))
			.orderBy(desc(syncRuns.startedAt))
			.limit(FAILED_CYCLES_TO_ALERT);

		if (recent.length < FAILED_CYCLES_TO_ALERT) {
			return null;
		}

		if (recent.some((run) => run.status !== "falhou")) {
			return null;
		}

		return collectionFailureAlert();
	}
}
