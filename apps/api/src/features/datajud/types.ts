import { type } from "arktype";

const datajudCode = "number | string.numeric.parse | null = null";

const datajudNamedSchema = type({
	codigo: datajudCode,
	nome: "string | null = null",
});

const datajudOrgaoSchema = type({
	codigo: "number | string | null = null",
	nome: "string | null = null",
});

const datajudComplementoSchema = type({
	codigo: datajudCode,
	valor: datajudCode,
	nome: "string | null = null",
	descricao: "string | null = null",
});

const datajudMovimentoSchema = type({
	codigo: datajudCode,
	nome: "string | null = null",
	dataHora: "string | null = null",
	complementosTabelados: datajudComplementoSchema
		.array()
		.or("null")
		.default(() => []),
});

export const datajudSourceSchema = type({
	id: "string | number | null = null",
	numeroProcesso: "string | null = null",
	classe: datajudNamedSchema.or("null").default(null),
	sistema: datajudNamedSchema.or("null").default(null),
	formato: datajudNamedSchema.or("null").default(null),
	tribunal: "string | null = null",
	grau: "string | null = null",
	dataHoraUltimaAtualizacao: "string | null = null",
	dataAjuizamento: "string | null = null",
	nivelSigilo: "number | null = null",
	orgaoJulgador: datajudOrgaoSchema.or("null").default(null),
	assuntos: datajudNamedSchema
		.array()
		.or("null")
		.default(() => []),
	movimentos: datajudMovimentoSchema
		.array()
		.or("null")
		.default(() => []),
});

// O total é o que denuncia o truncamento do lote: sem ele, o CNJ que o Elasticsearch deixou de fora
// do teto de `size` viraria "processo sem registro" na tela e a reconciliação apagaria a instância
// que ficou de fora do corte. Resposta sem total é resposta que o app não sabe ler.
const datajudTotalSchema = type({ value: "number" })
	.pipe(({ value }) => value)
	.or("number");

export const datajudResponseSchema = type({
	hits: {
		total: datajudTotalSchema,
		hits: type({ _id: "string | null = null", "_source?": "unknown" })
			.pipe(({ _id, _source }) => ({ documentId: _id, source: _source }))
			.array(),
	},
});

export type DatajudMovimento = typeof datajudMovimentoSchema.infer;
