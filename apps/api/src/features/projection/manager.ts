import { and, count, eq, exists, inArray, lt, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { caseLawyers } from "../../db/schema/case_lawyers.ts";
import { caseParties } from "../../db/schema/case_parties.ts";
import { cases } from "../../db/schema/cases.ts";
import { deadlines } from "../../db/schema/deadlines.ts";
import { djenCommunicationOabs } from "../../db/schema/djen_communication_oabs.ts";
import { djenCommunications } from "../../db/schema/djen_communications.ts";
import { lawyerOabs } from "../../db/schema/lawyer_oabs.ts";
import { lawyers } from "../../db/schema/lawyers.ts";
import { movements } from "../../db/schema/movements.ts";
import { publicationLinks } from "../../db/schema/publication_links.ts";
import { publications } from "../../db/schema/publications.ts";
import {
	CANCELED_PUBLICATION_WARNING,
	DJEN_PROJECTOR_VERSION,
	type DjenProjection,
	type ProjectedCase,
	projectDjenCommunication,
	PUBLICATION_SOURCE,
	RECTIFIED_PUBLICATION_WARNING,
} from "../djen/project.ts";

export const PROJECTION_BATCH_SIZE = 500;

type ProjectedOk = Extract<DjenProjection, { status: "ok" }>;

type RiteIdentity = Pick<
	typeof publications.$inferSelect,
	"orgName" | "className" | "documentType"
>;

interface PendingCommunication extends Record<string, unknown> {
	id: string;
	payload: unknown;
}

interface ProjectionEntry {
	communicationId: string;
	projection: ProjectedOk;
}

export interface OabSource {
	oabNumber: string;
	oabUf: string;
}

export interface ProjectionResult {
	projected: number;
	invalid: number;
	casesCreated: number;
	publicationIds: string[];
	caseIds: string[];
}

const CANCELED_WARNING_JSON = JSON.stringify([CANCELED_PUBLICATION_WARNING]);
const RECTIFIED_WARNING_JSON = JSON.stringify([RECTIFIED_PUBLICATION_WARNING]);

// O órgão, a classe e o tipo do documento são o que o mapa de cabimento lê para responder apelação em
// 15 dias ou recurso inominado em 10. Retificação é o tribunal trocar o que ele mesmo já tinha dito:
// campo que estava vazio e passou a vir preenchido é a projeção completando o registro, não um fato
// novo, e foi assim que `class_name` nasceu para a base inteira.
function rectifiedRite(
	before: RiteIdentity | undefined,
	after: { orgName: string | null; className: string | null; documentType: string | null },
) {
	if (!before) {
		return false;
	}

	return (
		(!!before.orgName && before.orgName !== after.orgName) ||
		(!!before.className && before.className !== after.className) ||
		(!!before.documentType && before.documentType !== after.documentType)
	);
}

function oabTuples(sources: OabSource[]) {
	return sql`select * from unnest(
		${sql.param(sources.map((source) => source.oabNumber))}::text[],
		${sql.param(sources.map((source) => source.oabUf))}::text[]
	)`;
}

function caseIdOf(entry: ProjectionEntry, caseIds: Map<string, string>) {
	const projected = entry.projection.case;

	if (!projected) {
		return null;
	}

	const caseId = caseIds.get(projected.cnjNumber);

	if (!caseId) {
		throw new Error(`O processo ${projected.cnjNumber} não voltou da gravação em lote.`);
	}

	return caseId;
}

function publicationIdOf(entry: ProjectionEntry, publicationIds: Map<string, string>) {
	const externalId = entry.projection.publication.externalId;
	const publicationId = publicationIds.get(externalId);

	if (!publicationId) {
		throw new Error(`A publicação ${externalId} não voltou da gravação em lote.`);
	}

	return publicationId;
}

function mergedCases(entries: ProjectionEntry[]) {
	const byCnj = new Map<string, ProjectedCase>();

	for (const entry of entries) {
		const projected = entry.projection.case;

		if (!projected) {
			continue;
		}

		const previous = byCnj.get(projected.cnjNumber);

		if (!previous) {
			byCnj.set(projected.cnjNumber, projected);
			continue;
		}

		byCnj.set(projected.cnjNumber, {
			...projected,
			lastMovementAt:
				previous.lastMovementAt > projected.lastMovementAt
					? previous.lastMovementAt
					: projected.lastMovementAt,
			parties: [...previous.parties, ...projected.parties],
		});
	}

	return [...byCnj.values()];
}

// A projeção é a única escritora das entidades de leitura: ela grava em lote e sempre reescreve o
// que o payload disser, porque publicação retificada ou cancelada volta pela fila.
export class ProjectionManager {
	constructor(private readonly db: Db | Tx) {}

	// A fila é das inscrições de quem está sincronizando: sem esse recorte os contadores creditam a
	// uma advogada o que veio da caixa de outra, e o lote é travado com `skip locked` para dois syncs
	// simultâneos não reescreverem as mesmas linhas.
	// O denominador da projeção é a fila que a etapa vai consumir, e ela é conhecida por inteiro antes
	// de começar: o mesmo recorte de inscrições e a mesma versão de projetor que `run` usa.
	async pending(sources: OabSource[]) {
		if (!sources.length) {
			return 0;
		}

		const [row] = await this.db
			.select({ total: count() })
			.from(djenCommunications)
			.where(
				and(
					lt(djenCommunications.projectorVersion, DJEN_PROJECTOR_VERSION),
					exists(
						this.db
							.select({ found: sql`1` })
							.from(djenCommunicationOabs)
							.where(
								and(
									eq(djenCommunicationOabs.communicationId, djenCommunications.id),
									sql`(${djenCommunicationOabs.oabNumber}, ${djenCommunicationOabs.oabUf}) in (${oabTuples(sources)})`,
								),
							),
					),
				),
			);

		return row?.total ?? 0;
	}

	async run(input: {
		sources: OabSource[];
		batchSize?: number;
		onProgress?: (done: number) => Promise<void>;
	}): Promise<ProjectionResult> {
		const batchSize = input.batchSize ?? PROJECTION_BATCH_SIZE;
		const publicationIds = new Set<string>();
		const caseIds = new Set<string>();

		let projected = 0;
		let invalid = 0;
		let casesCreated = 0;
		let done = 0;

		if (!input.sources.length) {
			return { projected, invalid, casesCreated, publicationIds: [], caseIds: [] };
		}

		for (;;) {
			const batch = await this.db.transaction(async (tx) => {
				const pending = await tx.execute<PendingCommunication>(sql`
					select ${djenCommunications.id} as id, ${djenCommunications.payload} as payload
					from ${djenCommunications}
					where ${djenCommunications.projectorVersion} < ${DJEN_PROJECTOR_VERSION}
						and exists (
							select 1
							from ${djenCommunicationOabs}
							where ${djenCommunicationOabs.communicationId} = ${djenCommunications.id}
								and (${djenCommunicationOabs.oabNumber}, ${djenCommunicationOabs.oabUf}) in (
									${oabTuples(input.sources)}
								)
						)
					order by ${djenCommunications.availableAt} desc nulls last
					limit ${batchSize}
					for update skip locked
				`);

				const rows = [...pending];

				if (!rows.length) {
					return null;
				}

				return { ...(await new ProjectionManager(tx).projectBatch(rows)), size: rows.length };
			});

			if (!batch) {
				break;
			}

			projected += batch.projected;
			invalid += batch.invalid;
			casesCreated += batch.casesCreated;
			done += batch.size;

			await input.onProgress?.(done);

			for (const id of batch.publicationIds) {
				publicationIds.add(id);
			}

			for (const id of batch.caseIds) {
				caseIds.add(id);
			}

			if (batch.size < batchSize) {
				break;
			}
		}

		return {
			projected,
			invalid,
			casesCreated,
			publicationIds: [...publicationIds],
			caseIds: [...caseIds],
		};
	}

	// Uma inscrição já coletada não volta a ser baixada, então quem passa a acompanhá-la depois
	// precisa herdar os vínculos do histórico que já está projetado. O anti-join devolve só o que
	// acabou de ganhar vínculo: é o recorte que o scan de prazos precisa e o que impede a
	// sincronização incremental de reinserir o histórico inteiro toda vez.
	async linkWatchers(sources: OabSource[]) {
		if (!sources.length) {
			return { publicationIds: [], caseIds: [] };
		}

		const linked = await this.db.execute<{ kind: string; id: string }>(sql`
			with watched as (
				select ${lawyers.id} as lawyer_id, ${lawyers.oabNumber} as oab_number, ${lawyers.oabUf} as oab_uf
				from ${lawyers}
				union
				select ${lawyerOabs.lawyerId}, ${lawyerOabs.oabNumber}, ${lawyerOabs.oabUf}
				from ${lawyerOabs}
			),
			reached as (
				select distinct ${publications.id} as publication_id, ${publications.caseId} as case_id, watched.lawyer_id
				from ${djenCommunicationOabs}
				inner join ${publications} on ${publications.sourceId} = ${djenCommunicationOabs.communicationId}
				inner join watched
					on watched.oab_number = ${djenCommunicationOabs.oabNumber}
					and watched.oab_uf = ${djenCommunicationOabs.oabUf}
				where (${djenCommunicationOabs.oabNumber}, ${djenCommunicationOabs.oabUf}) in (
					${oabTuples(sources)}
				)
			),
			linked as (
				insert into ${publicationLinks} (id, publication_id, lawyer_id)
				select gen_random_uuid(), reached.publication_id, reached.lawyer_id
				from reached
				where not exists (
					select 1 from ${publicationLinks}
					where ${publicationLinks.publicationId} = reached.publication_id
						and ${publicationLinks.lawyerId} = reached.lawyer_id
				)
				on conflict (publication_id, lawyer_id) do nothing
				returning publication_id
			),
			owned as (
				insert into ${caseLawyers} (id, case_id, lawyer_id)
				select distinct gen_random_uuid(), reached.case_id, reached.lawyer_id
				from reached
				where reached.case_id is not null
					and not exists (
						select 1 from ${caseLawyers}
						where ${caseLawyers.caseId} = reached.case_id
							and ${caseLawyers.lawyerId} = reached.lawyer_id
					)
				on conflict (case_id, lawyer_id) do nothing
				returning case_id
			)
			select 'publicacao' as kind, publication_id::text as id from linked
			union all
			select 'processo', case_id::text from owned
		`);

		const publicationIds = new Set<string>();
		const caseIds = new Set<string>();

		for (const row of linked) {
			(row.kind === "publicacao" ? publicationIds : caseIds).add(row.id);
		}

		return { publicationIds: [...publicationIds], caseIds: [...caseIds] };
	}

	private async projectBatch(pending: PendingCommunication[]) {
		const entries: ProjectionEntry[] = [];

		let invalid = 0;

		for (const row of pending) {
			const projection = projectDjenCommunication(row.payload);

			if (projection.status !== "ok") {
				invalid += 1;
				continue;
			}

			entries.push({ communicationId: row.id, projection });
		}

		const riteBefore = await this.riteBefore(entries);
		const casesByCnj = await this.upsertCases(entries);
		const publicationIds = await this.upsertPublications(entries, casesByCnj.ids);

		await this.linkLawyers(entries, casesByCnj.ids, publicationIds);
		await this.upsertMovements(entries, casesByCnj.ids, publicationIds);
		await this.flagCanceled(entries, publicationIds);
		await this.flagRectified(entries, publicationIds, riteBefore);

		await this.db
			.update(djenCommunications)
			.set({ projectedAt: new Date(), projectorVersion: DJEN_PROJECTOR_VERSION })
			.where(
				inArray(
					djenCommunications.id,
					pending.map((row) => row.id),
				),
			);

		return {
			projected: entries.length,
			invalid,
			casesCreated: casesByCnj.created,
			publicationIds: [...publicationIds.values()],
			caseIds: [...casesByCnj.ids.values()],
		};
	}

	// Lido antes da reescrita: depois do upsert não existe mais o que o tribunal tinha dito antes, e é a
	// comparação com aquilo que diz se houve retificação.
	private async riteBefore(entries: ProjectionEntry[]) {
		const externalIds = entries.map((entry) => entry.projection.publication.externalId);
		const before = new Map<string, RiteIdentity>();

		if (!externalIds.length) {
			return before;
		}

		const rows = await this.db
			.select({
				externalId: publications.externalId,
				orgName: publications.orgName,
				className: publications.className,
				documentType: publications.documentType,
			})
			.from(publications)
			.where(
				and(
					eq(publications.source, PUBLICATION_SOURCE),
					inArray(publications.externalId, externalIds),
				),
			);

		for (const { externalId, ...identity } of rows) {
			before.set(externalId, identity);
		}

		return before;
	}

	private async upsertCases(entries: ProjectionEntry[]) {
		const merged = mergedCases(entries);
		const ids = new Map<string, string>();

		if (!merged.length) {
			return { ids, created: 0 };
		}

		const rows = await this.db
			.insert(cases)
			.values(
				merged.map((projected) => ({
					cnjNumber: projected.cnjNumber,
					formattedNumber: projected.formattedNumber,
					tribunal: projected.tribunal,
					orgName: projected.orgName,
					className: projected.className,
					classCode: projected.classCode,
					lastMovementAt: projected.lastMovementAt,
				})),
			)
			.onConflictDoUpdate({
				target: cases.cnjNumber,
				set: {
					orgName: sql`coalesce(excluded.org_name, ${cases.orgName})`,
					className: sql`coalesce(excluded.class_name, ${cases.className})`,
					classCode: sql`coalesce(excluded.class_code, ${cases.classCode})`,
					lastMovementAt: sql`greatest(${cases.lastMovementAt}, excluded.last_movement_at)`,
				},
			})
			.returning({
				id: cases.id,
				cnjNumber: cases.cnjNumber,
				inserted: sql<boolean>`(xmax = 0)`,
			});

		let created = 0;

		for (const row of rows) {
			ids.set(row.cnjNumber, row.id);

			if (row.inserted) {
				created += 1;
			}
		}

		const parties: { caseId: string; name: string; polo: string | null }[] = [];

		for (const projected of merged) {
			const caseId = ids.get(projected.cnjNumber);

			if (!caseId) {
				throw new Error(`O processo ${projected.cnjNumber} não voltou da gravação em lote.`);
			}

			parties.push(...projected.parties.map((party) => ({ caseId, ...party })));
		}

		if (parties.length) {
			await this.db.insert(caseParties).values(parties).onConflictDoNothing();
		}

		return { ids, created };
	}

	private async upsertPublications(entries: ProjectionEntry[], caseIds: Map<string, string>) {
		const ids = new Map<string, string>();

		if (!entries.length) {
			return ids;
		}

		const rows = entries.map((entry) => ({
			...entry.projection.publication,
			sourceId: entry.communicationId,
			caseId: caseIdOf(entry, caseIds),
		}));

		const column = (pick: (row: (typeof rows)[number]) => string | null) =>
			sql`${sql.param(rows.map(pick))}::text[]`;

		const inserted = await this.db.execute<{ id: string; external_id: string }>(sql`
			insert into ${publications} (
				id, source, external_id, source_id, content_hash, case_id, cnj_number, tribunal,
				org_name, org_code, class_name, communication_type, document_type, communication_number,
				available_at, medium, link, text_html, text_plain, excerpt, active, status,
				cancel_reason, canceled_at, djen_hash, normalizer_version
			)
			select
				projected.id::uuid, projected.source, projected.external_id, projected.source_id::uuid,
				projected.content_hash, projected.case_id::uuid, projected.cnj_number, projected.tribunal,
				projected.org_name, projected.org_code, projected.class_name, projected.communication_type,
				projected.document_type, projected.communication_number, projected.available_at::date,
				projected.medium, projected.link, projected.text_html, projected.text_plain,
				projected.excerpt, projected.active::boolean, projected.status, projected.cancel_reason,
				projected.canceled_at::timestamptz, projected.djen_hash,
				projected.normalizer_version::integer
			from unnest(
				${column(() => crypto.randomUUID())},
				${column((row) => row.source)},
				${column((row) => row.externalId)},
				${column((row) => row.sourceId)},
				${column((row) => row.contentHash)},
				${column((row) => row.caseId)},
				${column((row) => row.cnjNumber)},
				${column((row) => row.tribunal)},
				${column((row) => row.orgName)},
				${column((row) => row.orgCode)},
				${column((row) => row.className)},
				${column((row) => row.communicationType)},
				${column((row) => row.documentType)},
				${column((row) => row.communicationNumber)},
				${column((row) => row.availableAt)},
				${column((row) => row.medium)},
				${column((row) => row.link)},
				${column((row) => row.textHtml)},
				${column((row) => row.textPlain)},
				${column((row) => row.excerpt)},
				${column((row) => String(row.active))},
				${column((row) => row.status)},
				${column((row) => row.cancelReason)},
				${column((row) => (row.canceledAt === null ? null : row.canceledAt.toISOString()))},
				${column((row) => row.djenHash)},
				${column((row) => String(row.normalizerVersion))}
			) as projected(
				id, source, external_id, source_id, content_hash, case_id, cnj_number, tribunal,
				org_name, org_code, class_name, communication_type, document_type, communication_number,
				available_at, medium, link, text_html, text_plain, excerpt, active, status,
				cancel_reason, canceled_at, djen_hash, normalizer_version
			)
			on conflict (source, external_id) do update set
				source_id = excluded.source_id,
				content_hash = excluded.content_hash,
				case_id = excluded.case_id,
				cnj_number = excluded.cnj_number,
				tribunal = excluded.tribunal,
				org_name = excluded.org_name,
				org_code = excluded.org_code,
				class_name = excluded.class_name,
				communication_type = excluded.communication_type,
				document_type = excluded.document_type,
				communication_number = excluded.communication_number,
				available_at = excluded.available_at,
				medium = excluded.medium,
				link = excluded.link,
				text_html = excluded.text_html,
				text_plain = excluded.text_plain,
				excerpt = excluded.excerpt,
				active = excluded.active,
				status = excluded.status,
				cancel_reason = excluded.cancel_reason,
				canceled_at = excluded.canceled_at,
				djen_hash = excluded.djen_hash,
				normalizer_version = excluded.normalizer_version,
				updated_at = now()
			returning id, external_id
		`);

		for (const row of inserted) {
			ids.set(row.external_id, row.id);
		}

		return ids;
	}

	private async watchersByCommunication(communicationIds: string[]) {
		const scope = inArray(djenCommunicationOabs.communicationId, communicationIds);

		const [own, watched] = await Promise.all([
			this.db
				.select({
					communicationId: djenCommunicationOabs.communicationId,
					lawyerId: lawyers.id,
				})
				.from(djenCommunicationOabs)
				.innerJoin(
					lawyers,
					and(
						eq(lawyers.oabNumber, djenCommunicationOabs.oabNumber),
						eq(lawyers.oabUf, djenCommunicationOabs.oabUf),
					),
				)
				.where(scope),
			this.db
				.select({
					communicationId: djenCommunicationOabs.communicationId,
					lawyerId: lawyerOabs.lawyerId,
				})
				.from(djenCommunicationOabs)
				.innerJoin(
					lawyerOabs,
					and(
						eq(lawyerOabs.oabNumber, djenCommunicationOabs.oabNumber),
						eq(lawyerOabs.oabUf, djenCommunicationOabs.oabUf),
					),
				)
				.where(scope),
		]);

		const byCommunication = new Map<string, Set<string>>();

		for (const row of [...own, ...watched]) {
			const list = byCommunication.get(row.communicationId) ?? new Set<string>();

			list.add(row.lawyerId);
			byCommunication.set(row.communicationId, list);
		}

		return byCommunication;
	}

	private async linkLawyers(
		entries: ProjectionEntry[],
		caseIds: Map<string, string>,
		publicationIds: Map<string, string>,
	) {
		if (!entries.length) {
			return;
		}

		const watchers = await this.watchersByCommunication(
			entries.map((entry) => entry.communicationId),
		);

		const links: { publicationId: string; lawyerId: string }[] = [];
		const owners: { caseId: string; lawyerId: string }[] = [];

		for (const entry of entries) {
			const publicationId = publicationIdOf(entry, publicationIds);
			const caseId = caseIdOf(entry, caseIds);

			for (const lawyerId of watchers.get(entry.communicationId) ?? []) {
				links.push({ publicationId, lawyerId });

				if (caseId) {
					owners.push({ caseId, lawyerId });
				}
			}
		}

		if (links.length) {
			await this.db.insert(publicationLinks).values(links).onConflictDoNothing();
		}

		if (owners.length) {
			await this.db.insert(caseLawyers).values(owners).onConflictDoNothing();
		}
	}

	private async upsertMovements(
		entries: ProjectionEntry[],
		caseIds: Map<string, string>,
		publicationIds: Map<string, string>,
	) {
		const values: (typeof movements.$inferInsert)[] = [];

		for (const entry of entries) {
			const projected = entry.projection.movement;
			const caseId = caseIdOf(entry, caseIds);

			if (!projected || !caseId) {
				continue;
			}

			values.push({
				caseId,
				publicationId: publicationIdOf(entry, publicationIds),
				occurredAt: projected.occurredAt,
				type: projected.type,
				summary: projected.summary,
				source: "publication",
			});
		}

		if (!values.length) {
			return;
		}

		// Retificação também reescreve a timeline: sem isso o movimento continua contando a versão do
		// fato que o tribunal já revogou.
		await this.db
			.insert(movements)
			.values(values)
			.onConflictDoUpdate({
				target: movements.publicationId,
				set: {
					occurredAt: sql`excluded.occurred_at`,
					type: sql`excluded.type`,
					summary: sql`excluded.summary`,
				},
			});
	}

	// O tribunal cancela e a advogada continua vendo a publicação: sumir com o que ela já leu é pior
	// do que mostrá-la marcada, e o prazo derivado fica pendente com o aviso até ela decidir.
	private async flagCanceled(entries: ProjectionEntry[], publicationIds: Map<string, string>) {
		const canceled: string[] = [];
		const restored: string[] = [];

		for (const entry of entries) {
			const publicationId = publicationIdOf(entry, publicationIds);

			(entry.projection.canceled ? canceled : restored).push(publicationId);
		}

		if (canceled.length) {
			await this.db
				.update(deadlines)
				.set({ warnings: sql`${deadlines.warnings} || ${CANCELED_WARNING_JSON}::jsonb` })
				.where(
					and(
						inArray(deadlines.publicationId, canceled),
						sql`not (${deadlines.warnings} @> ${CANCELED_WARNING_JSON}::jsonb)`,
					),
				);
		}

		if (restored.length) {
			await this.db
				.update(deadlines)
				.set({ warnings: sql`${deadlines.warnings} - ${CANCELED_PUBLICATION_WARNING}` })
				.where(
					and(
						inArray(deadlines.publicationId, restored),
						sql`${deadlines.warnings} @> ${CANCELED_WARNING_JSON}::jsonb`,
					),
				);
		}
	}

	// O prazo aberto pelo eixo Recorrer congelou a base legal e a contagem no dia em que a advogada
	// escolheu o recurso. Se o tribunal retifica o que elegeu aquele recurso, a resposta nova já sai
	// certa na tela do processo, mas o prazo que está na agenda dela continua sendo o antigo até ela
	// olhar. O prazo automático fica de fora porque a varredura o recalcula do texto e ele já sai com a
	// resposta nova. Diferente do cancelamento, que é estado e se desfaz, retificação é fato consumado:
	// o aviso fica.
	private async flagRectified(
		entries: ProjectionEntry[],
		publicationIds: Map<string, string>,
		before: Map<string, RiteIdentity>,
	) {
		const rectified = entries
			.filter((entry) =>
				rectifiedRite(
					before.get(entry.projection.publication.externalId),
					entry.projection.publication,
				),
			)
			.map((entry) => publicationIdOf(entry, publicationIds));

		if (!rectified.length) {
			return;
		}

		await this.db
			.update(deadlines)
			.set({ warnings: sql`${deadlines.warnings} || ${RECTIFIED_WARNING_JSON}::jsonb` })
			.where(
				and(
					inArray(deadlines.publicationId, rectified),
					eq(deadlines.origin, "manual"),
					sql`not (${deadlines.warnings} @> ${RECTIFIED_WARNING_JSON}::jsonb)`,
				),
			);
	}
}
