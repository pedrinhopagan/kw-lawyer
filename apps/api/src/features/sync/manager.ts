import { ORPCError } from "@orpc/server";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseLawyers } from "../../db/schema/case_lawyers.ts";
import { caseParties } from "../../db/schema/case_parties.ts";
import { cases } from "../../db/schema/cases.ts";
import { lawyers } from "../../db/schema/lawyers.ts";
import { movements } from "../../db/schema/movements.ts";
import { publicationLinks } from "../../db/schema/publication_links.ts";
import { publications } from "../../db/schema/publications.ts";
import { syncRuns } from "../../db/schema/sync_runs.ts";
import { CaseAnalysisManager } from "../analysis/manager.ts";
import { DeadlineManager } from "../deadlines/manager.ts";
import { DatajudClient } from "../datajud/client.ts";
import { DjenClient } from "../djen/client.ts";
import { LawyerOabManager } from "../oabs/manager.ts";
import {
	contentHash,
	extractActBody,
	formatCnj,
	htmlToPlainText,
	summarize,
	toCnjDigits,
} from "../djen/normalize.ts";
import type { DjenItem } from "../djen/types.ts";
import { emptySyncCounters, type SyncCounters, syncRealtime } from "./realtime.ts";

const ORPHAN_RUN_MS = 15 * 60 * 1000;
const DATAJUD_FRESHNESS_MS = 6 * 60 * 60 * 1000;
const DATAJUD_CONCURRENCY = 4;
const PUBLICATION_SOURCE = "djen";
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

type DjenSource = Pick<DjenClient, "fetchAll">;
type DatajudSource = Pick<DatajudClient, "findCase">;
type DatajudFound = Extract<Awaited<ReturnType<DatajudSource["findCase"]>>, { status: "ok" }>;
type DatajudMovement = DatajudFound["case"]["movements"][number];

type EnrichmentTarget = { id: string; cnjNumber: string; tribunal: string };

function runCounters(counters: SyncCounters) {
	return {
		fetched: counters.fetched,
		created: counters.created,
		duplicated: counters.duplicated,
		invalid: counters.invalid,
		casesCreated: counters.casesCreated,
		casesEnriched: counters.casesEnriched,
		movementsCreated: counters.movementsCreated,
	};
}

function errorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function asText(value: string | number | null | undefined) {
	if (typeof value === "number") {
		return String(value);
	}

	return value;
}

function publicationExcerpt(textPlain: string, item: DjenItem) {
	const candidate = [
		summarize(extractActBody(textPlain)),
		item.tipoComunicacao,
		item.tipoDocumento,
	].find((value) => !!value?.trim());

	if (!candidate) {
		return "Publicação sem texto";
	}

	return candidate;
}

function movementSummary(movement: DatajudMovement) {
	const complements = movement.complements.map((complement) => complement.nome).filter(Boolean);

	if (!complements.length) {
		return movement.name;
	}

	return `${movement.name}: ${complements.join(", ")}`;
}

export class SyncManager {
	constructor(
		private readonly db: Db | Tx,
		private readonly djen: DjenSource = new DjenClient({}),
		private readonly datajud: DatajudSource = new DatajudClient({}),
	) {}

	async start(lawyerId: string) {
		const orphanBefore = new Date(Date.now() - ORPHAN_RUN_MS);

		return await this.db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lawyerId}))`);

			const [running] = await tx
				.select({ id: syncRuns.id })
				.from(syncRuns)
				.where(
					and(
						eq(syncRuns.lawyerId, lawyerId),
						eq(syncRuns.status, "em_execucao"),
						gt(syncRuns.startedAt, orphanBefore),
					),
				)
				.orderBy(desc(syncRuns.startedAt))
				.limit(1);

			if (running) {
				return { runId: running.id, resumed: true };
			}

			await tx
				.update(syncRuns)
				.set({
					status: "falhou",
					finishedAt: new Date(),
					errorMessage: "Sincronização interrompida antes de terminar.",
				})
				.where(and(eq(syncRuns.lawyerId, lawyerId), eq(syncRuns.status, "em_execucao")));

			const [run] = await tx
				.insert(syncRuns)
				.values({ lawyerId, status: "em_execucao" })
				.returning({ id: syncRuns.id });

			if (!run) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Não foi possível abrir a sincronização.",
				});
			}

			return { runId: run.id, resumed: false };
		});
	}

	async syncLawyer(lawyerId: string, options: { runId: string; force: boolean }) {
		const counters = emptySyncCounters();

		const [lawyer] = await this.db
			.select({ id: lawyers.id })
			.from(lawyers)
			.innerJoin(syncRuns, eq(syncRuns.lawyerId, lawyers.id))
			.where(
				and(
					eq(lawyers.id, lawyerId),
					eq(syncRuns.id, options.runId),
					eq(syncRuns.status, "em_execucao"),
				),
			)
			.limit(1);

		if (!lawyer) {
			return { runId: options.runId, status: "ignorada" as const, ...counters };
		}

		const oabs = new LawyerOabManager(this.db);

		try {
			for (const source of await oabs.sources(lawyerId)) {
				await this.discover({ id: lawyer.id, ...source }, options.runId, counters);
				await oabs.markSynced(lawyerId, source);
			}

			await this.enrich(lawyerId, options.runId, counters, options.force);
			await new DeadlineManager(this.db).scan({});
			await new CaseAnalysisManager(this.db).scan({});
		} catch (error) {
			return await this.finish(lawyerId, options.runId, counters, errorMessage(error));
		}

		await this.db.update(lawyers).set({ lastSyncedAt: new Date() }).where(eq(lawyers.id, lawyerId));

		return await this.finish(lawyerId, options.runId, counters, null);
	}

	async status(lawyerId: string) {
		const [lawyer] = await this.db
			.select({ lastSyncedAt: lawyers.lastSyncedAt })
			.from(lawyers)
			.where(eq(lawyers.id, lawyerId))
			.limit(1);

		if (!lawyer) {
			throw new ORPCError("NOT_FOUND", { message: "Advogado não encontrado." });
		}

		const [run] = await this.db
			.select()
			.from(syncRuns)
			.where(eq(syncRuns.lawyerId, lawyerId))
			.orderBy(desc(syncRuns.startedAt))
			.limit(1);

		if (!run) {
			return { run: null, lastSyncedAt: lawyer.lastSyncedAt };
		}

		return { run, lastSyncedAt: lawyer.lastSyncedAt };
	}

	async *events(lawyerId: string, signal?: AbortSignal) {
		for await (const event of syncRealtime.events(signal)) {
			if (event.lawyerId !== lawyerId) {
				continue;
			}

			yield event;
		}
	}

	private async finish(
		lawyerId: string,
		runId: string,
		counters: SyncCounters,
		failure: string | null,
	) {
		const status = failure ? ("falhou" as const) : ("concluida" as const);

		await this.db
			.update(syncRuns)
			.set({ ...runCounters(counters), status, finishedAt: new Date(), errorMessage: failure })
			.where(eq(syncRuns.id, runId));

		syncRealtime.publish({
			...counters,
			lawyerId,
			runId,
			phase: status,
			errorMessage: failure,
		});

		return { runId, status, ...counters };
	}

	private async discover(
		lawyer: { id: string; oabNumber: string; oabUf: string },
		runId: string,
		counters: SyncCounters,
	) {
		syncRealtime.publish({
			...counters,
			lawyerId: lawyer.id,
			runId,
			phase: "descoberta",
			errorMessage: null,
		});

		await this.djen.fetchAll({ oabNumber: lawyer.oabNumber, oabUf: lawyer.oabUf }, async (page) => {
			counters.fetched += page.items.length + page.invalid;
			counters.invalid += page.invalid;

			await this.db.transaction(async (tx) => {
				for (const item of page.items) {
					await this.ingest(tx, lawyer.id, item, counters);
				}
			});

			await this.db.update(syncRuns).set(runCounters(counters)).where(eq(syncRuns.id, runId));

			syncRealtime.publish({
				...counters,
				lawyerId: lawyer.id,
				runId,
				phase: "descoberta",
				errorMessage: null,
			});
		});
	}

	private async ingest(tx: Tx, lawyerId: string, item: DjenItem, counters: SyncCounters) {
		const availableAt = item.data_disponibilizacao.slice(0, 10);

		if (!DATE_ONLY_PATTERN.test(availableAt)) {
			counters.invalid += 1;

			return;
		}

		const cnjNumber =
			toCnjDigits(item.numero_processo) ?? toCnjDigits(item.numeroprocessocommascara);
		const tribunal = item.siglaTribunal?.trim().toUpperCase();
		const textPlain = htmlToPlainText(item.texto);
		const excerpt = publicationExcerpt(textPlain, item);
		const occurredAt = new Date(`${availableAt}T00:00:00.000Z`);

		const caseId =
			cnjNumber && tribunal
				? await this.upsertCase(tx, { cnjNumber, tribunal, item, occurredAt }, counters)
				: null;

		if (caseId) {
			await tx.insert(caseLawyers).values({ caseId, lawyerId }).onConflictDoNothing();
			await this.upsertParties(tx, caseId, item.destinatarios);
		}

		const publicationId = await this.upsertPublication(
			tx,
			{ item, caseId, cnjNumber, tribunal, availableAt, textPlain, excerpt },
			counters,
		);

		await tx.insert(publicationLinks).values({ publicationId, lawyerId }).onConflictDoNothing();

		if (!caseId) {
			return;
		}

		await tx
			.insert(movements)
			.values({
				caseId,
				publicationId,
				occurredAt,
				type: item.tipoComunicacao,
				summary: excerpt,
				source: "publication",
			})
			.onConflictDoNothing({ target: movements.publicationId });
	}

	private async upsertCase(
		tx: Tx,
		input: { cnjNumber: string; tribunal: string; item: DjenItem; occurredAt: Date },
		counters: SyncCounters,
	) {
		const [row] = await tx
			.insert(cases)
			.values({
				cnjNumber: input.cnjNumber,
				formattedNumber: input.item.numeroprocessocommascara?.trim() || formatCnj(input.cnjNumber),
				tribunal: input.tribunal,
				orgName: input.item.nomeOrgao,
				className: input.item.nomeClasse,
				classCode: asText(input.item.codigoClasse),
				lastMovementAt: input.occurredAt,
			})
			.onConflictDoUpdate({
				target: cases.cnjNumber,
				set: {
					orgName: sql`coalesce(excluded.org_name, ${cases.orgName})`,
					className: sql`coalesce(excluded.class_name, ${cases.className})`,
					classCode: sql`coalesce(excluded.class_code, ${cases.classCode})`,
					lastMovementAt: sql`greatest(${cases.lastMovementAt}, excluded.last_movement_at)`,
				},
			})
			.returning({ id: cases.id, inserted: sql<boolean>`(xmax = 0)` });

		if (!row) {
			throw new Error(`Não foi possível gravar o processo ${input.cnjNumber}.`);
		}

		if (row.inserted) {
			counters.casesCreated += 1;
		}

		return row.id;
	}

	private async upsertParties(tx: Tx, caseId: string, destinatarios: DjenItem["destinatarios"]) {
		const seen = new Set<string>();
		const values: { caseId: string; name: string; polo: string | null | undefined }[] = [];

		for (const destinatario of destinatarios ?? []) {
			const name = destinatario.nome.trim();

			if (!name || seen.has(`${name}|${destinatario.polo}`)) {
				continue;
			}

			seen.add(`${name}|${destinatario.polo}`);
			values.push({ caseId, name, polo: destinatario.polo });
		}

		if (!values.length) {
			return;
		}

		await tx.insert(caseParties).values(values).onConflictDoNothing();
	}

	private async upsertPublication(
		tx: Tx,
		input: {
			item: DjenItem;
			caseId: string | null;
			cnjNumber: string | null;
			tribunal: string | undefined;
			availableAt: string;
			textPlain: string;
			excerpt: string;
		},
		counters: SyncCounters,
	) {
		const externalId = String(input.item.id);

		const [inserted] = await tx
			.insert(publications)
			.values({
				source: PUBLICATION_SOURCE,
				externalId,
				contentHash: contentHash({
					source: PUBLICATION_SOURCE,
					cnj: input.cnjNumber,
					availableAt: input.availableAt,
					text: input.textPlain,
				}),
				caseId: input.caseId,
				cnjNumber: input.cnjNumber,
				tribunal: input.tribunal,
				orgName: input.item.nomeOrgao,
				communicationType: input.item.tipoComunicacao,
				documentType: input.item.tipoDocumento,
				availableAt: input.availableAt,
				medium: input.item.meiocompleto,
				link: input.item.link,
				textHtml: input.item.texto,
				textPlain: input.textPlain,
				excerpt: input.excerpt,
				raw: input.item,
			})
			.onConflictDoNothing({ target: [publications.source, publications.externalId] })
			.returning({ id: publications.id });

		if (inserted) {
			counters.created += 1;

			return inserted.id;
		}

		counters.duplicated += 1;

		const [existing] = await tx
			.select({ id: publications.id })
			.from(publications)
			.where(
				and(eq(publications.source, PUBLICATION_SOURCE), eq(publications.externalId, externalId)),
			)
			.limit(1);

		if (!existing) {
			throw new Error(`Publicação ${externalId} conflitou mas não foi encontrada.`);
		}

		return existing.id;
	}

	private async enrich(lawyerId: string, runId: string, counters: SyncCounters, force: boolean) {
		const staleBefore = new Date(Date.now() - DATAJUD_FRESHNESS_MS);

		const targets = await this.db
			.select({ id: cases.id, cnjNumber: cases.cnjNumber, tribunal: cases.tribunal })
			.from(cases)
			.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
			.where(
				and(
					eq(caseLawyers.lawyerId, lawyerId),
					force
						? undefined
						: or(isNull(cases.datajudSyncedAt), lt(cases.datajudSyncedAt, staleBefore)),
				),
			);

		const queue = targets.slice();

		await Promise.all(
			Array.from({ length: Math.min(DATAJUD_CONCURRENCY, queue.length) }, () =>
				this.enrichQueue(queue, lawyerId, runId, counters),
			),
		);
	}

	private async enrichQueue(
		queue: EnrichmentTarget[],
		lawyerId: string,
		runId: string,
		counters: SyncCounters,
	) {
		for (let target = queue.shift(); target; target = queue.shift()) {
			await this.enrichCase(target, counters);

			syncRealtime.publish({
				...counters,
				lawyerId,
				runId,
				phase: "enriquecimento",
				errorMessage: null,
			});
		}
	}

	private async enrichCase(target: EnrichmentTarget, counters: SyncCounters) {
		try {
			const found = await this.datajud.findCase({
				cnjNumber: target.cnjNumber,
				tribunal: target.tribunal,
			});

			if (found.status !== "ok") {
				await this.db
					.update(cases)
					.set({ datajudStatus: found.status, datajudSyncedAt: new Date() })
					.where(eq(cases.id, target.id));

				return;
			}

			const created = await this.db.transaction(async (tx) => {
				await tx
					.update(cases)
					.set({
						className: sql`coalesce(${found.case.className}, ${cases.className})`,
						classCode: sql`coalesce(${found.case.classCode}, ${cases.classCode})`,
						grau: found.case.grau,
						orgJudgingName: found.case.orgJudgingName,
						orgJudgingCode: found.case.orgJudgingCode,
						subjects: found.case.subjects,
						systemName: found.case.systemName,
						filedAt: found.case.filedAt,
						secrecyLevel: found.case.secrecyLevel,
						datajudStatus: "ok",
						datajudSyncedAt: new Date(),
					})
					.where(eq(cases.id, target.id));

				return await this.insertDatajudMovements(tx, target.id, found.case.movements);
			});

			counters.movementsCreated += created;
			counters.casesEnriched += 1;
		} catch (error) {
			await this.db
				.update(cases)
				.set({ datajudStatus: "falhou" })
				.where(eq(cases.id, target.id))
				.catch((markError: unknown) => {
					console.error(
						`[sync] não foi possível marcar o processo ${target.cnjNumber} como falho`,
						markError,
					);
				});

			console.error(`[sync] falha ao enriquecer o processo ${target.cnjNumber}`, error);
		}
	}

	private async insertDatajudMovements(tx: Tx, caseId: string, incoming: DatajudMovement[]) {
		const seen = new Set<string>();
		const values: (typeof movements.$inferInsert)[] = [];

		let newest: Date | null = null;

		for (const movement of incoming) {
			const externalCode = String(movement.code);
			const key = `${externalCode}|${movement.occurredAt.toISOString()}`;

			if (seen.has(key)) {
				continue;
			}

			seen.add(key);

			if (!newest || movement.occurredAt > newest) {
				newest = movement.occurredAt;
			}

			values.push({
				caseId,
				occurredAt: movement.occurredAt,
				type: movement.name,
				summary: summarize(movementSummary(movement)),
				source: "datajud",
				externalCode,
				complements: movement.complements,
			});
		}

		if (!values.length) {
			return 0;
		}

		const inserted = await tx
			.insert(movements)
			.values(values)
			.onConflictDoNothing({
				target: [movements.caseId, movements.source, movements.externalCode, movements.occurredAt],
			})
			.returning({ id: movements.id });

		if (newest) {
			await tx
				.update(cases)
				.set({
					lastMovementAt: sql`greatest(${cases.lastMovementAt}, ${newest.toISOString()}::timestamptz)`,
				})
				.where(eq(cases.id, caseId));
		}

		return inserted.length;
	}
}
