import { formatCnj } from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { stubCases, stubLawyer } from "../playwright/cnj-stub.ts";
import { expect, test } from "../playwright/fixtures.ts";
import { enterGate, loginWithOab } from "../playwright/ui.ts";

const BUSCA = "JOANA";

test("rota autenticada sem sessão vai para o login e volta ao destino depois de entrar", async ({
	page,
	scenario: _scenario,
}) => {
	await page.goto(`/processos?q=${BUSCA}`);

	await expect(page).toHaveURL(`/entrar?redirect=%2Fprocessos%3Fq%3D${BUSCA}`);
	await expect(page.getByRole("heading", { name: "Área do painel" })).toBeVisible();

	await enterGate(page);

	await expect(page).toHaveURL(`/login?redirect=%2Fprocessos%3Fq%3D${BUSCA}`);
	await expect(page.getByRole("heading", { name: "Entre com a sua OAB" })).toBeVisible();

	await loginWithOab(page, stubLawyer);

	await expect(page).toHaveURL(`/processos?q=${BUSCA}`);
	await expect(page.getByRole("heading", { name: "Processos", level: 1 })).toBeVisible();
	await expect(page.getByText("1 processo encontrado")).toBeVisible();
	await expect(
		page.getByText(formatCnj(stubCases.falencia.cnjNumber), { exact: true }),
	).toBeVisible();
});
