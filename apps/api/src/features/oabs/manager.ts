import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { lawyerOabs } from "../../db/schema/lawyer_oabs.ts";
import { lawyers } from "../../db/schema/lawyers.ts";
import { DjenClient } from "../djen/client.ts";

const OAB_UF_PATTERN = /^[A-Z]{2}$/u;
const WATCHED_OAB_LIMIT = 10;

type DjenLawyerLookup = Pick<DjenClient, "findLawyer">;

function normalize(input: { oabNumber: string; oabUf: string }) {
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

	return { oabNumber, oabUf };
}

export class LawyerOabManager {
	constructor(
		private readonly db: Db | Tx,
		private readonly djen: DjenLawyerLookup = new DjenClient({}),
	) {}

	// A inscrição do próprio advogado vem de `lawyers` e não pode ser removida; as demais são as que
	// ele declarou acompanhar. O sync varre todas com o mesmo dono, então uma publicação que sai no
	// nome do sócio entra no painel de quem acompanha aquela inscrição.
	async watched(lawyerId: string) {
		const [owner] = await this.db
			.select({
				name: lawyers.name,
				oabNumber: lawyers.oabNumber,
				oabUf: lawyers.oabUf,
				lastSyncedAt: lawyers.lastSyncedAt,
			})
			.from(lawyers)
			.where(eq(lawyers.id, lawyerId))
			.limit(1);

		if (!owner) {
			throw new ORPCError("NOT_FOUND", { message: "Advogado não encontrado." });
		}

		const extra = await this.db
			.select({
				id: lawyerOabs.id,
				oabNumber: lawyerOabs.oabNumber,
				oabUf: lawyerOabs.oabUf,
				holderName: lawyerOabs.holderName,
				lastSyncedAt: lawyerOabs.lastSyncedAt,
			})
			.from(lawyerOabs)
			.where(eq(lawyerOabs.lawyerId, lawyerId))
			.orderBy(asc(lawyerOabs.createdAt));

		return {
			own: {
				oabNumber: owner.oabNumber,
				oabUf: owner.oabUf,
				holderName: owner.name,
				lastSyncedAt: owner.lastSyncedAt,
			},
			extra,
		};
	}

	async sources(lawyerId: string) {
		const { own, extra } = await this.watched(lawyerId);

		return [
			{ oabNumber: own.oabNumber, oabUf: own.oabUf },
			...extra.map((row) => ({ oabNumber: row.oabNumber, oabUf: row.oabUf })),
		];
	}

	async add(lawyerId: string, input: { oabNumber: string; oabUf: string }) {
		const { oabNumber, oabUf } = normalize(input);
		const { own, extra } = await this.watched(lawyerId);

		if (own.oabNumber === oabNumber && own.oabUf === oabUf) {
			throw new ORPCError("CONFLICT", { message: "Esta já é a sua própria inscrição." });
		}

		if (extra.length >= WATCHED_OAB_LIMIT) {
			throw new ORPCError("CONFLICT", {
				message: `Você já acompanha ${WATCHED_OAB_LIMIT} inscrições além da sua. Remova uma para incluir outra.`,
			});
		}

		const found = await this.djen.findLawyer({ oabNumber, oabUf });

		const [created] = await this.db
			.insert(lawyerOabs)
			.values({
				lawyerId,
				oabNumber,
				oabUf,
				holderName: found?.name,
				djenAdvogadoId: found?.djenAdvogadoId,
			})
			.onConflictDoNothing({
				target: [lawyerOabs.lawyerId, lawyerOabs.oabNumber, lawyerOabs.oabUf],
			})
			.returning({
				id: lawyerOabs.id,
				oabNumber: lawyerOabs.oabNumber,
				oabUf: lawyerOabs.oabUf,
				holderName: lawyerOabs.holderName,
				lastSyncedAt: lawyerOabs.lastSyncedAt,
			});

		if (!created) {
			throw new ORPCError("CONFLICT", { message: "Você já acompanha esta inscrição." });
		}

		return { oab: created, publishing: !!found };
	}

	async remove(lawyerId: string, input: { id: string }) {
		const [removed] = await this.db
			.delete(lawyerOabs)
			.where(and(eq(lawyerOabs.id, input.id), eq(lawyerOabs.lawyerId, lawyerId)))
			.returning({ id: lawyerOabs.id });

		if (!removed) {
			throw new ORPCError("NOT_FOUND", { message: "Inscrição acompanhada não encontrada." });
		}

		return { ok: true };
	}

	async markSynced(lawyerId: string, input: { oabNumber: string; oabUf: string }) {
		await this.db
			.update(lawyerOabs)
			.set({ lastSyncedAt: new Date() })
			.where(
				and(
					eq(lawyerOabs.lawyerId, lawyerId),
					eq(lawyerOabs.oabNumber, input.oabNumber),
					eq(lawyerOabs.oabUf, input.oabUf),
				),
			);
	}
}
