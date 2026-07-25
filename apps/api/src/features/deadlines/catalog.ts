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
];
