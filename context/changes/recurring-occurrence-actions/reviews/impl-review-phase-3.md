<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Akcje na wystąpieniu zadania powtarzalnego

- **Plan**: context/changes/recurring-occurrence-actions/plan.md
- **Scope**: Phase 3 of 3
- **Reviewed phases**: 3
- **Date**: 2026-10-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success Criteria w tym przeglądzie: `npx supabase test db` PASS (310 testów), `npx astro check` 0 błędów 0 ostrzeżeń. Lint, build i smoke przeszły przy bramkach fazy 3 (commit 064c93c); kroki ręczne 3.6–3.8 potwierdzone przez użytkowniczkę. Poprzedni przegląd faz 1–2: `impl-review-phases-1-2.md`.

## Findings

### F1 — Lista z samymi pominiętymi wierszami nie ma stanu pustego ani podsumowania

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/today.astro:41-43, :62
- **Detail**: `hasRows` ukrywa stan „Na dziś nic do zrobienia.” już przy samych wierszach `skipped`, a podsumowanie jest bramkowane `itemCount > 0`. Gdy wczoraj była rutyna, a dziś nic nie ma do zrobienia (np. rutyna na dni tygodnia z wczoraj, bez innych zadań), strona pokazuje pod nagłówkiem samą listę „Pominięte wczoraj” bez żadnego wyjaśnienia. Potwierdzone w kodzie.
- **Fix**: Gdy `itemCount === 0` i są wiersze `skipped`, pokaż zdanie „Na dziś nic do zrobienia.” nad listą pominiętych (stan pusty z przyciskiem dodawania zostaje tylko przy braku jakichkolwiek wierszy).
- **Decision**: FIXED via Fix now (today.astro shows "Na dziś nic do zrobienia." above the skipped list when itemCount is 0)

### F2 — Komunikat 422 przy nieaktualnej stronie nie mówi o odświeżeniu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/tasks.ts:35-37 (stałe komunikatów), src/components/today/TodayTaskActions.tsx:75-96
- **Detail**: Przy nieaktualnej karcie „Zrobione” albo „Na jutro” na wystąpieniu już przeniesionym albo zrobionym serwer zwraca 422 z tekstem „To wystąpienie zostało już przeniesione na jutro.”, „To wystąpienie jest już zrobione.” albo „Tego wystąpienia nie można przenieść na jutro.”. Żaden z nich nie podpowiada odświeżenia strony (tylko starszy `OCCURRENCE_ERROR` ma „Odśwież stronę.”), a przyciski zostają aktywne, więc użytkowniczka zostaje na nieaktualnym wierszu.
- **Fix**: Dopisz „ Odśwież stronę.” do trzech stałych w tasks.ts (`OCCURRENCE_MOVED_ERROR`, `OCCURRENCE_DONE_ERROR`, `MOVE_ERROR`) i zaktualizuj dokładne teksty w smoke.
- **Decision**: FIXED via Fix now (" Odśwież stronę." appended to MOVE_ERROR, OCCURRENCE_DONE_ERROR, OCCURRENCE_MOVED_ERROR; smoke exact texts updated)

### F3 — `formatWeekdayFrom` zwraca `undefined` dla niepoprawnej daty

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/weekdays.ts:22-26
- **Detail**: Dla pustego lub niepoprawnego ciągu `new Date(iso).getUTCDay()` jest `NaN`, indeks `NaN`, a funkcja zwraca `undefined` mimo typu `string`; `today.astro` wyrenderowałby „przeniesione undefined”. Wejście z PostgREST to zawsze `YYYY-MM-DD`, więc to scenariusz zmiany formatu, nie bieżący błąd.
- **Fix**: Zwracaj pusty ciąg, gdy `getUTCDay()` jest `NaN`.
- **Decision**: FIXED via Fix now (formatWeekdayFrom returns "" for a non-date; today.astro renders the label only when the phrase is non-empty)

### F4 — Typy generowane mówią „bez NULL” dla kolumn, które SQL zwraca jako NULL

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/today.ts:36-51, src/db/database.types.ts:229,233
- **Detail**: `task_moved_from` i `task_can_move` są typowane jako `string` i `boolean`, choć są NULL poza wierszami `routine`. Serwis czyta je tylko dla `routine` i opisuje to komentarzem, jak wcześniej dla `interval_days` w S-07 i S-08, więc to istniejący wzorzec repo, nie nowa wada. Późniejsze `if (row.task_moved_from)` mogłoby jednak zostać oznaczone przez lint jako zbędne.
- **Fix**: Zostaw jak jest (spójnie z S-07/S-08); nadpisanie typów RPC rozważ wspólnie dla wszystkich takich kolumn osobną zmianą.
- **Decision**: SKIPPED (consistent with S-07/S-08; override RPC types for all such columns in a separate change)

### F5 — Odznaka „Pominięte wczoraj” napisana inline zamiast przez wspólny chip

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/today.astro:129-146
- **Detail**: Odznaka kopiuje klasy `DueChip` (`type-meta`, `rounded-pill`, `bg-warning-soft text-warning-ink`) i dodaje ikonę zegara; to druga implementacja chipa obok `DueChip.astro`. Tokeny istnieją w `:root` i `.dark`, a znaczenie niesie tekst i ikona, nie sam kolor.
- **Fix**: Zostaw; wspólny komponent chipa warto wydzielić dopiero przy trzecim użyciu.
- **Decision**: SKIPPED (extract a shared chip at the third use)

### F6 — Brak pokrycia testami dla odznaki, etykiety przeniesienia i helpera dnia

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs, src/lib/weekdays.ts
- **Detail**: Smoke nie steruje datą, więc żaden krok nie renderuje wiersza `skipped` ani etykiety „przeniesione ze środy”; wiersze `skipped` i `task_moved_from` pokrywa pgTAP po stronie SQL, ale `formatWeekdayFrom` i markup odznaki nie mają testu (repo nie ma runnera testów jednostkowych TS). Kroki 3.7 i 3.6 sprawdzono ręcznie.
- **Fix**: Zaakceptuj do czasu pojawienia się runnera testów TS lub E2E z kontrolą daty (Moduł 3).
- **Decision**: FIXED via Fix now (scripts/weekdays.test.mjs + npm run test:unit, dependency-free node:test; red on a broken helper, green restored). Badge markup and the skipped/moved rows remain untested beyond pgTAP and the manual steps)
