import type { MovementComplement } from "@kw-lawyer/api/src/db/schema/movements.ts";
import {
	HEARING_MOVEMENT_CODE,
	type SignalMovement,
	signalsOf,
} from "@kw-lawyer/api/src/features/cases/signals.ts";
import { expect, test } from "bun:test";
import { assertDefined } from "./utils/assertions.ts";

const MS_PER_DAY = 86_400_000;

// Base congelada: `Date.now()` a cada chamada faria a data usada para montar o dado diferir da usada
// no assert por alguns milissegundos, e o teste falharia só sob carga.
const NOW = Date.now();

function daysAgo(days: number) {
	return new Date(NOW - days * MS_PER_DAY);
}

function movement(input: {
	summary: string;
	days: number;
	externalCode?: string;
	complements?: MovementComplement[];
}): SignalMovement {
	return {
		summary: input.summary,
		occurredAt: daysAgo(input.days),
		externalCode: input.externalCode ? input.externalCode : null,
		complements: input.complements ? input.complements : null,
	};
}

// Complementos copiados do que o DataJud realmente devolve no movimento 970: situação, tipo e quem
// dirigiu. Nenhum deles carrega a data da audiência.
const HEARING_COMPLEMENTS = [
	{ nome: "designada", valor: 9, codigo: 15, descricao: "situacao_da_audiencia" },
	{ nome: "conciliação", valor: 17, codigo: 16, descricao: "tipo_de_audiencia" },
	{ nome: "Juiz(a)", valor: 185, codigo: 36, descricao: "dirigida_por" },
];

test("a faixa mostra um sinal por tipo, o mais recente de cada", () => {
	const { signals } = signalsOf([
		movement({ summary: "Conclusão para decisão", days: 5 }),
		movement({ summary: "Juntada de petição", days: 20 }),
		movement({ summary: "Conclusão para julgamento", days: 60 }),
		movement({ summary: "Redistribuição por prevenção", days: 200 }),
	]);

	expect(signals.map((signal) => signal.kind)).toEqual(["conclusao", "redistribuido"]);
	expect(signals[0]?.occurredAt).toEqual(daysAgo(5));
});

test("audiência designada vira sinal com tipo e situação, nunca com data inventada", () => {
	const { hearing } = signalsOf([
		movement({
			summary: "Audiência: designada, conciliação",
			days: 12,
			externalCode: HEARING_MOVEMENT_CODE,
			complements: HEARING_COMPLEMENTS,
		}),
	]);

	assertDefined(hearing);
	expect(hearing.situation).toBe("designada");
	expect(hearing.type).toBe("conciliação");
	expect(hearing.registeredAt).toEqual(daysAgo(12));
	expect(Object.keys(hearing)).toEqual(["situation", "type", "registeredAt", "summary"]);
});

test("audiência sem complemento de situação não é chutada como designada", () => {
	const { hearing } = signalsOf([
		movement({
			summary: "Audiência: Juiz(a)",
			days: 4,
			externalCode: HEARING_MOVEMENT_CODE,
			complements: [{ nome: "Juiz(a)", valor: 185, codigo: 36, descricao: "dirigida_por" }],
		}),
	]);

	assertDefined(hearing);
	expect(hearing.situation).toBe("indefinida");
	expect(hearing.type).toBeNull();
});

test("a situação lida é a do movimento de audiência mais recente", () => {
	const { hearing } = signalsOf([
		movement({
			summary: "Audiência: conciliação, redesignada",
			days: 2,
			externalCode: HEARING_MOVEMENT_CODE,
			complements: [
				{ nome: "redesignada", valor: 10, codigo: 15, descricao: "situacao_da_audiencia" },
				{ nome: "conciliação", valor: 17, codigo: 16, descricao: "tipo_de_audiencia" },
			],
		}),
		movement({
			summary: "Audiência: designada, conciliação",
			days: 90,
			externalCode: HEARING_MOVEMENT_CODE,
			complements: HEARING_COMPLEMENTS,
		}),
	]);

	assertDefined(hearing);
	expect(hearing.situation).toBe("redesignada");
});

test("processo sem movimento de audiência não inventa audiência", () => {
	expect(signalsOf([movement({ summary: "Juntada de petição", days: 1 })]).hearing).toBeNull();
});

test("a faixa lista um sinal por tipo, do mais recente para o mais antigo", () => {
	const result = signalsOf([
		movement({ summary: "Conclusão para julgamento", days: 30 }),
		movement({ summary: "Remessa ao Tribunal de Justiça", days: 400 }),
	]);

	expect(result.signals.map((signal) => signal.kind)).toEqual(["conclusao", "remetido"]);
});
