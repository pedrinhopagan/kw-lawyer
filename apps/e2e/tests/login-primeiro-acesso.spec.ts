import { stubLawyer, stubPublications } from "../playwright/cnj-stub.ts";
import { expect, test } from "../playwright/fixtures.ts";
import { enterGate, loginWithOab } from "../playwright/ui.ts";

const SYNC_TIMEOUT_MS = 20_000;

test("primeiro acesso entra pela OAB, cai no inbox e a sincronização traz as publicações", async ({
	page,
}) => {
	await page.goto("/login");
	await enterGate(page);

	await loginWithOab(page, stubLawyer);

	await expect(page).toHaveURL("/publicacoes");
	await expect(page.getByRole("heading", { name: "Publicações", level: 1 })).toBeVisible();
	await expect(
		page.getByText(`OAB/${stubLawyer.oabUf} ${stubLawyer.oabNumber}`).first(),
	).toBeVisible();

	await expect(
		page.getByRole("button", {
			name: new RegExp(`^Abrir ${stubPublications.despacho.title}`, "u"),
		}),
	).toBeVisible({ timeout: SYNC_TIMEOUT_MS });

	await expect(
		page.getByLabel(`${Object.keys(stubPublications).length} publicações não lidas`),
	).toBeVisible({ timeout: SYNC_TIMEOUT_MS });
});
