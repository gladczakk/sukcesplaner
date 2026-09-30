---
project: sukces-planer
researched_at: 2026-09-22
recommended_platform: Cloudflare Workers + Pages
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 7 (SSR, output=server) + React 19 islands
  runtime: Cloudflare Workers (via @astrojs/cloudflare adapter, already scaffolded)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

Cloudflare scored 5/5 Pass on the agent-friendly criteria — the only platform of the six researched to do so — and needs zero migration: the 10x-astro-starter scaffold already ships the `@astrojs/cloudflare` adapter and a working `wrangler.jsonc`. The two real risks surfaced in the anti-bias cross-check (the free tier's 10ms CPU-per-invocation cap, and the `context.locals.runtime.env` vs. `process.env` footgun) are both cheaply mitigated: the project already reads secrets through Astro's adapter-agnostic `astro:env/server` module rather than raw `process.env`, and the $5/mo paid plan raises the CPU budget to 30s if the free tier's cap is ever hit by this low-traffic (small user scale, low QPS), solo, single-region app. Vercel was seriously considered and remains the closest alternative — it has the most mature Astro adapter of the non-Cloudflare candidates and a comparably free Hobby tier — but was set aside after weighing the zero-migration-cost advantage of staying on Cloudflare against Vercel's own risks (single-region `iad1` default likely adding latency for an EU-based developer, and a non-commercial ToS restriction on the free tier) for a 3-week after-hours solo timeline.

## Platform Comparison

Scored against the five agent-friendly criteria (`Pass` / `Partial` / `Fail`); no criterion is a hard blocker on its own.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass (GA `llms.txt`) | Pass | Pass (GA) | 5 Pass |
| Vercel | Pass | Pass | Pass (GA `llms-full.txt`) | Pass (extended limits in beta) | Partial (MCP beta) | 4 Pass, 1 Partial |
| Render | Partial (rollback dashboard/API only) | Pass | Pass (dedicated Agent Skills repo) | Pass | Pass (GA) | 4 Pass, 1 Partial |
| Fly.io | Pass | Pass | Pass | Pass | Partial (MCP maturity unconfirmed) | 4 Pass, 1 Partial |
| Railway | Partial (rollback dashboard-only) | Pass | Partial (MDX, no `llms.txt`) | Pass | Pass (GA) | 3 Pass, 2 Partial |
| Netlify | Partial (no CLI rollback) | Pass | Pass | Pass (timeout docs inconsistent) | Partial (MCP maturity unconfirmed) | 3 Pass, 2 Partial |

Notes:
- **Cloudflare Workers** is the only platform with zero migration cost — the scaffold already ships the adapter and `wrangler.jsonc` — and scored highest on the criteria. Its free tier's 10ms CPU-per-invocation cap is a real but manageable risk for SSR; `process.env` is unavailable (must use `context.locals.runtime.env`), though this project's use of `astro:env/server` sidesteps most of that pitfall.
- **Vercel** has the most mature, Astro-core-maintained adapter (server islands, actions, sessions, ISR since 7.2.0). Hobby plan is free but ToS-restricted to non-commercial use, defaults to single-region (`iad1`, US East) execution, and several limits (1800s extended function duration, 5GB large functions, native WebSockets) are in beta.
- **Render** needs no Dockerfile (native Node detection) and ships a ready-made Astro SSR template; strongest agent-tooling signal via a dedicated 21-module Agent Skills GitHub repo. Free tier spins down after 15 minutes idle (~1 min cold start) — a poor fit for "check the today list every morning."
- **Fly.io** is the only platform with a true always-on process model and native WebSocket support (useful only if realtime is ever added — out of scope for this MVP per the PRD's non-goals). No free tier since October 2024; needs a Dockerfile since there's no native Astro-Fly adapter.
- **Railway** auto-detects Node apps but its newer build system (Railpack) is beta; rollback to an arbitrary past deployment is dashboard-only; usage-based billing is less predictable for a cost-sensitive solo project (~$5-45/mo depending on usage).
- **Netlify** has no CLI-native rollback command (dashboard/API only) and its free tier is a shared 300-credit/month pool with no overage billing — traffic simply stops when credits run out, an availability risk rather than a cost risk.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Highest raw score (5/5 Pass) and zero migration cost. Free tier likely sufficient for this app's light SSR workload (a small daily task/milestone list, not heavy compute), with a cheap ($5/mo) fallback if the CPU cap is hit. The `astro:env/server` pattern already used in the codebase avoids the worst of the Cloudflare-specific env-var pitfall.

#### 2. Vercel (runner-up)

Most mature Astro adapter of any platform researched and a free Hobby tier the project would qualify for as a personal, non-commercial tool. Remains the fallback if Cloudflare's CPU cap turns out to bind in practice, or if agent-tooling maturity (Cloudflare's MCP is GA vs. Vercel's beta) stops being the deciding factor.

#### 3. Render

Standard Node runtime, no Dockerfile, ready-made Astro SSR template, and the strongest agent-tooling documentation signal (dedicated Agent Skills repo). Scored third mainly because the free tier's 15-minute idle spin-down conflicts with the PRD's daily "check today's list" usage pattern; the $7/mo Starter tier avoids this but adds cost and still requires an adapter swap.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. The 10ms CPU-time cap on Cloudflare's free plan is measured in actual CPU time, not wall-clock — Astro SSR (JSX rendering plus Supabase auth/session checks on every request) can plausibly exceed this on a cold path, silently forcing an upgrade to the $5/mo plan or causing intermittent 500s under any load spike that a solo dev debugging locally (where the limit doesn't apply) won't reproduce until it's live.
2. `astro:env` support on the Cloudflare adapter is reported flaky (open GitHub issue), and the correct low-level pattern is `context.locals.runtime.env` rather than `process.env` — every generic tutorial and AI-generated snippet on the internet assumes `process.env`, so a future contributor (or an agent) could reach for the wrong pattern and get a silent `undefined` for `SUPABASE_KEY` if they bypass the project's existing `astro:env/server` usage.
3. Cloudflare Pages is explicitly in maintenance mode with new platform investment going to Workers only — the scaffold's `wrangler.jsonc` already targets Workers directly, but any third-party tutorial or future package version assuming the classic Pages deploy flow could silently point the project at a deprecated path.
4. Supabase's JS SDK relies on Node compatibility shims (`nodejs_compat`) rather than running on real Node — an edge case in a future dependency needing a Node API not covered by the polyfill would fail in a way that's hard to diagnose (works locally under `astro dev`'s real Node runtime, breaks only in the deployed Workers isolate).
5. Bundle size is capped at 3MiB gzipped on the free tier — shadcn/ui plus the Supabase client SDK plus React 19 islands can approach this ceiling faster than expected as the app grows past the MVP's four screens, and hitting the cap produces an opaque deploy-time failure rather than a graceful warning during development.

### Pre-Mortem — How This Could Fail

The team deployed the Astro app on Cloudflare Workers for the MVP. Six months later, the decision turned out to be a real headache. The original assumption was "it's just SSR, it'll work like any Node host" — but the first production incident came from a helper copied from a blog post assuming `process.env.SUPABASE_KEY`, silently returning `undefined` and breaking auth for a day before anyone traced it to the Cloudflare-specific env access pattern. Then, once a few extra shadcn components and an export library were added for a "quick feature," CI started failing intermittently with bundle-size errors that only showed up in the Workers build, not locally. The team stayed on the $5/mo plan to dodge the CPU-time cap, but a usage spike right before a milestone deadline (ironically, the app's own concept) caused a burst of CPU-capped errors nobody had load-tested for. By then, migrating off Cloudflare felt riskier than living with the quirks, so the team just worked around them, permanently.

### Unknown Unknowns

- The Astro Cloudflare adapter's exact `astro:env` behavior is version-dependent with open compatibility issues — pinning the adapter version and testing env-var access explicitly (rather than assuming it "just works" like other adapters) isn't obvious from the marketing page.
- Local `astro dev` runs on real Node, but the deployed app runs in a V8 isolate with `nodejs_compat` polyfills — "works on my machine" is a weaker signal on Cloudflare than on a Node-native host; a `wrangler dev` local-Workers-runtime test loop gives real parity, and most tutorials skip mentioning this.
- Cloudflare's Workers billing/CPU model charges for CPU time, not wall-clock time waiting on I/O (like the Supabase fetch call) — this actually works in the project's favor, but it's a subtle distinction that's easy to model backwards when estimating cost/limits.
- `wrangler rollback` reverts code instantly, but a Supabase schema migration applied alongside that deploy does not roll back automatically — a bad deploy paired with a schema change can leave the reverted code pointed at an incompatible database shape.
- Cloudflare Pages' maintenance-mode status means community tutorials and AI training data will keep recommending Pages-specific patterns for years — the project needs to consciously stay on the Workers-native path already set by `wrangler.jsonc`, not drift toward Pages docs found via search.

## Operational Story

- **Preview deploys**: `wrangler versions upload` (or the Cloudflare dashboard's GitHub integration) produces a preview URL per branch/PR; production traffic only shifts to a version via an explicit `wrangler versions deploy` or dashboard promotion — no extra protection needed by default since preview URLs are unguessable, not indexed.
- **Secrets**: `SUPABASE_URL` / `SUPABASE_KEY` are set as Worker Secrets (`wrangler secret put <NAME>`) or via the Cloudflare dashboard; readable only at runtime through `context.locals.runtime.env` (wired through Astro's `astro:env/server`), not visible in the dashboard once set; rotate by re-running `wrangler secret put` with the same name and redeploying.
- **Rollback**: `wrangler rollback` reverts to a prior deployed version instantly (100% traffic shift); a Supabase schema migration applied alongside a bad deploy does not roll back automatically — check schema compatibility before rolling back code.
- **Approval**: routine deploys (`wrangler deploy`, matching `tech-stack.md`'s `ci_default_flow: auto-deploy-on-merge`) can run unattended; a human should approve before rotating the primary Supabase service key or upgrading past the free plan.
- **Logs**: `wrangler tail` streams live request/exception logs from the CLI; Cloudflare's GA MCP support (developers.cloudflare.com/agents/model-context-protocol/) exposes Workers observability as structured tool calls for an agent, in addition to the CLI.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free tier's 10ms CPU-per-invocation cap is hit by SSR rendering, causing intermittent 500s under load | Devil's advocate | M | M | Watch `wrangler tail` for CPU-limit errors after launch; upgrade to the $5/mo plan (30s CPU budget) proactively if traffic grows beyond trivial |
| `process.env` used instead of `context.locals.runtime.env` by a future contributor or copied snippet, causing silent `undefined` secrets | Devil's advocate | L | H | Keep all env access routed through the existing `astro:env/server` module; flag any raw `process.env` usage in code review |
| Bundle size approaches the 3MiB (free) / 10MiB (paid) gzip cap as the app grows past the MVP's four screens | Devil's advocate | L | M | Monitor `wrangler deploy` output for bundle-size warnings; move to the paid plan's 10MiB cap if needed |
| `wrangler rollback` reverts code but not a paired Supabase schema migration, leaving a version/schema mismatch | Unknown unknowns | L | M | Treat schema migrations and code deploys as a single unit; verify schema compatibility before rolling back |
| Cloudflare Pages' maintenance-mode status leads to accidentally following deprecated Pages-specific guidance found via search | Devil's advocate | L | L | Stick to the Workers-native `wrangler.jsonc` already in the scaffold; verify any new guide targets Workers, not classic Pages |
| A future dependency needs a Node API not covered by `nodejs_compat` polyfills, failing only in production | Devil's advocate | L | M | Use `wrangler dev` (real Workers runtime) for testing before relying on `astro dev`'s Node-only local parity |

## Getting Started

1. No adapter change needed — `@astrojs/cloudflare` and `wrangler.jsonc` are already in place from the `10x-astro-starter` scaffold.
2. Authenticate the CLI: `npx wrangler login`.
3. Set production secrets: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (values come from the Supabase project's dashboard).
4. Run `npm run build` locally, then `npx wrangler dev` to smoke-test against the real Workers runtime (not just `astro dev`'s Node runtime) before the first deploy.
5. Deploy: `npx wrangler deploy` (or connect the GitHub repo in the Cloudflare dashboard for automatic deploys on merge to `master`, matching `tech-stack.md`'s `ci_default_flow: auto-deploy-on-merge`).
6. Re-run `npm run smoke` against the deployed URL to confirm the auth flow works end-to-end in production.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
