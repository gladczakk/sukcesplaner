---
starter_id: 10x-astro-starter
package_manager: npm
project_name: sukces-planer
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

SukcesPlaner is a solo, after-hours web-app MVP with a 3-week deadline and a must-have login (email+password or OAuth) requirement — exactly the cell `(web, js)` the registry's recommended default is built for. 10x Astro Starter bundles Astro + React islands + TypeScript + Supabase (Postgres, auth, storage) + Cloudflare Pages/Workers on a single agent-friendly, bootstrapper-verified-adjacent stack, so auth and a relational data model for projects/milestones/tasks come out of the box instead of being assembled by hand under a tight timeline. The standard path was taken without redesign since the PRD names no payments, realtime, AI, or background-job needs that would push past this starter's fit. Deployment stays on the starter's own default, Cloudflare Pages, and CI runs on GitHub Actions with auto-deploy-on-merge — the lowest-friction shape for a solo after-hours build.
