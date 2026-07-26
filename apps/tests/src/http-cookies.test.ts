import { ACCESS_COOKIE_NAME, createAccessToken } from "@kw-lawyer/api/src/features/access/gate.ts";
import { SESSION_COOKIE_NAME } from "@kw-lawyer/api/src/features/auth/session.ts";
import { createApiApp } from "@kw-lawyer/api/src/http.ts";
import { expect, test } from "bun:test";
import { withRollback } from "./utils/db.ts";
import { seedLawyer } from "./utils/seed.ts";

// O cookie é o único lugar onde a troca de advogado acontece de verdade: o manager pode devolver a
// sessão certa e a aba continuar na anterior se a resposta não carregar o token. Nenhum teste
// alcançava esta camada, e foi exatamente aqui que a suíte de ponta a ponta quebrou.
function callOrpc(app: ReturnType<typeof createApiApp>, path: string, input: unknown, cookie = "") {
	const jar = [`${ACCESS_COOKIE_NAME}=${createAccessToken()}`];

	if (cookie) {
		jar.push(`${SESSION_COOKIE_NAME}=${cookie}`);
	}

	return app.request(`/orpc/${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie: jar.join("; ") },
		body: JSON.stringify({ json: input }),
	});
}

function sessionCookieOf(response: Response) {
	const header = response.headers.get("set-cookie") ?? "";

	return new RegExp(`${SESSION_COOKIE_NAME}=([^;]*)`, "u").exec(header)?.[1];
}

async function entrar(app: ReturnType<typeof createApiApp>, oabNumber: string, cookie = "") {
	const response = await callOrpc(app, "auth/login", { oabNumber, oabUf: "SP" }, cookie);

	expect(response.status).toBe(200);

	const token = sessionCookieOf(response);

	expect(token).toBeTruthy();

	return token ?? "";
}

async function quemEsta(app: ReturnType<typeof createApiApp>, cookie: string) {
	const response = await callOrpc(app, "auth/me", {}, cookie);
	const body = (await response.json()) as { json: { lawyer: { id: string } | null } };

	return body.json.lawyer;
}

test(
	"entrar com a segunda OAB troca o cookie e mantém a primeira sessão viva",
	withRollback(async (tx) => {
		const app = createApiApp({ db: tx });

		const ana = await seedLawyer(tx, "940001");
		const renato = await seedLawyer(tx, "940002");

		const cookieAna = await entrar(app, ana.oabNumber);
		const cookieRenato = await entrar(app, renato.oabNumber, cookieAna);

		expect(cookieRenato).not.toBe(cookieAna);
		expect((await quemEsta(app, cookieRenato))?.id).toBe(renato.id);
		expect((await quemEsta(app, cookieAna))?.id).toBe(ana.id);
	}),
);

test(
	"sair de um perfil devolve na resposta o cookie do perfil que sobrou",
	withRollback(async (tx) => {
		const app = createApiApp({ db: tx });

		const ana = await seedLawyer(tx, "940003");
		const renato = await seedLawyer(tx, "940004");

		const cookieAna = await entrar(app, ana.oabNumber);
		const cookieRenato = await entrar(app, renato.oabNumber, cookieAna);

		const saida = await callOrpc(app, "auth/logout", {}, cookieRenato);

		expect(saida.status).toBe(200);

		const proximo = sessionCookieOf(saida);

		expect(proximo).toBe(cookieAna);
		expect((await quemEsta(app, cookieAna))?.id).toBe(ana.id);
		expect(await quemEsta(app, cookieRenato)).toBeNull();
	}),
);

test(
	"trocar de advogado responde com o cookie do escolhido",
	withRollback(async (tx) => {
		const app = createApiApp({ db: tx });

		const ana = await seedLawyer(tx, "940005");
		const renato = await seedLawyer(tx, "940006");

		const cookieAna = await entrar(app, ana.oabNumber);
		const cookieRenato = await entrar(app, renato.oabNumber, cookieAna);

		const troca = await callOrpc(app, "auth/switch", { lawyerId: ana.id }, cookieRenato);

		expect(troca.status).toBe(200);
		expect(sessionCookieOf(troca)).toBe(cookieAna);
	}),
);

test(
	"sair do último perfil apaga o cookie em vez de entregar outro",
	withRollback(async (tx) => {
		const app = createApiApp({ db: tx });

		const ana = await seedLawyer(tx, "940007");
		const cookieAna = await entrar(app, ana.oabNumber);

		const saida = await callOrpc(app, "auth/logout", {}, cookieAna);

		expect(saida.status).toBe(200);
		expect(sessionCookieOf(saida)).toBe("");
		expect(await quemEsta(app, cookieAna)).toBeNull();
	}),
);
