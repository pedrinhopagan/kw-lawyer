import type { DeadlineConfidence } from "../../db/schema/deadlines.ts";
import { LEGAL_DEADLINES } from "../deadlines/catalog.ts";
import type { CountingUnit } from "../deadlines/counting.ts";
import type { DecisionSpecies, DecisionSpeciesConfidence } from "../decisions/classify.ts";
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
	confidence: DeadlineConfidence;
	review: string | null;
}

export interface AppealAdvice {
	options: AppealOption[];
	blocked: { reason: string; basis: string } | null;
}

interface AppealContext {
	species: DecisionSpecies;
	// A espécie é o campo de maior alavancagem deste arquivo: ela escolhe o recurso, o prazo, o preparo
	// e até o bloqueio. Quando o classificador não a leu de um código de movimento nem do cabeçalho
	// confirmado pelo teor, ela é dedução de texto, e a resposta inteira herda essa dúvida.
	speciesConfidence: DecisionSpeciesConfidence;
	currentGrau: string | undefined;
	cnjNumber: string;
	className: string | null;
	caseOrgName: string | null;
	decisionGrau: string | null;
	decisionPublication: {
		orgName: string | null;
		className: string | null;
		documentType: string | null;
	} | null;
	transitedAt: Date | null;
}

function option(input: {
	actKey: string;
	admissibilityBasis: string;
	deadlineBasis?: string;
	needsPreparo: boolean;
	condition: string | null;
	confidence: DeadlineConfidence;
	review: string | null;
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
		deadlineBasis: input.deadlineBasis ?? legal.basis,
		admissibilityBasis: input.admissibilityBasis,
		needsPreparo: input.needsPreparo,
		condition: input.condition,
		confidence: input.confidence,
		review: input.review,
	};
}

const EMBARGOS = option({
	actKey: "embargos_declaracao",
	admissibilityBasis: "CPC, art. 1.022",
	needsPreparo: false,
	condition: "Cabe se houver omissão, contradição, obscuridade ou erro material.",
	confidence: "alta",
	review: null,
});

// O prazo de cinco dias é o mesmo nos três ramos, mas a regra que o dá não: citar o CPC dentro de um
// processo trabalhista ou de juizado é rastro errado num app que promete dizer por qual regra.
const EMBARGOS_TRABALHISTAS = option({
	actKey: "embargos_declaracao",
	admissibilityBasis: "CLT, art. 897-A",
	deadlineBasis: "CLT, art. 897-A",
	needsPreparo: false,
	condition:
		"Cabe se houver omissão, contradição, obscuridade ou manifesto equívoco no exame dos pressupostos extrínsecos do recurso.",
	confidence: "alta",
	review: null,
});

const EMBARGOS_JUIZADO = option({
	actKey: "embargos_declaracao",
	admissibilityBasis: "Lei 9.099/95, art. 48",
	deadlineBasis: "Lei 9.099/95, art. 50",
	needsPreparo: false,
	condition: "Cabe se houver obscuridade, contradição, omissão ou erro material.",
	confidence: "alta",
	review: null,
});

// O ramo da justiça está no número do processo, que é a identidade dele e nunca é reescrito.
function isLabor(context: AppealContext) {
	return context.cnjNumber.charAt(CNJ_SEGMENT_INDEX) === LABOR_SEGMENT;
}

const SMALL_CLAIMS_GRAUS = new Set(["JE", "TR"]);
const APPELLATE_GRAUS = new Set(["TR", "G2", "SUP"]);

const SMALL_CLAIMS_TEXT = /juizados? especia|turmas? recursa|colegios? recursa|recurso inominado/u;
const ORDINARY_TEXT =
	/procedimento comum|\bvaras?\b|\bcamaras?\b|desembargador|tribunal de justica|tribunal regional|superior tribunal|orgao especial/u;
const COLLEGIATE_TEXT =
	/\bcamaras?\b|\bturmas?\b|colegios? recursa|relator|desembargador|orgao especial|tribunal de justica|tribunal regional|superior tribunal/u;
const TRIAL_COURT_TEXT =
	/\bvaras?\b|\bjuizo\b|juizados? especia|procedimento comum|\bforo\b|comarca/u;
const RELATOR_DOCUMENT_TEXT = /monocratica|relator/u;

function textSignal(value: string | null | undefined, yes: RegExp, no: RegExp) {
	const text = normalizeForMatch(value?.trim() ?? "");

	if (!text) {
		return null;
	}

	if (yes.test(text)) {
		return true;
	}

	if (no.test(text)) {
		return false;
	}

	return null;
}

function grauSignal(grau: string | null | undefined, graus: Set<string>) {
	if (!grau) {
		return null;
	}

	return graus.has(grau);
}

// "Decisão monocrática" nomeia quem decidiu, não o assunto: só relator profere uma. Serve de segundo
// sinal porque o DJEN devolve o nome do órgão em branco com frequência em alguns tribunais.
function relatorDocumentSignal(documentType: string | null | undefined) {
	const text = normalizeForMatch(documentType?.trim() ?? "");

	if (text && RELATOR_DOCUMENT_TEXT.test(text)) {
		return true;
	}

	return null;
}

// A invariante deste arquivo: só sinal congelado na própria decisão responde com confiança alta.
//
// Congelado é o que ficou gravado quando a decisão saiu e não é mais reescrito: o órgão, a classe e o
// tipo de documento da publicação que a trouxe, e o grau do movimento que a originou.
//
// Volátil é o cadastro do processo (`cases.class_name` e `cases.org_name`, que a projeção reescreve
// com a última publicação do lote) e a instância corrente (`case_instances`, que o enriquecimento
// cria, muda e apaga). Ele continua desempatando, porque calar seria pior, mas nunca sozinho com cara
// de certeza: a opção que ele elegeu sai com confiança média e com o motivo da conferência escrito.
//
// Ausente é ninguém ter falado. A resposta então é uma suposição do app, e suposição também não é
// certeza.
type ReadingSource = "congelado" | "volatil" | "ausente";

interface Reading {
	value: boolean;
	source: ReadingSource;
}

function reading(input: { frozen: boolean | null; volatile: boolean | null }): Reading {
	if (input.frozen !== null) {
		return { value: input.frozen, source: "congelado" };
	}

	if (input.volatile !== null) {
		return { value: input.volatile, source: "volatil" };
	}

	return { value: false, source: "ausente" };
}

const RITE_REVIEW: Record<ReadingSource, string | null> = {
	congelado: null,
	volatil:
		"A publicação desta decisão não trouxe o órgão nem a classe que a identificam, então o app leu o rito pelo cadastro do processo, que a sincronização reescreve a cada ciclo. Confira se o processo corre no juizado especial ou na justiça comum: o recurso e o prazo mudam.",
	ausente:
		"Nada nesta decisão nem no cadastro do processo diz se ele corre no juizado especial, então o app respondeu pela justiça comum. Confira o rito: o recurso e o prazo mudam.",
};

const COURT_REVIEW: Record<ReadingSource, string | null> = {
	congelado: null,
	volatil:
		"A publicação desta decisão não trouxe o órgão que a proferiu, então o app leu quem decidiu pelo cadastro do processo, que a sincronização reescreve a cada ciclo. Confira se decidiu o juízo de origem ou o relator: a via muda.",
	ausente:
		"Nada nesta decisão nem no cadastro do processo diz se quem decidiu foi o relator, então o app respondeu pelo juízo de origem. Confira quem proferiu a decisão: a via muda.",
};

const EMBARGOS_REVIEW: Record<ReadingSource, string | null> = {
	congelado: null,
	volatil:
		"O prazo de 5 dias úteis é o mesmo nos três ramos, mas a regra que o dá muda com o rito, e aqui o rito veio do cadastro do processo, que a sincronização reescreve a cada ciclo. Confira o rito antes de citar a base na petição.",
	ausente:
		"O prazo de 5 dias úteis é o mesmo nos três ramos, mas a regra que o dá muda com o rito, e nada nesta decisão disse qual é o dela. O app citou a regra da justiça comum: confira antes de usar a base na petição.",
};

const SPECIES_REVIEW: Record<DecisionSpeciesConfidence, string | null> = {
	alta: null,
	media:
		"A espécie deste ato veio só do cabeçalho da publicação, e nada no teor da decisão confirmou a leitura. É a espécie que escolhe o recurso, o prazo e o preparo: confira o teor antes de protocolar.",
	baixa:
		"A espécie deste ato não veio de código de movimento: o app a deduziu do texto da decisão, e o cabeçalho da publicação não confirma essa leitura. É a espécie que escolhe o recurso, o prazo e o preparo, e por isso a resposta inteira depende dessa dedução. Confira o teor da decisão antes de protocolar.",
};

const SMALL_CLAIMS_RELATOR_REVIEW =
	"Nos juizados o regime é o da Lei 9.099/95, que não prevê agravo interno: contra decisão de relator de turma recursal o cabimento e o prazo saem do regimento interno do tribunal, e podem ser menores que os 15 dias do CPC. Confira o regimento antes de protocolar.";

const SMALL_CLAIMS_INTERLOCUTORY_REVIEW =
	"Nos juizados a Lei 9.099/95 não prevê agravo contra decisão interlocutória, e o entendimento corrente é que a matéria se impugna no recurso contra a sentença. Confira o regimento e a jurisprudência da turma recursal antes de protocolar.";

function reviewed(input: { reasons: (string | null)[]; entry: AppealOption }): AppealOption {
	const reasons = input.reasons.filter((value) => !!value);

	if (!reasons.length) {
		return input.entry;
	}

	return {
		...input.entry,
		confidence: "media",
		review: [input.entry.review, ...reasons].filter((value) => !!value).join(" "),
	};
}

// Primeiro a cadeia congelada inteira, depois a volátil inteira. Nenhum sinal volátil é perguntado
// antes de um congelado: o órgão que publicou a decisão e a classe em que ela saiu são a evidência
// direta do rito daquele ato, e o grau do movimento fica preso à instância em que ele ocorreu.
function smallClaimsReading(context: AppealContext): Reading {
	const frozen =
		textSignal(context.decisionPublication?.orgName, SMALL_CLAIMS_TEXT, ORDINARY_TEXT) ??
		textSignal(context.decisionPublication?.className, SMALL_CLAIMS_TEXT, ORDINARY_TEXT) ??
		grauSignal(context.decisionGrau, SMALL_CLAIMS_GRAUS);

	const volatile =
		textSignal(context.className, SMALL_CLAIMS_TEXT, ORDINARY_TEXT) ??
		textSignal(context.caseOrgName, SMALL_CLAIMS_TEXT, ORDINARY_TEXT) ??
		grauSignal(context.currentGrau, SMALL_CLAIMS_GRAUS);

	return reading({ frozen, volatile });
}

// Agravo interno só cabe contra decisão de relator, e quem responde se foi um relator é o órgão da
// publicação que trouxe esta decisão, depois o tipo do documento e depois o grau do movimento que a
// originou. A classe fica de fora das duas cadeias: ela continua sendo a da origem depois que o
// recurso sobe, então não diz nada sobre quem proferiu o ato.
function appellateReading(context: AppealContext): Reading {
	const frozen =
		textSignal(context.decisionPublication?.orgName, COLLEGIATE_TEXT, TRIAL_COURT_TEXT) ??
		relatorDocumentSignal(context.decisionPublication?.documentType) ??
		grauSignal(context.decisionGrau, APPELLATE_GRAUS);

	const volatile =
		textSignal(context.caseOrgName, COLLEGIATE_TEXT, TRIAL_COURT_TEXT) ??
		grauSignal(context.currentGrau, APPELLATE_GRAUS);

	return reading({ frozen, volatile });
}

function embargosOf(rite: Reading) {
	const entry = rite.value ? EMBARGOS_JUIZADO : EMBARGOS;

	return reviewed({ reasons: [EMBARGOS_REVIEW[rite.source]], entry });
}

// A Justiça do Trabalho não tem juizado especial: por isso o ramo é perguntado antes do rito
// sumaríssimo, que se lê de texto.
function appealsAgainstJudgment(context: AppealContext) {
	if (isLabor(context)) {
		return [
			option({
				actKey: "recurso_ordinario",
				admissibilityBasis: "CLT, art. 895",
				needsPreparo: true,
				condition: null,
				confidence: "alta",
				review: null,
			}),
			EMBARGOS_TRABALHISTAS,
		];
	}

	const rite = smallClaimsReading(context);

	if (rite.value) {
		return [
			reviewed({
				reasons: [RITE_REVIEW[rite.source]],
				entry: option({
					actKey: "recurso_inominado",
					admissibilityBasis: "Lei 9.099/95, art. 41",
					needsPreparo: true,
					condition: null,
					confidence: "alta",
					review: null,
				}),
			}),
			embargosOf(rite),
		];
	}

	return [
		reviewed({
			reasons: [RITE_REVIEW[rite.source]],
			entry: option({
				actKey: "apelacao",
				admissibilityBasis: "CPC, art. 1.009",
				needsPreparo: true,
				condition: null,
				confidence: "alta",
				review: null,
			}),
		}),
		embargosOf(rite),
	];
}

// Uma decisão de relator segue o regime do processo em que ela foi proferida: o ramo trabalhista tem
// prazo próprio e o juizado não tem agravo interno na lei. Responder CPC nos três seria afirmar o que
// o app não sabe.
function relatorAppeals(input: { context: AppealContext; reasons: (string | null)[] }) {
	if (isLabor(input.context)) {
		return [
			reviewed({
				reasons: input.reasons,
				entry: option({
					actKey: "agravo_interno_trabalhista",
					admissibilityBasis: "CPC, art. 1.021, aplicado por CLT, art. 769",
					needsPreparo: false,
					condition:
						"Decisão de relator se impugna por agravo interno para o próprio colegiado. Na Justiça do Trabalho o prazo não é o do CPC.",
					confidence: "media",
					review:
						"O prazo de 8 dias vem do art. 6 da Lei 5.584/70, que vale para qualquer recurso trabalhista, e não do art. 1.021 do CPC. O regimento interno do tribunal pode nomear o ato de outro jeito: confira antes de protocolar.",
				}),
			}),
			EMBARGOS_TRABALHISTAS,
		];
	}

	const rite = smallClaimsReading(input.context);

	if (rite.value) {
		return [
			reviewed({
				reasons: [...input.reasons, RITE_REVIEW[rite.source]],
				entry: option({
					actKey: "agravo_interno",
					admissibilityBasis: "Regimento interno da turma recursal, c/c CPC, art. 1.021",
					needsPreparo: false,
					condition:
						"Decisão de relator se impugna por agravo para o próprio colegiado. No juizado o ato costuma se chamar agravo regimental.",
					confidence: "media",
					review: SMALL_CLAIMS_RELATOR_REVIEW,
				}),
			}),
			embargosOf(rite),
		];
	}

	return [
		reviewed({
			reasons: [...input.reasons, RITE_REVIEW[rite.source]],
			entry: option({
				actKey: "agravo_interno",
				admissibilityBasis: "CPC, art. 1.021",
				needsPreparo: false,
				condition: null,
				confidence: "alta",
				review: null,
			}),
		}),
		embargosOf(rite),
	];
}

function appealsAgainstInterlocutory(context: AppealContext): AppealAdvice {
	if (isLabor(context)) {
		return {
			options: [EMBARGOS_TRABALHISTAS],
			blocked: {
				reason:
					"Decisão interlocutória no processo do trabalho não é recorrível de imediato: a matéria se impugna no recurso da sentença.",
				basis: "TST, Súmula 214",
			},
		};
	}

	const court = appellateReading(context);

	// Turma recursal também é colegiado e o relator dela também profere interlocutória. Responder o
	// agravo interno do CPC sem antes perguntar o rito é dar ao juizado um recurso que a Lei 9.099/95
	// não tem, e é o mesmo caminho da decisão monocrática: por isso os dois passam pela mesma função.
	if (court.value) {
		return {
			options: relatorAppeals({ context, reasons: [COURT_REVIEW[court.source]] }),
			blocked: null,
		};
	}

	const rite = smallClaimsReading(context);

	return {
		options: [
			reviewed({
				reasons: [
					COURT_REVIEW[court.source],
					RITE_REVIEW[rite.source],
					rite.value ? SMALL_CLAIMS_INTERLOCUTORY_REVIEW : null,
				],
				entry: option({
					actKey: "agravo_instrumento",
					admissibilityBasis: "CPC, art. 1.015",
					needsPreparo: true,
					condition:
						"Cabe só se a matéria estiver no rol do art. 1.015 do CPC. Fora do rol, a impugnação vai na apelação.",
					confidence: "alta",
					review: null,
				}),
			}),
			embargosOf(rite),
		],
		blocked: null,
	};
}

function appealsAgainstPanelDecision(context: AppealContext) {
	if (isLabor(context)) {
		return [
			EMBARGOS_TRABALHISTAS,
			option({
				actKey: "recurso_revista",
				admissibilityBasis: "CLT, art. 896",
				needsPreparo: true,
				condition:
					"Contra acórdão de Tribunal Regional do Trabalho a via é o recurso de revista ao TST, nas hipóteses do art. 896 da CLT: divergência entre tribunais, violação de lei federal ou ofensa à Constituição. Recurso especial ao STJ não existe neste ramo.",
				confidence: "media",
				review:
					"O app leu Justiça do Trabalho pelo número do processo, mas não distingue acórdão de TRT de acórdão do próprio TST, onde a via e o prazo são outros. O prazo de 8 dias está no art. 6 da Lei 5.584/70. Confira a instância e o prazo antes de protocolar.",
			}),
		];
	}

	const rite = smallClaimsReading(context);

	if (rite.value) {
		return [
			embargosOf(rite),
			reviewed({
				reasons: [RITE_REVIEW[rite.source]],
				entry: option({
					actKey: "recurso_especial",
					admissibilityBasis: "CF, art. 102, III (só recurso extraordinário)",
					needsPreparo: true,
					condition:
						"Contra acórdão de turma recursal não cabe recurso especial (STJ, Súmula 203). Só recurso extraordinário, por ofensa direta à Constituição.",
					confidence: "alta",
					review: null,
				}),
			}),
		];
	}

	return [
		embargosOf(rite),
		reviewed({
			reasons: [RITE_REVIEW[rite.source]],
			entry: option({
				actKey: "recurso_especial",
				admissibilityBasis: "CF, art. 105, III e art. 102, III",
				needsPreparo: true,
				condition: "Exige prequestionamento e o requisito específico de cada via.",
				confidence: "alta",
				review: null,
			}),
		}),
	];
}

function adviceBySpecies(context: AppealContext): AppealAdvice {
	if (context.species === "sentenca") {
		return { options: appealsAgainstJudgment(context), blocked: null };
	}

	if (context.species === "interlocutoria") {
		return appealsAgainstInterlocutory(context);
	}

	if (context.species === "monocratica") {
		return { options: relatorAppeals({ context, reasons: [] }), blocked: null };
	}

	return { options: appealsAgainstPanelDecision(context), blocked: null };
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

	const speciesReview = SPECIES_REVIEW[context.speciesConfidence];

	// O despacho não devolve opção nenhuma, então não há onde rebaixar a confiança: se a espécie foi
	// deduzida, a dúvida vai no próprio bloqueio, que é a única coisa que a advogada lê aqui.
	if (context.species === "despacho") {
		return {
			options: [],
			blocked: {
				reason: [
					"Despacho de expediente não tem conteúdo decisório e por isso não é recorrível.",
					speciesReview,
				]
					.filter((value) => !!value)
					.join(" "),
				basis: "CPC, art. 1.001",
			},
		};
	}

	const advice = adviceBySpecies(context);

	if (!speciesReview) {
		return advice;
	}

	return {
		...advice,
		options: advice.options.map((entry) => reviewed({ reasons: [speciesReview], entry })),
	};
}
