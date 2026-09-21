# Repository Guidelines

SukcesPlaner is an Astro 7 SSR web app (React 19 islands, Tailwind 4, Supabase auth) deployed to Cloudflare Workers. Full architecture and conventions are documented in `@CLAUDE.md`; read it before touching auth, API routes, or Supabase code.

## Hard Rules

- API routes export uppercase `GET`/`POST`, set `export const prerender = false`, and validate input with zod (`@CLAUDE.md`).
- Use the `cn()` helper (`@/lib/utils`) for conditional Tailwind classes — never concatenate class strings manually.
- New Supabase tables must enable RLS with granular per-operation, per-role policies; migrations go in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`.
- No git repository is initialized yet — run `git init` before committing.

## Project Structure & Module Organization

See `@README.md` (Project Structure) for the full top-level layout. Beyond that:

- `src/components/ui/` — shadcn/ui ("new-york" variant, see `@components.json`); `src/components/auth/` — sign-in/up form islands.
- `src/lib/` — Supabase client (`supabase.ts`), shared helpers (`utils.ts`).
- `src/middleware.ts` — auth guard; add paths to `PROTECTED_ROUTES` to require sign-in.
- `supabase/` — local Supabase config and migrations.
- `context/foundation/` — PRD, tech-stack hand-off, and bootstrap verification log (not in README).

## Build, Test, and Development Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime).
- `npm run build` — production build; `npm run preview` — preview it locally.
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules.
- `npm run format` — Prettier (astro + tailwind plugins).
- `npm run smoke` — dependency-free auth-flow check against a running server (`BASE_URL`, default `http://localhost:4321`).

## Coding Style & Naming Conventions

- TypeScript strict mode (`astro/tsconfigs/strict`); path alias `@/*` → `./src/*`.
- Formatting is enforced by Prettier (`@.prettierrc.json`) — don't hand-format.
- Astro vs. React component split and other conventions: see `@CLAUDE.md` (Key conventions).

## Testing Guidelines

No unit/integration framework is configured yet. `npm run smoke` (`scripts/smoke.mjs`) only sanity-checks the auth flow — per `@README.md` it is not a substitute for real tests. When adding a test runner, colocate `*.test.ts` next to the source file **(assumption — no runner is installed yet; confirm the convention before relying on this)**.

## Commit & Pull Request Guidelines

No commits exist yet — set the message convention on the first one. Pre-commit hooks (husky + lint-staged) already run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}` regardless. CI gates PRs to `master` (see `@README.md` — CI); the `ci` job specifically requires `SUPABASE_URL`/`SUPABASE_KEY` as repo secrets.

## Security & Configuration Tips

Server-only secrets (`SUPABASE_URL`, `SUPABASE_KEY`) and local env setup are documented in `@CLAUDE.md` (Environment) — never expose them to the client.
