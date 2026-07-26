import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { lawyers } from "@kw-lawyer/api/src/db/schema/lawyers.ts";
import { addDays, forensicToday } from "@kw-lawyer/api/src/features/deadlines/calendar.ts";
import type { DjenClient } from "@kw-lawyer/api/src/features/djen/client.ts";
import { djenItemSchema } from "@kw-lawyer/api/src/features/djen/types.ts";
import { PUBLICATION_BACKFILL_DAYS } from "@kw-lawyer/api/src/features/publications/window.ts";
import { SyncManager } from "@kw-lawyer/api/src/features/sync/manager.ts";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assertDefined } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";
import { createTestClient } from "./utils/orpc.ts";
import { seedCase, seedDeadline, seedLawyer, seedPublication, uniqueCnj } from "./utils/seed.ts";

const CUTOFF = "2026-07-25";
const SUFIXO_TJSP = "8520238260103";
const OLDEST_AVAILABLE_AT = "2025-03-04";

function djenSource(input: {
	cnjNumber: string;
	availableAt: string[];
}): Pick<DjenClient, "fetchAll"> {
	return {
		fetchAll: async (params, onPage) => {
			const items = input.availableAt
				.filter((date) => date >= params.window.from && date <= params.window.through)
				.map((date, index) =>
					djenItemSchema.assert({
						id: Number(date.replaceAll("-", "")) * 10 + index,
						data_disponibilizacao: date,
						texto: "<p>Manifeste-se a parte autora, no prazo de 5 (cinco) dias.</p>",
						siglaTribunal: "TJSP",
						tipoComunicacao: "Intimação",
						numero_processo: input.cnjNumber,
					}),
				);

			if (!items.length) {
				return { total: 0, invalid: 0, counted: 0 };
			}

			await onPage({ page: 1, count: items.length, items, invalid: 0, window: params.window });

			return { total: items.length, invalid: 0, counted: items.length };
		},
	};
}

async function syncedLawyer(tx: Tx, input: { oabNumber: string; availableAt: string[] }) {
	const [created] = await tx
		.insert(lawyers)
		.values({ name: `ADVOGADO ${input.oabNumber}`, oabNumber: input.oabNumber, oabUf: "SP" })
		.returning({ id: lawyers.id });

	assertDefined(created);

	const djen = djenSource({
		cnjNumber: uniqueCnj(SUFIXO_TJSP),
		availableAt: input.availableAt,
	});

	const manager = new SyncManager(tx, djen, {
		findCases: (params) =>
			Promise.resolve({
				status: "ok" as const,
				alias: params.tribunal.toLowerCase(),
				documents: [],
			}),
	});

	const { runId } = await manager.start(created.id);

	await manager.syncLawyer(created.id, { runId, force: false });

	const [synced] = await tx
		.select({
			id: lawyers.id,
			name: lawyers.name,
			oabNumber: lawyers.oabNumber,
			oabUf: lawyers.oabUf,
			historyCutoffAt: lawyers.historyCutoffAt,
			onboardingState: lawyers.onboardingState,
		})
		.from(lawyers)
		.where(eq(lawyers.id, created.id));

	assertDefined(synced);

	return synced;
}

const titlesOf = (result: { items: { title: string }[] }) => result.items.map((item) => item.title);

test(
	"o corte desce até a publicação mais antiga que o sync trouxe, e a caixa abre nela",
	withRollback(async (tx) => {
		const lawyer = await syncedLawyer(tx, {
			oabNumber: "96104",
			availableAt: [OLDEST_AVAILABLE_AT, "2026-07-24"],
		});

		expect(lawyer.historyCutoffAt).toBe(OLDEST_AVAILABLE_AT);

		const recorte = await createTestClient(tx, lawyer).publications.list({});

		expect(recorte.total).toBe(2);
	}),
);

test(
	"sync que não trouxe nada não mexe no corte",
	withRollback(async (tx) => {
		const lawyer = await syncedLawyer(tx, { oabNumber: "96105", availableAt: [] });

		expect(lawyer.historyCutoffAt).toBe(forensicToday());
	}),
);

test(
	"a agenda padrão começa no corte e só mostra o passivo antigo quando ela pede",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "96101", CUTOFF);

		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Passivo antigo",
			dueAt: "2025-11-10",
			audience: "partes",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Contrarrazões",
			dueAt: "2026-08-03",
			audience: "partes",
		});

		const client = createTestClient(tx, lawyer);

		expect(titlesOf(await client.deadlines.list({}))).toEqual(["Contrarrazões"]);
		expect(titlesOf(await client.deadlines.list({ includeHistory: true }))).toEqual([
			"Passivo antigo",
			"Contrarrazões",
		]);
		expect(titlesOf(await client.deadlines.list({ from: "2025-01-01" }))).toEqual([
			"Passivo antigo",
			"Contrarrazões",
		]);
	}),
);

test(
	"o contador de vencidos ignora o que venceu antes do corte",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "96102", CUTOFF);

		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Passivo antigo",
			dueAt: "2025-11-10",
			audience: "partes",
		});
		await seedDeadline(tx, {
			lawyerId: lawyer.id,
			title: "Vencido depois do corte",
			dueAt: "2026-07-28",
			audience: "partes",
		});

		const client = createTestClient(tx, lawyer);
		const recorte = await client.deadlines.summary({ today: "2026-07-30" });

		expect(recorte.overdue).toBe(1);
		expect(recorte.actionable).toBe(1);

		const completo = await client.deadlines.summary({
			today: "2026-07-30",
			includeHistory: true,
		});

		expect(completo.overdue).toBe(2);
		expect(completo.actionable).toBe(2);
	}),
);

test(
	"a inbox padrão guarda o último mês antes do corte, e o resto continua a um clique",
	withRollback(async (tx) => {
		const lawyer = await seedLawyer(tx, "96103", CUTOFF);
		const cnjNumber = uniqueCnj(SUFIXO_TJSP);
		const caseId = await seedCase(tx, {
			lawyerId: lawyer.id,
			cnjNumber,
			tribunal: "TJSP",
		});

		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			caseId,
			cnjNumber,
			availableAt: "2025-03-04",
			textPlain: "Publicação antiga, muito anterior ao corte.",
		});
		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			caseId,
			cnjNumber,
			availableAt: addDays(CUTOFF, -PUBLICATION_BACKFILL_DAYS + 1),
			textPlain: "Publicação da véspera da adoção.",
		});
		await seedPublication(tx, {
			lawyerIds: [lawyer.id],
			caseId,
			cnjNumber,
			availableAt: "2026-07-28",
			textPlain: "Publicação nova, depois do corte.",
		});

		const client = createTestClient(tx, lawyer);
		const recorte = await client.publications.list({});

		expect(recorte.total).toBe(2);
		expect(recorte.unread).toBe(2);
		expect(recorte.items[0]?.availableAt).toBe("2026-07-28");

		const completo = await client.publications.list({ includeHistory: true });

		expect(completo.total).toBe(3);
		expect(completo.unread).toBe(3);

		const periodo = await client.publications.list({ from: "2025-01-01" });

		expect(periodo.total).toBe(3);
	}),
);
