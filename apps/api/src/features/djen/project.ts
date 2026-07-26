import { type } from "arktype";
import {
	contentHash,
	extractActBody,
	formatCnj,
	htmlToPlainText,
	summarize,
	toCnjDigits,
} from "./normalize.ts";
import { type DjenItem, djenItemSchema } from "./types.ts";

// A versão 2 acrescentou `publications.class_name`, a classe congelada na publicação da decisão. O
// backfill é o próprio bump: toda comunicação já aterrissada volta pela fila e é reprojetada do
// payload cru, sem uma chamada ao governo.
export const DJEN_PROJECTOR_VERSION = 2;

export const PUBLICATION_SOURCE = "djen";

export const CANCELED_PUBLICATION_WARNING =
	"A publicação de origem foi cancelada pelo tribunal. Confira antes de baixar o prazo.";

export const RECTIFIED_PUBLICATION_WARNING =
	"O tribunal retificou esta publicação e trocou o órgão, a classe ou o tipo do documento, que são o que diz qual recurso cabe e em quantos dias. O prazo aberto guardou a base e a contagem da versão anterior: confira o cabimento antes de protocolar.";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export interface ProjectedParty {
	name: string;
	polo: string | null;
}

export interface ProjectedCase {
	cnjNumber: string;
	formattedNumber: string;
	tribunal: string;
	orgName: string | null;
	className: string | null;
	classCode: string | null;
	lastMovementAt: Date;
	parties: ProjectedParty[];
}

export interface ProjectedPublication {
	source: string;
	externalId: string;
	contentHash: string;
	cnjNumber: string | null;
	tribunal: string | null;
	orgName: string | null;
	orgCode: string | null;
	className: string | null;
	communicationType: string | null;
	documentType: string | null;
	communicationNumber: string | null;
	availableAt: string;
	medium: string | null;
	link: string | null;
	textHtml: string;
	textPlain: string;
	excerpt: string;
	active: boolean;
	status: string | null;
	cancelReason: string | null;
	canceledAt: Date | null;
	djenHash: string | null;
	normalizerVersion: number;
}

export interface ProjectedMovement {
	occurredAt: Date;
	type: string | null;
	summary: string;
}

export type DjenProjection =
	| { status: "invalido"; reason: string }
	| {
			status: "ok";
			availableAt: string;
			canceled: boolean;
			case: ProjectedCase | null;
			publication: ProjectedPublication;
			movement: ProjectedMovement | null;
	  };

function asText(value: string | number | null) {
	if (typeof value === "number") {
		return String(value);
	}

	return value;
}

function trimmedOrNull(value: string | null) {
	if (value === null) {
		return null;
	}

	const trimmed = value.trim();

	if (!trimmed) {
		return null;
	}

	return trimmed;
}

function upperOrNull(value: string | null) {
	const trimmed = trimmedOrNull(value);

	if (!trimmed) {
		return null;
	}

	return trimmed.toUpperCase();
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

function canceledAtOf(value: string | null) {
	if (!value) {
		return null;
	}

	const parsed = new Date(value);

	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed;
}

function projectedParties(destinatarios: DjenItem["destinatarios"]) {
	const seen = new Set<string>();
	const parties: ProjectedParty[] = [];

	for (const destinatario of destinatarios ?? []) {
		const name = destinatario.nome.trim();
		const key = `${name}|${destinatario.polo}`;

		if (!name || seen.has(key)) {
			continue;
		}

		seen.add(key);
		parties.push({ name, polo: destinatario.polo });
	}

	return parties;
}

// O tribunal cancela de duas formas: derrubando `ativo` ou mandando o motivo. Quem olhar só uma das
// duas marca a publicação como cancelada num lugar do app e como válida em outro.
export function isCanceledPublication(publication: {
	active: boolean;
	cancelReason: string | null;
}) {
	return !publication.active || !!publication.cancelReason;
}

// O payload cru volta pelo jsonb, então ele é uma fronteira de novo: reprojetar uma linha antiga não
// pode confiar no formato que o DJEN entregou naquele dia.
export function projectDjenCommunication(payload: unknown): DjenProjection {
	const item = djenItemSchema(payload);

	if (item instanceof type.errors) {
		return { status: "invalido", reason: item.summary };
	}

	const availableAt = item.data_disponibilizacao.slice(0, 10);

	if (!DATE_ONLY_PATTERN.test(availableAt)) {
		return { status: "invalido", reason: "Data de disponibilização em formato inesperado." };
	}

	const cnjNumber = toCnjDigits(item.numero_processo) ?? toCnjDigits(item.numeroprocessocommascara);
	const tribunal = upperOrNull(item.siglaTribunal);
	const textPlain = htmlToPlainText(item.texto);
	const excerpt = publicationExcerpt(textPlain, item);
	const occurredAt = new Date(`${availableAt}T00:00:00.000Z`);
	const active = item.ativo !== false;
	const cancelReason = trimmedOrNull(item.motivo_cancelamento);

	const projectedCase =
		cnjNumber && tribunal
			? {
					cnjNumber,
					formattedNumber: trimmedOrNull(item.numeroprocessocommascara) || formatCnj(cnjNumber),
					tribunal,
					orgName: trimmedOrNull(item.nomeOrgao),
					className: trimmedOrNull(item.nomeClasse),
					classCode: asText(item.codigoClasse),
					lastMovementAt: occurredAt,
					parties: projectedParties(item.destinatarios),
				}
			: null;

	return {
		status: "ok",
		availableAt,
		canceled: isCanceledPublication({ active, cancelReason }),
		case: projectedCase,
		publication: {
			source: PUBLICATION_SOURCE,
			externalId: String(item.id),
			contentHash: contentHash({
				source: PUBLICATION_SOURCE,
				cnj: cnjNumber,
				availableAt,
				text: textPlain,
			}),
			cnjNumber,
			tribunal,
			orgName: trimmedOrNull(item.nomeOrgao),
			orgCode: asText(item.idOrgao),
			className: trimmedOrNull(item.nomeClasse),
			communicationType: trimmedOrNull(item.tipoComunicacao),
			documentType: trimmedOrNull(item.tipoDocumento),
			communicationNumber: asText(item.numeroComunicacao),
			availableAt,
			medium: trimmedOrNull(item.meiocompleto),
			link: trimmedOrNull(item.link),
			textHtml: item.texto,
			textPlain,
			excerpt,
			active,
			status: trimmedOrNull(item.status),
			cancelReason,
			canceledAt: canceledAtOf(item.data_cancelamento),
			djenHash: trimmedOrNull(item.hash),
			normalizerVersion: DJEN_PROJECTOR_VERSION,
		},
		movement: projectedCase
			? { occurredAt, type: trimmedOrNull(item.tipoComunicacao), summary: excerpt }
			: null,
	};
}
