import { type } from "arktype";

const djenAdvogadoSchema = type({
	id: "number | null = null",
	nome: "string",
	numero_oab: "string | null = null",
	uf_oab: "string | null = null",
});

const djenDestinatarioSchema = type({
	nome: "string",
	polo: "string | null = null",
});

const djenDestinatarioAdvogadoSchema = type({
	advogado: djenAdvogadoSchema.or("null").default(null),
});

// Todo campo opcional do DJEN vira `null` aqui: o payload volta a atravessar esta fronteira quando a
// projeção relê o jsonb, e nenhuma camada abaixo deve precisar distinguir ausente de nulo.
export const djenItemSchema = type({
	id: "number",
	data_disponibilizacao: "string",
	texto: "string",
	siglaTribunal: "string | null = null",
	tipoComunicacao: "string | null = null",
	nomeOrgao: "string | null = null",
	idOrgao: "number | null = null",
	numero_processo: "string | null = null",
	numeroprocessocommascara: "string | null = null",
	meio: "string | null = null",
	meiocompleto: "string | null = null",
	link: "string | null = null",
	tipoDocumento: "string | null = null",
	nomeClasse: "string | null = null",
	codigoClasse: "string | number | null = null",
	numeroComunicacao: "number | null = null",
	ativo: "boolean | null = null",
	hash: "string | null = null",
	status: "string | null = null",
	motivo_cancelamento: "string | null = null",
	data_cancelamento: "string | null = null",
	datadisponibilizacao: "string | null = null",
	destinatarios: djenDestinatarioSchema.array().or("null").default(null),
	destinatarioadvogados: djenDestinatarioAdvogadoSchema.array().or("null").default(null),
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
export type DjenItemInput = typeof djenItemSchema.inferIn;
export type DjenResponse = typeof djenResponseSchema.infer;
