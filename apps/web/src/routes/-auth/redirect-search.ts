// Alimenta o `validateSearch` de /login e /entrar, que fica fora do code splitting do TanStack
// Router: import de runtime aqui entra no grafo eager do entry. Por isso só entram constantes.

import { GATE_ORDER } from "@/lib/gates";

const INTERNAL_PATH = /^\/(?!\/)[^\s]*$/u;
const QUERY_OR_HASH = /[?#].*$/u;

// O search da rota é o da raiz com o desta por cima, e a raiz repassa todo parâmetro que vier no
// endereço: omitir a chave mantém o valor cru da URL. Recusar é escrever `undefined` nela.
export function validateRedirectSearch(raw: Record<string, unknown>): { redirect?: string } {
	if (typeof raw.redirect !== "string" || !INTERNAL_PATH.test(raw.redirect)) {
		return { redirect: undefined };
	}

	// Gate nenhum é destino: a cadeia de entrada se remonta sozinha pelo `beforeLoad` de cada tela.
	// Guardar uma delas aqui aninhava um endereço dentro do outro, e ele dobrava de tamanho a cada
	// passagem até travar a aba.
	if (GATE_ORDER.includes(raw.redirect.replace(QUERY_OR_HASH, ""))) {
		return { redirect: undefined };
	}

	return { redirect: raw.redirect };
}
