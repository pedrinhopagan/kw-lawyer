import { type } from "arktype";

const djenAdvogadoSchema = type({
	id: "number | null = null",
	nome: "string",
	"numero_oab?": "string | null",
	"uf_oab?": "string | null",
});

const djenDestinatarioSchema = type({
	nome: "string",
	"polo?": "string | null",
});

const djenDestinatarioAdvogadoSchema = type({
	"advogado?": djenAdvogadoSchema.or("null"),
});

export const djenItemSchema = type({
	id: "number",
	data_disponibilizacao: "string",
	texto: "string",
	"siglaTribunal?": "string | null",
	"tipoComunicacao?": "string | null",
	"nomeOrgao?": "string | null",
	"idOrgao?": "number | null",
	"numero_processo?": "string | null",
	"numeroprocessocommascara?": "string | null",
	"meio?": "string | null",
	"meiocompleto?": "string | null",
	"link?": "string | null",
	"tipoDocumento?": "string | null",
	"nomeClasse?": "string | null",
	"codigoClasse?": "string | number | null",
	"numeroComunicacao?": "number | null",
	"ativo?": "boolean | null",
	"hash?": "string | null",
	"status?": "string | null",
	"motivo_cancelamento?": "string | null",
	"data_cancelamento?": "string | null",
	"datadisponibilizacao?": "string | null",
	"destinatarios?": djenDestinatarioSchema.array().or("null"),
	"destinatarioadvogados?": djenDestinatarioAdvogadoSchema.array().or("null"),
});

export const djenResponseSchema = type({
	"status?": "string | null",
	"message?": "string | null",
	count: "number",
	"items?": "unknown[] | null",
});

export type DjenAdvogado = typeof djenAdvogadoSchema.infer;
export type DjenDestinatario = typeof djenDestinatarioSchema.infer;
export type DjenItem = typeof djenItemSchema.infer;
export type DjenResponse = typeof djenResponseSchema.infer;
