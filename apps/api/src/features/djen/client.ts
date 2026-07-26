import { type } from "arktype";
import { env } from "../../env.ts";
import { addDays, assertDate, daysBetween, forensicToday } from "../deadlines/calendar.ts";
import { type DjenItem, djenItemSchema, djenResponseSchema } from "./types.ts";

// O DJEN só concentra as comunicações de todos os tribunais a partir da Resolução CNJ 455/2022,
// que tornou o diário nacional obrigatório: antes disso não existe nada para buscar nele.
export const DJEN_HISTORY_START = "2022-01-01";

// O `count` da API satura em 10000: janela que bate esse teto está escondendo o resto.
export const DJEN_COUNT_CEILING = 10_000;

const DJEN_DEFAULT_PAGE_SIZE = 250;
const DJEN_DEFAULT_TIMEOUT_MS = 30_000;
const DJEN_DEFAULT_MAX_ATTEMPTS = 5;
const DJEN_DEFAULT_RETRY_DELAY_MS = 2_000;
const DJEN_DEFAULT_USER_AGENT = "kw-lawyer/1.0 (acompanhamento processual)";
const DJEN_MAX_RETRY_DELAY_MS = 30_000;
const DJEN_MAX_PAGES = 500;
const DJEN_RATE_LIMIT_STATUS = 429;

interface DjenClientOptions {
	baseUrl?: string;
	pageSize?: number;
	timeoutMs?: number;
	maxAttempts?: number;
	retryDelayMs?: number;
	userAgent?: string;
}

interface DjenOabParams {
	oabNumber: string;
	oabUf: string;
}

export interface DjenWindow {
	from: string;
	through: string;
}

interface DjenPage {
	page: number;
	count: number;
	items: DjenItem[];
	invalid: number;
	window: DjenWindow;
}

interface DjenTotals {
	total: number;
	invalid: number;
	counted: number;
}

type DjenRequest =
	| { ok: true; payload: unknown }
	| { ok: false; message: string; retryable: boolean; waitMs: number | null };

function waitFromRateLimit(response: Response) {
	const retryAfterSeconds = Number(response.headers.get("retry-after"));

	if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
		return retryAfterSeconds * 1000;
	}

	return null;
}

export class DjenClient {
	private readonly baseUrl: string;
	private readonly pageSize: number;
	private readonly timeoutMs: number;
	private readonly maxAttempts: number;
	private readonly retryDelayMs: number;
	private readonly userAgent: string;

	constructor(options: DjenClientOptions) {
		this.baseUrl = (options.baseUrl ?? env.DJEN_BASE_URL).replaceAll(/\/+$/gu, "");
		this.pageSize = options.pageSize ?? DJEN_DEFAULT_PAGE_SIZE;
		this.timeoutMs = options.timeoutMs ?? DJEN_DEFAULT_TIMEOUT_MS;
		this.maxAttempts = options.maxAttempts ?? DJEN_DEFAULT_MAX_ATTEMPTS;
		this.retryDelayMs = options.retryDelayMs ?? DJEN_DEFAULT_RETRY_DELAY_MS;
		this.userAgent = options.userAgent ?? DJEN_DEFAULT_USER_AGENT;
	}

	async fetchPage(params: DjenOabParams & { window: DjenWindow; page: number; pageSize?: number }) {
		const url = new URL(`${this.baseUrl}/comunicacao`);

		url.searchParams.set("numeroOab", params.oabNumber.replaceAll(/\D/gu, ""));
		url.searchParams.set("ufOab", params.oabUf.trim().toUpperCase());
		url.searchParams.set("dataDisponibilizacaoInicio", assertDate(params.window.from));
		url.searchParams.set("dataDisponibilizacaoFim", assertDate(params.window.through));
		url.searchParams.set("itensPorPagina", String(params.pageSize ?? this.pageSize));
		url.searchParams.set("pagina", String(params.page));

		const response = djenResponseSchema(await this.requestJson(url));

		if (response instanceof type.errors) {
			throw new TypeError(`Resposta do DJEN em formato inesperado: ${response.summary}`);
		}

		const items: DjenItem[] = [];
		let invalid = 0;

		for (const raw of response.items ?? []) {
			const item = djenItemSchema(raw);

			if (item instanceof type.errors) {
				invalid++;
				continue;
			}

			items.push(item);
		}

		return { count: response.count, items, invalid };
	}

	// Uma janela saturada esconde o que passou do teto, então ela é dividida ao meio até caber. A
	// metade recente vem primeiro: é o que a advogada abre o painel para ver.
	async fetchAll(
		params: DjenOabParams & { window: DjenWindow; pageSize?: number },
		onPage: (page: DjenPage) => Promise<void>,
	): Promise<DjenTotals> {
		const first = await this.fetchPage({ ...params, page: 1 });
		const saturated = first.count >= DJEN_COUNT_CEILING;

		if (saturated && params.window.from !== params.window.through) {
			const half = addDays(
				params.window.from,
				Math.floor(daysBetween(params.window.from, params.window.through) / 2),
			);

			const recent = await this.fetchAll(
				{ ...params, window: { ...params.window, from: addDays(half, 1) } },
				onPage,
			);

			const older = await this.fetchAll(
				{ ...params, window: { ...params.window, through: half } },
				onPage,
			);

			return {
				total: recent.total + older.total,
				invalid: recent.invalid + older.invalid,
				counted: recent.counted + older.counted,
			};
		}

		if (saturated) {
			console.warn(
				`[djen] o dia ${params.window.from} da OAB ${params.oabNumber}/${params.oabUf} passou de ${DJEN_COUNT_CEILING} comunicações e não há como dividir mais: o excedente do dia ficou fora`,
			);
		}

		let total = 0;
		let invalid = 0;
		let received = 0;

		for (let page = 1; page <= DJEN_MAX_PAGES; page++) {
			const result = page === 1 ? first : await this.fetchPage({ ...params, page });
			const fetched = result.items.length + result.invalid;

			if (fetched === 0) {
				break;
			}

			await onPage({
				page,
				count: result.count,
				items: result.items,
				invalid: result.invalid,
				window: params.window,
			});

			total += result.items.length;
			invalid += result.invalid;
			received += fetched;

			if (received >= result.count) {
				break;
			}

			if (page === DJEN_MAX_PAGES) {
				console.warn(
					`[djen] a janela de ${params.window.from} a ${params.window.through} passou de ${DJEN_MAX_PAGES} páginas e foi truncada`,
				);
			}
		}

		return { total, invalid, counted: saturated ? 0 : first.count };
	}

	async findLawyer(params: DjenOabParams) {
		const window = { from: DJEN_HISTORY_START, through: forensicToday() };
		const { items } = await this.fetchPage({ ...params, window, page: 1, pageSize: 1 });
		const oabNumber = params.oabNumber.replaceAll(/\D/gu, "");
		const oabUf = params.oabUf.trim().toUpperCase();

		for (const item of items) {
			for (const entry of item.destinatarioadvogados ?? []) {
				if (!entry.advogado?.numero_oab || !entry.advogado.uf_oab) {
					continue;
				}

				if (entry.advogado.numero_oab.replaceAll(/\D/gu, "") !== oabNumber) {
					continue;
				}

				if (entry.advogado.uf_oab.trim().toUpperCase() !== oabUf) {
					continue;
				}

				return { name: entry.advogado.nome, djenAdvogadoId: entry.advogado.id };
			}
		}

		return null;
	}

	private async requestJson(url: URL) {
		for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
			const result = await this.request(url);

			if (result.ok) {
				return result.payload;
			}

			if (!result.retryable || attempt === this.maxAttempts) {
				throw new Error(result.message);
			}

			const backoffMs = this.retryDelayMs * 2 ** (attempt - 1);

			await Bun.sleep(Math.min(result.waitMs ?? backoffMs, DJEN_MAX_RETRY_DELAY_MS));
		}

		throw new Error("Falha ao consultar o DJEN");
	}

	private async request(url: URL): Promise<DjenRequest> {
		try {
			const response = await fetch(url, {
				headers: { accept: "application/json", "user-agent": this.userAgent },
				signal: AbortSignal.timeout(this.timeoutMs),
			});

			if (!response.ok) {
				return {
					ok: false,
					message: `DJEN respondeu com status ${response.status}`,
					retryable: response.status === DJEN_RATE_LIMIT_STATUS || response.status >= 500,
					waitMs: waitFromRateLimit(response),
				};
			}

			const payload: unknown = await response.json();

			return { ok: true, payload };
		} catch (error) {
			return {
				ok: false,
				message: `Falha ao consultar o DJEN: ${String(error)}`,
				retryable: true,
				waitMs: null,
			};
		}
	}
}
