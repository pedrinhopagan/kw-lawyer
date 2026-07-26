import { formatCnj } from "@kw-lawyer/api/src/features/djen/normalize.ts";

export const CNJ_STUB_PORT = 3002;
export const CNJ_STUB_URL = `http://localhost:${CNJ_STUB_PORT}`;
export const DJEN_STUB_BASE_URL = `${CNJ_STUB_URL}/djen`;
export const DATAJUD_STUB_BASE_URL = `${CNJ_STUB_URL}/datajud`;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number) {
	return new Date(Date.now() - days * DAY_MS);
}

function dateOnly(days: number) {
	return daysAgo(days).toISOString().slice(0, 10);
}

export const stubLawyer = {
	name: "ANA LUISA FERREIRA CAMPOS",
	oabNumber: "999001",
	oabUf: "SP",
	djenAdvogadoId: 4331,
};

// O sócio existe no banco e nunca no DJEN do stub: é assim que o login o encontra sem chamar o
// governo, e é dele o painel vazio que prova que um perfil não enxerga o processo do outro.
export const stubPartner = {
	name: "RENATO GALVAO DE ARAUJO",
	oabNumber: "999002",
	oabUf: "SP",
	djenAdvogadoId: null,
};

export const stubCases = {
	falencia: {
		cnjNumber: "00144695920128260510",
		tribunal: "TJSP",
		orgName: "1ª Vara Cível do Foro de Rio Claro",
		className: "Falência de Empresários",
		author: "MASSA FALIDA DE CERAMICA MODELO LTDA",
		defendant: "JOANA PEREIRA MENDES",
	},
	execucao: {
		cnjNumber: "50012345620254036100",
		tribunal: "TRF3",
		orgName: "6ª Vara Cível Federal de São Paulo",
		className: "Execução Fiscal",
		author: "UNIÃO FEDERAL - FAZENDA NACIONAL",
		defendant: "TRANSPORTES EXEMPLO LTDA",
	},
};

export const stubPublications = {
	despacho: {
		externalId: 910_001,
		case: stubCases.falencia,
		communicationType: "Intimação",
		documentType: "Despacho",
		title: "Intimação / Despacho",
		availableAt: dateOnly(1),
		body: "Vistos. Manifeste-se a administradora judicial sobre o pedido de habilitação retardatária de crédito apresentado às fls. 2.114/2.130, no prazo de 5 (cinco) dias. Após, tornem os autos conclusos para deliberação. Intime-se.",
	},
	edital: {
		externalId: 910_002,
		case: stubCases.falencia,
		communicationType: "Citação",
		documentType: "Edital",
		title: "Citação / Edital",
		availableAt: dateOnly(9),
		body: "EDITAL DE CONVOCAÇÃO DE CREDORES. Ficam convocados os credores da massa falida para a assembleia geral designada nos autos, na forma do artigo 36 da Lei 11.101/2005, ficando desde já advertidos de que a ausência não suspende os trabalhos.",
	},
	sentenca: {
		externalId: 910_003,
		case: stubCases.execucao,
		communicationType: "Intimação",
		documentType: "Sentença",
		title: "Intimação / Sentença",
		availableAt: dateOnly(4),
		body: "Julgo extinta a execução fiscal, com fundamento no artigo 924, inciso II, do Código de Processo Civil, ante a quitação integral do débito inscrito. Custas na forma da lei. Transitada em julgado, arquivem-se os autos com as cautelas de praxe. Publique-se.",
	},
};

export const stubMovements = {
	conclusao: { code: 51, name: "Conclusão", daysAgo: 2 },
	juntada: { code: 85, name: "Juntada de Petição", daysAgo: 6 },
	distribuicao: { code: 26, name: "Distribuição por sorteio", daysAgo: 40 },
};

type StubPublication = (typeof stubPublications)[keyof typeof stubPublications];

function djenItem(publication: StubPublication) {
	return {
		id: publication.externalId,
		data_disponibilizacao: publication.availableAt,
		siglaTribunal: publication.case.tribunal,
		tipoComunicacao: publication.communicationType,
		tipoDocumento: publication.documentType,
		nomeOrgao: publication.case.orgName,
		nomeClasse: publication.case.className,
		codigoClasse: "159",
		numero_processo: publication.case.cnjNumber,
		numeroprocessocommascara: formatCnj(publication.case.cnjNumber),
		meiocompleto: "Diário de Justiça Eletrônico Nacional",
		link: `https://comunica.pje.jus.br/consulta/${publication.externalId}`,
		texto: `<p>Processo ${formatCnj(publication.case.cnjNumber)} - ${publication.case.className}</p><p>${publication.body}</p><p>ADV: ${stubLawyer.name} (OAB ${stubLawyer.oabNumber}/${stubLawyer.oabUf})</p>`,
		destinatarios: [
			{ nome: publication.case.author, polo: "A" },
			{ nome: publication.case.defendant, polo: "P" },
		],
		destinatarioadvogados: [
			{
				advogado: {
					id: stubLawyer.djenAdvogadoId,
					nome: stubLawyer.name,
					numero_oab: stubLawyer.oabNumber,
					uf_oab: stubLawyer.oabUf,
				},
			},
		],
	};
}

function djenPage(url: URL) {
	const oabNumber = url.searchParams.get("numeroOab")?.replaceAll(/\D/gu, "");
	const oabUf = url.searchParams.get("ufOab")?.trim().toUpperCase();

	if (oabNumber !== stubLawyer.oabNumber || oabUf !== stubLawyer.oabUf) {
		return { status: "success", message: "Nenhum registro encontrado", count: 0, items: [] };
	}

	const from = url.searchParams.get("dataDisponibilizacaoInicio") ?? "";
	const through = url.searchParams.get("dataDisponibilizacaoFim") ?? "9999-12-31";

	const items = Object.values(stubPublications)
		.filter((publication) => publication.availableAt >= from && publication.availableAt <= through)
		.map(djenItem);
	const pageSize = Number(url.searchParams.get("itensPorPagina") ?? items.length);
	const page = Number(url.searchParams.get("pagina") ?? 1);
	const offset = (page - 1) * pageSize;

	return {
		status: "success",
		message: "Consulta realizada com sucesso",
		count: items.length,
		items: items.slice(offset, offset + pageSize),
	};
}

function datajudSource(cnjNumber: string) {
	const found = Object.values(stubCases).find((entry) => entry.cnjNumber === cnjNumber);

	if (!found) {
		return null;
	}

	return {
		id: `${found.tribunal}-${found.cnjNumber}-G1`,
		numeroProcesso: found.cnjNumber,
		tribunal: found.tribunal,
		grau: "G1",
		dataHoraUltimaAtualizacao: daysAgo(1).toISOString(),
		formato: { codigo: 1, nome: "Eletrônico" },
		dataAjuizamento: "20120814143200",
		nivelSigilo: 0,
		classe: { codigo: 159, nome: found.className },
		sistema: { codigo: 1, nome: "PJe" },
		orgaoJulgador: { codigo: 510, nome: found.orgName },
		assuntos: [{ codigo: 9985, nome: "Recuperação judicial e falência" }],
		movimentos: Object.values(stubMovements).map((movement) => ({
			codigo: movement.code,
			nome: movement.name,
			dataHora: daysAgo(movement.daysAgo).toISOString(),
			complementosTabelados: [],
		})),
	};
}

// O stub responde ao lote e só ao lote: uma volta à consulta por processo tem que quebrar a suíte
// aqui, e não passar despercebida como e2e verde.
async function datajudHits(request: Request) {
	const body = (await request.json()) as { query?: { terms?: { numeroProcesso?: string[] } } };
	const cnjNumbers = body.query?.terms?.numeroProcesso;

	if (!Array.isArray(cnjNumbers)) {
		return null;
	}

	const hits = cnjNumbers
		.map((cnjNumber) => datajudSource(cnjNumber))
		.filter((source) => source !== null)
		.map((source) => ({ _id: source.id, _source: source }));

	return { hits: { total: { value: hits.length, relation: "eq" }, hits } };
}

const DJEN_LATENCY_PATH = "/controle/atraso-djen";

// O stub sobrevive à suíte (`reuseExistingServer`), então um teste morto no meio deixaria o atraso
// ligado para todo mundo que rodasse depois. O atraso vale por uma janela curta e se desfaz sozinho.
const DJEN_LATENCY_TTL_MS = 30_000;

// O DJEN de verdade leva segundos por janela, e a carga inicial varre dezenas delas: é nesse tempo
// que a advogada olha a barra de progresso. Contra um stub instantâneo a tela de sincronização
// aparece e some antes de qualquer asserção, e o teste que a conferisse só piscaria.
export async function comAtrasoNoDjen(latencyMs: number, run: () => Promise<void>) {
	await fetch(`${CNJ_STUB_URL}${DJEN_LATENCY_PATH}`, {
		method: "POST",
		body: JSON.stringify({ latencyMs }),
	});

	try {
		await run();
	} finally {
		await fetch(`${CNJ_STUB_URL}${DJEN_LATENCY_PATH}`, {
			method: "POST",
			body: JSON.stringify({ latencyMs: 0 }),
		});
	}
}

if (import.meta.main) {
	let djenLatencyMs = 0;
	let djenLatencyUntil = 0;

	const server = Bun.serve({
		port: CNJ_STUB_PORT,
		async fetch(request) {
			const url = new URL(request.url);

			if (url.pathname === DJEN_LATENCY_PATH) {
				const body = (await request.json()) as { latencyMs?: number };

				djenLatencyMs = body.latencyMs ?? 0;
				djenLatencyUntil = Date.now() + DJEN_LATENCY_TTL_MS;

				return Response.json({ latencyMs: djenLatencyMs });
			}

			if (url.pathname === "/djen/comunicacao") {
				if (djenLatencyMs && Date.now() < djenLatencyUntil) {
					await Bun.sleep(djenLatencyMs);
				}

				return Response.json(djenPage(url));
			}

			if (url.pathname.startsWith("/datajud/api_publica_")) {
				const hits = await datajudHits(request);

				if (!hits) {
					return new Response("stub do DataJud só responde consulta em lote (terms)", {
						status: 400,
					});
				}

				return Response.json(hits);
			}

			return new Response("stub do CNJ não conhece esta rota", { status: 404 });
		},
	});

	console.log(`[e2e] stub do CNJ ouvindo em ${server.url.origin}`);
}
