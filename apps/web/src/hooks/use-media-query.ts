import { useCallback, useSyncExternalStore } from "react";

// Espelha o breakpoint `md:` do Tailwind (48rem, sem override em index.css). Existe porque cortar
// mobile e desktop só por classe CSS mantém os dois ramos montados na árvore React: no desktop a
// lista inteira da agenda continua sendo renderizada e reconciliada dentro de um display:none.
export const MD_BREAKPOINT = "(min-width: 48rem)";

export function useMediaQuery(query: string) {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const media = window.matchMedia(query);

			media.addEventListener("change", onChange);

			return () => media.removeEventListener("change", onChange);
		},
		[query],
	);

	return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
