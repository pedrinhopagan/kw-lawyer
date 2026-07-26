import { ORPCError } from "@orpc/server";
import { and, desc, eq, gt, inArray, ne, notInArray, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseInstances } from "../../db/schema/case_instances.ts";
import { caseLawyers } from "../../db/schema/case_lawyers.ts";
import { type CaseDatajudStatus, cases } from "../../db/schema/cases.ts";
import { datajudDocuments } from "../../db/schema/datajud_documents.ts";
import { djenCommunicationOabs } from "../../db/schema/djen_communication_oabs.ts";
import { djenCommunications } from "../../db/schema/djen_communications.ts";
import { lawyers } from "../../db/schema/lawyers.ts";
import { movements } from "../../db/schema/movements.ts";
import { oabCollections } from "../../db/schema/oab_collections.ts";
import { publicationLinks } from "../../db/schema/publication_links.ts";
import { publications } from "../../db/schema/publications.ts";
import { syncRuns } from "../../db/schema/sync_runs.ts";
import { CaseAnalysisManager } from "../analysis/manager.ts";
import { DeadlineManager } from "../deadlines/manager.ts";
import { DATAJUD_BATCH_SIZE, DatajudClient, type DatajudDocument } from "../datajud/client.ts";
import { forensicToday } from "../deadlines/calendar.ts";
import { DjenClient, type DjenWindow } from "../djen/client.ts";
import { lowerGrau } from "../legal/grau.ts";
import { LawyerOabManager } from "../oabs/manager.ts";
import { ProjectionManager } from "../projection/manager.ts";
import { planCollectionWindows } from "./windows.ts";
import { summarize } from "../djen/normalize.ts";
import type { DjenItem } from "../djen/types.ts";
import {
	emptySyncCounters,
	type SyncCounters,
	type SyncPhase,
	syncProgressOf,
	syncRealtime,
} from "./realtime.ts";

// O run é órfão quando o batimento parou, não quando começou faz tempo: carga inicial passa dos
// quinze minutos com frequência, e derrubá-la por idade era o que colocava dois syncs para rodar
// em cima da mesma carteira.
export const ORPHAN_HEARTBEAT_MS = 5 * 60 * 1000;

// O progresso não bate durante as etapas longas: a varredura de prazos e a análise dos processos
// passam minutos sem nada a relatar, e um sync vivo seria declarado órfão no meio delas. O relógio
// bate sozinho e morre com o processo, que é o caso que a detecção de órfão existe para pegar.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

type DjenSource = Pick<DjenClient, "fetchAll">;
type DatajudSource = Pick<DatajudClient, "findCases">;
type DatajudMovement = DatajudDocument["movements"][number];

interface EnrichmentTarget {
	id: string;
	cnjNumber: string;
	tribunal: string;
	sourceUpdatedAt: Date | null;
	documentIds: string[];
}

function errorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
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
		const silentBefore = new Date(Date.now() - ORPHAN_HEARTBEAT_MS);

		return await this.db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lawyerId}))`);

			const [running] = await tx
				.select({ id: syncRuns.id })
				.from(syncRuns)
				.where(
					and(
						eq(syncRuns.lawyerId, lawyerId),
						eq(syncRuns.status, "em_execucao"),
						gt(syncRuns.heartbeatAt, silentBefore),
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
					phase: "falhou",
					finishedAt: new Date(),
					errorMessage: "Sincronização interrompida antes de terminar.",
				})
				.where(and(eq(syncRuns.lawyerId, lawyerId), eq(syncRuns.status, "em_execucao")));

			const [lawyer] = await tx
				.select({ firstSyncCompletedAt: lawyers.firstSyncCompletedAt })
				.from(lawyers)
				.where(eq(lawyers.id, lawyerId))
				.limit(1);

			if (!lawyer) {
				throw new ORPCError("NOT_FOUND", { message: "Advogado não encontrado." });
			}

			const [run] = await tx
				.insert(syncRuns)
				.values({
					lawyerId,
					status: "em_execucao",
					phase: "descoberta",
					kind: lawyer.firstSyncCompletedAt ? "incremental" : "inicial",
				})
				.returning({ id: syncRuns.id });

			if (!run) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Não foi possível abrir a sincronização.",
				});
			}

			await tx
				.update(lawyers)
				.set({ onboardingState: "sincronizando" })
				.where(and(eq(lawyers.id, lawyerId), ne(lawyers.onboardingState, "pronto")));

			return { runId: run.id, resumed: false };
		});
	}

	private beat(runId: string) {
		const timer = setInterval(() => {
			this.db
				.update(syncRuns)
				.set({ heartbeatAt: new Date() })
				.where(and(eq(syncRuns.id, runId), eq(syncRuns.status, "em_execucao")))
				.catch((error: unknown) => {
					console.error("[sync] falha ao registrar o batimento", error);
				});
		}, HEARTBEAT_INTERVAL_MS);

		timer.unref();

		return () => {
			clearInterval(timer);
		};
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
		const projection = new ProjectionManager(this.db);
		const stopBeating = this.beat(options.runId);

		try {
			const sources = await oabs.sources(lawyerId);
			const discovered = { total: 0 };

			for (const source of sources) {
				await this.discover({ id: lawyer.id, ...source }, options.runId, counters, discovered);
				await oabs.markSynced(lawyerId, source);
			}

			const pending = await projection.pending(sources);

			await this.report({
				runId: options.runId,
				phase: "projecao",
				counters,
				total: pending,
				done: 0,
			});

			const projected = await projection.run({
				sources,
				onProgress: async (done) => {
					await this.report({
						runId: options.runId,
						phase: "projecao",
						counters,
						total: pending,
						done,
					});
				},
			});

			counters.casesCreated += projected.casesCreated;
			counters.invalid += projected.invalid;

			// O vínculo recém-criado é o que faltava para a segunda advogada ter prazo: a publicação já
			// está projetada e varrida, então só um scan forçado sobre o que acabou de ganhar vínculo
			// cria a linha de `deadlines` dela.
			const linked = await projection.linkWatchers(sources);

			await this.lowerHistoryCutoff(lawyerId);

			// Conclusão, suspensão e baixa definitiva chegam como movimento do DataJud, sem publicação
			// nenhuma. Classificar só o que veio do DJEN deixaria o processo baixado marcado como em
			// tramitação para sempre, morando no radar de parados e pesando errado na ordenação.
			const enriched = await this.enrich(lawyerId, options.runId, counters, options.force);

			const publicationIds = [...new Set([...projected.publicationIds, ...linked.publicationIds])];
			const caseIds = [...new Set([...projected.caseIds, ...linked.caseIds, ...enriched])];

			await this.classify(options.runId, counters, {
				publicationIds,
				caseIds,
				lawyerId,
				touched: enriched,
			});
		} catch (error) {
			return await this.finish(lawyerId, options.runId, counters, errorMessage(error));
		} finally {
			stopBeating();
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

	// O último run gravado é a resposta completa: quem abre o painel no meio da coleta recebe o estado
	// atual antes do próximo evento, e é isso que faz o F5 e a segunda réplica contarem a mesma coisa.
	async progress(lawyerId: string) {
		const [run] = await this.db
			.select()
			.from(syncRuns)
			.where(eq(syncRuns.lawyerId, lawyerId))
			.orderBy(desc(syncRuns.startedAt))
			.limit(1);

		if (!run) {
			return null;
		}

		return syncProgressOf(run);
	}

	async *events(lawyerId: string, signal?: AbortSignal) {
		const live = syncRealtime.live({
			signal,
			filter: (event) => event.lawyerId === lawyerId,
			getSnapshot: () => this.progress(lawyerId),
			select: (event) => event,
		});

		for await (const progress of live) {
			if (!progress) {
				continue;
			}

			yield progress;
		}
	}

	private async classify(
		runId: string,
		counters: SyncCounters,
		targets: { publicationIds: string[]; caseIds: string[]; lawyerId: string; touched: string[] },
	) {
		const total = targets.publicationIds.length + targets.caseIds.length;

		await this.report({ runId, phase: "classificacao", counters, total, done: 0 });

		if (targets.publicationIds.length) {
			await new DeadlineManager(this.db).scan({
				publicationIds: targets.publicationIds,
				force: true,
				onProgress: async (done) => {
					await this.report({ runId, phase: "classificacao", counters, total, done });
				},
			});
		}

		await this.report({
			runId,
			phase: "classificacao",
			counters,
			total,
			done: targets.publicationIds.length,
		});

		// O eixo de estado varre a carteira inteira e não a lista: processo que só o DataJud mexeu, e
		// processo que nunca foi classificado, não aparecem em lista nenhuma vinda do DJEN.
		await new CaseAnalysisManager(this.db).scan({
			caseIds: targets.caseIds,
			lawyerId: targets.lawyerId,
			touched: targets.touched,
		});

		await this.report({ runId, phase: "classificacao", counters, total, done: total });
	}

	// Grava e transmite o mesmo objeto: o evento é a linha que acabou de ser escrita, nunca uma cópia
	// montada à parte. O batimento anda junto, então progresso e sinal de vida são a mesma escrita.
	private async report(input: {
		runId: string;
		phase: SyncPhase;
		counters: SyncCounters;
		total: number;
		done: number;
	}) {
		const [run] = await this.db
			.update(syncRuns)
			.set({
				...input.counters,
				phase: input.phase,
				stepTotal: input.total,
				stepDone: input.done,
				heartbeatAt: new Date(),
			})
			.where(and(eq(syncRuns.id, input.runId), eq(syncRuns.status, "em_execucao")))
			.returning();

		// Run substituído por outro não volta a mandar no painel: quem manda é quem está em execução.
		if (!run) {
			return;
		}

		syncRealtime.publish(syncProgressOf(run));
	}

	private async finish(
		lawyerId: string,
		runId: string,
		counters: SyncCounters,
		failure: string | null,
	) {
		const status = failure ? ("falhou" as const) : ("concluida" as const);

		const [run] = await this.db
			.update(syncRuns)
			.set({
				...counters,
				status,
				phase: status,
				finishedAt: new Date(),
				heartbeatAt: new Date(),
				errorMessage: failure,
			})
			.where(and(eq(syncRuns.id, runId), eq(syncRuns.status, "em_execucao")))
			.returning();

		if (!run) {
			return { runId, status, ...counters };
		}

		await this.markOnboarding(lawyerId, failure);

		syncRealtime.publish(syncProgressOf(run));

		return { runId, status, ...counters };
	}

	// "pronto" é terminal: quem já tem o painel montado não volta para o onboarding porque um sync
	// incremental falhou.
	private async markOnboarding(lawyerId: string, failure: string | null) {
		if (failure) {
			await this.db
				.update(lawyers)
				.set({ onboardingState: "falhou" })
				.where(and(eq(lawyers.id, lawyerId), ne(lawyers.onboardingState, "pronto")));

			return;
		}

		await this.db
			.update(lawyers)
			.set({
				onboardingState: "pronto",
				firstSyncCompletedAt: sql`coalesce(${lawyers.firstSyncCompletedAt}, now())`,
			})
			.where(eq(lawyers.id, lawyerId));
	}

	// A descoberta conta em vez de fracionar. O tamanho de cada janela só existe depois de abri-la, e
	// o histórico inteiro são dezenas delas: prometer fração faria a barra encher e recuar uma vez por
	// janela, e passar de 100% no dia saturado, cujo tamanho o próprio governo não sabe dizer. O total
	// verdadeiro entra no fim, quando `fetchAll` devolve o que deu para contar.
	private async discover(
		lawyer: { id: string; oabNumber: string; oabUf: string },
		runId: string,
		counters: SyncCounters,
		discovered: { total: number },
	) {
		const source = { oabNumber: lawyer.oabNumber, oabUf: lawyer.oabUf };
		const windows = planCollectionWindows({
			mark: await this.collectionMark(source),
			today: forensicToday(),
		});
		await this.report({
			runId,
			phase: "descoberta",
			counters,
			total: 0,
			done: counters.fetched,
		});

		for (const window of windows) {
			const totals = await this.djen.fetchAll({ ...source, window }, async (page) => {
				counters.fetched += page.items.length + page.invalid;
				counters.invalid += page.invalid;

				await this.db.transaction(async (tx) => {
					await this.land(tx, source, runId, page.items, counters);
				});

				await this.report({
					runId,
					phase: "descoberta",
					counters,
					total: 0,
					done: counters.fetched,
				});
			});

			discovered.total += totals.counted;

			await this.markCollected(source, window, runId);
		}

		await this.report({
			runId,
			phase: "descoberta",
			counters,
			total: discovered.total,
			done: counters.fetched,
		});
	}

	private async collectionMark(source: { oabNumber: string; oabUf: string }) {
		const [mark] = await this.db
			.select({
				collectedFrom: oabCollections.collectedFrom,
				collectedThrough: oabCollections.collectedThrough,
			})
			.from(oabCollections)
			.where(
				and(eq(oabCollections.oabNumber, source.oabNumber), eq(oabCollections.oabUf, source.oabUf)),
			)
			.limit(1);

		return mark;
	}

	// A marca avança por janela concluída, e não no fim do sync: interrompido no meio, o próximo run
	// retoma de onde parou em vez de recomeçar o histórico inteiro.
	private async markCollected(
		source: { oabNumber: string; oabUf: string },
		window: DjenWindow,
		runId: string,
	) {
		await this.db
			.insert(oabCollections)
			.values({
				oabNumber: source.oabNumber,
				oabUf: source.oabUf,
				collectedFrom: window.from,
				collectedThrough: window.through,
				lastRunId: runId,
			})
			.onConflictDoUpdate({
				target: [oabCollections.oabNumber, oabCollections.oabUf],
				set: {
					collectedFrom: sql`least(${oabCollections.collectedFrom}, excluded.collected_from)`,
					collectedThrough: sql`greatest(${oabCollections.collectedThrough}, excluded.collected_through)`,
					lastRunId: sql`excluded.last_run_id`,
					updatedAt: new Date(),
				},
			});
	}

	// O corte do histórico é o mais antigo que já foi coletado para ela. Enquanto o sync ainda desce
	// no tempo, a caixa acompanha o que chegou em vez de esperar o fim para deixar de mostrar 30 dias.
	private async lowerHistoryCutoff(lawyerId: string) {
		await this.db
			.update(lawyers)
			.set({
				historyCutoffAt: sql`least(${lawyers.historyCutoffAt}, (
					select min(${publications.availableAt})
					from ${publications}
					inner join ${publicationLinks} on ${publicationLinks.publicationId} = ${publications.id}
					where ${publicationLinks.lawyerId} = ${lawyerId}
				))`,
			})
			.where(eq(lawyers.id, lawyerId));
	}

	// A ingestão só aterrissa o cru: normalizar aqui é o que impedia publicação retificada ou
	// cancelada de entrar e obrigava a rebaixar tudo do governo para corrigir o normalizador.
	private async land(
		tx: Tx,
		source: { oabNumber: string; oabUf: string },
		runId: string,
		items: DjenItem[],
		counters: SyncCounters,
	) {
		// O DJEN repete a mesma comunicação dentro de uma página, e o `do update` recusa tocar a mesma
		// linha duas vezes no mesmo comando: sem colapsar aqui, uma página repetida derruba o sync
		// inteiro. Vence a última entrega, que é a versão mais recente do item.
		const landing = new Map<string, { availableAt: string | null; payload: string }>();

		for (const item of items) {
			const availableAt = item.data_disponibilizacao.slice(0, 10);

			// A data só existe aqui para ordenar a fila de projeção: formato inesperado aterrissa
			// mesmo assim, e quem recusa a comunicação é a projeção, que sabe dizer o porquê.
			landing.set(String(item.id), {
				availableAt: DATE_ONLY_PATTERN.test(availableAt) ? availableAt : null,
				payload: JSON.stringify(item),
			});
		}

		if (!landing.size) {
			return;
		}

		const rows = [...landing.entries()].map(([externalId, row]) => ({ externalId, ...row }));
		const externalIds = rows.map((row) => row.externalId);

		// Hash igual não escreve nada; hash diferente devolve a comunicação para a fila de projeção.
		const changed = await tx.execute<{ inserted: boolean }>(sql`
			insert into ${djenCommunications} (
				id, external_id, available_at, payload, payload_hash, fetched_at, run_id
			)
			select gen_random_uuid(), landed.external_id, landed.available_at::date, landed.payload,
				md5(landed.payload::text), now(), ${runId}::uuid
			from unnest(
				${sql.param(externalIds)}::text[],
				${sql.param(rows.map((row) => row.availableAt))}::text[],
				${sql.param(rows.map((row) => row.payload))}::jsonb[]
			) as landed(external_id, available_at, payload)
			on conflict (external_id) do update set
				available_at = excluded.available_at,
				payload = excluded.payload,
				payload_hash = excluded.payload_hash,
				fetched_at = excluded.fetched_at,
				run_id = excluded.run_id,
				projected_at = null,
				projector_version = 0
			where ${djenCommunications.payloadHash} is distinct from excluded.payload_hash
			returning (xmax = 0) as inserted
		`);

		const written = [...changed];
		const created = written.filter((row) => row.inserted).length;

		// Retificada não é duplicada: o hash mudou, a comunicação foi reescrita e volta para a fila.
		counters.created += created;
		counters.updated += written.length - created;
		counters.duplicated += items.length - written.length;

		// O vínculo nasce da inscrição, não de quem coletou: a segunda advogada a acompanhar a mesma
		// OAB não refaz a coleta e ainda assim precisa herdar o histórico inteiro.
		await tx.execute(sql`
			insert into ${djenCommunicationOabs} (id, communication_id, oab_number, oab_uf)
			select gen_random_uuid(), ${djenCommunications.id}, ${source.oabNumber}, ${source.oabUf}
			from ${djenCommunications}
			where ${djenCommunications.externalId} = any(${sql.param(externalIds)}::text[])
			on conflict (communication_id, oab_number, oab_uf) do nothing
		`);
	}

	// O alvo do enriquecimento é o processo cujo conteúdo mudou na fonte, e isso só se sabe depois de
	// buscar: como o lote traz o documento inteiro, três buscas que não escrevem nada saem muito mais
	// barato do que trezentas buscas por relógio.
	private async enrich(lawyerId: string, runId: string, counters: SyncCounters, force: boolean) {
		const targets = await this.db
			.select({
				id: cases.id,
				cnjNumber: cases.cnjNumber,
				tribunal: cases.tribunal,
				sourceUpdatedAt: cases.datajudSourceUpdatedAt,
				// A marca d'água por carimbo não enxerga documento novo com data antiga, que é como o
				// tribunal cria a instância recursal: o conjunto de documentos gravados completa a marca.
				documentIds: sql<string[]>`coalesce((
					select array_agg(${datajudDocuments.documentId})
					from ${datajudDocuments}
					where ${datajudDocuments.caseId} = ${cases.id}
				), '{}')`,
			})
			.from(cases)
			.innerJoin(caseLawyers, eq(caseLawyers.caseId, cases.id))
			.where(eq(caseLawyers.lawyerId, lawyerId));

		const byTribunal = new Map<string, EnrichmentTarget[]>();

		for (const target of targets) {
			const tribunal = byTribunal.get(target.tribunal) ?? [];

			tribunal.push(target);
			byTribunal.set(target.tribunal, tribunal);
		}

		const touched: string[] = [];
		let done = 0;

		await this.report({
			runId,
			phase: "enriquecimento",
			counters,
			total: targets.length,
			done,
		});

		for (const [tribunal, tribunalTargets] of byTribunal) {
			for (let start = 0; start < tribunalTargets.length; start += DATAJUD_BATCH_SIZE) {
				const batch = tribunalTargets.slice(start, start + DATAJUD_BATCH_SIZE);

				touched.push(...(await this.enrichBatch(tribunal, batch, counters, force)));

				done += batch.length;

				await this.report({
					runId,
					phase: "enriquecimento",
					counters,
					total: targets.length,
					done,
				});
			}
		}

		return touched;
	}

	private async enrichBatch(
		tribunal: string,
		batch: EnrichmentTarget[],
		counters: SyncCounters,
		force: boolean,
	) {
		const found = await this.datajud
			.findCases({ tribunal, cnjNumbers: batch.map((target) => target.cnjNumber) })
			.catch((error: unknown) => {
				console.error(`[sync] falha ao consultar o lote de processos do ${tribunal}`, error);

				return null;
			});

		if (!found) {
			await this.markFailure(batch);

			return [];
		}

		if (found.status !== "ok") {
			await this.markStatus(batch, found.status);

			return [];
		}

		const byCnj = new Map<string, DatajudDocument[]>();

		for (const document of found.documents) {
			const documents = byCnj.get(document.cnjNumber) ?? [];

			documents.push(document);
			byCnj.set(document.cnjNumber, documents);
		}

		// O lote responde por muitos processos, e a gravação de um não pode levar os outros junto: o
		// processo que falhar fica marcado e a fila do tribunal segue.
		const unchanged: EnrichmentTarget[] = [];
		const missing: EnrichmentTarget[] = [];
		const touched: string[] = [];

		for (const target of batch) {
			const outcome = await this.enrichCase(
				target,
				found.alias,
				byCnj.get(target.cnjNumber) ?? [],
				counters,
				force,
			).catch(async (error: unknown) => {
				console.error(`[sync] falha ao enriquecer o processo ${target.cnjNumber}`, error);

				await this.markFailure([target]);

				return "falhou" as const;
			});

			if (outcome === "inalterado") {
				unchanged.push(target);
			}

			if (outcome === "sem_registro") {
				missing.push(target);
			}

			if (outcome === "enriquecido") {
				touched.push(target.id);
			}
		}

		// A marcação sai por lote: o caminho sem novidade é o caso comum de quem tem milhares de
		// processos parados, e uma UPDATE por processo seria uma ida ao banco por processo a cada ciclo.
		if (unchanged.length) {
			await this.markStatus(unchanged, "ok");
		}

		if (missing.length) {
			await this.markStatus(missing, "sem_registro");
		}

		return touched;
	}

	private async enrichCase(
		target: EnrichmentTarget,
		alias: string,
		documents: DatajudDocument[],
		counters: SyncCounters,
		force: boolean,
	) {
		// A classe e os assuntos do processo vêm da instância de origem, que é a primeira da ordem
		// estável do lote: eleger o documento por chegada era o que fazia o mesmo processo mudar de
		// classe entre duas execuções.
		const [origin] = documents;

		if (!origin) {
			return "sem_registro" as const;
		}

		const sourceUpdatedAt = documents.reduce<Date | null>((newest, document) => {
			if (!document.sourceUpdatedAt || (newest && newest >= document.sourceUpdatedAt)) {
				return newest;
			}

			return document.sourceUpdatedAt;
		}, null);

		const stored = new Set(target.documentIds);
		const sameDocuments =
			documents.length === stored.size &&
			documents.every((document) => stored.has(document.documentId));

		const unchanged =
			sameDocuments &&
			!!sourceUpdatedAt &&
			!!target.sourceUpdatedAt &&
			sourceUpdatedAt <= target.sourceUpdatedAt;

		// Processo verificado hoje e sem novidade continua verificado hoje: quando a checagem não era
		// registrada, o processo ficava preso no último erro e sumia do radar de silêncio para sempre.
		if (unchanged && !force) {
			return "inalterado" as const;
		}

		const created = await this.db.transaction(async (tx) => {
			await tx
				.update(cases)
				.set({
					className: sql`coalesce(${origin.className}, ${cases.className})`,
					classCode: sql`coalesce(${origin.classCode}, ${cases.classCode})`,
					subjects: origin.subjects,
					datajudStatus: "ok",
					datajudSyncedAt: new Date(),
					datajudSourceUpdatedAt: sourceUpdatedAt,
				})
				.where(eq(cases.id, target.id));

			for (const document of documents) {
				await this.writeInstance(tx, target.id, alias, document);
			}

			// Os movimentos são gravados depois dos documentos todos, e não um documento por vez: o mesmo
			// movimento vem repetido em duas instâncias e é aqui que se decide de qual grau ele é.
			const movementsCreated = await this.insertDatajudMovements(tx, target.id, documents);

			await this.dropMissing(tx, target.id, documents);

			return movementsCreated;
		});

		counters.movementsCreated += created;
		counters.casesEnriched += 1;

		return "enriquecido" as const;
	}

	// `datajudSyncedAt` responde "quando eu chequei" e só avança quando a fonte respondeu alguma coisa:
	// a marca do que mudou é `datajudSourceUpdatedAt`, e misturar as duas fazia o processo parado há
	// meses aparecer como se nunca tivesse sido consultado.
	private async markStatus(targets: EnrichmentTarget[], status: CaseDatajudStatus) {
		await this.db
			.update(cases)
			.set({ datajudStatus: status, datajudSyncedAt: new Date() })
			.where(
				inArray(
					cases.id,
					targets.map((target) => target.id),
				),
			)
			.catch((error: unknown) => {
				console.error(`[sync] não foi possível marcar os processos como ${status}`, error);
			});
	}

	// A indisponibilidade é do tribunal, não do processo: rebaixar para "falhou" quem já tem conteúdo
	// gravado tiraria o lote inteiro do radar de silêncio, e o relógio automático nunca desfaria isso.
	// Quem nunca foi coberto muda de estado; os outros ficam com a última consulta que deu resposta.
	private async markFailure(targets: EnrichmentTarget[]) {
		await this.db
			.update(cases)
			.set({
				datajudStatus: sql`case when ${cases.datajudSourceUpdatedAt} is null then 'falhou' else ${cases.datajudStatus} end`,
			})
			.where(
				inArray(
					cases.id,
					targets.map((target) => target.id),
				),
			)
			.catch((error: unknown) => {
				console.error("[sync] não foi possível registrar a falha de consulta dos processos", error);
			});
	}

	// A fonte reindexa, redistribui e corrige documento espúrio. Sem apagar o que sumiu do lote, um
	// documento de juizado que o tribunal já retirou continuaria ditando o rito recursal para sempre.
	private async dropMissing(tx: Tx, caseId: string, documents: DatajudDocument[]) {
		await tx.delete(datajudDocuments).where(
			and(
				eq(datajudDocuments.caseId, caseId),
				notInArray(
					datajudDocuments.documentId,
					documents.map((document) => document.documentId),
				),
			),
		);

		const graus = documents.flatMap((document) => document.grau ?? []);

		if (!graus.length) {
			return;
		}

		await tx
			.delete(caseInstances)
			.where(and(eq(caseInstances.caseId, caseId), notInArray(caseInstances.grau, graus)));

		// O movimento sobrevive à retirada do documento, porque é dele que penduram a decisão e a
		// correção que a advogada fez. O que não sobrevive é o grau: apagar a instância e deixar o
		// movimento apontando para ela mantinha o rito do juizado retirado ditando o prazo para sempre.
		await tx
			.update(movements)
			.set({ grau: null })
			.where(and(eq(movements.caseId, caseId), notInArray(movements.grau, graus)));
	}

	private async writeInstance(tx: Tx, caseId: string, alias: string, document: DatajudDocument) {
		const [stored] = await tx
			.insert(datajudDocuments)
			.values({
				caseId,
				tribunalAlias: alias,
				documentId: document.documentId,
				source: document.source,
				sourceUpdatedAt: document.sourceUpdatedAt,
				fetchedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [datajudDocuments.tribunalAlias, datajudDocuments.documentId],
				set: {
					caseId: sql`excluded.case_id`,
					source: sql`excluded.source`,
					sourceUpdatedAt: sql`excluded.source_updated_at`,
					fetchedAt: sql`excluded.fetched_at`,
				},
			})
			.returning({ id: datajudDocuments.id });

		// Sem grau não há instância para chavear: o documento fica gravado inteiro e a instância espera
		// a fonte dizer de qual grau ele é.
		if (!document.grau || !stored) {
			return;
		}

		await tx
			.insert(caseInstances)
			.values({
				caseId,
				grau: document.grau,
				orgJudgingName: document.orgJudgingName,
				orgJudgingCode: document.orgJudgingCode,
				systemName: document.systemName,
				formatName: document.formatName,
				filedAt: document.filedAt,
				secrecyLevel: document.secrecyLevel,
				datajudDocumentId: stored.id,
				sourceUpdatedAt: document.sourceUpdatedAt,
			})
			.onConflictDoUpdate({
				target: [caseInstances.caseId, caseInstances.grau],
				set: {
					orgJudgingName: sql`excluded.org_judging_name`,
					orgJudgingCode: sql`excluded.org_judging_code`,
					systemName: sql`excluded.system_name`,
					formatName: sql`excluded.format_name`,
					filedAt: sql`excluded.filed_at`,
					secrecyLevel: sql`excluded.secrecy_level`,
					datajudDocumentId: sql`excluded.datajud_document_id`,
					sourceUpdatedAt: sql`excluded.source_updated_at`,
					updatedAt: new Date(),
				},
			});
	}

	private async insertDatajudMovements(tx: Tx, caseId: string, documents: DatajudDocument[]) {
		const byKey = new Map<string, typeof movements.$inferInsert>();

		let newest: Date | null = null;

		for (const document of documents) {
			for (const movement of document.movements) {
				const externalCode = String(movement.code);
				const key = `${externalCode}|${movement.occurredAt.toISOString()}`;
				const previous = byKey.get(key);
				const grau = lowerGrau(previous?.grau, document.grau);

				if (previous && grau !== document.grau) {
					continue;
				}

				if (!newest || movement.occurredAt > newest) {
					newest = movement.occurredAt;
				}

				byKey.set(key, {
					caseId,
					occurredAt: movement.occurredAt,
					type: movement.name,
					summary: summarize(movementSummary(movement)),
					source: "datajud",
					grau,
					externalCode,
					complements: movement.complements,
				});
			}
		}

		const values = [...byKey.values()];

		if (!values.length) {
			return 0;
		}

		// O grau do movimento é retratável: ele veio de um documento que o tribunal reindexa, redistribui
		// e retira. A fonte corrige o que já está gravado, mas documento que não declarou grau nenhum não
		// apaga o que outro já disse.
		const written = await tx
			.insert(movements)
			.values(values)
			.onConflictDoUpdate({
				target: [movements.caseId, movements.source, movements.externalCode, movements.occurredAt],
				set: { grau: sql`coalesce(excluded.grau, ${movements.grau})` },
			})
			.returning({ id: movements.id, inserted: sql<boolean>`(xmax = 0)` });

		if (newest) {
			await tx
				.update(cases)
				.set({
					lastMovementAt: sql`greatest(${cases.lastMovementAt}, ${newest.toISOString()}::timestamptz)`,
				})
				.where(eq(cases.id, caseId));
		}

		return written.filter((row) => row.inserted).length;
	}
}
