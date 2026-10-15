<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Zarządzanie zadaniami (CRUD)

- **Plan**: context/changes/task-crud/plan.md
- **Mode**: Deep
- **Date**: 2026-10-15
- **Verdict**: REVISE → SOUND po poprawkach z triage
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding

Istniejące ścieżki ✓ (`listMilestones`, `MilestoneListItem`, `task_count`, `getProjectCounts`, `Task`/`TaskStatus`, `select.tsx`, `button.tsx`, `smoke.mjs`, migracje i trzy pliki pgTAP); nowe ścieżki nie kolidują ✓ (katalog `[milestoneId]/tasks/` obok pliku `[milestoneId].ts` — ten sam układ co `[id].ts` obok `[id]/` w S-02); Progress↔Phase 18/18 ✓, bloki faz bez checkboxów ✓; brief↔plan ✓. Zweryfikowane na żywo: `SELECT … FOR SHARE` na milestonie działa dla roli `authenticated` pod RLS (psql na lokalnym Supabase); `order(…, {referencedTable, nullsFirst})` istnieje w postgrest-js 2.116.0; `select("*, tasks(*)")` wynika z relacji FK (jak działające `tasks(count)`); daty smoke z planu są spójne z regułami (projekt i milestony `2099-12-31`). Brak pominiętych konsumentów `listMilestones`/`MilestoneListItem`.

## Findings

### F1 — Nowa reguła zamkniętego milestona psuje istniejący test pgTAP z S-02

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — pkt 2 (testy pgTAP) i kryterium 1.2
- **Detail**: `supabase/tests/database/core_domain_milestone_close.test.sql:28-42` wstawia milestony m5 i m6 jako już zamknięte i dodaje do nich zadania `todo` (symulacja stanu „zadanie dodane po zamknięciu"). Trigger `tasks_check_rules` odrzuci ten INSERT w setupie, więc cały plik się wywali (asercje 7–10 i kolejne) i kryterium 1.2 (`supabase test db`) nie przejdzie. Plan nie wspomina o zmianie tego pliku. Pozostałe pliki (`core_domain_schema`, `core_domain_rls`) przechodzą bez zmian.
- **Fix**: Dopisać do Fazy 1 zmianę `core_domain_milestone_close.test.sql`: otoczyć wstawienie zadań m5/m6 poleceniami `alter table public.tasks disable trigger tasks_check_rules;` / `enable trigger …` z komentarzem, że to symulacja stanu sprzed reguły (liczba asercji `plan(13)` bez zmian); test działa jako `postgres`, a transakcja jest wycofywana.
- **Decision**: FIXED (Fix in plan) — Faza 1 dostała pkt 3: disable/enable trigger tasks_check_rules wokół setupu m5/m6 w core_domain_milestone_close.test.sql

### F2 — Kroki smoke T5 i T9 nie mogą sprawdzić tekstu błędu przez `bodyIncludes`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — pkt 6 (smoke dla API zadań)
- **Detail**: Runner wypełnia `text` tylko dla odpowiedzi `text/html` (`scripts/smoke.mjs:38-43`); dla JSON `text` jest pusty, więc `bodyIncludes` nie zadziała dla „error zawierającym niezrobione zadania (1)" (T5) ani dla komunikatu zamkniętego milestona (T9). Plan nie nazywa też zmiennej na zapamiętane id zadania (`taskId`), która musi być zadeklarowana nad tablicą kroków (jak `completedAt`, linia 55).
- **Fix**: W planie użyć `bodyEquals` z dokładnymi komunikatami z serwisów („Nie można zamknąć milestona: ma niezrobione zadania (1)" dla T5; „Nie można dodać niezrobionego zadania do zamkniętego milestona. Otwórz milestone ponownie." dla T9, T10) oraz nazwać zmienną `let taskId = ""` zapamiętywaną w T3.
- **Decision**: FIXED (Fix in plan) — T5/T9/T10 przez bodyEquals z dokładnymi komunikatami, zmienna taskId nazwana, uwaga o polu text tylko dla HTML

### F3 — Trigger zadań musi obsłużyć brak widocznego milestona (RLS)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — pkt 1 (`check_task_rules`)
- **Detail**: W roli `authenticated` zadanie wskazujące milestone innego użytkownika nie zobaczy go przez RLS na SELECT (`core_domain_rls.test.sql:132` oczekuje `42501`, linia 190 oczekuje `23503`). Plan mówi tylko „brak milestona zgłosi klucz obcy"; funkcja, która po `SELECT … INTO` rzuci wyjątek albo porówna NULL-e, zmieni te kody błędów i wywali istniejące testy RLS.
- **Fix**: Zapisać w kontrakcie funkcji: gdy `SELECT … FOR SHARE` nie zwróci wiersza (`NOT FOUND`), funkcja zwraca `new` bez błędu, a właściwy błąd zgłaszają WITH CHECK i klucz obcy.
- **Decision**: FIXED (Fix in plan) — kontrakt check_task_rules: NOT FOUND → return new, błąd zgłaszają WITH CHECK i FK

### F4 — Przebudowa wiersza milestona i API `Select` nie są opisane

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — pkt 4 i 5
- **Detail**: Wiersz milestona w `[id].astro` to jeden `<li>` z układem flex (nagłówek po lewej, `MilestoneRowActions` po prawej); sekcja zadań „pod nagłówkiem" wymaga zmiany kontenera (np. kolumna/wrap), czego plan nie mówi. `Select` z repo przyjmuje `options` i `onChange(value: string)` (nie zdarzenie) oraz ma bazową klasę `w-full h-10`, więc w wierszu zadania trzeba nadpisać szerokość.
- **Fix**: Dopisać w Fazie 3 jedno zdanie: wiersz milestona dostaje kontener kolumnowy (nagłówek + akcje w górnym wierszu flex, lista zadań pod spodem), a `TaskRowActions` używa `Select` z `options` i `className` ograniczającym szerokość.
- **Decision**: FIXED (Fix in plan) — Faza 3: kontener kolumnowy wiersza milestona i opis API Select
