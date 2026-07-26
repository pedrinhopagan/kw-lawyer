import { formatCnj } from "@kw-lawyer/api/src/features/djen/normalize.ts";
import { stubCases, stubLawyer, stubMovements, stubPublications } from "../playwright/cnj-stub.ts";
import { expect, test } from "../playwright/fixtures.ts";
import { loginWithOab } from "../playwright/ui.ts";

const CASO = stubCases.falencia;

test("do inbox o número do processo abre a timeline com o andamento correspondente", async ({
	page,
	scenario: _scenario,
}) => {
	await page.goto("/login");
	await loginWithOab(page, stubLawyer);

	await expect(
		page.getByLabel(`${Object.keys(stubPublications).length} publicações não lidas`),
	).toBeVisible();

	await page
		.getByRole("link", { name: formatCnj(CASO.cnjNumber), exact: true })
		.first()
		.click();

	await expect(page).toHaveURL(
		new RegExp(`/processos/${CASO.cnjNumber}\\?pub=[0-9a-f-]{36}&aba=andamentos$`, "u"),
	);
	await expect(page.getByRole("heading", { name: CASO.className, level: 1 })).toBeVisible();
	await expect(page.getByText(CASO.orgName).first()).toBeVisible();

	await expect(page.getByText(stubPublications.despacho.body)).toBeVisible();
	await expect(page.getByText(stubMovements.juntada.name).first()).toBeVisible();
});
