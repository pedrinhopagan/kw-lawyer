import { type } from "arktype";
import type { CaseSubject } from "../../db/schema/cases.ts";
import type { MovementComplement } from "../../db/schema/movements.ts";
import { env } from "../../env.ts";
import { grauRank } from "../legal/grau.ts";
import { parseAjuizamento, parseInstant, toCodeText, toLabel } from "./normalize.ts";
import { datajudResponseSchema, type DatajudMovimento, datajudSourceSchema } from "./types.ts";

export const DATAJUD_BATCH_SIZE = 100;

// Um CNJ pode ter um documento por instância, então o teto de hits não pode ser a quantidade de
// números pedidos: seria a segunda instância do último processo do lote que ficaria de fora.
const DATAJUD_DOCUMENTS_PER_CASE = 5;
const DATAJUD_MAX_DOCUMENTS = 1_000;
const DATAJUD_DEFAULT_TIMEOUT_MS = 30_000;
const DATAJUD_DEFAULT_MAX_ATTEMPTS = 4;
const DATAJUD_DEFAULT_RETRY_DELAY_MS = 1_500;
const DATAJUD_MAX_RETRY_DELAY_MS = 30_000;
const DATAJUD_RATE_LIMIT_STATUS = 429;

const DATAJUD_UFS = [
	"ac",
	"al",
	"am",
	"ap",
	"ba",
	"ce",
	"df",
	"es",
	"go",
	"ma",
	"mg",
	"ms",
	"mt",
	"pa",
	"pb",
	"pe",
	"pi",
	"pr",
	"rj",
	"rn",
	"ro",
	"rr",
	"rs",
	"sc",
	"se",
	"sp",
	"to",
];

const DATAJUD_ALIASES = new Set([
	"tst",
	"tse",
	"stj",
	"stm",
	"tjmmg",
	"tjmrs",
	"tjmsp",
	...Array.from({ length: 6 }, (_, index) => `trf${index + 1}`),
	...Array.from({ length: 24 }, (_, index) => `trt${index + 1}`),
	...DATAJUD_UFS.map((uf) => (uf === "df" ? "tjdft" : `tj${uf}`)),
	...DATAJUD_UFS.map((uf) => `tre-${uf}`),
]);

interface DatajudClientOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
	maxAttempts?: number;
	retryDelayMs?: number;
}

interface DatajudMovement {
	code: number;
	name: string;
	occurredAt: Date;
	complements: MovementComplement[];
}

export interface DatajudDocument {
	documentId: string;
	cnjNumber: string;
	grau: string | null;
	sourceUpdatedAt: Date | null;
	className: string | null;
	classCode: string | null;
	orgJudgingName: string | null;
	orgJudgingCode: string | null;
	subjects: CaseSubject[];
	systemName: string | null;
	formatName: string | null;
	filedAt: Date | null;
	secrecyLevel: number | null;
	movements: DatajudMovement[];
	source: unknown;
}

export type DatajudBatch =
	| { status: "ok"; alias: string; documents: DatajudDocument[] }
	| { status: "tribunal_nao_suportado" };

type DatajudRequest =
	| { ok: true; payload: unknown }
	| { ok: false; message: string; retryable: boolean; waitMs: number | null };

function datajudAlias(tribunal: string) {
	const sigla = tribunal
		.trim()
		.toLowerCase()
		.replaceAll(/[^a-z0-9]/gu, "");

	if (DATAJUD_ALIASES.has(sigla)) {
		return sigla;
	}

	const eleitoral = sigla.replace(/^tre([a-z]{2})$/u, "tre-$1");

	if (DATAJUD_ALIASES.has(eleitoral)) {
		return eleitoral;
	}

	return null;
}

function waitFromRateLimit(response: Response) {
	const retryAfterSeconds = Number(response.headers.get("retry-after"));

	if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
		return retryAfterSeconds * 1000;
	}

	return null;
}

function toMovement(movimento: DatajudMovimento): DatajudMovement | null {
	const occurredAt = parseInstant(movimento.dataHora);

	if (movimento.codigo === null || !occurredAt) {
		return null;
	}

	return {
		code: movimento.codigo,
		name: toLabel(movimento.nome) ?? `Movimento ${movimento.codigo}`,
		occurredAt,
		complements: (movimento.complementosTabelados ?? []).map((complemento) => ({
			codigo: complemento.codigo,
			valor: complemento.valor,
			nome: toLabel(complemento.nome),
			descricao: toLabel(complemento.descricao),
		})),
	};
}

function toDocument(hit: { documentId: string | null; source?: unknown }): DatajudDocument {
	const source = datajudSourceSchema(hit.source);

	if (source instanceof type.errors) {
		throw new TypeError(`Processo do DataJud em formato inesperado: ${source.summary}`);
	}

	const documentId = toCodeText(source.id) ?? toLabel(hit.documentId);
	const cnjNumber = toLabel(source.numeroProcesso);

	if (!documentId || !cnjNumber) {
		throw new TypeError("Processo do DataJud veio sem identificador ou sem número do processo.");
	}

	return {
		documentId,
		cnjNumber,
		grau: toLabel(source.grau),
		sourceUpdatedAt: parseInstant(source.dataHoraUltimaAtualizacao),
		className: toLabel(source.classe?.nome),
		classCode: toCodeText(source.classe?.codigo),
		orgJudgingName: toLabel(source.orgaoJulgador?.nome),
		orgJudgingCode: toCodeText(source.orgaoJulgador?.codigo),
		subjects: (source.assuntos ?? []).map((assunto) => ({
			codigo: assunto.codigo,
			nome: toLabel(assunto.nome),
		})),
		systemName: toLabel(source.sistema?.nome),
		formatName: toLabel(source.formato?.nome),
		filedAt: parseAjuizamento(source.dataAjuizamento),
		secrecyLevel: source.nivelSigilo,
		movements: (source.movimentos ?? []).map(toMovement).filter((movement) => movement !== null),
		source: hit.source,
	};
}

export class DatajudClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly timeoutMs: number;
	private readonly maxAttempts: number;
	private readonly retryDelayMs: number;

	constructor(options: DatajudClientOptions) {
		this.baseUrl = (options.baseUrl ?? env.DATAJUD_BASE_URL).replaceAll(/\/+$/gu, "");
		this.apiKey = options.apiKey ?? env.DATAJUD_API_KEY;
		this.timeoutMs = options.timeoutMs ?? DATAJUD_DEFAULT_TIMEOUT_MS;
		this.maxAttempts = options.maxAttempts ?? DATAJUD_DEFAULT_MAX_ATTEMPTS;
		this.retryDelayMs = options.retryDelayMs ?? DATAJUD_DEFAULT_RETRY_DELAY_MS;
	}

	// O lote é a diferença entre três chamadas ao governo e trezentas: o DataJud responde 249 números
	// numa consulta só, e um CNJ ausente da resposta é resultado legítimo, não erro.
	async findCases(params: { tribunal: string; cnjNumbers: string[] }): Promise<DatajudBatch> {
		const alias = datajudAlias(params.tribunal);

		if (!alias) {
			return { status: "tribunal_nao_suportado" };
		}

		if (!params.cnjNumbers.length) {
			return { status: "ok", alias, documents: [] };
		}

		const documents = await this.fetchDocuments(alias, params.cnjNumbers);

		// A ordem do Elasticsearch não é contrato. Quem decide qual instância vale para a classe e para
		// o rito recursal é esta ordenação, e ela precisa dar o mesmo resultado em toda execução. O
		// desempate segue a ordem jurídica dos graus, não a alfabética: por texto, G1 vinha antes de JE.
		return {
			status: "ok",
			alias,
			documents: documents.sort(
				(left, right) =>
					left.cnjNumber.localeCompare(right.cnjNumber) ||
					grauRank(left.grau) - grauRank(right.grau) ||
					left.documentId.localeCompare(right.documentId),
			),
		};
	}

	// O teto de `size` é do lote inteiro, então um processo com muitos documentos come a cota dos
	// outros. Quando a resposta vem truncada, o lote é refeito em pedaços menores: deixar por isso
	// mesmo apagaria da tela um processo que existe.
	private async fetchDocuments(
		alias: string,
		cnjNumbers: string[],
		size = cnjNumbers.length * DATAJUD_DOCUMENTS_PER_CASE,
	): Promise<DatajudDocument[]> {
		const page = await this.search(alias, cnjNumbers, size);

		if (page.total <= page.documents.length) {
			return page.documents;
		}

		if (cnjNumbers.length === 1) {
			const [cnjNumber] = cnjNumbers;

			// O processo que não cabe na consulta fica sem documento nenhum, e não com metade deles: um
			// conjunto amputado apagaria instância viva na reconciliação. A falha é dele e para nele, em
			// vez de derrubar o lote de cem processos que dividiu a mesma consulta.
			if (size >= DATAJUD_MAX_DOCUMENTS) {
				console.error(
					`[datajud] o processo ${cnjNumber} tem ${page.total} documentos, acima do teto de ${DATAJUD_MAX_DOCUMENTS} por consulta: ficou de fora deste ciclo.`,
				);

				return [];
			}

			return await this.fetchDocuments(
				alias,
				cnjNumbers,
				Math.min(page.total, DATAJUD_MAX_DOCUMENTS),
			);
		}

		const half = Math.ceil(cnjNumbers.length / 2);

		return [
			...(await this.fetchDocuments(alias, cnjNumbers.slice(0, half))),
			...(await this.fetchDocuments(alias, cnjNumbers.slice(half))),
		];
	}

	private async search(alias: string, cnjNumbers: string[], size: number) {
		const response = datajudResponseSchema(
			await this.requestJson(alias, {
				query: { terms: { numeroProcesso: cnjNumbers } },
				size,
				sort: ["_doc"],
				track_total_hits: true,
			}),
		);

		if (response instanceof type.errors) {
			throw new TypeError(`Resposta do DataJud em formato inesperado: ${response.summary}`);
		}

		return {
			documents: response.hits.hits.map((hit) => toDocument(hit)),
			total: response.hits.total,
		};
	}

	private async requestJson(alias: string, body: unknown) {
		for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
			const result = await this.request(alias, body);

			if (result.ok) {
				return result.payload;
			}

			if (!result.retryable || attempt === this.maxAttempts) {
				throw new Error(result.message);
			}

			const backoffMs = this.retryDelayMs * 2 ** (attempt - 1);

			await Bun.sleep(Math.min(result.waitMs ?? backoffMs, DATAJUD_MAX_RETRY_DELAY_MS));
		}

		throw new Error("Falha ao consultar o DataJud");
	}

	private async request(alias: string, body: unknown): Promise<DatajudRequest> {
		try {
			const response = await fetch(`${this.baseUrl}/api_publica_${alias}/_search`, {
				method: "POST",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
					authorization: `APIKey ${this.apiKey}`,
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(this.timeoutMs),
			});

			if (!response.ok) {
				return {
					ok: false,
					message: `DataJud respondeu com status ${response.status} para ${alias}`,
					retryable: response.status === DATAJUD_RATE_LIMIT_STATUS || response.status >= 500,
					waitMs: waitFromRateLimit(response),
				};
			}

			const payload: unknown = await response.json();

			return { ok: true, payload };
		} catch (error) {
			return {
				ok: false,
				message: `Falha ao consultar o DataJud: ${String(error)}`,
				retryable: true,
				waitMs: null,
			};
		}
	}
}
