import { expect, test } from "../playwright/fixtures.ts";
import { enterGate, loginWithOab } from "../playwright/ui.ts";

test("OAB sem publicações no DJEN não entra e explica o motivo em pt-br", async ({ page }) => {
	await page.goto("/login");
	await enterGate(page);

	await loginWithOab(page, { oabNumber: "999999", oabUf: "SP" });

	await expect(
		page
			.getByText("Não encontramos publicações para a OAB 999999/SP. Confira o número e a UF.")
			.first(),
	).toBeVisible();

	await expect(page).toHaveURL("/login");
	await expect(page.getByRole("heading", { name: "Entre com a sua OAB" })).toBeVisible();
});
