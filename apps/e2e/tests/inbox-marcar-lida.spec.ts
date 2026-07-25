import { stubLawyer, stubPublications } from "../playwright/cnj-stub.ts";
import { expect, test } from "../playwright/fixtures.ts";
import { enterGate, loginWithOab } from "../playwright/ui.ts";

const TOTAL = Object.keys(stubPublications).length;

test("abrir uma publicação do inbox marca como lida e derruba o contador", async ({
	page,
	scenario: _scenario,
}) => {
	await page.goto("/login");
	await enterGate(page);
	await loginWithOab(page, stubLawyer);

	await expect(page.getByLabel(`${TOTAL} publicações não lidas`)).toBeVisible();
	await expect(page.getByText(`${TOTAL} publicações`)).toBeVisible();

	await page
		.getByRole("button", { name: new RegExp(`^Abrir ${stubPublications.despacho.title}`, "u") })
		.click();

	const leitor = page.getByRole("dialog");

	await expect(
		leitor.getByRole("heading", { name: stubPublications.despacho.title }),
	).toBeVisible();
	await expect(leitor.getByText(stubPublications.despacho.body)).toBeVisible();

	await expect(page.getByLabel(`${TOTAL - 1} publicações não lidas`)).toBeVisible();

	await page.reload();

	await expect(page.getByLabel(`${TOTAL - 1} publicações não lidas`)).toBeVisible();
});
