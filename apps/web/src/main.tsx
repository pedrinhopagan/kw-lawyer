import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { queryClient } from "./lib/orpc";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
	routeTree,
	context: { queryClient },
	defaultPreload: "intent",
	scrollRestoration: true,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.querySelector("#root");

if (!rootElement) {
	throw new Error("Elemento #root não encontrado");
}

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);

// Registro fora do React de propósito: o service worker é do documento, não de um componente, e o
// Web Push depende dele estar pronto antes de qualquer tela pedir permissão. Em dev fica fora para
// não competir com o HMR.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
	await navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
		console.error("[pwa] service worker não registrou", error);
	});
}
