# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-26

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase`, `scripts`
(excluded: `dist`, `node_modules`, `context`, `.claude`; 65 commits in the last 30 days).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Zadanie, które powinno być na liście na dziś, się nie pojawia, więc użytkownik nie wie, że je pominął | High | High | interview Q1, Q3; PRD guardrail 1 i Business Logic; hot-spot dirs `src/lib/services` (27 commits/30d), `supabase/migrations` (17 commits/30d) |
| 2 | Zadanie ważne dla milestona pojawia się za późno lub za nisko na liście, np. dopiero w dniu deadline'u | High | Medium | interview Q2; PRD FR-010 i guardrail 2; PRD US-01 |
| 3 | Granice dat dają zadanie w złym dniu: przełom dnia, strefa czasowa, ostatni dzień milestona lub rytmu | High | Medium | interview Q4 (brak wiedzy, jak to rozwiązano i jak sprawdzić); roadmap S-07 (zakres od dodania do daty milestona lub zamknięcia); PRD v2 |
| 4 | Akcje na liście (zrobione, częściowo, na jutro, pominięte wystąpienie) zostawiają zadanie w złym stanie: znika albo nie wraca | High | Medium | PRD FR-011, FR-012 i AC z US-01; roadmap S-09 (akcje „najbardziej narażone na regresję"); hot-spot dir `src/components/today` (23 commits/30d) |
| 5 | Zmiana rytmu lub wyłączenie powtarzania gubi odhaczenia, wystąpienia albo przesuwa je na zły dzień | Medium | Medium | roadmap S-10 (nierozstrzygnięty los przeniesień, ryzyko edycji po fakcie); PRD v2; hot-spot dir `supabase/migrations` (17 commits/30d) |
| 6 | Reguła „najbliższy niezamknięty milestone" jest błędna po edycji lub usunięciu (kaskady, walidacja dat), więc lista przeskakuje albo gubi zadania | Medium | Medium | interview Q3; PRD FR-003, FR-005 i Business Logic |
| 7 | Nadużycie: zalogowany użytkownik widzi lub zmienia cudze projekty i zadania | High | Low (na starcie jeden użytkownik) | PRD Access Control i FR-001; tech-stack `has_auth`; interview Q5 (jedyny użytkownik na początku) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Każde niedokończone zadanie spełniające regułę kwalifikacji z PRD jest na liście; żadne nie znika po akcji ani zmianie dnia | „Lista się renderuje, więc jest kompletna" | gdzie powstaje lista, jakie ma wejścia, co już pokrywa istniejący test bazy dla listy na dziś | integration (prawdziwa baza) | implementation mirror; happy-path-only |
| #2 | Zadania są uporządkowane po bliskości deadline'u (własnego lub milestona); zadanie bez terminu jest na końcu, ale widoczne | „Sortowanie po dacie wystarcza do sygnalizacji z wyprzedzeniem" | skąd bierze się deadline do sortowania; czy guardrail 2 jest w ogóle zaimplementowany | integration plus test parametryczny | oczekiwana kolejność liczona tą samą logiką co kod |
| #3 | Wynik zależy od „dzisiejszej daty" z jednego spójnego źródła; granice (północ, ostatni dzień, strefa) dają dokładnie oczekiwany dzień | „Data to po prostu data" | skąd bierze się „dziś" (serwer, baza, klient) i w jakiej strefie; jak dziś wstrzyknąć datę | unit/integration parametryczny z wstrzykniętą datą | zegar systemowy w teście; jedna data zamiast granic |
| #4 | Po każdej akcji stan zadania i lista następnego dnia zgadzają się z PRD | „Akcja zwróciła sukces, więc stan jest poprawny" | czy sekwencja zapisów jest atomowa; obsługa częściowego błędu | integration plus hermetyczny stub częściowego błędu | over-mocking wnętrzności zamiast sprawdzania stanu końcowego |
| #5 | Po zmianie rytmu odhaczenia „zrobione" zostają, a przyszłe wystąpienia wynikają z nowego rytmu | „Zmiana rytmu to edycja jednego pola" | los przeniesień i pominięć przy zmianie rytmu (otwarta niewiadoma z roadmapy) | integration (prawdziwa baza) | nadmiarowe kopie testów tego samego przypadku |
| #6 | Po usunięciu lub edycji lista pokazuje właściwy, najbliższy niezamknięty milestone i zgodne zadania | „Usunięcie kaskadowe jest bezpieczne" | reguły zamykania i kaskady po stronie bazy | integration (prawdziwa baza) | mock bazy, który kłamie o kaskadach |
| #7 | Użytkownik B nie czyta ani nie zmienia danych użytkownika A, także przez bezpośrednie wywołanie API | „Zalogowany to uprawniony" | warstwa wymuszająca własność i to, czy zwykły klient może ją ominąć | integration (rozszerzenie istniejącego testu RLS) | test tylko na jednym koncie |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Poprawność listy na dziś | Dowieść, że lista jest kompletna, uporządkowana i stabilna na granicach dat; zainicjować runner testów aplikacji i podpiąć testy bazy do CI | #1, #2, #3 | integration, parametryczne granice dat | change opened | context/changes/testing-today-list-correctness/ |
| 2 | Akcje i rytmy | Dowieść, że akcje na liście i zmiana rytmu nie gubią zadań ani odhaczeń | #4, #5 | integration, hermetyczne stuby częściowych błędów | not started | — |
| 3 | Spójność danych i izolacja | Dowieść poprawności reguły milestona po edycji i usunięciu oraz granicy własności danych | #6, #7 | integration (rozszerzenie testów bazy i RLS) | not started | — |
| 4 | Jeden przepływ e2e i bramki | Domknąć krytyczny przepływ w przeglądarce i utrwalić bramki w CI i hooku | #1, #4 (domknięcie) | 1 test e2e, bramki jakości | not started | — |

## 4. Stack

The classic test base for this project. Profil bazy testów: `sparse` — skonfigurowane tylko
testy `node --test` (3 pliki w `scripts/`), 10 testów pgTAP w `supabase/tests/database/` oraz
smoke auth; warstwa aplikacji (serwisy, endpointy, widoki) bez testów.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | `node --test` (wbudowany runner Node, `npm run test:unit`) | Node 22 | Pokrywa tylko `scripts/`; w CI |
| database / integration | pgTAP przez Supabase CLI (`supabase/tests/database/`) | Supabase CLI latest (z CI) | 10 testów reguł domeny i RLS; nie podpięte do CI — none yet, see Phase 1 |
| app-level unit + integration | none yet — see Phase 1 | — | Wybór runnera należy do `/10x-research` i `/10x-plan` Fazy 1 |
| smoke | `scripts/smoke.mjs` (job `smoke` w CI) | — | Tylko przepływ auth; sprawdza treść wysp React, nie tylko status (lessons.md) |
| e2e | none yet — see Phase 4 | — | Najwyżej 1 przepływ krytyczny |
| accessibility | none | — | Poza zakresem (patrz §7) |

**Stack grounding tools (current session):**
- Docs: none — Context7 / docs MCP not available in current session; checked: 2026-10-26
- Search: none — Exa.ai / web search MCP not available in current session; checked: 2026-10-26
- Runtime/browser: none — Playwright MCP not available in current session; not used; checked: 2026-10-26
- Provider/platform: none — GitHub/Cloudflare/Supabase MCP not available in current session; checked: 2026-10-26

Rekomendacje wynikają wyłącznie z lokalnych manifestów i konfiguracji. Przed wyborem
runnera aplikacji `/10x-research` powinien sprawdzić aktualną dokumentację.

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck (`eslint`, `astro check`) | local (husky pre-commit) + CI | required (wired) | syntactic / type drift |
| unit (`npm run test:unit`) | local + CI | required (wired) | regresje w skryptach pomocniczych |
| smoke auth | CI (job `smoke`) | required (wired) | zepsuty przepływ logowania, wyspy React nierenderujące się |
| database tests (pgTAP) | local + CI | required after §3 Phase 1 | regresje reguł domeny, listy na dziś i RLS |
| app-level unit + integration | local + CI | required after §3 Phase 1 | błędy logiki serwisów i walidacji |
| e2e on critical flow | CI on PR | required after §3 Phase 4 | zepsuty krytyczny przepływ (login → zadanie → lista → odhaczenie) |
| post-edit hook | local (agent loop) | recommended after §3 Phase 4 | regresje w czasie edycji |
| mutation testing (Stryker) | local, ad hoc | optional, selektywnie po fazie ryzyka | testy, które nie wykryłyby zepsucia reguły |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- **Location**: obecnie `scripts/*.test.mjs`; dla warstwy aplikacji — TBD, see §3 Phase 1.
- **Naming**: `<module>.test.mjs` (istniejące pliki).
- **Reference test**: `scripts/weekdays.test.mjs`.
- **Run locally**: `npm run test:unit`.

### 6.2 Adding a database / integration test

- **Location**: `supabase/tests/database/`.
- **Naming**: `core_domain_<topic>.test.sql`.
- **Reference test**: `supabase/tests/database/core_domain_today_list.test.sql`.
- **Run locally**: TBD — see §3 Phase 1 (polecenie i podpięcie do CI).

### 6.3 Adding a test for the today-list rule (qualification, ordering, date boundaries)

- TBD — see §3 Phase 1 for the missing-task, late-appearance and date-boundary regression pattern.

### 6.4 Adding a test for list actions and recurring rhythm changes

- TBD — see §3 Phase 2 for the task-state-after-action and rhythm-change pattern, including partial-failure stubs.

### 6.5 Adding a test for data integrity and ownership

- TBD — see §3 Phase 3 for the cascade, milestone-rule and cross-account isolation pattern.

### 6.6 Adding an e2e test

- TBD — see §3 Phase 4.

### 6.7 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Wygląd UI i tokeny designu (w tym snapshoty UI)** — pilnuje ich już `check:values` w pre-commit. Re-evaluate if kontrakt designu przestanie być egzekwowany skryptem. (Source: interview Q5.)
- **Strony auth poza istniejącym smoke** — obecny smoke wystarcza. Re-evaluate if pojawi się OAuth lub dodatkowe przepływy auth. (Source: interview Q5.)
- **Kitchen sink (`/dev/kitchen-sink`) i skrypty pomocnicze** — narzędzia deweloperskie, niewidoczne dla użytkownika. Re-evaluate if zaczną wpływać na produkcję. (Source: interview Q5.)
- **Kontrola wielu użytkowników i nadużyć na dużą skalę (rate-limit, obciążenie)** — na starcie jedyny użytkownik to autor. Re-evaluate if aplikacja zostanie udostępniona szerszemu gronu. (Source: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-26
- Stack versions last verified: 2026-10-26
- AI-native tool references last verified: 2026-10-26 (brak narzędzi AI-native w planie)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
