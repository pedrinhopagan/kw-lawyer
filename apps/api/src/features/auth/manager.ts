import { ORPCError } from "@orpc/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { lawyers } from "../../db/schema/lawyers.ts";
import { env } from "../../env.ts";
import { sessions } from "../../db/schema/sessions.ts";
import { DjenClient } from "../djen/client.ts";
import { NotificationsManager } from "../notifications/manager.ts";
import { registerAttempt } from "./attempts.ts";
import {
	createSessionToken,
	SESSION_ROW_REFRESH_AFTER_MS,
	SESSION_TTL_MS,
	type SessionContext,
	type SessionLawyer,
	type SessionProfile,
} from "./session.ts";

const LOGIN_ATTEMPT_WINDOW_MS = 60_000;
const OAB_UF_PATTERN = /^[A-Z]{2}$/u;

// A tela de entrada não espera o DJEN: uma tentativa curta basta para descobrir o nome de quem chega
// pela primeira vez, e o que não voltar a tempo vira o formulário que pede o nome declarado.
const LOGIN_DJEN_MAX_ATTEMPTS = 1;
const LOGIN_DJEN_TIMEOUT_MS = 4_000;

type DjenLawyerLookup = Pick<DjenClient, "findLawyer">;

const sessionLawyerColumns = {
	id: lawyers.id,
	name: lawyers.name,
	oabNumber: lawyers.oabNumber,
	oabUf: lawyers.oabUf,
	historyCutoffAt: lawyers.historyCutoffAt,
	onboardingState: lawyers.onboardingState,
};

export class AuthManager {
	constructor(
		private readonly db: Db | Tx,
		private readonly djen: DjenLawyerLookup = new DjenClient({
			maxAttempts: LOGIN_DJEN_MAX_ATTEMPTS,
			timeoutMs: LOGIN_DJEN_TIMEOUT_MS,
		}),
	) {}

	// `deviceId` chega da sessão que já estava aberta nesta aba: entrar com a segunda OAB junta o novo
	// advogado ao mesmo aparelho em vez de derrubar o primeiro.
	async loginWithOab(input: {
		oabNumber: string;
		oabUf: string;
		name?: string;
		deviceId: string | null;
	}) {
		const oabNumber = input.oabNumber.replaceAll(/\D/gu, "");
		const oabUf = input.oabUf.trim().toUpperCase();

		if (!oabNumber) {
			throw new ORPCError("BAD_REQUEST", { message: "Informe o número da OAB." });
		}

		if (!OAB_UF_PATTERN.test(oabUf)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Informe a UF da OAB com duas letras, por exemplo SP.",
			});
		}

		const attempts = registerAttempt(`oab:${oabUf}:${oabNumber}`, {
			windowMs: LOGIN_ATTEMPT_WINDOW_MS,
		});

		if (attempts > env.LOGIN_ATTEMPT_LIMIT) {
			throw new ORPCError("RATE_LIMITED", {
				message: "Muitas tentativas de entrada para esta OAB. Espere um minuto e tente de novo.",
			});
		}

		const [known] = await this.db
			.select(sessionLawyerColumns)
			.from(lawyers)
			.where(and(eq(lawyers.oabNumber, oabNumber), eq(lawyers.oabUf, oabUf)))
			.limit(1);

		// Quem já entrou uma vez volta direto pelo banco: o DJEN só serve para descobrir o nome de quem
		// ainda não existe aqui.
		if (known) {
			return { lawyer: known, token: await this.openSession(known.id, input.deviceId) };
		}

		const found = await this.djen.findLawyer({ oabNumber, oabUf }).catch((error: unknown) => {
			console.error("[auth] falha ao consultar o DJEN no login", error);

			return null;
		});

		const declaredName = input.name?.trim().toUpperCase();

		// Advogado sem nenhuma comunicação no DJEN (recém-inscrito, atuação em processo físico ou
		// intimação que sai no nome do sócio) existe e precisa entrar. Ele se identifica pelo nome e
		// o painel fica vazio até a primeira publicação chegar.
		if (!found && !declaredName) {
			throw new ORPCError("NOT_FOUND", {
				message: `Não encontramos publicações para a OAB ${oabNumber}/${oabUf}. Confira o número e a UF.`,
			});
		}

		const name = found?.name ?? declaredName;

		if (!name) {
			throw new ORPCError("BAD_REQUEST", { message: "Informe o seu nome completo." });
		}

		const [lawyer] = await this.db
			.insert(lawyers)
			.values({ name, oabNumber, oabUf, djenAdvogadoId: found?.djenAdvogadoId })
			.onConflictDoUpdate({
				target: [lawyers.oabNumber, lawyers.oabUf],
				set: found ? { name, djenAdvogadoId: found.djenAdvogadoId } : { name },
			})
			.returning(sessionLawyerColumns);

		if (!lawyer) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Não foi possível gravar o advogado.",
			});
		}

		return { lawyer, token: await this.openSession(lawyer.id, input.deviceId) };
	}

	private async openSession(lawyerId: string, device: string | null) {
		const deviceId = device ?? crypto.randomUUID();
		const token = createSessionToken();

		// Entrar de novo com a mesma OAB no mesmo aparelho troca a sessão em vez de empilhar outra:
		// senão o seletor mostraria o mesmo advogado repetido e "Sair" deixaria a cópia viva.
		await this.db
			.update(sessions)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(sessions.deviceId, deviceId),
					eq(sessions.lawyerId, lawyerId),
					isNull(sessions.revokedAt),
				),
			);

		await this.db.insert(sessions).values({
			lawyerId,
			deviceId,
			token,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		});

		return token;
	}

	async resolveSession(token: string): Promise<SessionContext | null> {
		const now = new Date();

		const [session] = await this.db
			.select({
				sessionId: sessions.id,
				deviceId: sessions.deviceId,
				expiresAt: sessions.expiresAt,
				lawyer: sessionLawyerColumns,
			})
			.from(sessions)
			.innerJoin(lawyers, eq(lawyers.id, sessions.lawyerId))
			.where(
				and(eq(sessions.token, token), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
			)
			.limit(1);

		if (!session) {
			return null;
		}

		if (
			session.expiresAt.getTime() - now.getTime() <
			SESSION_TTL_MS - SESSION_ROW_REFRESH_AFTER_MS
		) {
			await this.db
				.update(sessions)
				.set({ expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
				.where(eq(sessions.id, session.sessionId));
		}

		return { deviceId: session.deviceId, lawyer: session.lawyer };
	}

	async profiles(context: SessionContext): Promise<{ profiles: SessionProfile[] }> {
		const open = await this.db
			.select({
				id: lawyers.id,
				name: lawyers.name,
				oabNumber: lawyers.oabNumber,
				oabUf: lawyers.oabUf,
				onboardingState: lawyers.onboardingState,
			})
			.from(sessions)
			.innerJoin(lawyers, eq(lawyers.id, sessions.lawyerId))
			.where(
				and(
					eq(sessions.deviceId, context.deviceId),
					isNull(sessions.revokedAt),
					gt(sessions.expiresAt, new Date()),
				),
			)
			.orderBy(lawyers.name);

		return {
			profiles: open.map((profile) => ({ ...profile, active: profile.id === context.lawyer.id })),
		};
	}

	// Trocar de advogado não é entrar: só vale para quem já tem sessão viva neste aparelho. O id que
	// chega da tela é conferido contra o grupo do dispositivo, e não contra a lista de advogados.
	async switchTo(input: { context: SessionContext; lawyerId: string }) {
		const [target] = await this.db
			.select({ sessionId: sessions.id, token: sessions.token, lawyer: sessionLawyerColumns })
			.from(sessions)
			.innerJoin(lawyers, eq(lawyers.id, sessions.lawyerId))
			.where(
				and(
					eq(sessions.deviceId, input.context.deviceId),
					eq(sessions.lawyerId, input.lawyerId),
					isNull(sessions.revokedAt),
					gt(sessions.expiresAt, new Date()),
				),
			)
			.limit(1);

		if (!target) {
			throw new ORPCError("NOT_FOUND", {
				message: "Este advogado não está mais conectado neste navegador. Entre com a OAB de novo.",
			});
		}

		await this.db
			.update(sessions)
			.set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
			.where(eq(sessions.id, target.sessionId));

		return { lawyer: target.lawyer, token: target.token };
	}

	// Sair é sair deste advogado neste navegador. Revogar todas as sessões dele derrubaria o celular
	// de quem fechou a aba do escritório, e com ele os alertas de prazo.
	async logout(input: { context: SessionContext; pushEndpoint?: string }) {
		const { deviceId, lawyer } = input.context;

		await this.db
			.update(sessions)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(sessions.deviceId, deviceId),
					eq(sessions.lawyerId, lawyer.id),
					isNull(sessions.revokedAt),
				),
			);

		// A assinatura de push é do par (advogado, aparelho). Quem sai para de receber prazo deste
		// advogado; os outros perfis do mesmo navegador continuam avisando, e é o `endpointInUse` que
		// diz à tela para não cancelar a inscrição do navegador por cima deles.
		const push = input.pushEndpoint
			? await new NotificationsManager(this.db).unsubscribe({
					lawyerId: lawyer.id,
					endpoint: input.pushEndpoint,
				})
			: null;

		const [next] = await this.db
			.select({ token: sessions.token, lawyer: sessionLawyerColumns })
			.from(sessions)
			.innerJoin(lawyers, eq(lawyers.id, sessions.lawyerId))
			.where(
				and(
					eq(sessions.deviceId, deviceId),
					isNull(sessions.revokedAt),
					gt(sessions.expiresAt, new Date()),
				),
			)
			.orderBy(desc(sessions.expiresAt), desc(sessions.createdAt))
			.limit(1);

		// Sair do escritório não devolve à tela de OAB enquanto sobrar outro perfil no aparelho: a aba
		// assume o que restou. O `token` nulo é o que faz o cookie ser apagado do lado do Hono.
		const endpointInUse = !!push?.endpointInUse;

		if (!next) {
			return { ok: true, token: null, lawyer: null, endpointInUse };
		}

		return { ok: true, token: next.token, lawyer: next.lawyer, endpointInUse };
	}

	async me(lawyerId: string | undefined): Promise<{ lawyer: SessionLawyer | null }> {
		if (!lawyerId) {
			return { lawyer: null };
		}

		const [lawyer] = await this.db
			.select(sessionLawyerColumns)
			.from(lawyers)
			.where(eq(lawyers.id, lawyerId))
			.limit(1);

		if (!lawyer) {
			throw new ORPCError("NOT_FOUND", { message: "Advogado não encontrado." });
		}

		return { lawyer };
	}
}
