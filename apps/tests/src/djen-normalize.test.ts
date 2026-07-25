import {
	contentHash,
	extractActBody,
	formatCnj,
	htmlToPlainText,
	summarize,
	toCnjDigits,
} from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { describe, expect, test } from "bun:test";

const publicationHtml = `<html>
	<head><style>b { color: red }</style></head>
	<body><article>
		<section><b>Procedimento Comum C&iacute;vel N&ordm; 4011790-85.2025.8.26.0114/SP</b></section>
		<section><table>
			<tr><td>AUTOR</td><td>: JOANA PEREIRA MENDES</td></tr>
			<tr><td>ADVOGADO(A)</td><td>: ANA LUISA FERREIRA CAMPOS (OAB SP999001)</td></tr>
		</table></section>
		<section><p align="center">DESPACHO/DECIS&Atilde;O</p></section>
		<section>
			<p>Vistos&#46;</p>
			<p>Manifeste-se a parte autora sobre a decis&atilde;o, sob pena de extin&ccedil;&atilde;o do processo sem resolu&ccedil;&atilde;o de m&eacute;rito, na forma do artigo 485, III e &sect; 1&ordm;, do C&oacute;digo de Processo Civil&#46;</p>
			<p>&nbsp;</p>
			<hr>
		</section>
	</article></body>
</html>`;

describe("toCnjDigits", () => {
	test("extrai os dígitos de um número com máscara", () => {
		expect(toCnjDigits("4011790-85.2025.8.26.0114")).toBe("40117908520258260114");
	});

	test("mantém um número que já vem só com dígitos", () => {
		expect(toCnjDigits("40117908520258260114")).toBe("40117908520258260114");
	});

	test("devolve null para ausente, vazio ou fora dos 20 dígitos", () => {
		const itemSemProcesso: { numero_processo?: string } = {};

		expect(toCnjDigits(null)).toBeNull();
		expect(toCnjDigits(itemSemProcesso.numero_processo)).toBeNull();
		expect(toCnjDigits("")).toBeNull();
		expect(toCnjDigits("   ")).toBeNull();
		expect(toCnjDigits("401179085202582601")).toBeNull();
		expect(toCnjDigits("401179085202582601140")).toBeNull();
		expect(toCnjDigits("processo sem número")).toBeNull();
	});
});

describe("formatCnj", () => {
	test("aplica a máscara NNNNNNN-DD.AAAA.J.TR.OOOO", () => {
		expect(formatCnj("40117908520258260114")).toBe("4011790-85.2025.8.26.0114");
	});

	test("é o inverso de toCnjDigits", () => {
		const digits = toCnjDigits("4011790-85.2025.8.26.0114");

		expect(digits).not.toBeNull();
		expect(toCnjDigits(formatCnj(digits ?? ""))).toBe(digits);
	});

	test("recusa entrada que não tem 20 dígitos", () => {
		expect(() => formatCnj("123")).toThrow("Número CNJ precisa ter 20 dígitos");
	});
});

describe("htmlToPlainText", () => {
	test("remove tags e o conteúdo de style", () => {
		const plain = htmlToPlainText(publicationHtml);

		expect(plain).not.toContain("<");
		expect(plain).not.toContain("color: red");
	});

	test("decodifica entidades acentuadas, símbolos e numéricas", () => {
		const plain = htmlToPlainText(publicationHtml);

		expect(plain).toContain("Procedimento Comum Cível N\u00BA 4011790-85.2025.8.26.0114/SP");
		expect(plain).toContain("DESPACHO/DECISÃO");
		expect(plain).toContain("extinção do processo sem resolução de mérito");
		expect(plain).toContain("artigo 485, III e \u00A7 1\u00BA, do Código de Processo Civil.");
		expect(plain).toContain("Vistos.");
		expect(plain).not.toContain("&");
	});

	test("transforma linhas de tabela em quebras e células em colunas legíveis", () => {
		const plain = htmlToPlainText(publicationHtml);

		expect(plain).toContain(
			"AUTOR : JOANA PEREIRA MENDES\nADVOGADO(A) : ANA LUISA FERREIRA CAMPOS",
		);
	});

	test("colapsa espaços e quebras repetidas", () => {
		expect(htmlToPlainText("<p>um</p>\n\n\n<p>   dois    tres   </p>")).toBe("um\ndois tres");
		expect(htmlToPlainText(publicationHtml)).not.toMatch(/\n\n|  /u);
	});

	test("devolve string vazia para html sem conteúdo", () => {
		expect(htmlToPlainText("<html><body><p>&nbsp;</p></body></html>")).toBe("");
	});
});

describe("extractActBody", () => {
	test("TJSP: pula número, classe, assunto e partes até o teor", () => {
		const plain =
			"Processo 0001352-82.2025.8.26.0659 (apensado ao processo 0002514-83.2023.8.26.0659) - Cumprimento de sentença - Turismo - Ysa Operadora de Viagens e Turismo Ltda - Optur - - Vivian Coelho Favini - Vistos. Concedo à recorrente os benefícios da gratuidade de justiça. - ADV: ANA LUISA FERREIRA CAMPOS (OAB 999001/SP)";

		expect(extractActBody(plain)).toBe(
			"Vistos. Concedo à recorrente os benefícios da gratuidade de justiça.",
		);
	});

	test("TJSP: mantém o teor curto sem o bloco de advogados do rodapé", () => {
		const plain =
			"Processo 1000457-41.2026.8.26.0022 - Procedimento do Juizado Especial da Fazenda Pública - Urgência - Sandra Batista dos Santos - Fls. 45/62: Ciência. - ADV: ANA LUISA FERREIRA CAMPOS (OAB 999001/SP)";

		expect(extractActBody(plain)).toBe("Fls. 45/62: Ciência.");
	});

	test("STJ: descarta as linhas de RELATOR, AGRAVANTE e ADVOGADOS", () => {
		const plain = [
			"AREsp 3289843/SP (2026/0234156-2)",
			"RELATOR : MINISTRO PRESIDENTE DO STJ",
			"AGRAVANTE : R L D",
			"ADVOGADOS : ANA LUISA FERREIRA CAMPOS - SP999001",
			"AMANDA LIZA BARBOSA SILVA - SP434598",
			"INTERESSADO : MINISTÉRIO PÚBLICO DO ESTADO DE SÃO PAULO",
			"DECISÃO",
			"Cuida-se de Agravo em Recurso Especial apresentado por R L D à decisão que inadmitiu.",
		].join("\n");

		expect(extractActBody(plain)).toBe(
			"DECISÃO\nCuida-se de Agravo em Recurso Especial apresentado por R L D à decisão que inadmitiu.",
		);
	});

	test("TRF3: descarta o cabeçalho institucional e os rótulos em linha", () => {
		const plain =
			"PODER JUDICIÁRIO 1ª Vara Gabinete JEF de Bragança Paulista Avenida dos Imigrantes, 1411, Jardim América, Bragança Paulista - SP - CEP: 12902-000 PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL (436) Nº 5003372-95.2025.4.03.6329 AUTOR: JULIA BORIM ALVARES DA SILVA ADVOGADO do(a) AUTOR: ANA LUISA FERREIRA CAMPOS - SP999001 REU: BANCO DO BRASIL SA DECISÃO Trata-se de ação revisional de contrato de financiamento estudantil.";

		expect(extractActBody(plain)).toBe(
			"DECISÃO Trata-se de ação revisional de contrato de financiamento estudantil.",
		);
	});

	test("TRT3: descarta o cabeçalho sem rótulo nomeado e para no ato", () => {
		const plain =
			"PODER JUDICIÁRIO JUSTIÇA DO TRABALHO TRIBUNAL REGIONAL DO TRABALHO DA 3ª REGIÃO 1ª VARA DO TRABALHO DE UBERLÂNDIA 0010115-68.2025.5.03.0043 : GABRIEL DE OLIVEIRA VIEIRA DA SILVA : IRMAOS KEHDI COMERCIO IMPORTACAO LTDA INTIMAÇÃO Fica V. Sa. intimado para tomar ciência do Despacho ID f913156 proferido nos autos.";

		expect(extractActBody(plain)).toBe(
			"INTIMAÇÃO Fica V. Sa. intimado para tomar ciência do Despacho ID f913156 proferido nos autos.",
		);
	});

	test("TJMG: descarta o cabeçalho em linha única sem marcador de ato", () => {
		const plain =
			"PODER JUDICIÁRIO DO ESTADO DE MINAS GERAIS Justiça de Primeira Instância Comarca de Poços de Caldas Avenida Doutor David Benedito Ottoni, 749, Jardim dos Estados, Poços de Caldas - MG - CEP: 37701-069 PROCESSO Nº: 5003201-36.2024.8.13.0518 CLASSE: [CÍVEL] PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL (436) ASSUNTO: [Locação de Móvel] Requerente: LOC BEM LTDA - ME CNPJ: 66.280.561/0001-08 Requeridos: GUILHERME BARTOLOSO e outros Não sendo o caso de reconhecimento das hipóteses previstas nos arts. 354/356 do Código de Processo Civil, tem-se que proceder à organização do processo.";

		expect(extractActBody(plain)).toBe(
			"Não sendo o caso de reconhecimento das hipóteses previstas nos arts. 354/356 do Código de Processo Civil, tem-se que proceder à organização do processo.",
		);
	});

	test("TJSC: devolve o texto inteiro quando nada casa como cabeçalho", () => {
		const plain = "Processo sigiloso\nPara visualização do documento, consulte os autos digitais";

		expect(extractActBody(plain)).toBe(plain);
	});

	test("devolve o texto inteiro quando o processo só foi distribuído", () => {
		const plain =
			"Processo 4001446-93.2026.8.26.0022 distribuido para 1ª Vara da Comarca de Amparo na data de 29/05/2026.";

		expect(extractActBody(plain)).toBe(plain);
	});

	test("não confunde a pauta de julgamentos com um cabeçalho de identificação", () => {
		const plain = [
			"10ª Câmara de Direito Civil",
			"Pauta de Julgamentos",
			"Torno público que, de acordo com o art. 934 do Código de Processo Civil, serão julgados os seguintes processos:",
			"Apelação Nº 5037487-46.2023.8.24.0008/ SC (Pauta: 111)",
			"RELATOR : Desembargador JABER FARAH FILHO",
		].join("\n");

		expect(extractActBody(plain)).toBe(plain);
	});

	test("nunca devolve vazio", () => {
		expect(extractActBody("")).toBe("");
		expect(extractActBody("Vistos.")).toBe("Vistos.");
		expect(extractActBody("Processo 1002296-38.2025.8.26.0022 - Alvará Judicial")).toBe(
			"Processo 1002296-38.2025.8.26.0022 - Alvará Judicial",
		);
	});

	test("é idempotente", () => {
		const textos = [
			"Processo 0001352-82.2025.8.26.0659 - Cumprimento de sentença - Turismo - Vivian Coelho Favini - Vistos. Concedo à recorrente os benefícios da gratuidade de justiça.",
			"AREsp 3289843/SP (2026/0234156-2)\nRELATOR : MINISTRO PRESIDENTE DO STJ\nAGRAVANTE : R L D\nDECISÃO\nCuida-se de Agravo em Recurso Especial apresentado por R L D.",
			"Processo sigiloso\nPara visualização do documento, consulte os autos digitais",
		];

		for (const texto of textos) {
			const body = extractActBody(texto);

			expect(extractActBody(body)).toBe(body);
		}
	});

	test("aceita o texto limpo pelo htmlToPlainText", () => {
		expect(extractActBody(htmlToPlainText(publicationHtml))).toBe(
			"DESPACHO/DECISÃO\nVistos.\nManifeste-se a parte autora sobre a decisão, sob pena de extinção do processo sem resolução de mérito, na forma do artigo 485, III e \u00A7 1\u00BA, do Código de Processo Civil.",
		);
	});
});

describe("summarize", () => {
	test("devolve o texto inteiro quando cabe no limite", () => {
		expect(summarize("Despacho publicado hoje.")).toBe("Despacho publicado hoje.");
	});

	test("corta em fronteira de palavra e acrescenta reticências", () => {
		const summary = summarize("intimacao do advogado responsavel pelo processo", 20);

		expect(summary).toBe("intimacao do...");
	});

	test("nunca parte uma palavra ao meio", () => {
		const singleLine = htmlToPlainText(publicationHtml).replaceAll("\n", " ");
		const summary = summarize(singleLine);

		expect(summary.endsWith("...")).toBe(true);
		expect(singleLine.startsWith(`${summary.slice(0, -3)} `)).toBe(true);
		expect(summary.length).toBeLessThanOrEqual(301);
	});

	test("colapsa quebras do texto limpo em uma linha", () => {
		expect(summarize("primeira linha\nsegunda linha")).toBe("primeira linha segunda linha");
	});
});

describe("contentHash", () => {
	const base = {
		source: "djen",
		cnj: "40117908520258260114",
		availableAt: "2026-07-24",
		text: "Vistos. Manifeste-se a parte autora.",
	};

	test("é sha256 em hex", () => {
		expect(contentHash(base)).toMatch(/^[0-9a-f]{64}$/u);
	});

	test("é estável para a mesma entrada", () => {
		expect(contentHash(base)).toBe(contentHash({ ...base }));
	});

	test("muda quando o texto muda", () => {
		expect(contentHash({ ...base, text: `${base.text} ` })).not.toBe(contentHash(base));
		expect(contentHash({ ...base, text: "Outro despacho." })).not.toBe(contentHash(base));
	});

	test("muda quando o processo ou a data mudam", () => {
		expect(contentHash({ ...base, cnj: null })).not.toBe(contentHash(base));
		expect(contentHash({ ...base, cnj: "40117908520258260115" })).not.toBe(contentHash(base));
		expect(contentHash({ ...base, availableAt: "2026-07-25" })).not.toBe(contentHash(base));
		expect(contentHash({ ...base, source: "outro" })).not.toBe(contentHash(base));
	});
});
