import { formatCnj, formatOab, formatPersonName } from "@kw-lawyer/web/src/lib/format.ts";
import { describe, expect, test } from "bun:test";

describe("formatPersonName", () => {
	test("aplica caixa de título em nome que vem todo em maiúsculas", () => {
		expect(formatPersonName("JOANA PEREIRA MENDES")).toBe("Joana Pereira Mendes");
		expect(formatPersonName("ANA LUISA FERREIRA CAMPOS")).toBe("Ana Luisa Ferreira Campos");
	});

	test("preserva iniciais com ponto das partes em segredo de justiça", () => {
		expect(formatPersonName("M.A.B.A.")).toBe("M.A.B.A.");
		expect(formatPersonName("F.S.M.A.")).toBe("F.S.M.A.");
		expect(formatPersonName("F. M. F.")).toBe("F. M. F.");
	});

	test("mantém partículas em minúscula sem rebaixar a primeira palavra", () => {
		expect(formatPersonName("MASSA FALIDA DE INDUSTRIAL CERÂMICOS MODELO LTDA")).toBe(
			"Massa Falida de Industrial Cerâmicos Modelo Ltda",
		);
		expect(formatPersonName("MARIA DE LOURDES EXEMPLO")).toBe("Maria de Lourdes Exemplo");
		expect(formatPersonName("DA SILVA")).toBe("Da Silva");
	});

	test("combina iniciais e partículas no mesmo nome", () => {
		expect(formatPersonName("A. B. DA C.")).toBe("A. B. da C.");
	});

	test("normaliza classe processual do DataJud", () => {
		expect(formatPersonName("PROCEDIMENTO COMUM CÍVEL")).toBe("Procedimento Comum Cível");
	});

	test("colapsa espaços repetidos e é idempotente", () => {
		expect(formatPersonName("  JOSE   CARLOS  VALLONE ")).toBe("Jose Carlos Vallone");

		for (const name of ["M.A.B.A.", "A. B. DA C.", "MASSA FALIDA DE INDUSTRIAL LTDA"]) {
			expect(formatPersonName(formatPersonName(name))).toBe(formatPersonName(name));
		}
	});
});

describe("formatCnj", () => {
	test("aplica a máscara nos 20 dígitos", () => {
		expect(formatCnj("00144695920128260510")).toBe("0014469-59.2012.8.26.0510");
	});

	test("devolve o valor original quando não tem 20 dígitos", () => {
		expect(formatCnj("123")).toBe("123");
	});
});

describe("formatOab", () => {
	test("monta o registro no formato OAB/UF número", () => {
		expect(formatOab({ oabNumber: "999001", oabUf: "SP" })).toBe("OAB/SP 999001");
	});
});
