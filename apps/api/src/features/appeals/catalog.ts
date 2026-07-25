import { LEGAL_DEADLINES } from "../deadlines/catalog.ts";
import type { CountingUnit } from "../deadlines/counting.ts";
import type { DecisionSpecies } from "../decisions/classify.ts";
import { normalizeForMatch } from "../legal/text.ts";

const CNJ_SEGMENT_INDEX = 13;
const LABOR_SEGMENT = "5";

const BY_KEY = new Map(LEGAL_DEADLINES.map((entry) => [entry.key, entry]));

interface AppealOption {
	actKey: string;
	label: string;
	days: number;
	unit: CountingUnit;
	deadlineBasis: string;
	admissibilityBasis: string;
	needsPreparo: boolean;
	condition: string | null;
}

export interface AppealAdvice {
	options: AppealOption[];
	blocked: { reason: string; basis: string } | null;
}

interface AppealContext {
	species: DecisionSpecies;
	grau: string | null;
	cnjNumber: string;
	className: string | null;
	orgName: string | null;
	transitedAt: Date | null;
}

function option(input: {
	actKey: string;
	admissibilityBasis: string;
	needsPreparo: boolean;
	condition: string | null;
}): AppealOption {
	const legal = BY_KEY.get(input.actKey);

	if (!legal) {
		throw new Error(`Ato recursal ${input.actKey} não está no catálogo de prazos.`);
	}

	return {
		actKey: legal.key,
		label: legal.label,
		days: legal.days,
		unit: legal.unit,
		deadlineBasis: legal.basis,
		admissibilityBasis: input.admissibilityBasis,
		needsPreparo: input.needsPreparo,
		condition: input.condition,
	};
}

const EMBARGOS = option({
	actKey: "embargos_declaracao",
	admissibilityBasis: "CPC, art. 1.022",
	needsPreparo: false,
	condition: "Cabe se houver omissão, contradição, obscuridade ou erro material.",
});

function isLabor(context: AppealContext) {
	return context.cnjNumber.charAt(CNJ_SEGMENT_INDEX) === LABOR_SEGMENT;
}

function isSmallClaims(context: AppealContext) {
	if (context.grau === "JE" || context.grau === "TR") {
		return true;
	}

	return /juizado especial/u.test(
		normalizeForMatch([context.className, context.orgName].filter((value) => !!value).join(" ")),
	);
}

const APPELLATE_GRAUS = new Set(["G2", "SUP", "TR"]);

function isAppellateCourt(context: AppealContext) {
	if (!context.grau) {
		return false;
	}

	return APPELLATE_GRAUS.has(context.grau);
}

function appealsAgainstJudgment(context: AppealContext) {
	if (isSmallClaims(context)) {
		return [
			option({
				actKey: "recurso_inominado",
				admissibilityBasis: "Lei 9.099/95, art. 41",
				needsPreparo: true,
				condition: null,
			}),
			EMBARGOS,
		];
	}

	if (isLabor(context)) {
		return [
			option({
				actKey: "recurso_ordinario",
				admissibilityBasis: "CLT, art. 895",
				needsPreparo: true,
				condition: null,
			}),
			EMBARGOS,
		];
	}

	return [
		option({
			actKey: "apelacao",
			admissibilityBasis: "CPC, art. 1.009",
			needsPreparo: true,
			condition: null,
		}),
		EMBARGOS,
	];
}

function appealsAgainstInterlocutory(context: AppealContext): AppealAdvice {
	if (isLabor(context)) {
		return {
			options: [EMBARGOS],
			blocked: {
				reason:
					"Decisão interlocutória no processo do trabalho não é recorrível de imediato: a matéria se impugna no recurso da sentença.",
				basis: "TST, Súmula 214",
			},
		};
	}

	if (isAppellateCourt(context)) {
		return {
			options: [
				option({
					actKey: "agravo_interno",
					admissibilityBasis: "CPC, art. 1.021",
					needsPreparo: false,
					condition: null,
				}),
				EMBARGOS,
			],
			blocked: null,
		};
	}

	return {
		options: [
			option({
				actKey: "agravo_instrumento",
				admissibilityBasis: "CPC, art. 1.015",
				needsPreparo: true,
				condition:
					"Cabe só se a matéria estiver no rol do art. 1.015 do CPC. Fora do rol, a impugnação vai na apelação.",
			}),
			EMBARGOS,
		],
		blocked: null,
	};
}

function appealsAgainstPanelDecision(context: AppealContext) {
	if (isSmallClaims(context)) {
		return [
			EMBARGOS,
			option({
				actKey: "recurso_especial",
				admissibilityBasis: "CF, art. 102, III (só recurso extraordinário)",
				needsPreparo: true,
				condition:
					"Contra acórdão de turma recursal não cabe recurso especial (STJ, Súmula 203). Só recurso extraordinário, por ofensa direta à Constituição.",
			}),
		];
	}

	return [
		EMBARGOS,
		option({
			actKey: "recurso_especial",
			admissibilityBasis: "CF, art. 105, III e art. 102, III",
			needsPreparo: true,
			condition: "Exige prequestionamento e o requisito específico de cada via.",
		}),
	];
}

export function appealAdviceFor(context: AppealContext): AppealAdvice {
	if (context.transitedAt) {
		return {
			options: [],
			blocked: {
				reason: `Trânsito em julgado certificado nos autos. Não corre mais prazo recursal contra esta decisão.`,
				basis: "CPC, art. 502",
			},
		};
	}

	if (context.species === "despacho") {
		return {
			options: [],
			blocked: {
				reason: "Despacho de expediente não tem conteúdo decisório e por isso não é recorrível.",
				basis: "CPC, art. 1.001",
			},
		};
	}

	if (context.species === "sentenca") {
		return { options: appealsAgainstJudgment(context), blocked: null };
	}

	if (context.species === "interlocutoria") {
		return appealsAgainstInterlocutory(context);
	}

	if (context.species === "monocratica") {
		return {
			options: [
				option({
					actKey: "agravo_interno",
					admissibilityBasis: "CPC, art. 1.021",
					needsPreparo: false,
					condition: null,
				}),
				EMBARGOS,
			],
			blocked: null,
		};
	}

	return { options: appealsAgainstPanelDecision(context), blocked: null };
}
