// Alimenta o `validateSearch` de /login e /entrar, que fica fora do code splitting do TanStack
// Router: import de runtime aqui entra no grafo eager do entry. Por isso é TypeScript puro.

const INTERNAL_PATH = /^\/(?!\/)[^\s]*$/u;

export function validateRedirectSearch(raw: Record<string, unknown>): { redirect?: string } {
	if (typeof raw.redirect !== "string" || !INTERNAL_PATH.test(raw.redirect)) {
		return {};
	}

	return { redirect: raw.redirect };
}
