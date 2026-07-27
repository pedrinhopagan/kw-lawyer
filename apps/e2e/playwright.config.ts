import { defineConfig, devices } from "@playwright/test";
import { CNJ_STUB_PORT, DATAJUD_STUB_BASE_URL, DJEN_STUB_BASE_URL } from "./playwright/cnj-stub.ts";
import { GATE_PASSWORD, GATE_STATE_PATH, GATE_USER } from "./playwright/ui.ts";

// Porta fixa em máquina que roda vários projetos vira teste rodando contra o app do vizinho:
// `reuseExistingServer` aceita o que já está no ar, e a suíte inteira falha sem dizer por quê. Foi o
// que aconteceu com a 5174, o default do vite em todo repositório: o teste entrava no app do vizinho,
// que responde sem gate nenhum, e a tela de acesso nunca aparecia. As portas ficam na faixa deste
// projeto, ao lado das 1995 e 1996 do desenvolvimento, e nenhum servidor de fora é reaproveitado.
const API_PORT = Number(process.env.KW_E2E_API_PORT ?? 1997);
const WEB_PORT = Number(process.env.KW_E2E_WEB_PORT ?? 1998);
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const DATABASE_URL = "postgres://postgres:postgres@localhost:5445/lawyer_e2e";

process.env.DATABASE_URL = DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.DJEN_BASE_URL = DJEN_STUB_BASE_URL;
process.env.DATAJUD_BASE_URL = DATAJUD_STUB_BASE_URL;

// Toda spec que precisa de painel entra pelo formulário, e é sempre a mesma OAB dentro do mesmo
// minuto. Com o teto de produção, a suíte passa a falhar por número de specs em vez de por defeito,
// e a mensagem de limite aparece no lugar da tela esperada. O teto real é provado na integração.
const LOGIN_ATTEMPT_LIMIT = "1000";

process.env.LOGIN_ATTEMPT_LIMIT = LOGIN_ATTEMPT_LIMIT;

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
			name: "gate",
			testDir: "./playwright",
			testMatch: /gate\.setup\.ts$/u,
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "chromium",
			dependencies: ["gate"],
			use: { ...devices["Desktop Chrome"], storageState: GATE_STATE_PATH },
		},
	],

	webServer: [
		{
			command: `bun ./playwright/cnj-stub.ts`,
			port: CNJ_STUB_PORT,
			reuseExistingServer: false,
			timeout: 30_000,
			stdout: "pipe",
			stderr: "pipe",
		},
		{
			command: `bun ./playwright/api-boot.ts`,
			port: API_PORT,
			reuseExistingServer: false,
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
				LOGIN_ATTEMPT_LIMIT: LOGIN_ATTEMPT_LIMIT,
			},
		},
		{
			command: `bun --cwd ../web vite --port ${WEB_PORT}`,
			port: WEB_PORT,
			reuseExistingServer: false,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				API_PROXY_TARGET: API_URL,
			},
		},
	],
});
