import type { Page } from "@playwright/test";
import { formatCnj } from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { stubCases, stubLawyer, stubPartner } from "../playwright/cnj-stub.ts";
import { expect, test } from "../playwright/fixtures.ts";
import { loginWithOab } from "../playwright/ui.ts";

// O nome da advogada também sai no corpo das publicações, então quem identifica o perfil ativo é o
// botão do rodapé da barra lateral, e não o texto solto na página.
const ANA = /Ana Luisa Ferreira Campos/iu;
const RENATO = /Renato Galvao de Araujo/iu;

async function openLawyerMenu(page: Page, name: RegExp) {
	await page.getByRole("button", { name }).click();
}

test("dois advogados ficam conectados no mesmo navegador e a troca não mistura os painéis", async ({
	page,
	scenario: _scenario,
}) => {
	await page.goto("/login");
	await loginWithOab(page, stubLawyer);

	await expect(page).toHaveURL("/publicacoes");
	await expect(page.getByRole("button", { name: ANA })).toBeVisible();

	await openLawyerMenu(page, ANA);
	await page.getByRole("menuitem", { name: "Entrar com outra OAB" }).click();

	// Sair do último perfil pode chegar ao login por dois caminhos que correm juntos: a navegação da
	// própria saída e a query que ainda estava no ar e voltou sem sessão. Os dois param no login, e
	// exigir um deles transformaria a corrida em teste instável.
	await expect(page).toHaveURL(/\/login/u);
	await expect(page.getByText("continua conectado neste navegador")).toBeVisible();

	await loginWithOab(page, stubPartner);

	await expect(page).toHaveURL("/publicacoes");
	await expect(page.getByRole("button", { name: RENATO })).toBeVisible();

	// O painel do sócio é vazio: nenhum processo da Ana pode aparecer aqui.
	await page.goto("/processos");
	await expect(page.getByText("Nenhum processo por aqui ainda")).toBeVisible();

	await openLawyerMenu(page, RENATO);
	await expect(page.getByRole("menuitem", { name: ANA })).toBeVisible();
	await page.getByRole("menuitem", { name: ANA }).click();

	await expect(page).toHaveURL("/publicacoes");
	await expect(page.getByRole("button", { name: ANA })).toBeVisible();

	await page.goto("/processos");
	await expect(
		page.getByText(formatCnj(stubCases.falencia.cnjNumber), { exact: true }),
	).toBeVisible();
});

test("sair de um advogado deixa o outro conectado e não devolve à tela de OAB", async ({
	page,
	scenario: _scenario,
}) => {
	await page.goto("/login");
	await loginWithOab(page, stubLawyer);
	await expect(page).toHaveURL("/publicacoes");

	await openLawyerMenu(page, ANA);
	await page.getByRole("menuitem", { name: "Entrar com outra OAB" }).click();
	await loginWithOab(page, stubPartner);
	await expect(page.getByRole("button", { name: RENATO })).toBeVisible();

	await openLawyerMenu(page, RENATO);
	await page.getByRole("menuitem", { name: "Sair desta OAB" }).click();

	await expect(page).toHaveURL("/publicacoes");
	await expect(page.getByRole("button", { name: ANA })).toBeVisible();

	// O sócio saiu de verdade: ele não pode ter sobrado no seletor.
	await openLawyerMenu(page, ANA);
	await expect(page.getByRole("menuitem", { name: RENATO })).toBeHidden();
	await page.keyboard.press("Escape");

	await openLawyerMenu(page, ANA);
	await page.getByRole("menuitem", { name: "Sair" }).click();

	// Sair do último perfil pode chegar ao login por dois caminhos que correm juntos: a navegação da
	// própria saída e a query que ainda estava no ar e voltou sem sessão. Os dois param no login, e
	// exigir um deles transformaria a corrida em teste instável.
	await expect(page).toHaveURL(/\/login/u);
});
