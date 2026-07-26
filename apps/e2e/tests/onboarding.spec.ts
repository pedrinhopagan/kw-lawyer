import { comAtrasoNoDjen, stubLawyer, stubPublications } from "../playwright/cnj-stub.ts";
import { expect, test } from "../playwright/fixtures.ts";
import { loginWithOab } from "../playwright/ui.ts";

const SYNC_TIMEOUT_MS = 20_000;

// Atraso por janela do DJEN: segura a etapa de descoberta tempo suficiente para a tela ser lida e
// recarregada, sem esticar a suíte.
const DJEN_LATENCY_MS = 150;

test("primeiro acesso cai no convite, sincroniza e entrega as publicações", async ({ page }) => {
	await page.goto("/login");

	await loginWithOab(page, stubLawyer);

	await expect(page).toHaveURL("/comecar");

	const comecar = page.getByRole("button", { name: "Começar" });

	await expect(comecar).toBeVisible();
	await comecar.click();

	await expect(comecar).toBeHidden();

	await expect(page).toHaveURL("/publicacoes", { timeout: SYNC_TIMEOUT_MS });
	await expect(page.getByRole("heading", { name: "Publicações", level: 1 })).toBeVisible();

	await expect(
		page.getByRole("button", {
			name: new RegExp(`^Abrir ${stubPublications.despacho.title}`, "u"),
		}),
	).toBeVisible({ timeout: SYNC_TIMEOUT_MS });

	await expect(
		page.getByLabel(`${Object.keys(stubPublications).length} publicações não lidas`),
	).toBeVisible({ timeout: SYNC_TIMEOUT_MS });
});

test("a carga troca de etapa na tela e diz onde parou depois do F5", async ({ page }) => {
	await page.goto("/login");

	await loginWithOab(page, stubLawyer);

	await expect(page).toHaveURL("/comecar");

	const convite = page.getByRole("button", { name: "Começar" });
	const carregando = page.getByRole("heading", { name: "Baixando o seu histórico" });
	const etapa = page.getByRole("status").filter({ hasText: "Buscando publicações" });
	const contador = page.getByText("etapa 1 de 4");

	await comAtrasoNoDjen(DJEN_LATENCY_MS, async () => {
		await convite.click();

		await expect(convite).toBeHidden();
		await expect(carregando).toBeVisible();
		await expect(etapa).toBeVisible();
		await expect(contador).toBeVisible();

		// O progresso mora no run, não na conexão que o viu começar: quem recarrega no meio volta para a
		// mesma etapa em vez de cair no convite ou ficar sem nada até a próxima página do DJEN chegar.
		await page.reload();

		await expect(page).toHaveURL("/comecar");
		await expect(carregando).toBeVisible();
		await expect(etapa).toBeVisible();
		await expect(contador).toBeVisible();
	});

	await expect(page).toHaveURL("/publicacoes", { timeout: SYNC_TIMEOUT_MS });
	await expect(page.getByRole("heading", { name: "Publicações", level: 1 })).toBeVisible();
});

test("rota de dado antes da primeira sincronização volta para o convite", async ({ page }) => {
	await page.goto("/login");

	await loginWithOab(page, stubLawyer);

	await expect(page).toHaveURL("/comecar");

	await page.goto("/processos");

	await expect(page).toHaveURL("/comecar");
	await expect(page.getByRole("button", { name: "Começar" })).toBeVisible();
});

test("quem já sincronizou não vê mais o convite", async ({ page, scenario: _scenario }) => {
	await page.goto("/login");

	await loginWithOab(page, stubLawyer);

	await expect(page).toHaveURL("/publicacoes");
	await expect(page.getByRole("heading", { name: "Publicações", level: 1 })).toBeVisible();

	await page.goto("/comecar");

	await expect(page).toHaveURL("/publicacoes");
});
