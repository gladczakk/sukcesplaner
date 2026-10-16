<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Akcje na liście zadań na dziś

- **Plan**: context/changes/today-list-actions/plan.md
- **Mode**: Deep
- **Date**: 2026-10-16
- **Verdict**: SOUND (po poprawkach z triage)
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

Istniejące ścieżki ✓ (`src/lib/today.ts`, `src/lib/validation/task.ts`, `src/lib/services/tasks.ts`, `src/lib/services/today.ts`, `src/types.ts`, `src/pages/today.astro`, `[taskId].ts`, `use-task-api.ts`, `CloseMilestoneButton.tsx`, `scripts/smoke.mjs`, migracje); nowe ścieżki nie kolidują ✓ (`src/components/today/TodayTaskActions.tsx`, `RestoreDeferredButton.tsx`); symbole ✓ (`setTaskStatus`, `findMilestone`, `translateError`, `TodayView`, `deferredCount`, `todayInWarsaw`, `taskStatusSchema`); Progress↔Phase 13/13 ✓ (6+7 kryteriów), bloki faz bez checkboxów ✓; brief↔plan ✓. Zweryfikowane: schemat `z.union([z.literal("tomorrow"), z.null()], {error})` (zod 4.6.5) daje komunikat z planu dla każdej złej wartości (`"yesterday"`, liczba, brak klucza), a `"tomorrow"` i `null` przechodzą; `{status, deferred_until: null}` i `{deferred_until: "…"}` przechodzą typowo (`database.types.ts` Update); łańcuch `.update().eq().eq().neq().select()` jest poprawny typowo (postgrest-js 2.116.0); trigger `tasks_check_rules` odpala się przy zapisie z `status` na liście SET, a przy samym `deferred_until` nie; żaden test pgTAP nie zapisuje `deferred_until` po stronie `update`; sekwencja kroków smoke D1–D6 daje oczekiwane wyniki i nie psuje istniejących kroków (zadanie `partial` nadal liczy się jako niezrobione w „…niezrobione zadania (1)"). Niezweryfikowane wprost: render `aria-pressed` w SSR (wiedza o React, do sprawdzenia przy smoke).

## Findings

### F1 — Faza 1 pomija inicjalizatory `TodayView` w dwóch plikach

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — pkt 5 (lista przeniesionych w `getToday`)
- **Detail**: Zmiana `TodayView` (`deferredCount` → `deferred`) dotyka trzech miejsc, a plan wymienia dwa i pół: `src/lib/services/today.ts` ma inicjalizator `{ …, deferredCount: 0 }` i `deferredCount += 1` (linie ok. 18 i 38-39) oraz komentarz „deferred count", a `src/pages/today.astro` ma `let view: TodayView = { tasks: [], milestones: [], deferredCount: 0 }` (linia ok. 20) i odczyt `view.deferredCount` (ok. 126-127). Plan mówi tylko o `view.deferred.length` w stronie; bez zmiany inicjalizatora `astro check` się wywali.
- **Fix**: Dopisać w pkt 5 Fazy 1: inicjalizator w `today.ts` i w `today.astro` zmienia się na `deferred: []`, `getToday` dopisuje wiersze `deferred` do listy, a komentarz serwisu jest aktualizowany.
- **Decision**: FIXED (Fix in plan) — Faza 1 pkt 5 wymienia wszystkie trzy miejsca deferredCount (inicjalizatory w today.ts i today.astro, komentarz serwisu)

### F2 — Status `TodayTask` może być `done` w typie

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — pkt 4 (strona `/today`, propsy `TodayTaskActions`)
- **Detail**: Plan mówi, że `task.status` jest „zawężony do `todo|partial`", ale `TodayTask.status` ma typ `TaskStatus` (zawiera `done`); SQL nie zwraca zadań `done`, ale typ tego nie gwarantuje, a rzutowanie `as` w stronie ukryłoby błąd.
- **Fix**: Wskazać w kontrakcie jawny guard zamiast rzutowania (np. zadanie ze statusem `done` nie dostaje wyspy akcji lub zawężenie przez funkcję pomocniczą), zgodnie z lintem `strictTypeChecked`.
- **Decision**: FIXED (Fix in plan) — Faza 2 pkt 4: jawny guard zamiast rzutowania, zadanie done nie dostaje wyspy akcji

### F3 — `PATCH` z kluczami `status` i `deferred` naraz

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — pkt 4 (trasa `PATCH`)
- **Detail**: Plan rozróżnia kształt ciała po obecności klucza `deferred`; ciało z obydwoma kluczami po cichu wybrałoby gałąź przeniesienia i zignorowało `status`, bez błędu.
- **Fix**: Dopisać regułę: ciało z obydwoma kluczami → `422` z komunikatem „Podaj albo status, albo przeniesienie." (pierwsza gałąź sprawdza obecność obu kluczy przed walidacją schematów).
- **Decision**: FIXED (Fix in plan) — Faza 1 pkt 4: ciało z kluczami status i deferred naraz → 422; nowy krok smoke D7

### F4 — Asercje smoke zależą od ciągłego tekstu w `summary`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — pkt 4 (sekcja `<details>`) i pkt 5 (smoke)
- **Detail**: Krok smoke szuka w HTML ciągu „Przeniesione na później: 1"; jeśli licznik trafi do osobnego elementu (`<span>`), `includes` zawiedzie mimo poprawnego widoku. Plan opisuje tekst ciągły, ale nie nazywa tego ograniczenia.
- **Fix**: Dopisać w kontrakcie `summary`: tekst „Przeniesione na później: {N}" renderowany jako jeden ciągły węzeł tekstowy (np. interpolacja w jednym wyrażeniu), bez osobnego elementu dla liczby.
- **Decision**: FIXED (Fix in plan) — Faza 2 pkt 4: summary renderuje „Przeniesione na później: {N}” jako jeden ciągły węzeł tekstowy
