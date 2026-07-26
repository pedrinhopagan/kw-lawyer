import { test as setup } from "@playwright/test";
import { enterGate, GATE_STATE_PATH } from "./ui.ts";

setup("abre o gate de acesso uma vez para a suíte", async ({ page }) => {
	await page.goto("/entrar");
	await enterGate(page);

	await page.context().storageState({ path: GATE_STATE_PATH });
});
