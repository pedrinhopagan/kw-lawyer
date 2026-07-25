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
	numeroProcesso: "string | null = null",
	classe: datajudNamedSchema.or("null").default(null),
	sistema: datajudNamedSchema.or("null").default(null),
	tribunal: "string | null = null",
	grau: "string | null = null",
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

export const datajudResponseSchema = type({
	hits: {
		hits: type({ "_source?": "unknown" })
			.pipe(({ _source }) => _source)
			.array(),
	},
});

export type DatajudMovimento = typeof datajudMovimentoSchema.infer;
