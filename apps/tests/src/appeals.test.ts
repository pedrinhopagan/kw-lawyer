import type { Tx } from "@kw-lawyer/api/src/db/client.ts";
import { cases } from "@kw-lawyer/api/src/db/schema/cases.ts";
import { movements } from "@kw-lawyer/api/src/db/schema/movements.ts";
import { publications } from "@kw-lawyer/api/src/db/schema/publications.ts";
import { appealAdviceFor } from "@kw-lawyer/api/src/features/appeals/catalog.ts";
import {
	classifyDecision,
	type DecisionSpecies,
} from "@kw-lawyer/api/src/features/decisions/classify.ts";
import { DecisionManager } from "@kw-lawyer/api/src/features/decisions/manager.ts";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assertDefined, expectOrpcError } from "./utils/assertions.ts";
import { movementSource, publicationOf } from "./utils/case-source.ts";
import { withRollback } from "./utils/db.ts";
import { createTestClient } from "./utils/orpc.ts";
import { seedCase, seedLawyer, seedPublication } from "./utils/seed.ts";

const CNJ_ESTADUAL = "75010000920268260100";
const CNJ_TRABALHISTA = "75020000920265150060";
const CNJ_JUIZADO_JE_PRIMEIRO = "75040000920268260100";
const CNJ_TRIBUNAL_COM_ORIGEM = "75050000920268260100";
const CNJ_ORGAO_REESCRITO = "75060000920268260100";
const CNJ_SENTENCA_REESCRITA = "75080000920268260100";
const CNJ_ESPECIE_DEDUZIDA = "75090000920268260100";
const CNJ_ESPECIE_TROCADA = "75100000920268260100";

// O classificador deduz "interlocutória" deste texto por regex, sem código de movimento, sem
// cabeçalho e sem resultado: é o teor cru que a advogada recebe do DJEN quando o tribunal publica a
// liminar sem tipo de documento útil.
const TEXTO_LIMINAR_DEDUZIDA =
	"Defiro em parte o pedido liminar formulado pela parte autora, para determinar a suspensão do protesto. Intimem-se.";

const BASE_CONTEXT: Parameters<typeof appealAdviceFor>[0] = {
	species: "sentenca",
	speciesConfidence: "alta",
	currentGrau: "G1",
	cnjNumber: CNJ_ESTADUAL,
	className: "Procedimento Comum Cível",
	caseOrgName: "1ª Vara Cível",
	decisionGrau: null,
	decisionPublication: { orgName: "1ª Vara Cível", className: null, documentType: "Sentença" },
	transitedAt: null,
};

test("sentença comum estadual cabe apelação com prazo de 15 dias úteis", () => {
	const advice = appealAdviceFor(BASE_CONTEXT);
	const apelacao = advice.options.find((option) => option.actKey === "apelacao");

	assertDefined(apelacao);

	expect(apelacao.days).toBe(15);
	expect(apelacao.unit).toBe("uteis");
	expect(apelacao.admissibilityBasis).toBe("CPC, art. 1.009");
	expect(apelacao.needsPreparo).toBe(true);
	expect(advice.options.map((option) => option.actKey)).toContain("embargos_declaracao");
});

test("sentença de juizado especial cabe recurso inominado em 10 dias, não apelação", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		className: "Procedimento do Juizado Especial Cível",
		decisionPublication: {
			orgName: "2º Juizado Especial Cível",
			className: null,
			documentType: null,
		},
		currentGrau: "JE",
	});
	const keys = advice.options.map((option) => option.actKey);

	expect(keys).toContain("recurso_inominado");
	expect(keys).not.toContain("apelacao");

	const inominado = advice.options.find((option) => option.actKey === "recurso_inominado");

	assertDefined(inominado);

	expect(inominado.days).toBe(10);
});

test("classe e órgão da decisão vencem a instância, e não o contrário", () => {
	const comum = appealAdviceFor({ ...BASE_CONTEXT, currentGrau: "JE" });
	const juizado = appealAdviceFor({
		...BASE_CONTEXT,
		className: "Procedimento do Juizado Especial Cível",
		decisionPublication: {
			orgName: "1º Juizado Especial Cível",
			className: null,
			documentType: null,
		},
		currentGrau: "G1",
	});

	expect(comum.options.map((option) => option.actKey)).toEqual(["apelacao", "embargos_declaracao"]);
	expect(juizado.options.map((option) => option.actKey)).toEqual([
		"recurso_inominado",
		"embargos_declaracao",
	]);
});

test("sem classe e sem órgão o rito sai da instância corrente", () => {
	const silencioso = {
		...BASE_CONTEXT,
		className: null,
		caseOrgName: null,
		decisionPublication: { orgName: null, className: null, documentType: null },
	};

	expect(
		appealAdviceFor({ ...silencioso, currentGrau: "JE" }).options.map((option) => option.actKey),
	).toEqual(["recurso_inominado", "embargos_declaracao"]);
	expect(
		appealAdviceFor({ ...silencioso, currentGrau: "G1" }).options.map((option) => option.actKey),
	).toEqual(["apelacao", "embargos_declaracao"]);
});

test("interlocutória de relator cabe agravo interno mesmo com documento de origem no processo", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		species: "interlocutoria",
		decisionPublication: {
			orgName: "2ª Câmara de Direito Privado",
			className: null,
			documentType: null,
		},
		currentGrau: "G1",
	});

	expect(advice.options.map((option) => option.actKey)).toEqual([
		"agravo_interno",
		"embargos_declaracao",
	]);
});

test("sentença trabalhista cabe recurso ordinário em 8 dias", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		cnjNumber: CNJ_TRABALHISTA,
		className: "Ação Trabalhista",
	});
	const ordinario = advice.options.find((option) => option.actKey === "recurso_ordinario");

	assertDefined(ordinario);

	expect(ordinario.days).toBe(8);
	expect(advice.options.map((option) => option.actKey)).not.toContain("apelacao");
});

test("interlocutória trabalhista é irrecorrível de imediato e o app diz por quê", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		species: "interlocutoria",
		cnjNumber: CNJ_TRABALHISTA,
	});

	assertDefined(advice.blocked);

	expect(advice.blocked.basis).toBe("TST, Súmula 214");
	expect(advice.options.map((option) => option.actKey)).not.toContain("agravo_instrumento");
});

test("interlocutória estadual cabe agravo de instrumento com a ressalva do rol", () => {
	const advice = appealAdviceFor({ ...BASE_CONTEXT, species: "interlocutoria" });
	const agravo = advice.options.find((option) => option.actKey === "agravo_instrumento");

	assertDefined(agravo);
	assertDefined(agravo.condition);

	expect(agravo.admissibilityBasis).toBe("CPC, art. 1.015");
	expect(agravo.condition).toContain("1.015");
});

test("decisão monocrática de relator cabe agravo interno sem preparo", () => {
	const advice = appealAdviceFor({ ...BASE_CONTEXT, species: "monocratica", currentGrau: "G2" });
	const interno = advice.options.find((option) => option.actKey === "agravo_interno");

	assertDefined(interno);

	expect(interno.needsPreparo).toBe(false);
	expect(interno.admissibilityBasis).toBe("CPC, art. 1.021");
});

test("órgão da publicação da decisão manda, e o órgão do processo não troca o recurso sozinho", () => {
	// O órgão do processo é reescrito a cada publicação projetada. Se ele decidisse, uma intimação do
	// relator no agravo já interposto trocaria o recurso cabível contra a interlocutória da vara que
	// ainda está com o prazo correndo, e a advogada protocolaria recurso inadmissível.
	const daVara = appealAdviceFor({
		...BASE_CONTEXT,
		species: "interlocutoria",
		caseOrgName: "3ª Câmara de Direito Privado",
		decisionPublication: { orgName: "2ª Vara Cível", className: null, documentType: "Decisão" },
		currentGrau: "G2",
	});

	expect(daVara.options.map((option) => option.actKey)).toEqual([
		"agravo_instrumento",
		"embargos_declaracao",
	]);

	// Publicação sem nome de órgão é comum no DJEN: aí quem responde por relator é o tipo do documento.
	const doRelator = appealAdviceFor({
		...BASE_CONTEXT,
		species: "interlocutoria",
		caseOrgName: null,
		decisionPublication: { orgName: null, className: null, documentType: "Decisão Monocrática" },
		currentGrau: "G1",
	});

	expect(doRelator.options.map((option) => option.actKey)).toEqual([
		"agravo_interno",
		"embargos_declaracao",
	]);
});

test("o grau do movimento da decisão vale antes do órgão do processo", () => {
	// O grau fica congelado no movimento que originou a decisão; o órgão do processo é reescrito a
	// cada publicação projetada. Com os dois discordando, quem manda é o congelado.
	const doRelator = appealAdviceFor({
		...BASE_CONTEXT,
		species: "interlocutoria",
		caseOrgName: "2ª Vara Cível",
		decisionGrau: "G2",
		decisionPublication: { orgName: null, className: null, documentType: "Decisão" },
	});
	const interno = doRelator.options.find((option) => option.actKey === "agravo_interno");

	assertDefined(interno);

	expect(interno.confidence).toBe("alta");
	expect(interno.review).toBeNull();

	const daVara = appealAdviceFor({
		...BASE_CONTEXT,
		species: "interlocutoria",
		caseOrgName: "3ª Câmara de Direito Privado",
		decisionGrau: "G1",
		decisionPublication: { orgName: null, className: null, documentType: "Decisão" },
	});
	const instrumento = daVara.options.find((option) => option.actKey === "agravo_instrumento");

	assertDefined(instrumento);

	expect(instrumento.confidence).toBe("alta");
	expect(instrumento.review).toBeNull();
});

test("o órgão do processo não mexe na via nem no prazo que a publicação já respondeu, e sozinho nunca sai com confiança alta", () => {
	// `cases.org_name` é reescrito a cada publicação projetada: uma intimação do relator no agravo já
	// interposto troca a vara pela câmara enquanto o prazo da decisão de origem ainda corre. Quando a
	// publicação da decisão diz quem a proferiu, o campo volátil não pode mudar nada.
	for (const caseOrgName of ["2ª Vara Cível", "3ª Câmara de Direito Privado"]) {
		const instrumento = appealAdviceFor({
			...BASE_CONTEXT,
			species: "interlocutoria",
			caseOrgName,
			decisionGrau: null,
			decisionPublication: { orgName: "2ª Vara Cível", className: null, documentType: "Decisão" },
		}).options.find((option) => option.actKey === "agravo_instrumento");

		assertDefined(
			instrumento,
			`o órgão do processo "${caseOrgName}" trocou a via da interlocutória`,
		);

		expect(instrumento.confidence).toBe("alta");
		expect(instrumento.review).toBeNull();
	}

	// A mesma troca do outro lado encurta o prazo em vez da via: apelação de 15 dias virando recurso
	// inominado de 10 é prazo perdido, não recomendação discutível.
	for (const caseOrgName of ["1ª Vara Cível", "1º Juizado Especial Cível"]) {
		const apelacao = appealAdviceFor({
			...BASE_CONTEXT,
			className: null,
			caseOrgName,
			decisionGrau: null,
			decisionPublication: { orgName: "1ª Vara Cível", className: null, documentType: "Sentença" },
		}).options.find((option) => option.actKey === "apelacao");

		assertDefined(apelacao, `o órgão do processo "${caseOrgName}" trocou o prazo da sentença`);

		expect(apelacao.days).toBe(15);
		expect(apelacao.confidence).toBe("alta");
	}

	// Sem órgão na publicação e sem grau no movimento sobra o campo volátil. Ele continua desempatando,
	// porque calar seria pior, mas a opção que só ele elegeu sai marcada para conferência.
	const muda = {
		...BASE_CONTEXT,
		className: null,
		decisionGrau: null,
		decisionPublication: { orgName: null, className: null, documentType: null },
	};

	const daCamara = appealAdviceFor({
		...muda,
		species: "interlocutoria",
		caseOrgName: "3ª Câmara de Direito Privado",
	}).options.find((option) => option.actKey === "agravo_interno");

	assertDefined(daCamara);
	assertDefined(daCamara.review);

	expect(daCamara.confidence).toBe("media");
	expect(daCamara.review).toContain("cadastro do processo");

	const daVara = appealAdviceFor({
		...muda,
		species: "interlocutoria",
		caseOrgName: "2ª Vara Cível",
	}).options.find((option) => option.actKey === "agravo_instrumento");

	assertDefined(daVara);
	assertDefined(daVara.review);

	expect(daVara.confidence).toBe("media");

	const inominado = appealAdviceFor({
		...muda,
		caseOrgName: "1º Juizado Especial Cível",
	}).options.find((option) => option.actKey === "recurso_inominado");

	assertDefined(inominado);
	assertDefined(inominado.review);

	expect(inominado.days).toBe(10);
	expect(inominado.confidence).toBe("media");
	expect(inominado.review).toContain("juizado especial");
});

test("documento de acórdão não faz o app dizer quem decidiu a interlocutória", () => {
	// "Acórdão" numa decisão classificada como interlocutória é entrada contraditória: ela não nomeia
	// relator, então não pode eleger o agravo interno com cara de certeza.
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		species: "interlocutoria",
		caseOrgName: null,
		decisionGrau: null,
		decisionPublication: { orgName: null, className: null, documentType: "Acórdão" },
	});

	expect(advice.options.map((option) => option.actKey)).toEqual([
		"agravo_instrumento",
		"embargos_declaracao",
	]);
});

test("a classe do processo não atropela o rito que a publicação da decisão congelou", () => {
	// `cases.class_name` é gravado pela mesma linha que `cases.org_name`, a partir do mesmo item do
	// DJEN, e a última publicação do lote vence. Se ela mandasse, a apelação de 15 dias viraria recurso
	// inominado de 10 sem que nada da decisão tivesse mudado.
	const doJuizado = {
		...BASE_CONTEXT,
		decisionPublication: {
			orgName: "1º Juizado Especial Cível",
			className: "Procedimento do Juizado Especial Cível",
			documentType: "Sentença",
		},
		decisionGrau: "JE",
	};

	for (const className of ["Procedimento Comum Cível", "Recurso Inominado Cível", null]) {
		const advice = appealAdviceFor({ ...doJuizado, className });
		const inominado = advice.options.find((option) => option.actKey === "recurso_inominado");

		assertDefined(inominado, `a classe "${className}" trocou o rito da sentença do juizado`);

		expect(inominado.days).toBe(10);
		expect(inominado.confidence).toBe("alta");
		expect(advice.options.map((option) => option.actKey)).not.toContain("apelacao");
	}

	// E o contrário: o acórdão de câmara não perde o recurso especial porque a classe do processo virou
	// a de um juizado.
	const daCamara = {
		...BASE_CONTEXT,
		species: "acordao" as const,
		decisionPublication: {
			orgName: "3ª Câmara de Direito Privado",
			className: "Apelação Cível",
			documentType: "Acórdão",
		},
		decisionGrau: "G2",
	};

	for (const className of ["Recurso Inominado Cível", "Procedimento do Juizado Especial Cível"]) {
		const especial = appealAdviceFor({ ...daCamara, className }).options.find(
			(option) => option.actKey === "recurso_especial",
		);

		assertDefined(especial);

		expect(especial.admissibilityBasis).toBe("CF, art. 105, III e art. 102, III");
		expect(especial.confidence).toBe("alta");
	}
});

test("a instância corrente não troca o recurso nem o prazo com cara de certeza", () => {
	// `case_instances` é criado, alterado e apagado pelo enriquecimento do DataJud: rodar o sync uma vez
	// não pode trocar em silêncio o recurso e o prazo que a advogada leu ontem.
	const semSinalCongelado = {
		...BASE_CONTEXT,
		className: null,
		caseOrgName: null,
		decisionGrau: null,
		decisionPublication: { orgName: null, className: null, documentType: null },
	};

	const antes = appealAdviceFor({ ...semSinalCongelado, currentGrau: undefined });
	const depois = appealAdviceFor({ ...semSinalCongelado, currentGrau: "JE" });

	expect(antes.options.map((option) => option.actKey)).toEqual(["apelacao", "embargos_declaracao"]);
	expect(depois.options.map((option) => option.actKey)).toEqual([
		"recurso_inominado",
		"embargos_declaracao",
	]);

	// O acórdão é o caso em que a troca não muda o nome do recurso, e por isso passa despercebida: a
	// Súmula 203 aparece do nada e o recurso especial some do rodapé da mesma opção.
	const semTurma = appealAdviceFor({
		...semSinalCongelado,
		species: "acordao",
		currentGrau: undefined,
	});
	const comTurma = appealAdviceFor({
		...semSinalCongelado,
		species: "acordao",
		currentGrau: "TR",
	});
	const especialAntes = semTurma.options.find((option) => option.actKey === "recurso_especial");
	const especialDepois = comTurma.options.find((option) => option.actKey === "recurso_especial");

	assertDefined(especialAntes);
	assertDefined(especialDepois);
	assertDefined(especialAntes.condition);
	assertDefined(especialDepois.condition);

	expect(especialAntes.admissibilityBasis).toBe("CF, art. 105, III e art. 102, III");
	expect(especialAntes.condition).not.toContain("Súmula 203");
	expect(especialDepois.condition).toContain("Súmula 203");

	for (const option of [
		...antes.options,
		...depois.options,
		...semTurma.options,
		...comTurma.options,
	]) {
		expect(option.confidence).toBe("media");
		assertDefined(option.review, `${option.actKey} saiu sem motivo de conferência`);
	}
});

test("decisão de relator de turma recursal não afirma o agravo interno do CPC em nenhuma espécie", () => {
	// A espécie é palpite do classificador, não dado: o aviso do regimento não pode existir num palpite
	// e sumir no outro. Turma recursal é colegiado, então quem chega aqui pela leitura do colegiado
	// precisa passar pela mesma pergunta de rito que a monocrática.
	const doRelator = {
		...BASE_CONTEXT,
		className: "Recurso Inominado Cível",
		decisionGrau: "TR",
		decisionPublication: {
			orgName: "1ª Turma Recursal Cível",
			className: "Recurso Inominado Cível",
			documentType: "Decisão Monocrática",
		},
	};

	for (const species of ["monocratica", "interlocutoria"] as const) {
		const advice = appealAdviceFor({ ...doRelator, species });
		const agravo = advice.options.find((option) => option.actKey === "agravo_interno");

		assertDefined(agravo, `a espécie ${species} não ofereceu o agravo do regimento`);
		assertDefined(agravo.review);

		expect(agravo.confidence).toBe("media");
		expect(agravo.admissibilityBasis).toContain("Regimento interno");
		expect(agravo.review).toContain("Lei 9.099/95");

		const embargos = advice.options.find((option) => option.actKey === "embargos_declaracao");

		assertDefined(embargos);

		expect(embargos.admissibilityBasis).toBe("Lei 9.099/95, art. 48");
	}
});

test("os embargos não trocam de base legal por sinal volátil", () => {
	// O prazo é o mesmo nos três ramos, então aqui não se perde prazo: perde-se o rastro de por qual
	// regra o app respondeu, num app cujo contrato é dizer exatamente isso.
	const semRitoCongelado = {
		...BASE_CONTEXT,
		decisionGrau: null,
		decisionPublication: { orgName: null, className: null, documentType: null },
	};

	const juizado = appealAdviceFor({
		...semRitoCongelado,
		className: null,
		caseOrgName: "1º Juizado Especial Cível",
	}).options.find((option) => option.actKey === "embargos_declaracao");
	const comum = appealAdviceFor({
		...semRitoCongelado,
		className: null,
		caseOrgName: "1ª Vara Cível",
	}).options.find((option) => option.actKey === "embargos_declaracao");

	assertDefined(juizado);
	assertDefined(comum);

	expect(juizado.admissibilityBasis).toBe("Lei 9.099/95, art. 48");
	expect(comum.admissibilityBasis).toBe("CPC, art. 1.022");

	for (const embargos of [juizado, comum]) {
		expect(embargos.confidence).toBe("media");
		assertDefined(embargos.review);
	}

	// Com o rito congelado na publicação da decisão, a base volta a ser afirmação fechada.
	const congelado = appealAdviceFor({
		...BASE_CONTEXT,
		className: null,
		caseOrgName: null,
		decisionPublication: {
			orgName: "1º Juizado Especial Cível",
			className: null,
			documentType: "Sentença",
		},
	}).options.find((option) => option.actKey === "embargos_declaracao");

	assertDefined(congelado);

	expect(congelado.admissibilityBasis).toBe("Lei 9.099/95, art. 48");
	expect(congelado.confidence).toBe("alta");
	expect(congelado.review).toBeNull();
});

const FROZEN_ORG_NAMES = [
	null,
	"2ª Vara Cível",
	"1º Juizado Especial Cível",
	"3ª Câmara de Direito Privado",
	"1ª Turma Recursal Cível",
];
const FROZEN_CLASS_NAMES = [
	null,
	"Procedimento Comum Cível",
	"Procedimento do Juizado Especial Cível",
];
const FROZEN_DOCUMENT_TYPES = [null, "Sentença", "Decisão Monocrática", "Acórdão"];
const FROZEN_GRAUS = [null, "G1", "G2", "JE", "TR", "SUP"];

// As listas voláteis carregam os mesmos textos de juizado das congeladas de propósito: são eles que
// trocam 15 dias por 10, e a invariante só morde se o lado volátil puder tentar essa troca.
const VOLATILE_CLASS_NAMES = [
	null,
	"Procedimento Comum Cível",
	"Procedimento do Juizado Especial Cível",
	"Recurso Inominado Cível",
	"Recurso Ordinário Trabalhista",
];
const VOLATILE_ORG_NAMES = [
	null,
	"2ª Vara Cível",
	"1º Juizado Especial Cível",
	"1ª Turma Recursal Cível",
	"3ª Turma",
];
const VOLATILE_GRAUS = [undefined, "G1", "G2", "JE", "TR", "SUP"];

const FROZEN_PUBLICATIONS = FROZEN_ORG_NAMES.flatMap((orgName) =>
	FROZEN_CLASS_NAMES.flatMap((className) =>
		FROZEN_DOCUMENT_TYPES.map((documentType) => ({ orgName, className, documentType })),
	),
);

// A espécie fica em "alta" na grade de propósito: ela é o outro eixo da resposta e tem teste próprio.
// Solta aqui, rebaixaria toda opção para média e a invariante passaria dizendo nada.
const FROZEN_CONTEXTS = (
	["sentenca", "interlocutoria", "monocratica", "acordao", "despacho"] as const
).flatMap((species) =>
	[CNJ_ESTADUAL, CNJ_TRABALHISTA].flatMap((cnjNumber) =>
		FROZEN_PUBLICATIONS.flatMap((decisionPublication) =>
			FROZEN_GRAUS.map((decisionGrau) => ({
				species,
				speciesConfidence: "alta" as const,
				cnjNumber,
				decisionGrau,
				decisionPublication,
				transitedAt: null,
			})),
		),
	),
);

const VOLATILE_CONTEXTS = VOLATILE_CLASS_NAMES.flatMap((className) =>
	VOLATILE_ORG_NAMES.flatMap((caseOrgName) =>
		VOLATILE_GRAUS.map((currentGrau) => ({ className, caseOrgName, currentGrau })),
	),
);

test("nenhuma opção sai com confiança alta decidida por sinal que a sincronização reescreve", () => {
	// A invariante do catálogo, verificada por força bruta em vez de por leitura: opção com confiança
	// alta tem que ser idêntica sob qualquer reescrita do cadastro do processo e da instância corrente.
	// Se alguma variar, foi um campo volátil que a elegeu, e é a falha que já voltou três vezes em
	// campos vizinhos.
	const falhas: string[] = [];
	const mudas: string[] = [];

	let comAlta = 0;

	for (const frozen of FROZEN_CONTEXTS) {
		const porAssinatura = new Map<string, string>();

		for (const volatile of VOLATILE_CONTEXTS) {
			const advice = appealAdviceFor({ ...frozen, ...volatile });
			const assinatura = JSON.stringify(
				advice.options.filter((option) => option.confidence === "alta"),
			);

			if (!porAssinatura.has(assinatura)) {
				porAssinatura.set(assinatura, JSON.stringify(volatile));
			}

			// A outra metade da invariante: o que não sai com confiança alta tem que dizer o que conferir.
			// Sem isso, rebaixar tudo para média passaria na comparação acima e a advogada continuaria sem
			// saber que a resposta dependeu de um campo que a sincronização reescreve.
			for (const option of advice.options) {
				if (option.confidence !== "alta" && !option.review) {
					mudas.push(`${option.actKey} em ${JSON.stringify({ ...frozen, ...volatile })}`);
				}
			}
		}

		if (porAssinatura.size > 1) {
			falhas.push(`${JSON.stringify(frozen)} => ${JSON.stringify([...porAssinatura])}`);
		}

		if (![...porAssinatura.keys()].includes("[]")) {
			comAlta += 1;
		}
	}

	expect(falhas.slice(0, 2)).toEqual([]);
	expect(mudas.slice(0, 2)).toEqual([]);

	// Uma implementação que devolvesse tudo com confiança média passaria na verificação acima sem dizer
	// nada: a contagem é o que impede que ela vire teste vazio.
	expect(FROZEN_CONTEXTS.length * VOLATILE_CONTEXTS.length).toBeGreaterThan(50_000);
	expect(comAlta).toBeGreaterThan(FROZEN_CONTEXTS.length / 4);
});

test("espécie deduzida do texto não afirma o recurso com confiança alta", () => {
	// A espécie escolhe o ramo inteiro da resposta, e ela é um palpite do classificador com confiança
	// gravada. Palpite que chega à tela como certeza é o mesmo defeito dos campos voláteis, entrando
	// pela outra porta.
	const alta = appealAdviceFor(BASE_CONTEXT).options;
	const baixa = appealAdviceFor({ ...BASE_CONTEXT, speciesConfidence: "baixa" }).options;

	expect(alta.map((option) => option.actKey)).toEqual(baixa.map((option) => option.actKey));
	expect(alta.some((option) => option.confidence === "alta")).toBe(true);

	for (const option of baixa) {
		expect(option.confidence).toBe("media");
		expect(option.review).toContain("deduziu do texto");
	}

	// Média do classificador também é dedução, só que com um sinal a mais.
	for (const option of appealAdviceFor({ ...BASE_CONTEXT, speciesConfidence: "media" }).options) {
		expect(option.confidence).toBe("media");
		assertDefined(option.review);
	}
});

test("despacho deduzido do texto diz por que bloqueou tudo", () => {
	const despacho = { ...BASE_CONTEXT, species: "despacho" as const };
	const certo = appealAdviceFor(despacho).blocked;
	const deduzido = appealAdviceFor({ ...despacho, speciesConfidence: "baixa" }).blocked;

	assertDefined(certo);
	assertDefined(deduzido);

	// Sem opção nenhuma para rebaixar, o bloqueio é o único lugar em que a dúvida cabe: um despacho
	// deduzido errado esconde da advogada o recurso que ela tinha.
	expect(certo.reason).not.toContain("deduziu do texto");
	expect(deduzido.reason).toContain(certo.reason);
	expect(deduzido.reason).toContain("deduziu do texto");
});

test("monocrática de relator de turma recursal não afirma o prazo do CPC", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		species: "monocratica",
		className: "Recurso Inominado Cível",
		decisionPublication: {
			orgName: "1ª Turma Recursal Cível",
			className: null,
			documentType: "Decisão Monocrática",
		},
		currentGrau: "TR",
	});
	const agravo = advice.options.find((option) => option.actKey === "agravo_interno");

	assertDefined(agravo);

	expect(agravo.confidence).toBe("media");
	assertDefined(agravo.review);
	expect(agravo.review).toContain("regimento interno");
});

test("os embargos de declaração citam a regra do ramo, não o CPC em todo lugar", () => {
	const comum = appealAdviceFor(BASE_CONTEXT).options.find(
		(option) => option.actKey === "embargos_declaracao",
	);
	const trabalhista = appealAdviceFor({
		...BASE_CONTEXT,
		cnjNumber: CNJ_TRABALHISTA,
		className: "Ação Trabalhista",
	}).options.find((option) => option.actKey === "embargos_declaracao");
	const juizado = appealAdviceFor({
		...BASE_CONTEXT,
		className: "Procedimento do Juizado Especial Cível",
		decisionPublication: {
			orgName: "2º Juizado Especial Cível",
			className: null,
			documentType: null,
		},
	}).options.find((option) => option.actKey === "embargos_declaracao");

	assertDefined(comum);
	assertDefined(trabalhista);
	assertDefined(juizado);

	expect(comum.admissibilityBasis).toBe("CPC, art. 1.022");
	expect(comum.deadlineBasis).toBe("CPC, art. 1.023");
	expect(trabalhista.admissibilityBasis).toBe("CLT, art. 897-A");
	expect(trabalhista.deadlineBasis).toBe("CLT, art. 897-A");
	expect(juizado.admissibilityBasis).toBe("Lei 9.099/95, art. 48");
	expect(juizado.deadlineBasis).toBe("Lei 9.099/95, art. 50");

	// O prazo de cinco dias úteis é o mesmo nos três: o que muda é a regra que o dá.
	expect([comum.days, trabalhista.days, juizado.days]).toEqual([5, 5, 5]);
});

test("acórdão trabalhista abre recurso de revista em 8 dias, e nunca recurso especial", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		species: "acordao",
		cnjNumber: CNJ_TRABALHISTA,
		className: "Recurso Ordinário Trabalhista",
		caseOrgName: "3ª Turma",
		decisionPublication: {
			orgName: "3ª Turma do Tribunal Regional do Trabalho",
			className: null,
			documentType: "Acórdão",
		},
	});
	const revista = advice.options.find((option) => option.actKey === "recurso_revista");

	assertDefined(revista);

	expect(revista.days).toBe(8);
	expect(revista.unit).toBe("uteis");
	expect(revista.admissibilityBasis).toBe("CLT, art. 896");
	expect(revista.deadlineBasis).toBe("Lei 5.584/70, art. 6");
	expect(advice.options.map((option) => option.actKey)).not.toContain("recurso_especial");

	// A regra do ramo trabalhista não é certeza fechada: ela chega marcada para conferência, em vez de
	// entregar um prazo com cara de certo.
	expect(revista.confidence).toBe("media");
	assertDefined(revista.review);
});

test("monocrática trabalhista abre agravo interno com o prazo do ramo, não o do CPC", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		species: "monocratica",
		cnjNumber: CNJ_TRABALHISTA,
		decisionPublication: {
			orgName: "Gabinete do Desembargador Relator",
			className: null,
			documentType: "Decisão Monocrática",
		},
	});
	const interno = advice.options.find((option) => option.actKey === "agravo_interno_trabalhista");

	assertDefined(interno);

	expect(interno.days).toBe(8);
	expect(interno.needsPreparo).toBe(false);
	expect(interno.admissibilityBasis).toContain("CLT, art. 769");
	expect(interno.deadlineBasis).toBe("Lei 5.584/70, art. 6");
	expect(interno.confidence).toBe("media");
	assertDefined(interno.review);
	expect(advice.options.map((option) => option.actKey)).not.toContain("agravo_interno");
});

test("acórdão de turma recursal não abre recurso especial", () => {
	const advice = appealAdviceFor({
		...BASE_CONTEXT,
		species: "acordao",
		className: "Recurso Inominado Cível",
		decisionPublication: {
			orgName: "1ª Turma Recursal Cível",
			className: null,
			documentType: null,
		},
		currentGrau: "TR",
	});
	const especial = advice.options.find((option) => option.actKey === "recurso_especial");

	assertDefined(especial);
	assertDefined(especial.condition);

	expect(especial.condition).toContain("Súmula 203");
});

test("despacho não é recorrível e o trânsito em julgado fecha todas as vias", () => {
	const despacho = appealAdviceFor({ ...BASE_CONTEXT, species: "despacho" });

	assertDefined(despacho.blocked);

	expect(despacho.options).toHaveLength(0);
	expect(despacho.blocked.basis).toBe("CPC, art. 1.001");

	const transitado = appealAdviceFor({
		...BASE_CONTEXT,
		transitedAt: new Date("2026-04-01T00:00:00Z"),
	});

	assertDefined(transitado.blocked);

	expect(transitado.options).toHaveLength(0);
	expect(transitado.blocked.basis).toBe("CPC, art. 502");
});

test(
	"escolher recorrer abre prazo com memória de cálculo e o ato nomeado na agenda",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7501");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_ESTADUAL,
			tribunal: "TJSP",
		});

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber: CNJ_ESTADUAL,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			textPlain: "Diante do exposto, JULGO IMPROCEDENTE o pedido. Condeno o autor nas custas.",
		});

		await tx.insert(movements).values({
			caseId,
			publicationId,
			occurredAt: new Date("2026-05-04T00:00:00Z"),
			type: "Intimação",
			summary: "sentença publicada",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const recorriveis = await client.appeals.byCase({ cnjNumber: CNJ_ESTADUAL });
		const first = recorriveis.items[0];

		assertDefined(first);

		expect(first.decision.species).toBe("sentenca");
		expect(first.choice).toBeUndefined();

		await client.appeals.choose({
			decisionId: first.decision.id,
			choice: "recorrer",
			actKey: "apelacao",
		});

		const agenda = await client.deadlines.list({ query: "Apelação" });
		const prazo = agenda.items[0];

		assertDefined(prazo);

		expect(prazo.title).toBe("Apelação");
		expect(prazo.origin).toBe("manual");
		expect(prazo.audience).toBe("partes");
		expect(prazo.basis).toContain("CPC, art. 1.009");
		expect(prazo.dueAt).toBe("2026-05-26");

		const depois = await client.appeals.byCase({ cnjNumber: CNJ_ESTADUAL });

		expect(depois.items[0]?.choice?.choice).toBe("recorrer");
		expect(depois.items[0]?.choice?.deadlineId).toBe(prazo.id);
	}),
);

async function seedAct(
	tx: Tx,
	input: {
		lawyer: Awaited<ReturnType<typeof seedLawyer>>;
		caseId: string;
		cnjNumber: string;
		availableAt: string;
		documentType: string;
		orgName?: string;
		textPlain: string;
	},
) {
	const publicationId = await seedPublication(tx, {
		lawyerIds: [input.lawyer.id],
		caseId: input.caseId,
		cnjNumber: input.cnjNumber,
		availableAt: input.availableAt,
		documentType: input.documentType,
		orgName: input.orgName,
		textPlain: input.textPlain,
	});

	await tx.insert(movements).values({
		caseId: input.caseId,
		publicationId,
		occurredAt: new Date(`${input.availableAt}T00:00:00Z`),
		type: "Intimação",
		summary: "ato publicado",
	});
}

async function adviceOf(
	tx: Tx,
	input: {
		lawyer: Awaited<ReturnType<typeof seedLawyer>>;
		cnjNumber: string;
		species: DecisionSpecies;
	},
) {
	const { items } = await createTestClient(tx, input.lawyer).appeals.byCase({
		cnjNumber: input.cnjNumber,
	});
	const found = items.find((item) => item.decision.species === input.species);

	assertDefined(found, `nenhuma decisão classificada como ${input.species}`);

	return found.advice;
}

test(
	"processo com documento de juizado e sentença de vara cível abre apelação de 15 dias, e o acórdão dele não leva a ressalva da Súmula 203",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7504");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_JUIZADO_JE_PRIMEIRO,
			tribunal: "TJSP",
			graus: ["JE", "G1"],
			className: "Procedimento Comum Cível",
			orgName: "2ª Vara Cível",
		});

		await seedAct(tx, {
			lawyer: alice,
			caseId,
			cnjNumber: CNJ_JUIZADO_JE_PRIMEIRO,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			textPlain: "Diante do exposto, JULGO IMPROCEDENTE o pedido. Condeno o autor nas custas.",
		});

		await seedAct(tx, {
			lawyer: alice,
			caseId,
			cnjNumber: CNJ_JUIZADO_JE_PRIMEIRO,
			availableAt: "2026-06-15",
			documentType: "Acórdão",
			textPlain:
				"Vistos, relatados e discutidos estes autos, ACORDAM os integrantes desta Câmara em negar provimento ao recurso.",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const sentenca = await adviceOf(tx, {
			lawyer: alice,
			cnjNumber: CNJ_JUIZADO_JE_PRIMEIRO,
			species: "sentenca",
		});
		const apelacao = sentenca.options.find((option) => option.actKey === "apelacao");

		assertDefined(apelacao, "a sentença de vara cível não abriu apelação");

		expect(apelacao.days).toBe(15);
		expect(apelacao.unit).toBe("uteis");
		expect(sentenca.options.map((option) => option.actKey)).not.toContain("recurso_inominado");

		const acordao = await adviceOf(tx, {
			lawyer: alice,
			cnjNumber: CNJ_JUIZADO_JE_PRIMEIRO,
			species: "acordao",
		});
		const especial = acordao.options.find((option) => option.actKey === "recurso_especial");

		assertDefined(especial);
		assertDefined(especial.condition);

		expect(especial.admissibilityBasis).toBe("CF, art. 105, III e art. 102, III");
		expect(especial.condition).not.toContain("Súmula 203");
	}),
);

test(
	"interlocutória publicada pela câmara cabe agravo interno mesmo com o processo apontando a vara",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7505");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_TRIBUNAL_COM_ORIGEM,
			tribunal: "TJSP",
			graus: ["G1", "G2"],
			className: "Procedimento Comum Cível",
			orgName: "2ª Vara Cível",
		});

		await seedAct(tx, {
			lawyer: alice,
			caseId,
			cnjNumber: CNJ_TRIBUNAL_COM_ORIGEM,
			availableAt: "2026-05-04",
			documentType: "Decisão",
			orgName: "2ª Câmara de Direito Privado",
			textPlain: "DEFIRO a tutela recursal para suspender os efeitos da decisão agravada.",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const advice = await adviceOf(tx, {
			lawyer: alice,
			cnjNumber: CNJ_TRIBUNAL_COM_ORIGEM,
			species: "interlocutoria",
		});
		const interno = advice.options.find((option) => option.actKey === "agravo_interno");

		assertDefined(interno, "a interlocutória de relator não abriu agravo interno");

		expect(interno.needsPreparo).toBe(false);
		expect(interno.admissibilityBasis).toBe("CPC, art. 1.021");
		expect(advice.options.map((option) => option.actKey)).not.toContain("agravo_instrumento");
	}),
);

test(
	"acórdão de TRT abre prazo de recurso de revista com a ressalva de conferência junto",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7507");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_TRABALHISTA,
			tribunal: "TRT15",
			graus: ["G1", "G2"],
			className: "Recurso Ordinário Trabalhista",
			orgName: "3ª Turma",
		});

		await seedAct(tx, {
			lawyer: alice,
			caseId,
			cnjNumber: CNJ_TRABALHISTA,
			availableAt: "2026-05-04",
			documentType: "Acórdão",
			orgName: "3ª Turma do Tribunal Regional do Trabalho",
			textPlain:
				"Vistos, relatados e discutidos estes autos, ACORDAM os integrantes desta Turma em negar provimento ao recurso ordinário.",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const { items } = await client.appeals.byCase({ cnjNumber: CNJ_TRABALHISTA });
		const acordao = items.find((item) => item.decision.species === "acordao");

		assertDefined(acordao, "nenhuma decisão classificada como acórdão");

		await client.appeals.choose({
			decisionId: acordao.decision.id,
			choice: "recorrer",
			actKey: "recurso_revista",
		});

		const agenda = await client.deadlines.list({ query: "revista" });
		const prazo = agenda.items[0];

		assertDefined(prazo);

		expect(prazo.days).toBe(8);
		expect(prazo.basis).toContain("CLT, art. 896");
		expect(prazo.basis).toContain("Lei 5.584/70, art. 6");

		// O prazo do ramo trabalhista sai com confiança média: ele chega à agenda com a ressalva à vista,
		// e não com cara de conta fechada.
		expect(prazo.confidence).toBe("media");
		expect(prazo.warnings.join(" ")).toContain("TST");
	}),
);

test(
	"o órgão do processo virar câmara no meio do prazo não troca o recurso da interlocutória da vara",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7506");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_ORGAO_REESCRITO,
			tribunal: "TJSP",
			graus: ["G1", "G2"],
			className: "Procedimento Comum Cível",
			orgName: "2ª Vara Cível",
		});

		await seedAct(tx, {
			lawyer: alice,
			caseId,
			cnjNumber: CNJ_ORGAO_REESCRITO,
			availableAt: "2026-05-04",
			documentType: "Decisão",
			orgName: "2ª Vara Cível",
			textPlain: "DEFIRO a tutela de urgência para suspender a cobrança até a sentença.",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		// A projeção reescreve `cases.org_name` a cada publicação: uma intimação do relator no agravo já
		// interposto põe a câmara no lugar da vara enquanto o prazo da interlocutória ainda corre. Se
		// esse campo mandasse, a tela passaria a recomendar agravo interno contra decisão de primeiro
		// grau, que é inadmissível, e o prazo do agravo de instrumento morreria calado.
		await tx
			.update(cases)
			.set({ orgName: "3ª Câmara de Direito Privado" })
			.where(eq(cases.id, caseId));

		const client = createTestClient(tx, alice);
		const { items } = await client.appeals.byCase({ cnjNumber: CNJ_ORGAO_REESCRITO });
		const interlocutoria = items.find((item) => item.decision.species === "interlocutoria");

		assertDefined(interlocutoria, "nenhuma decisão classificada como interlocutória");

		expect(interlocutoria.advice.options.map((option) => option.actKey)).toEqual([
			"agravo_instrumento",
			"embargos_declaracao",
		]);

		// Recomendar o recurso certo e depois recusar a abertura do prazo dele seria o mesmo defeito do
		// outro lado: a advogada leria o agravo de instrumento na tela e não conseguiria abrir o prazo.
		await client.appeals.choose({
			decisionId: interlocutoria.decision.id,
			choice: "recorrer",
			actKey: "agravo_instrumento",
		});

		const agenda = await client.deadlines.list({ query: "Agravo" });

		expect(agenda.items[0]?.title).toBe("Agravo de instrumento");
	}),
);

test(
	"o órgão do processo virar juizado não encurta a apelação da sentença proferida pela vara",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7508");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_SENTENCA_REESCRITA,
			tribunal: "TJSP",
			className: "Procedimento Comum Cível",
			orgName: "2ª Vara Cível",
		});

		await seedAct(tx, {
			lawyer: alice,
			caseId,
			cnjNumber: CNJ_SENTENCA_REESCRITA,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			orgName: "2ª Vara Cível",
			textPlain: "Diante do exposto, JULGO IMPROCEDENTE o pedido. Condeno o autor nas custas.",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		// A projeção reescreve `cases.org_name` e pode deixar a classe em branco. Se esses campos
		// mandassem, a apelação de 15 dias viraria recurso inominado de 10 e a advogada protocolaria
		// depois do vencimento achando que ainda tinha prazo.
		await tx
			.update(cases)
			.set({ orgName: "1º Juizado Especial Cível", className: null })
			.where(eq(cases.id, caseId));

		const client = createTestClient(tx, alice);
		const { items } = await client.appeals.byCase({ cnjNumber: CNJ_SENTENCA_REESCRITA });
		const sentenca = items.find((item) => item.decision.species === "sentenca");

		assertDefined(sentenca, "nenhuma decisão classificada como sentença");

		const apelacao = sentenca.advice.options.find((option) => option.actKey === "apelacao");

		assertDefined(apelacao, "a sentença da vara deixou de abrir apelação");

		expect(apelacao.days).toBe(15);
		expect(apelacao.confidence).toBe("alta");
		expect(sentenca.advice.options.map((option) => option.actKey)).not.toContain(
			"recurso_inominado",
		);

		await client.appeals.choose({
			decisionId: sentenca.decision.id,
			choice: "recorrer",
			actKey: "apelacao",
		});

		const agenda = await client.deadlines.list({ query: "Apelação" });
		const prazo = agenda.items[0];

		assertDefined(prazo);

		expect(prazo.days).toBe(15);
		expect(prazo.dueAt).toBe("2026-05-26");
	}),
);

test(
	"recurso não cabível contra a decisão é recusado",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7502");
		const cnjNumber = "75030000920268260100";
		const caseId = await seedCase(tx, { lawyerId: alice.id, cnjNumber, tribunal: "TJSP" });

		const publicationId = await seedPublication(tx, {
			lawyerIds: [alice.id],
			caseId,
			cnjNumber,
			availableAt: "2026-05-04",
			documentType: "Sentença",
			textPlain: "Diante do exposto, JULGO IMPROCEDENTE o pedido.",
		});

		await tx.insert(movements).values({
			caseId,
			publicationId,
			occurredAt: new Date("2026-05-04T00:00:00Z"),
			type: "Intimação",
			summary: "sentença publicada",
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const [first] = (await client.appeals.byCase({ cnjNumber })).items;

		assertDefined(first);

		await expectOrpcError(
			client.appeals.choose({
				decisionId: first.decision.id,
				choice: "recorrer",
				actKey: "agravo_instrumento",
			}),
			"BAD_REQUEST",
		);

		await client.appeals.choose({
			decisionId: first.decision.id,
			choice: "nao_recorrer",
			reason: "Cliente orientado a não recorrer: valor da causa não justifica o preparo.",
		});

		const depois = await client.appeals.byCase({ cnjNumber });

		expect(depois.items[0]?.choice?.choice).toBe("nao_recorrer");
		expect(depois.items[0]?.choice?.deadlineId).toBeNull();
	}),
);

test(
	"decisão cuja espécie o classificador deduziu do texto não recomenda recurso em confiança alta",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7509");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_ESPECIE_DEDUZIDA,
			tribunal: "TJSP",
			className: "Procedimento Comum Cível",
			orgName: "2ª Vara Cível",
		});

		// O classificador real é quem tem que gravar a dúvida: um contexto montado à mão provaria só o
		// catálogo e deixaria passar o encanamento, que é onde a confiança se perdia.
		await seedAct(tx, {
			lawyer: alice,
			caseId,
			cnjNumber: CNJ_ESPECIE_DEDUZIDA,
			availableAt: "2026-05-04",
			documentType: "Decisão",
			orgName: "2ª Vara Cível",
			textPlain: TEXTO_LIMINAR_DEDUZIDA,
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const deduzida = (await client.appeals.byCase({ cnjNumber: CNJ_ESPECIE_DEDUZIDA })).items[0];

		assertDefined(deduzida);

		expect(deduzida.decision.species).toBe("interlocutoria");
		expect(deduzida.decision.speciesConfidence).toBe("baixa");

		// A espécie escolhe recurso, prazo e preparo: recomendar o agravo é certo, afirmá-lo como
		// certeza a partir de uma regex sobre o texto é o que a advogada não pode ler.
		expect(deduzida.advice.options.map((option) => option.actKey)).toContain("agravo_instrumento");

		for (const option of deduzida.advice.options) {
			expect(option.confidence).toBe("media");
			expect(option.review).toContain("deduziu do texto");
		}

		await client.decisions.correct({ id: deduzida.decision.id, species: "interlocutoria" });

		const conferida = (await client.appeals.byCase({ cnjNumber: CNJ_ESPECIE_DEDUZIDA })).items[0];

		assertDefined(conferida);

		// Espécie que a advogada confirmou deixa de ser palpite, e é isso que impede o teste de passar
		// com uma implementação que rebaixasse tudo para média e nunca mais afirmasse nada.
		expect(conferida.decision.speciesConfidence).toBe("alta");
		expect(conferida.advice.options.some((option) => option.confidence === "alta")).toBe(true);
		expect(
			conferida.advice.options.some((option) => option.review?.includes("deduziu do texto")),
		).toBe(false);
	}),
);

test(
	"espécie que troca na reclassificação não entrega duas respostas em confiança alta com atos diferentes",
	withRollback(async (tx) => {
		const alice = await seedLawyer(tx, "7510");
		const caseId = await seedCase(tx, {
			lawyerId: alice.id,
			cnjNumber: CNJ_ESPECIE_TROCADA,
			tribunal: "TJSP",
			className: "Procedimento Comum Cível",
			orgName: "2ª Vara Cível",
		});

		await seedAct(tx, {
			lawyer: alice,
			caseId,
			cnjNumber: CNJ_ESPECIE_TROCADA,
			availableAt: "2026-05-04",
			documentType: "Decisão",
			orgName: "2ª Vara Cível",
			textPlain: TEXTO_LIMINAR_DEDUZIDA,
		});

		await new DecisionManager(tx).scan({ caseIds: [caseId] });

		const client = createTestClient(tx, alice);
		const antes = (await client.appeals.byCase({ cnjNumber: CNJ_ESPECIE_TROCADA })).items[0];

		assertDefined(antes);
		assertDefined(antes.decision.publicationId);

		// O tribunal retificou o teor da mesma publicação e a varredura reclassifica a mesma decisão:
		// `species = excluded.species` troca o ramo inteiro da resposta sem que nada peça permissão.
		await tx
			.update(publications)
			.set({ textPlain: "Diante do exposto, JULGO IMPROCEDENTE o pedido." })
			.where(eq(publications.id, antes.decision.publicationId));

		await new DecisionManager(tx).scan({ caseIds: [caseId], force: true });

		const depois = (await client.appeals.byCase({ cnjNumber: CNJ_ESPECIE_TROCADA })).items[0];

		assertDefined(depois);

		expect(antes.decision.species).toBe("interlocutoria");
		expect(depois.decision.species).toBe("sentenca");
		expect(antes.advice.options.map((option) => option.actKey)).toContain("agravo_instrumento");
		expect(depois.advice.options.map((option) => option.actKey)).toContain("apelacao");

		// Duas respostas em confiança alta apontando atos diferentes para a mesma decisão é o app
		// afirmando duas coisas incompatíveis: a advogada que leu a primeira protocolaria o recurso
		// errado sem nunca saber que a leitura mudou.
		for (const advice of [antes.advice, depois.advice]) {
			expect(advice.options.filter((option) => option.confidence === "alta")).toEqual([]);
		}
	}),
);

// O rito aqui é o congelado (órgão e classe vindos da própria publicação), então nada além da
// espécie pode rebaixar a resposta: o que sobrar em alta terá saído de uma regex sobre o texto.
test("ato lido por regex não vira recurso, prazo, preparo e base em confiança alta", () => {
	const TEXTO_SENTENCA = "Julgo procedente o pedido e condeno a ré ao pagamento de R$ 10.000,00.";
	const TEXTO_LIMINAR = "Defiro em parte o pedido liminar formulado, para suspender o protesto.";
	const TEXTO_MONOCRATICA = "Nego seguimento ao recurso por manifestamente inadmissível.";

	const probes = [
		{ externalCode: "200", documentType: "Intimação", text: TEXTO_SENTENCA, act: "apelacao" },
		{
			externalCode: "198",
			documentType: "Intimação",
			text: TEXTO_LIMINAR,
			act: "agravo_instrumento",
		},
		{
			externalCode: "15162",
			documentType: "Intimação",
			text: TEXTO_LIMINAR,
			act: "agravo_instrumento",
		},
		{ externalCode: "15163", documentType: "Intimação", text: TEXTO_SENTENCA, act: "apelacao" },
		{
			externalCode: "15164",
			documentType: "Intimação",
			text: TEXTO_MONOCRATICA,
			act: "agravo_interno",
		},
		{ externalCode: null, documentType: "Despacho", text: TEXTO_SENTENCA, act: "apelacao" },
		{
			externalCode: null,
			documentType: "Sentença",
			text: TEXTO_LIMINAR,
			act: "agravo_instrumento",
		},
	];

	for (const probe of probes) {
		const classification = classifyDecision(
			movementSource({
				summary: "Intimação",
				type: null,
				externalCode: probe.externalCode,
				publication: publicationOf(probe.text, probe.documentType),
			}),
		);

		assertDefined(classification);

		const advice = appealAdviceFor({
			...BASE_CONTEXT,
			species: classification.species,
			speciesConfidence: classification.speciesConfidence,
			decisionPublication: {
				orgName: "2ª Vara Cível",
				className: "Procedimento Comum Cível",
				documentType: probe.documentType,
			},
		});

		// Sem esta asserção o teste passaria com um catálogo que não respondesse nada.
		expect(advice.options.map((option) => option.actKey)).toContain(probe.act);

		for (const option of advice.options) {
			expect(option.confidence).toBe("media");
			expect(option.review).toContain("Confira o teor da decisão");
			expect(option.days).toBeGreaterThan(0);
			expect(option.admissibilityBasis.length).toBeGreaterThan(0);
		}
	}
});
