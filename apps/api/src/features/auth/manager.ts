import { ORPCError } from "@orpc/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { lawyers } from "../../db/schema/lawyers.ts";
import { sessions } from "../../db/schema/sessions.ts";
import { DjenClient } from "../djen/client.ts";
import { registerAttempt } from "./attempts.ts";
import {
	createSessionToken,
	SESSION_RENEWAL_THRESHOLD_MS,
	SESSION_TTL_MS,
	type SessionLawyer,
} from "./session.ts";

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_MS = 60_000;
const OAB_UF_PATTERN = /^[A-Z]{2}$/u;

type DjenLawyerLookup = Pick<DjenClient, "findLawyer">;

export class AuthManager {
	constructor(
		private readonly db: Db | Tx,
		private readonly djen: DjenLawyerLookup = new DjenClient({}),
	) {}

	async loginWithOab(input: { oabNumber: string; oabUf: string; name?: string }) {
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

		if (attempts > LOGIN_ATTEMPT_LIMIT) {
			throw new ORPCError("RATE_LIMITED", {
				message: "Muitas tentativas de entrada para esta OAB. Espere um minuto e tente de novo.",
			});
		}

		const found = await this.djen.findLawyer({ oabNumber, oabUf });
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
			.returning({
				id: lawyers.id,
				name: lawyers.name,
				oabNumber: lawyers.oabNumber,
				oabUf: lawyers.oabUf,
			});

		if (!lawyer) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Não foi possível gravar o advogado.",
			});
		}

		const token = createSessionToken();

		await this.db.insert(sessions).values({
			lawyerId: lawyer.id,
			token,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		});

		return { lawyer, token };
	}

	async resolveSession(token: string): Promise<SessionLawyer | null> {
		const now = new Date();

		const [session] = await this.db
			.select({
				sessionId: sessions.id,
				expiresAt: sessions.expiresAt,
				id: lawyers.id,
				name: lawyers.name,
				oabNumber: lawyers.oabNumber,
				oabUf: lawyers.oabUf,
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

		if (session.expiresAt.getTime() - now.getTime() < SESSION_RENEWAL_THRESHOLD_MS) {
			await this.db
				.update(sessions)
				.set({ expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
				.where(eq(sessions.id, session.sessionId));
		}

		return {
			id: session.id,
			name: session.name,
			oabNumber: session.oabNumber,
			oabUf: session.oabUf,
		};
	}

	async logout(lawyerId: string) {
		await this.db
			.update(sessions)
			.set({ revokedAt: new Date() })
			.where(and(eq(sessions.lawyerId, lawyerId), isNull(sessions.revokedAt)));

		return { ok: true };
	}

	async me(lawyerId: string | undefined): Promise<{ lawyer: SessionLawyer | null }> {
		if (!lawyerId) {
			return { lawyer: null };
		}

		const [lawyer] = await this.db
			.select({
				id: lawyers.id,
				name: lawyers.name,
				oabNumber: lawyers.oabNumber,
				oabUf: lawyers.oabUf,
			})
			.from(lawyers)
			.where(eq(lawyers.id, lawyerId))
			.limit(1);

		if (!lawyer) {
			throw new ORPCError("NOT_FOUND", { message: "Advogado não encontrado." });
		}

		return { lawyer };
	}
}
