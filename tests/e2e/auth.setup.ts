import { test as setup } from "@playwright/test";
import { registerAndSignIn } from "./helpers/auth";

// Session for seed.spec.ts, which asserts an EMPTY /today: this user must stay data-free.
setup("sign up a fresh user, sign in and save the session", async ({ page }) => {
  await registerAndSignIn(page, "playwright/.auth/user.json");
});
