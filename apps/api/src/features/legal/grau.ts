// O juizado é o rito mais simples do primeiro grau, não uma instância acima da vara: empatar os dois
// fazia o processo de vara cível com documento de juizado aparecer como juizado no cabeçalho. Esta é
// a única ordem de grau do app: ordenar por texto punha G1 antes de JE e congelava 15 dias onde o
// rito é de 10.
const GRAU_RANK: Record<string, number> = { JE: 1, G1: 2, TR: 3, G2: 4, SUP: 5 };

export function grauRank(grau: string | null | undefined) {
	if (!grau) {
		return 0;
	}

	return GRAU_RANK[grau] ?? 0;
}

// O mesmo movimento aparece no documento de mais de uma instância quando o tribunal replica o
// histórico ao subir o processo. Ele ocorreu na mais baixa, e é ela que dita o rito recursal daquele
// ato. Documento que não declarou grau nenhum não desempata coisa alguma.
export function lowerGrau(left: string | null | undefined, right: string | null | undefined) {
	if (!left || !right) {
		return left ?? right;
	}

	if (grauRank(left) <= grauRank(right)) {
		return left;
	}

	return right;
}
