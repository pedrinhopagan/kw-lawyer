import { createForensicCalendar } from "@kw-lawyer/api/src/features/deadlines/calendar.ts";
import { calculateDeadline } from "@kw-lawyer/api/src/features/deadlines/counting.ts";
import { stubLawyer, stubPublications } from "../playwright/cnj-stub.ts";
import { expect, test } from "../playwright/fixtures.ts";
import { loginWithOab } from "../playwright/ui.ts";

const SYNC_TIMEOUT_MS = 20_000;
const DEADLINE_TITLE = "Prazo indicado na publicação";

function asBrazilianDate(isoDate: string) {
	return isoDate.split("-").toReversed().join("/");
}

test("o prazo da agenda abre o hub de ação com a memória de cálculo e aceita a baixa", async ({
	scenario: _scenario,
	page,
}) => {
	const expected = calculateDeadline({
		calendar: createForensicCalendar({
			tribunal: stubPublications.despacho.case.tribunal,
			curatedDays: [],
		}),
		availableAt: stubPublications.despacho.availableAt,
		days: 5,
	});

	await page.goto("/login");
	await loginWithOab(page, stubLawyer);

	await expect(page.getByRole("heading", { name: "Publicações", level: 1 })).toBeVisible();

	await page.goto("/agenda?vista=lista");

	const abrir = page.getByRole("button", {
		name: new RegExp(`^Abrir o prazo ${DEADLINE_TITLE}`, "u"),
	});

	await expect(abrir).toBeVisible({ timeout: SYNC_TIMEOUT_MS });

	await abrir.click();

	await expect(page.getByRole("heading", { name: DEADLINE_TITLE, level: 1 })).toBeVisible();
	await expect(page).toHaveURL(/\/prazos\/[0-9a-f-]{36}$/u);

	await expect(page.getByText("Por causa de quê")).toBeVisible();
	await expect(page.getByText("Como cheguei nessa data")).toBeVisible();
	await expect(page.getByText("Disponibilização no diário")).toBeVisible();
	await expect(page.getByText("Início da contagem")).toBeVisible();
	await expect(page.getByText(asBrazilianDate(expected.publishedAt))).toBeVisible();
	await expect(page.getByText(asBrazilianDate(expected.dueAt)).first()).toBeVisible();

	await page.getByRole("button", { name: "Marcar cumprido" }).click();

	await expect(page.getByRole("button", { name: "Marcar cumprido" })).toBeHidden();
	await expect(page.getByText("Cumprido").first()).toBeVisible();
});
