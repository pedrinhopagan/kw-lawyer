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
};

export const googleCalendarConfigured = !!(
	env.GOOGLE_CLIENT_ID &&
	env.GOOGLE_CLIENT_SECRET &&
	env.TOKEN_ENCRYPTION_KEY
);

export const accessGateConfigured = !!(env.ACCESS_USER && env.ACCESS_PASSWORD);

if (env.NODE_ENV === "production" && !accessGateConfigured) {
	console.error(
		"[env] Em produção o app não sobe sem ACCESS_USER e ACCESS_PASSWORD: seria um painel processual aberto na internet.",
	);
	process.exit(1);
}
