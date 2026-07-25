import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
	envPrefix: ["IS_"],
	plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
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
