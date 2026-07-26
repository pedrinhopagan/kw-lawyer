import { type } from "arktype";

const DATAJUD_PUBLIC_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
const DJEN_PUBLIC_BASE_URL = "https://comunicaapi.pje.jus.br/api/v1";
const DATAJUD_PUBLIC_BASE_URL = "https://api-publica.datajud.cnj.jus.br";
const APP_DEFAULT_BASE_URL = "http://localhost:1995";
const GOOGLE_ACCOUNTS_DEFAULT_BASE_URL = "https://accounts.google.com";
const GOOGLE_OAUTH_DEFAULT_BASE_URL = "https://oauth2.googleapis.com";
const GOOGLE_API_DEFAULT_BASE_URL = "https://www.googleapis.com";

const envSchema = type({
	"PORT?": "string.numeric.parse",
	"NODE_ENV?": "'development' | 'production' | 'test'",
	DATABASE_URL: "string > 0",
	"OBSERVABILITY_DB_PATH?": "string > 0",
	"DATAJUD_API_KEY?": "string > 0",
	"DJEN_BASE_URL?": "string > 0",
	"DATAJUD_BASE_URL?": "string > 0",
	"GOOGLE_CLIENT_ID?": "string > 0",
	"GOOGLE_CLIENT_SECRET?": "string > 0",
	"TOKEN_ENCRYPTION_KEY?": "string >= 32",
	"APP_BASE_URL?": "string > 0",
	"GOOGLE_ACCOUNTS_BASE_URL?": "string > 0",
	"GOOGLE_OAUTH_BASE_URL?": "string > 0",
	"GOOGLE_API_BASE_URL?": "string > 0",
	"ACCESS_USER?": "string > 0",
	"ACCESS_PASSWORD?": "string >= 8",
	"VAPID_PUBLIC_KEY?": "string > 0",
	"VAPID_PRIVATE_KEY?": "string > 0",
	"VAPID_SUBJECT?": "string > 0",
	"WATCH_CLOCK?": "'on' | 'off'",
	"LOGIN_ATTEMPT_LIMIT?": "string.numeric.parse",
});

const parsed = envSchema(process.env);

if (parsed instanceof type.errors) {
	console.error("[env] Configuração inválida:");
	console.error(parsed.summary);
	process.exit(1);
}

export const env = {
	PORT: parsed.PORT ?? 1996,
	NODE_ENV: parsed.NODE_ENV ?? "development",
	DATABASE_URL: parsed.DATABASE_URL,
	OBSERVABILITY_DB_PATH: parsed.OBSERVABILITY_DB_PATH ?? "./data/observability.db",
	DATAJUD_API_KEY: parsed.DATAJUD_API_KEY ?? DATAJUD_PUBLIC_API_KEY,
	DJEN_BASE_URL: parsed.DJEN_BASE_URL ?? DJEN_PUBLIC_BASE_URL,
	DATAJUD_BASE_URL: parsed.DATAJUD_BASE_URL ?? DATAJUD_PUBLIC_BASE_URL,
	GOOGLE_CLIENT_ID: parsed.GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET: parsed.GOOGLE_CLIENT_SECRET,
	TOKEN_ENCRYPTION_KEY: parsed.TOKEN_ENCRYPTION_KEY,
	APP_BASE_URL: parsed.APP_BASE_URL ?? APP_DEFAULT_BASE_URL,
	GOOGLE_ACCOUNTS_BASE_URL: parsed.GOOGLE_ACCOUNTS_BASE_URL ?? GOOGLE_ACCOUNTS_DEFAULT_BASE_URL,
	GOOGLE_OAUTH_BASE_URL: parsed.GOOGLE_OAUTH_BASE_URL ?? GOOGLE_OAUTH_DEFAULT_BASE_URL,
	GOOGLE_API_BASE_URL: parsed.GOOGLE_API_BASE_URL ?? GOOGLE_API_DEFAULT_BASE_URL,
	ACCESS_USER: parsed.ACCESS_USER,
	ACCESS_PASSWORD: parsed.ACCESS_PASSWORD,
	VAPID_PUBLIC_KEY: parsed.VAPID_PUBLIC_KEY,
	VAPID_PRIVATE_KEY: parsed.VAPID_PRIVATE_KEY,
	VAPID_SUBJECT: parsed.VAPID_SUBJECT ?? parsed.APP_BASE_URL ?? APP_DEFAULT_BASE_URL,
	WATCH_CLOCK: parsed.WATCH_CLOCK ?? (parsed.NODE_ENV === "production" ? "on" : "off"),
	// A suíte de ponta a ponta entra dezenas de vezes com a mesma OAB dentro do mesmo minuto e o
	// contador vive na memória do processo, então ela precisa de um teto próprio. Quem prova que a
	// regra vale é o teste de integração, que chama o manager direto com o teto real.
	LOGIN_ATTEMPT_LIMIT: parsed.LOGIN_ATTEMPT_LIMIT ?? 10,
};

export const googleCalendarConfigured = !!(
	env.GOOGLE_CLIENT_ID &&
	env.GOOGLE_CLIENT_SECRET &&
	env.TOKEN_ENCRYPTION_KEY
);

export const accessGateConfigured = !!(env.ACCESS_USER && env.ACCESS_PASSWORD);

export const vapid =
	env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
		? {
				publicKey: env.VAPID_PUBLIC_KEY,
				privateKey: env.VAPID_PRIVATE_KEY,
				subject: env.VAPID_SUBJECT,
			}
		: null;

if (env.NODE_ENV === "production" && !accessGateConfigured) {
	console.error(
		"[env] Em produção o app não sobe sem ACCESS_USER e ACCESS_PASSWORD: seria um painel processual aberto na internet.",
	);
	process.exit(1);
}
