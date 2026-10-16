<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Ręczne dodanie zadania z listy na dziś

- **Plan**: context/changes/manual-task-add-from-list/plan.md
- **Mode**: Deep
- **Date**: 2026-10-16
- **Verdict**: SOUND (po poprawkach z triage)
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Istniejące ścieżki ✓ (`src/lib/services/today.ts`, `src/types.ts`, `src/pages/today.astro`, `src/pages/projects/index.astro`, `src/components/projects/TaskFormDialog.tsx`, `src/components/hooks/use-task-api.ts`, `src/components/ui/{select,field}.tsx`, `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/index.ts`, `scripts/smoke.mjs`); nowa ścieżka `src/components/today/AddTaskFromTodayDialog.tsx` nie koliduje ✓; symbole ✓ (`createTask`, `taskInputSchema`, `TASK_FIELDS`, `Field` z `hint`, `Select` z `{value,label}`, `formatDate`, `readFailure`); Progress↔Phase 7/7 ✓ (4 automatyczne + 3 ręczne kryteria = 7 wierszy), bloki faz bez checkboxów poza standardową notką ✓; brief↔plan ✓ (decyzje, zakres, jedna faza). Zweryfikowane: reguła „najbliższy milestone" w SQL to `distinct on (m.project_id) … where m.completed_at is null order by m.project_id, m.due_date, m.seq` (`supabase/migrations/20261016120000_today_list.sql:51-56`), czyli dokładnie kolejność `due_date, seq` z planu; `tasks` i `taskInputSchema` przyjmują `{title, due_date}` z pustym terminem jako `null`; `createTask` sprawdza przynależność milestona do projektu (`findMilestone`), a trigger odrzuca zamknięty milestone komunikatem obsługiwanym przez `translateError`; istniejące kroki smoke „today page renders empty state" (bez projektów) i „…lists the open task of the nearest milestone" (dane) obsługują `bodyIncludes`/`bodyExcludes`, a dopisywane teksty nie kolidują z ich obecnymi asercjami (`bodyExcludes: "pozycj"`, `["Beta smoke", "milestone do zamknięcia"]`); opcje milestonów nie trafiają do SSR HTML (zawartość `Dialog` renderuje się po otwarciu), więc „Beta smoke" nie pojawi się w kroku z danymi. Niezweryfikowane wprost: typ osadzonego `projects(id, name)` dla złożonego FK `milestones_project_owner_fkey (project_id, user_id)` w supabase-js (sprawdzić przy implementacji, `gen types` nie opisuje tej relacji jawnie).

## Findings

### F1 — Osadzenie `projects(...)` po złożonym kluczu obcym nie jest zweryfikowane

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — pkt 2 (`getTaskTargets`)
- **Detail**: `milestones` łączy się z `projects` złożonym FK `(project_id, user_id) → projects(id, user_id)` (`milestones_project_owner_fkey`, `src/db/database.types.ts:73-78`). PostgREST zwykle rozpoznaje takie osadzenie, ale w repo nie ma jeszcze zapytania `projects(...)` od strony `milestones`, a plan zostawia typ wyniku („tablica lub obiekt") do ustalenia przy implementacji. Gdy osadzenie nie zadziała lub da zły typ, implementator zgaduje obejście.
- **Fix**: Dopisać w kontrakcie `getTaskTargets` jawny plan awaryjny: jeśli osadzenie nie działa lub nie daje obiektu, dwa zapytania (`listProjects(supabase)` plus milestony `completed_at is null`) łączone po `project_id` w pamięci, bez rzutowania `as`.
- **Decision**: FIXED (Fix in plan) — Faza 1 pkt 2: weryfikacja osadzenia po złożonym FK (guard bez as) i plan awaryjny z dwoma zapytaniami łączonymi po project_id

### F2 — Podpowiedź o widoczności pojawia się po zmianie selecta, ale nie jest ogłaszana

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — pkt 3 (`AddTaskFromTodayDialog`, `hint` pola Milestone)
- **Detail**: Podpowiedź to `hint` w `Field` (`<p>` połączony przez `aria-describedby`; `src/components/ui/field.tsx`), więc czytnik ekranu odczyta ją dopiero przy kolejnym fokusie na select. Użytkownik, który zmienia milestone klawiaturą, nie usłyszy ostrzeżenia, a to jedyny sygnał chroniący guardrail „nic nie znika bez wiedzy użytkownika". Plan wymaga dostępności tylko w ręcznej weryfikacji ogólnie (etykiety, klawiatura).
- **Fix**: Dopisać w kontrakcie, że tekst podpowiedzi jest renderowany w elemencie `role="status"` (stały kontener, zmienia się tylko treść), i dodać do ręcznej weryfikacji, że ostrzeżenie jest ogłaszane po zmianie milestona.
- **Decision**: FIXED (Fix in plan) — Faza 1 pkt 3: podpowiedź renderowana w stałym elemencie role="status"; ręczne kryterium 1.6 obejmuje ogłoszenie przez czytnik ekranu
