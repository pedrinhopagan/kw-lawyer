import { hasAccess } from "@kw-lawyer/api/src/features/access/gate.ts";
import { accessRouter } from "@kw-lawyer/api/src/router/access.ts";
import { authRouter } from "@kw-lawyer/api/src/router/auth.ts";
import { casesRouter } from "@kw-lawyer/api/src/router/cases.ts";
import { publicationsRouter } from "@kw-lawyer/api/src/router/publications.ts";
import { createRouterClient } from "@orpc/server";
import { expect, test } from "bun:test";
import { TEST_ACCESS_PASSWORD, TEST_ACCESS_USER } from "./env-test.ts";
import { createHmac } from "node:crypto";
import { expectOrpcError } from "./utils/assertions.ts";
import { withRollback } from "./utils/db.ts";

function signedTokenFor(user: string, expiresAt: number) {
	const payload = `${user}.${expiresAt}`;
	const signature = createHmac("sha256", TEST_ACCESS_PASSWORD).update(payload).digest("base64url");

	return `${payload}.${signature}`;
}

test(
	"sem o gate liberado nenhuma procedure de dado responde",
	withRollback(async (tx) => {
		const context = { lawyer: null, access: false, db: tx };

		await expectOrpcError(createRouterClient(authRouter, { context }).me(), "ACCESS_REQUIRED");
		await expectOrpcError(createRouterClient(casesRouter, { context }).list({}), "ACCESS_REQUIRED");
		await expectOrpcError(
			createRouterClient(publicationsRouter, { context }).list({}),
			"ACCESS_REQUIRED",
		);
	}),
);

test(
	"o status do gate responde mesmo sem acesso, para a tela saber o que pedir",
	withRollback(async (tx) => {
		const client = createRouterClient(accessRouter, {
			context: { lawyer: null, access: false, db: tx },
		});

		expect(await client.status()).toEqual({ granted: false });
	}),
);

test(
	"credencial correta devolve um token que o gate reconhece",
	withRollback(async (tx) => {
		const client = createRouterClient(accessRouter, {
			context: { lawyer: null, access: false, db: tx },
		});

		const { token } = await client.login({
			user: TEST_ACCESS_USER,
			password: TEST_ACCESS_PASSWORD,
		});

		expect(hasAccess(token)).toBe(true);
	}),
);

test(
	"senha errada não entra",
	withRollback(async (tx) => {
		const client = createRouterClient(accessRouter, {
			context: { lawyer: null, access: false, db: tx },
		});

		await expectOrpcError(
			client.login({ user: TEST_ACCESS_USER, password: "chute" }),
			"UNAUTHORIZED",
		);
	}),
);

test("token forjado, vencido, truncado ou ausente não vale", () => {
	expect(hasAccess()).toBe(false);
	expect(hasAccess(`${TEST_ACCESS_USER}.99999999999999.assinatura-inventada`)).toBe(false);
	expect(hasAccess("outro.99999999999999.assinatura-inventada")).toBe(false);
	expect(hasAccess("sem-separador")).toBe(false);
	expect(hasAccess(`${TEST_ACCESS_USER}.assinatura`)).toBe(false);
});

test("token vencido não vale mesmo com assinatura boa", () => {
	expect(hasAccess(signedTokenFor(TEST_ACCESS_USER, Date.now() - 1))).toBe(false);
	expect(hasAccess(signedTokenFor(TEST_ACCESS_USER, Date.now() + 60_000))).toBe(true);
});

test("usuário com ponto no nome continua sendo reconhecido", () => {
	expect(hasAccess(signedTokenFor("outro.usuario", Date.now() + 60_000))).toBe(false);
});
