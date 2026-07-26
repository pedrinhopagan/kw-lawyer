interface SearchBody {
	query: { terms: { numeroProcesso: string[] } };
	size: number;
}

function hit(cnjNumber: string, index: number) {
	return {
		_id: `${cnjNumber}-${index}`,
		_source: {
			id: `${cnjNumber}-${index}`,
			numeroProcesso: cnjNumber,
			grau: "G1",
			dataHoraUltimaAtualizacao: "2026-05-02T10:00:00.000Z",
		},
	};
}

// O DataJud é Elasticsearch: o `size` corta o lote inteiro, e quem fica de fora é escolha do
// servidor. O stub corta igual e devolve o total real, que é o único sinal do truncamento. Quando
// `withTotal` é falso ele imita o servidor que não mandou o total, que é a resposta que o app não
// sabe ler e por isso precisa recusar.
export function datajudElasticsearch(input: {
	documentsByCnj: Record<string, number>;
	declaredByCnj: Record<string, number>;
	withTotal: boolean;
}) {
	const calls: { cnjNumbers: string[]; size: number }[] = [];

	const server = Bun.serve({
		port: 0,
		fetch: async (request) => {
			const body = (await request.json()) as SearchBody;
			const cnjNumbers = body.query.terms.numeroProcesso;

			calls.push({ cnjNumbers, size: body.size });

			const documents = cnjNumbers.flatMap((cnjNumber) =>
				Array.from({ length: input.documentsByCnj[cnjNumber] ?? 0 }, (_, index) =>
					hit(cnjNumber, index),
				),
			);
			const total = cnjNumbers.reduce(
				(sum, cnjNumber) =>
					sum + (input.declaredByCnj[cnjNumber] ?? input.documentsByCnj[cnjNumber] ?? 0),
				0,
			);
			const hits = documents.slice(0, body.size);

			if (!input.withTotal) {
				return Response.json({ hits: { hits } });
			}

			return Response.json({ hits: { total: { value: total, relation: "eq" }, hits } });
		},
	});

	return { calls, server };
}
