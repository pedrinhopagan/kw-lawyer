import { createForensicCalendar } from "@kw-lawyer/api/src/features/deadlines/calendar.ts";
import { calculateDeadline } from "@kw-lawyer/api/src/features/deadlines/counting.ts";
import { stubLawyer, stubPublications } from "../playwright/cnj-stub.ts";
import { expect, test } from "../playwright/fixtures.ts";
import { loginWithOab } from "../playwright/ui.ts";

const DEADLINE_TITLE = "Prazo indicado na publicação";
const AGENDA_TIMEOUT_MS = 20_000;

function currentMonth() {
	return new Date().toLocaleDateString("en-CA").slice(0, 7);
}

test("a agenda abre no recorte da advogada e o mesmo prazo aparece nas três vistas", async ({
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
	await page.waitForURL("**/publicacoes");
	await page.goto("/agenda?vista=lista");

	const abrir = page.getByRole("button", {
		name: new RegExp(`^Abrir o prazo ${DEADLINE_TITLE}`, "u"),
	});

	await expect(abrir).toBeVisible({ timeout: AGENDA_TIMEOUT_MS });
	await expect(page.getByRole("button", { name: /^Minha ação/u })).toHaveAttribute(
		"aria-pressed",
		"true",
	);

	await page.getByRole("group", { name: "Vista da agenda" }).getByText("Calendário").click();

	if (!expected.dueAt.startsWith(currentMonth())) {
		await page.getByRole("button", { name: "Próximo mês" }).click();
	}

	await expect(
		page.getByRole("button", { name: new RegExp(`${DEADLINE_TITLE}$`, "u") }),
	).toBeVisible();

	await page.getByRole("group", { name: "Vista da agenda" }).getByText("Situação").click();

	const pendentes = page.getByRole("heading", { name: "Em aberto", level: 2 });

	await expect(pendentes).toBeVisible();
	await expect(abrir).toBeVisible();
	await expect(page.getByRole("heading", { name: "Cumprido", level: 2 })).toBeVisible();
});

test("o filtro de audiência tira da agenda o prazo que não é da advogada", async ({
	scenario: _scenario,
	page,
}) => {
	await page.goto("/login");
	await loginWithOab(page, stubLawyer);
	await page.waitForURL("**/publicacoes");
	await page.goto("/agenda?vista=lista");

	const abrir = page.getByRole("button", {
		name: new RegExp(`^Abrir o prazo ${DEADLINE_TITLE}`, "u"),
	});

	await expect(abrir).toBeVisible({ timeout: AGENDA_TIMEOUT_MS });

	await page.getByRole("button", { name: /^Filtros/u }).click();
	await page.getByRole("checkbox", { name: "De terceiro" }).click();
	await page.keyboard.press("Escape");

	await expect(abrir).toBeHidden();
	await expect(page.getByRole("button", { name: /^Filtros 1/u })).toBeVisible();
});
