import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../env.ts";

const TOKEN_CIPHER = "aes-256-gcm";
const TOKEN_VERSION = "v1";
const TOKEN_IV_BYTES = 12;
const TOKEN_PARTS = 4;

function tokenKey() {
	if (!env.TOKEN_ENCRYPTION_KEY) {
		throw new Error(
			"TOKEN_ENCRYPTION_KEY não configurada: sem ela não é possível cifrar os tokens do Google Agenda.",
		);
	}

	return createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY).digest();
}

export function encryptToken(plain: string) {
	const iv = randomBytes(TOKEN_IV_BYTES);
	const cipher = createCipheriv(TOKEN_CIPHER, tokenKey(), iv);
	const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);

	return [
		TOKEN_VERSION,
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		encrypted.toString("base64url"),
	].join(":");
}

export function decryptToken(stored: string) {
	const parts = stored.split(":");
	const [version, iv, tag, payload] = parts;

	if (parts.length !== TOKEN_PARTS || version !== TOKEN_VERSION || !iv || !tag || !payload) {
		throw new Error("Token do Google Agenda em formato desconhecido.");
	}

	const decipher = createDecipheriv(TOKEN_CIPHER, tokenKey(), Buffer.from(iv, "base64url"));

	decipher.setAuthTag(Buffer.from(tag, "base64url"));

	return Buffer.concat([
		decipher.update(Buffer.from(payload, "base64url")),
		decipher.final(),
	]).toString("utf8");
}
