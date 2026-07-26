import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { caseLawyers } from "@kw-lawyer/api/src/db/schema/case_lawyers.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import type { DatajudClient } from "@kw-lawyer/api/src/features/datajud/client.ts";
import type { DjenClient } from "@kw-lawyer/api/src/features/djen/client.ts";
import { type DjenItem, djenItemSchema } from "@kw-lawyer/api/src/features/djen/types.ts";
import { LawyerOabManager } from "@kw-lawyer/api/src/features/oabs/manager.ts";
import { SyncManager } from "@kw-lawyer/api/src/features/sync/manager.ts";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";

type DjenSource = Pick<DjenClient, "fetchAll">;
type DatajudSource = Pick<DatajudClient, "findCases">;

const OWN_OAB = "930001";
const PARTNER_OAB = "930002";
const OWN_CNJ = "10025874520248260100";
const PARTNER_CNJ = "40117908520258260114";

const DATAJUD_EMPTY: DatajudSource = {
	findCases: (params) =>
		Promise.resolve({ status: "ok" as const, alias: params.tribunal.toLowerCase(), documents: [] }),
};

function djenItem(input: { id: number; cnjNumber: string }): DjenItem {
	const payload = {
		id: input.id,
		data_disponibilizacao: "2026-07-24",
		texto: "<p>Manifeste-se a parte autora, no prazo de 5 (cinco) dias.</p>",
		siglaTribunal: "TJSP",
		tipoComunicacao: "Intimação",
		nomeOrgao: "1ª Vara Cível",
		numero_processo: input.cnjNumber,
	};

	return djenItemSchema.assert(payload);
}

// Cada inscrição devolve o seu próprio processo: é assim que se enxerga se o sync varreu as duas.
function djenByOab(itemsByOab: Record<string, DjenItem[]>): DjenSource {
	return {
		fetchAll: async (params, onPage) => {
			const items = (itemsByOab[params.oabNumber] ?? []).filter(
				(item) =>
					item.data_disponibilizacao >= params.window.from &&
					item.data_disponibilizacao <= params.window.through,
			);

			if (!items.length) {
				return { total: 0, invalid: 0, counted: 0 };
			}

			await onPage({ page: 1, count: items.length, items, invalid: 0, window: params.window });

			return { total: items.length, invalid: 0, counted: items.length };
		},
	};
}

async function createLawyer(tx: Tx) {
	const [lawyer] = await tx
		.insert(lawyers)
		.values({ name: "VITOR DE TESTE", oabNumber: OWN_OAB, oabUf: "SP" })
		.returning({ id: lawyers.id });

	assertDefined(lawyer);

	return lawyer.id;
}

async function caseNumbersOf(tx: Tx, lawyerId: string) {
	const rows = await tx
		.select({ cnjNumber: cases.cnjNumber })
		.from(cases)
		.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
		.where(eq(caseLawyers.lawyerId, lawyerId));

	return rows.map((row) => row.cnjNumber).sort();
}

function oabManager(tx: Tx, found: { name: string; djenAdvogadoId: number | null } | null) {
	return new LawyerOabManager(tx, { findLawyer: () => Promise.resolve(found) });
}

test(
	"o sync varre a inscrição do advogado e as que ele acompanha",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx);

		await oabManager(tx, { name: "JOSE ROBERTO SOCIO", djenAdvogadoId: 42 }).add(lawyerId, {
			oabNumber: PARTNER_OAB,
			oabUf: "SP",
		});

		const djen = djenByOab({
			[OWN_OAB]: [djenItem({ id: 1, cnjNumber: OWN_CNJ })],
			[PARTNER_OAB]: [djenItem({ id: 2, cnjNumber: PARTNER_CNJ })],
		});

		const manager = new SyncManager(tx, djen, DATAJUD_EMPTY);
		const { runId } = await manager.start(lawyerId);

		await manager.syncLawyer(lawyerId, { runId, force: false });

		expect(await caseNumbersOf(tx, lawyerId)).toEqual([OWN_CNJ, PARTNER_CNJ].sort());
	}),
);

test(
	"a inscrição acompanhada guarda o titular que o DJEN informou",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx);

		const { oab, publishing } = await oabManager(tx, {
			name: "MONICA SOCIA",
			djenAdvogadoId: 7,
		}).add(lawyerId, { oabNumber: PARTNER_OAB, oabUf: " sp " });

		expect(oab.oabUf).toBe("SP");
		expect(oab.holderName).toBe("MONICA SOCIA");
		expect(publishing).toBe(true);

		const { extra } = await oabManager(tx, null).watched(lawyerId);

		expect(extra).toHaveLength(1);
	}),
);

test(
	"inscrição sem publicação entra, mas avisa que o DJEN não tem nada nela",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx);

		const { publishing } = await oabManager(tx, null).add(lawyerId, {
			oabNumber: PARTNER_OAB,
			oabUf: "SP",
		});

		expect(publishing).toBe(false);
	}),
);

test(
	"a própria inscrição e a repetida não entram duas vezes",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx);
		const manager = oabManager(tx, null);

		await expectOrpcError(manager.add(lawyerId, { oabNumber: OWN_OAB, oabUf: "SP" }), "CONFLICT");

		await manager.add(lawyerId, { oabNumber: PARTNER_OAB, oabUf: "SP" });

		await expectOrpcError(
			manager.add(lawyerId, { oabNumber: PARTNER_OAB, oabUf: "SP" }),
			"CONFLICT",
		);
	}),
);

test(
	"remover só alcança inscrição do próprio advogado",
	withRollback(async (tx) => {
		const lawyerId = await createLawyer(tx);

		const [other] = await tx
			.insert(lawyers)
			.values({ name: "OUTRA PESSOA", oabNumber: "930003", oabUf: "SP" })
			.returning({ id: lawyers.id });

		assertDefined(other);

		const manager = oabManager(tx, null);
		const { oab } = await manager.add(lawyerId, { oabNumber: PARTNER_OAB, oabUf: "SP" });

		await expectOrpcError(manager.remove(other.id, { id: oab.id }), "NOT_FOUND");

		expect(await manager.remove(lawyerId, { id: oab.id })).toEqual({ ok: true });
		expect((await manager.watched(lawyerId)).extra).toHaveLength(0);
	}),
);
