# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.64.1
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts
- full-suite command: npm run test:e2e
- base URL: http://localhost:4321 (or http://localhost:$E2E_PORT when E2E_PORT is set)
- port: 4321 (detected from the Astro preview default, no port in astro.config.mjs; override with E2E_PORT in .env, e.g. when a local `astro dev` holds 4321)
- web server command: npm run build && npm run preview -- --port $E2E_PORT (4321 when unset); reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts); the test user is created in the setup itself (fresh sign-up with a timestamped e-mail through /auth/signup, then explicit sign-in), not read from env
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts, protects risk #1 (test-plan §2): the signed-in /today renders content from the React island (empty state + disabled "Dodaj zadanie" with hint)
- browser CLI: playwright-cli, command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-10-30

### Running locally

Prerequisites, in order:

1. Docker running, then `npx supabase start` (local Supabase; sign-up needs `enable_confirmations = false`, the default in `supabase/config.toml`).
2. `.dev.vars` with `SUPABASE_URL` and `SUPABASE_KEY` of the local stack (`npx supabase status`). The Cloudflare preview reads this file, not `.env`. Never commit it.
3. Optional: `E2E_PORT=<free port>` in `.env` if 4321 is taken (e.g. by `npm run dev`). In CI the port stays 4321.
4. `npm run test:e2e`. Playwright builds the app and starts the preview itself (`webServer`, up to 180 s); nothing may already listen on the port, otherwise `reuseExistingServer` silently tests whatever runs there. The HTML report lands in `playwright-report/`.

Decisions: production build + preview instead of the dev server; `ASTRO_PREVIEW_BACKGROUND=1` keeps Astro 7's preview in the foreground; the unit runner (vitest, `src/**/*.test.ts`) does not collect `tests/e2e/`; no E2E_USERNAME / E2E_PASSWORD, every run signs up its own user.
