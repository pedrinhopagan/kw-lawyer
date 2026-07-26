import { resolve } from "node:path";
import type { Page } from "@playwright/test";

export const GATE_USER = "advogada-e2e";
export const GATE_PASSWORD = "senha-de-teste";

// O gate limita a oito tentativas por minuto na mesma conta, e é a mesma conta em toda a suíte. Um
// projeto de setup abre o gate uma vez e as specs herdam o cookie; quem precisa provar o gate em si
// zera o storageState e paga uma tentativa.
export const GATE_STATE_PATH = resolve(import.meta.dirname, "../.auth/gate.json");

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
