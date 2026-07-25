import { defineConfig, devices } from "@playwright/test";
import { CNJ_STUB_PORT, DATAJUD_STUB_BASE_URL, DJEN_STUB_BASE_URL } from "./playwright/cnj-stub.ts";
import { GATE_PASSWORD, GATE_USER } from "./playwright/ui.ts";

const API_PORT = 3001;
const WEB_PORT = 5174;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const DATABASE_URL = "postgres://postgres:postgres@localhost:5445/lawyer_e2e";

process.env.DATABASE_URL = DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.DJEN_BASE_URL = DJEN_STUB_BASE_URL;
process.env.DATAJUD_BASE_URL = DATAJUD_STUB_BASE_URL;

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",

	use: {
		baseURL: WEB_URL,
		trace: "retain-on-failure",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	webServer: [
		{
			command: `bun ./playwright/cnj-stub.ts`,
			port: CNJ_STUB_PORT,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
			stdout: "pipe",
			stderr: "pipe",
		},
		{
			command: `bun ./playwright/api-boot.ts`,
			port: API_PORT,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				PORT: String(API_PORT),
				NODE_ENV: "test",
				DATABASE_URL,
				DJEN_BASE_URL: DJEN_STUB_BASE_URL,
				DATAJUD_BASE_URL: DATAJUD_STUB_BASE_URL,
				// O gate fica ligado no E2E: em produção ele é a primeira porta, e o teste que não
				// passa por ele não prova nada sobre o app publicado.
				ACCESS_USER: GATE_USER,
				ACCESS_PASSWORD: GATE_PASSWORD,
			},
		},
		{
			command: `bun --cwd ../web vite --port ${WEB_PORT}`,
			port: WEB_PORT,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				API_PROXY_TARGET: API_URL,
			},
		},
	],
});
