import { type } from "arktype";
import type { CaseSubject } from "../../db/schema/cases.ts";
import type { MovementComplement } from "../../db/schema/movements.ts";
import { env } from "../../env.ts";
import { parseAjuizamento, parseInstant, toCodeText, toLabel } from "./normalize.ts";
import { datajudResponseSchema, type DatajudMovimento, datajudSourceSchema } from "./types.ts";

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

interface DatajudCase {
	className: string | null;
	classCode: string | null;
	grau: string | null;
	orgJudgingName: string | null;
	orgJudgingCode: string | null;
	subjects: CaseSubject[];
	systemName: string | null;
	filedAt: Date | null;
	secrecyLevel: number | null;
	movements: DatajudMovement[];
}

type DatajudResult =
	| { status: "ok"; case: DatajudCase }
	| { status: "sem_registro" }
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

	async findCase(params: { cnjNumber: string; tribunal: string }): Promise<DatajudResult> {
		const alias = datajudAlias(params.tribunal);

		if (!alias) {
			return { status: "tribunal_nao_suportado" };
		}

		const response = datajudResponseSchema(
			await this.requestJson(alias, {
				query: { match: { numeroProcesso: params.cnjNumber } },
				size: 1,
			}),
		);

		if (response instanceof type.errors) {
			throw new TypeError(`Resposta do DataJud em formato inesperado: ${response.summary}`);
		}

		const [hit] = response.hits.hits;

		if (!hit) {
			return { status: "sem_registro" };
		}

		const source = datajudSourceSchema(hit);

		if (source instanceof type.errors) {
			throw new TypeError(`Processo do DataJud em formato inesperado: ${source.summary}`);
		}

		return {
			status: "ok",
			case: {
				className: toLabel(source.classe?.nome),
				classCode: toCodeText(source.classe?.codigo),
				grau: toLabel(source.grau),
				orgJudgingName: toLabel(source.orgaoJulgador?.nome),
				orgJudgingCode: toCodeText(source.orgaoJulgador?.codigo),
				subjects: (source.assuntos ?? []).map((assunto) => ({
					codigo: assunto.codigo,
					nome: toLabel(assunto.nome),
				})),
				systemName: toLabel(source.sistema?.nome),
				filedAt: parseAjuizamento(source.dataAjuizamento),
				secrecyLevel: source.nivelSigilo,
				movements: (source.movimentos ?? [])
					.map(toMovement)
					.filter((movement) => movement !== null),
			},
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
