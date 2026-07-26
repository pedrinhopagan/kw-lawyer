import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";

const SW_VERSION_TOKEN = "__KW_LAWYER_SW_VERSION__";

// Sem versão nova no corpo do sw.js o navegador considera o arquivo idêntico e mantém o service worker
// antigo depois do deploy. O hash dos assets emitidos é o que muda em todo build. O selo acontece
// depois da escrita porque o sw.js vem de `public/`, copiado fora do bundle do rollup.
function stampServiceWorkerVersion(): Plugin {
	let outDir = "dist";
	let version = "";

	return {
		name: "kw-lawyer-sw-version",
		apply: "build",
		configResolved(config) {
			outDir = resolve(config.root, config.build.outDir);
		},
		generateBundle(_options, bundle) {
			version = createHash("sha256")
				.update(Object.keys(bundle).sort().join("|"))
				.digest("hex")
				.slice(0, 12);
		},
		async closeBundle() {
			const target = resolve(outDir, "sw.js");
			const source = await readFile(target, "utf8");

			if (!source.includes(SW_VERSION_TOKEN)) {
				throw new Error(`${target} não tem ${SW_VERSION_TOKEN}: o cache do PWA ficaria sem selo.`);
			}

			await writeFile(target, source.replaceAll(SW_VERSION_TOKEN, version));
		},
	};
}

export default defineConfig({
	envPrefix: ["IS_"],
	plugins: [
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
		stampServiceWorkerVersion(),
	],
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "./src"),
			"@api": resolve(import.meta.dirname, "../api/src"),
		},
	},
	server: {
		port: 1995,
		strictPort: true,
		proxy: {
			"/orpc": process.env.API_PROXY_TARGET ?? "http://localhost:1996",
			"/auth/google": process.env.API_PROXY_TARGET ?? "http://localhost:1996",
		},
	},
});
