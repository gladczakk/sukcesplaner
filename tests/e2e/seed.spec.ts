import { test, expect } from "@playwright/test";

// Seed, pattern for every later e2e test. Origin: risk #1 (test-plan §2), simplest variant: a signed-in
// user opens /today and sees content rendered by the React island, not just a 200 (lesson #1:
// Astro swallows an island SSR error). A brand-new user has no project and no milestone, so
// "add task" is disabled with a hint. Creates no data: nothing to clean up.
test("risk #1: new signed-in user sees the empty /today rendered by the island", async ({ page }) => {
  await page.goto("/today");

  await expect(page.getByText("Na dziś nic do zrobienia.")).toBeVisible();

  const addTask = page.getByRole("button", { name: "Dodaj zadanie" });
  await expect(addTask).toBeVisible();
  await expect(addTask).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("Najpierw dodaj projekt z otwartym milestonem.")).toBeVisible();
});
