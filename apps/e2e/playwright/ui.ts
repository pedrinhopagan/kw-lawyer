import type { Page } from "@playwright/test";

export const GATE_USER = "advogada-e2e";
export const GATE_PASSWORD = "senha-de-teste";

export async function enterGate(page: Page) {
	await page.getByLabel("Usuário").fill(GATE_USER);
	await page.getByLabel("Senha").fill(GATE_PASSWORD);
	await page.getByRole("button", { name: "Entrar" }).click();
	await page.waitForURL((url) => !url.pathname.startsWith("/entrar"));
}

export async function loginWithOab(page: Page, oab: { oabNumber: string; oabUf: string }) {
	await page.getByLabel("Número da OAB").fill(oab.oabNumber);
	await page.getByLabel("UF").click();
	await page
		.getByRole("option")
		.filter({ hasText: new RegExp(`^${oab.oabUf}`, "u") })
		.click();
	await page.getByRole("button", { name: "Entrar" }).click();
}
