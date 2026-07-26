import { describe, expect, test } from "bun:test";
import { validateRedirectSearch } from "@kw-lawyer/web/src/routes/-auth/redirect-search.ts";
import { agendaSearchSchema } from "@kw-lawyer/web/src/routes/-agenda/search.ts";
import { parseCaseSearch, parseCasesSearch } from "@kw-lawyer/web/src/routes/-processos/search.ts";
import { inboxSearchSchema } from "@kw-lawyer/web/src/routes/-publicacoes/search.ts";

// Estes parsers decidem quais prazos e publicações a advogada enxerga. Eles saíram do arktype para
// tirar 151 KB do grafo eager do bundle, então a rede que garante que nada mudou é este arquivo:
// URL malformada precisa virar filtro ausente, nunca filtro errado aplicado em silêncio.

describe("agendaSearchSchema", () => {
	test("descarta chave desconhecida e devolve as 16 chaves conhecidas", () => {
		const parsed = agendaSearchSchema({ hackeado: "sim", aba: "revisar" });

		expect(Object.keys(parsed).sort()).toEqual([
			"aba",
			"ate",
			"ato",
			"audiencia",
			"confianca",
			"de",
			"dia",
			"filtro",
			"google",
			"historico",
			"mes",
			"origem",
			"q",
			"status",
			"tribunais",
			"vista",
		]);
		expect(parsed.aba).toBe("revisar");
	});

	test("array repetido na URL não vaza para campo de data", () => {
		expect(agendaSearchSchema({ de: ["2026-01-01", "2026-01-02"] }).de).toBeUndefined();
		expect(agendaSearchSchema({ dia: ["2026-01-01"] }).dia).toBeUndefined();
		expect(agendaSearchSchema({ mes: ["2026-01"] }).mes).toBeUndefined();
	});

	test("valor não string em campo de enum é ignorado", () => {
		expect(agendaSearchSchema({ vista: 1 }).vista).toBeUndefined();
		expect(agendaSearchSchema({ filtro: null }).filtro).toBeUndefined();
		expect(agendaSearchSchema({ google: true }).google).toBeUndefined();
	});

	test("aceita os valores válidos de cada eixo", () => {
		const parsed = agendaSearchSchema({
			vista: "lista",
			filtro: "vencidos",
			de: "2026-01-01",
			ate: "2026-02-01",
			mes: "2026-07",
			google: "conectado",
			historico: true,
		});

		expect(parsed).toMatchObject({
			vista: "lista",
			filtro: "vencidos",
			de: "2026-01-01",
			ate: "2026-02-01",
			mes: "2026-07",
			google: "conectado",
			historico: true,
		});
	});

	test("mês inválido é rejeitado", () => {
		expect(agendaSearchSchema({ mes: "2026-13" }).mes).toBeUndefined();
		expect(agendaSearchSchema({ mes: "2026-00" }).mes).toBeUndefined();
	});

	test("historico só liga com booleano true, nunca com a string", () => {
		expect(agendaSearchSchema({ historico: "true" }).historico).toBeUndefined();
		expect(agendaSearchSchema({ historico: 1 }).historico).toBeUndefined();
		expect(agendaSearchSchema({ historico: true }).historico).toBe(true);
	});

	test("status ausente fica undefined, não array vazio", () => {
		expect(agendaSearchSchema({}).status).toBeUndefined();
		expect(agendaSearchSchema({ status: [] }).status).toBeUndefined();
		expect(agendaSearchSchema({ status: ["inexistente"] }).status).toBeUndefined();
	});

	test("lista de status filtra item a item e deduplica", () => {
		expect(agendaSearchSchema({ status: ["pendente", "pendente", 7, "cumprido"] }).status).toEqual([
			"pendente",
			"cumprido",
		]);
	});

	test("q acima de 200 caracteres é descartado, não truncado", () => {
		expect(agendaSearchSchema({ q: "a".repeat(201) }).q).toBeUndefined();
		expect(agendaSearchSchema({ q: "a".repeat(200) }).q).toBe("a".repeat(200));
		expect(agendaSearchSchema({ q: "  silva  " }).q).toBe("silva");
		expect(agendaSearchSchema({ q: "   " }).q).toBeUndefined();
	});

	test("tribunal e ato respeitam o formato", () => {
		expect(agendaSearchSchema({ tribunais: ["TJSP", "tjsp"] }).tribunais).toEqual(["TJSP"]);
		expect(agendaSearchSchema({ ato: ["embargos_declaracao", "X"] }).ato).toEqual([
			"embargos_declaracao",
		]);
	});
});

describe("inboxSearchSchema", () => {
	test("descarta chave desconhecida e devolve as 7 conhecidas", () => {
		expect(Object.keys(inboxSearchSchema({ hackeado: 1 })).sort()).toEqual([
			"from",
			"historico",
			"page",
			"q",
			"to",
			"tribunal",
			"unread",
		]);
	});

	test("page só aceita inteiro a partir de 2", () => {
		expect(inboxSearchSchema({ page: 1 }).page).toBeUndefined();
		expect(inboxSearchSchema({ page: 0 }).page).toBeUndefined();
		expect(inboxSearchSchema({ page: -3 }).page).toBeUndefined();
		expect(inboxSearchSchema({ page: 1.5 }).page).toBeUndefined();
		expect(inboxSearchSchema({ page: "3" }).page).toBeUndefined();
		expect(inboxSearchSchema({ page: 3 }).page).toBe(3);
	});

	test("q respeita o intervalo de 1 a 200 caracteres", () => {
		expect(inboxSearchSchema({ q: "" }).q).toBeUndefined();
		expect(inboxSearchSchema({ q: "a".repeat(201) }).q).toBeUndefined();
		expect(inboxSearchSchema({ q: " intimação " }).q).toBe("intimação");
	});

	test("array em campo de data não passa", () => {
		expect(inboxSearchSchema({ from: ["2026-01-01"] }).from).toBeUndefined();
		expect(inboxSearchSchema({ from: "2026-01-01" }).from).toBe("2026-01-01");
	});
});

describe("parseCasesSearch", () => {
	test("campo com tipo errado derruba o parse inteiro", () => {
		expect(parseCasesSearch({ q: "silva", page: "abc" })).toEqual({});
		expect(parseCasesSearch({ q: 7 })).toEqual({});
	});

	test("normaliza tribunal e página", () => {
		expect(parseCasesSearch({ q: " silva ", tribunal: "tjsp", page: 3.7 })).toEqual({
			q: "silva",
			tribunal: "TJSP",
			page: 3,
		});
	});

	test("página 1 não entra na URL", () => {
		expect(parseCasesSearch({ page: 1 }).page).toBeUndefined();
	});

	test("tribunal fora do formato é ignorado sem derrubar o resto", () => {
		expect(parseCasesSearch({ q: "silva", tribunal: "tribunal-inteiro" })).toEqual({ q: "silva" });
	});
});

describe("parseCaseSearch", () => {
	const uuid = "0b8c1f2a-3d4e-4f5a-8b9c-0d1e2f3a4b5c";

	test("pub válido abre a aba de andamentos", () => {
		expect(parseCaseSearch({ pub: uuid })).toEqual({ pub: uuid, aba: "andamentos" });
	});

	test("pub inválido não vira aba", () => {
		expect(parseCaseSearch({ pub: "nao-e-uuid" })).toEqual({});
	});

	test("visao-geral não é serializada na URL", () => {
		expect(parseCaseSearch({ aba: "visao-geral" })).toEqual({});
		expect(parseCaseSearch({ aba: "provas" })).toEqual({ aba: "provas" });
	});
});

describe("validateRedirectSearch", () => {
	test("aceita caminho interno", () => {
		expect(validateRedirectSearch({ redirect: "/agenda?vista=lista" })).toEqual({
			redirect: "/agenda?vista=lista",
		});
	});

	test("recusa destino externo e protocol-relative", () => {
		expect(validateRedirectSearch({ redirect: "https://evil.example" })).toEqual({});
		expect(validateRedirectSearch({ redirect: "//evil.example" })).toEqual({});
	});

	test("recusa valor que não é string em vez de lançar", () => {
		expect(validateRedirectSearch({ redirect: ["/agenda"] })).toEqual({});
		expect(validateRedirectSearch({})).toEqual({});
	});
});
