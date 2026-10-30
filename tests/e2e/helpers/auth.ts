import { expect, type Page } from "@playwright/test";

// Shared by every `*.setup.ts`: each setup signs up its OWN fresh user, so specs that mutate
// data (today-flow) never share an account with specs that assume an empty one (seed).
// Fresh user per run: signing up through the real UI keeps the setup self-contained
// (local Supabase has enable_confirmations = false). Nothing here comes from env.
export async function registerAndSignIn(page: Page, authFile: string): Promise<void> {
  // Date.now() alone collides: two setups start within the same millisecond.
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${unique}@example.com`;
  const password = `E2e-${unique}-Passw0rd!`;

  // Sign up. The form is a React island: input typed before hydration is dropped and the
  // submit is then blocked by validation. Sign-up creates an account, so it is not retried
  // blindly: wait until every island has hydrated, then fill and submit once.
  await page.goto("/auth/signup");
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByLabel("Powtórz hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Utwórz konto" }).click();
  await page.waitForURL("**/auth/confirm-email");

  // Sign in explicitly (do not assume a session after sign-up).
  await page.goto("/auth/signin");
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL("**/today");
  await expect(page.getByRole("button", { name: "Dodaj zadanie" })).toBeVisible();

  await page.context().storageState({ path: authFile });
}
