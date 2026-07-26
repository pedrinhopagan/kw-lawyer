import type { CountingUnit } from "./counting.ts";

export interface LegalDeadline {
	key: string;
	label: string;
	days: number;
	unit: CountingUnit;
	basis: string;
	patterns: RegExp[];
}

export const LEGAL_DEADLINES: LegalDeadline[] = [
	{
		key: "embargos_declaracao",
		label: "Embargos de declaração",
		days: 5,
		unit: "uteis",
		basis: "CPC, art. 1.023",
		patterns: [/embargos de declara/u],
	},
	{
		key: "contestacao",
		label: "Contestação",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 335",
		patterns: [/contesta[cç][aã]o/u, /apresentar defesa/u],
	},
	{
		key: "replica",
		label: "Réplica",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 350",
		patterns: [/r[eé]plica/u, /manifeste[- ]se sobre a contesta/u],
	},
	{
		key: "apelacao",
		label: "Apelação",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 1.003, parágrafo 5",
		patterns: [/apela[cç][aã]o/u],
	},
	{
		key: "contrarrazoes",
		label: "Contrarrazões",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 1.003, parágrafo 5",
		patterns: [/contrarraz[oõ]es/u, /contra[- ]raz[oõ]es/u],
	},
	{
		key: "agravo_instrumento",
		label: "Agravo de instrumento",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 1.003, parágrafo 5",
		patterns: [/agravo de instrumento/u],
	},
	{
		key: "agravo_interno",
		label: "Agravo interno",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 1.021, parágrafo 2",
		patterns: [/agravo interno/u, /agravo regimental/u],
	},
	{
		key: "recurso_especial",
		label: "Recurso especial ou extraordinário",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 1.003, parágrafo 5",
		patterns: [/recurso especial/u, /recurso extraordin[aá]rio/u],
	},
	{
		key: "cumprimento_sentenca",
		label: "Pagamento voluntário no cumprimento de sentença",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 523",
		patterns: [/pagamento volunt[aá]rio/u, /cumprimento volunt[aá]rio da senten/u],
	},
	{
		key: "impugnacao_cumprimento",
		label: "Impugnação ao cumprimento de sentença",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 525",
		patterns: [/impugna[cç][aã]o ao cumprimento/u],
	},
	{
		key: "embargos_execucao",
		label: "Embargos à execução",
		days: 15,
		unit: "uteis",
		basis: "CPC, art. 915",
		patterns: [/embargos [aà] execu[cç][aã]o/u],
	},
	{
		key: "recurso_inominado",
		label: "Recurso inominado",
		days: 10,
		unit: "uteis",
		basis: "Lei 9.099/95, art. 42",
		patterns: [/recurso inominado/u],
	},
	{
		key: "recurso_ordinario",
		label: "Recurso ordinário trabalhista",
		days: 8,
		unit: "uteis",
		basis: "CLT, art. 895",
		patterns: [/recurso ordin[aá]rio/u],
	},
	{
		key: "recurso_revista",
		label: "Recurso de revista",
		days: 8,
		unit: "uteis",
		basis: "Lei 5.584/70, art. 6",
		patterns: [/recurso de revista/u],
	},
	// O texto da publicação chama os dois de "agravo interno": quem separa o prazo de 8 dias do de 15
	// é o ramo da justiça, que só o número do processo sabe. Sem padrão, o extrator nunca elege este
	// ato por texto; ele existe para o mapa de cabimento, que lê o CNJ.
	{
		key: "agravo_interno_trabalhista",
		label: "Agravo interno na Justiça do Trabalho",
		days: 8,
		unit: "uteis",
		basis: "Lei 5.584/70, art. 6",
		patterns: [],
	},
];
