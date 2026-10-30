import { test, expect, type Page } from "@playwright/test";
import { registerAndSignIn } from "./helpers/auth";

// risk: test-plan.md #1 (the /today list is rendered by islands and must show the right rows)
//       and #4 (a task action must land: done leaves the list, partial stays, "tomorrow" moves it away).
// seed: tests/e2e/seed.spec.ts (same locators, hydration wait and state-based waits).
//
// Expectations are written by hand from the PRD, never computed from app code:
//   prd.md:51  "Oznaczenie zadania jako zrobione usuwa je z listy na dziś"
//   prd.md:52  "Oznaczenie jako częściowo zrobione i przeniesienie na jutro przenosi pozostałą część
//               na listę następnego dnia" (the partial task is still open, so it stays on the list)
//   prd.md:106 the list shows every unfinished task of the nearest open milestone
// What the PRD does not define is not asserted: dates, deadline chips, the day heading, the
// "milestone do zamknięcia" row, error messages.
//
// Data and cleanup: every test signs up its OWN user (unique e-mail, helpers/auth.ts) instead of
// loading a shared storageState. A shared account would let parallel runs (--repeat-each, workers)
// see each other's milestones and deferred tasks, and the seed asserts an EMPTY /today for its user.
// All rows belong to that fresh user (RLS) and are never reused, so deleting them afterwards is
// deliberately skipped: the next run signs up a new user and sees none of it. The test-data
// annotation carries the titles for finding the rows in the database.
test.use({ storageState: { cookies: [], origins: [] } });

// Islands (client:load) drop clicks before they hydrate; wait until none is left server-only.
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}

test("risks #1 and #4: task actions on /today persist after reload (done leaves, partial stays, tomorrow moves)", async ({
  page,
}) => {
  const token = `${Date.now()}`;
  const projectName = `Projekt e2e ${token}`;
  const milestoneName = `Milestone e2e ${token}`;
  const titleA = `Zadanie A ${token}`;
  const titleB = `Zadanie B ${token}`;
  test.info().annotations.push({ type: "test-data", description: `${projectName} / ${titleA} / ${titleB}` });

  // Setup: a fresh signed-in user (sign-up through the real UI; the helper ends on /today).
  await registerAndSignIn(page, test.info().outputPath("flow-user.json"));

  // A project with one milestone, created through the real UI. Far-future dates keep the
  // tasks independent of today's date; exactly one milestone, so both tasks land on the list.
  await page.goto("/projects");
  await waitForHydration(page);
  // The empty state shows a second "Dodaj projekt" button; both open the same dialog.
  await page.getByRole("button", { name: "Dodaj projekt" }).first().click();
  await page.getByLabel("Nazwa").fill(projectName);
  await page.getByLabel("Termin").fill("2099-12-31");
  await page.getByRole("button", { name: "Zapisz" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

  await waitForHydration(page);
  await page.getByRole("button", { name: "Dodaj milestone" }).click();
  await page.getByLabel("Nazwa").fill(milestoneName);
  await page.getByLabel("Data").fill("2099-12-30");
  await page.getByRole("button", { name: "Zapisz" }).click();
  await expect(page.getByText(milestoneName).first()).toBeVisible();

  // Add two tasks without a deadline from the /today dialog.
  await page.goto("/today");
  await waitForHydration(page);
  for (const title of [titleA, titleB]) {
    await page.getByRole("button", { name: "Dodaj zadanie" }).click();
    await page.getByLabel("Tytuł").fill(title);
    await page.getByRole("button", { name: "Zapisz" }).click();
    // The dialog reloads the page; the new task must be rendered in the list (risk #1).
    await expect(page.getByRole("button", { name: `Zrobione: ${title}` })).toBeVisible();
    await waitForHydration(page);
  }

  // Step 1: task A "Częściowo". PRD 52 + 106: a partly done task is unfinished, so it stays on the list.
  await page.getByRole("button", { name: `Częściowo: ${titleA}` }).click();
  await expect(page.getByRole("button", { name: `Częściowo: ${titleA}` })).toHaveAttribute("aria-pressed", "true");
  const rowA = page.getByRole("listitem").filter({ hasText: titleA });
  await expect(rowA).toContainText("częściowo");
  // Task B is untouched and still on the list.
  await expect(page.getByRole("button", { name: `Zrobione: ${titleB}` })).toBeVisible();

  // Step 2: task B "Na jutro". PRD 52: it leaves today's list and is shown under "Przeniesione na później".
  await waitForHydration(page);
  await page.getByRole("button", { name: `Na jutro: ${titleB}` }).click();
  await expect(page.getByText("Przeniesione na później: 1")).toBeVisible();
  await expect(page.getByRole("button", { name: `Zrobione: ${titleB}` })).toHaveCount(0);
  // The deferred block is collapsed by default; open it to see which task was moved.
  await page.getByText("Przeniesione na później: 1").click();
  await expect(page.getByRole("button", { name: `Przywróć na dziś: ${titleB}` })).toBeVisible();
  // Task A is still on the list, still partial (the move of B must not touch it).
  await expect(page.getByRole("button", { name: `Częściowo: ${titleA}` })).toHaveAttribute("aria-pressed", "true");

  // Step 3: task A "Zrobione". PRD 51: a done task disappears from today's list.
  await page.getByRole("button", { name: `Zrobione: ${titleA}` }).click();
  await expect(page.getByRole("button", { name: `Zrobione: ${titleA}` })).toHaveCount(0);
  await expect(page.getByText(titleA)).toHaveCount(0);

  // Same state after a fresh load: done stays gone, the moved task stays moved (PRD 51 + 52).
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByText("Przeniesione na później: 1")).toBeVisible();
  await expect(page.getByText(titleA)).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Zrobione: ${titleB}` })).toHaveCount(0);
});
