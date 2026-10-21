<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zmiana rytmu i wyłączenie powtarzania

- **Plan**: context/changes/recurring-task-edit-disable/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-21
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

Success Criteria uruchomione w tym przeglądzie: `npx supabase test db` PASS (325 testów), `npx astro check` 0 błędów 0 ostrzeżeń. Lint, build, smoke, `test:unit` i testy zepsucia przeszły przy bramkach faz (commity 214d970, 5a7bf66, 3d12a7a); kroki ręczne 3.7–3.10 potwierdzone przez użytkowniczkę.

## Findings

### F1 — Wybór rytmu i powrót do „Nie powtarzaj” kasuje termin zwykłego zadania

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/projects/TaskFormDialog.tsx (`changeRepeat`, `submit`)
- **Detail**: `changeRepeat` zeruje `due_date`, gdy wybierasz rytm, a po powrocie do „Nie powtarzaj” zostawia już pustą wartość. W edycji zwykłego zadania z terminem 2026-11-05: wybierz „Codziennie”, wróć do „Nie powtarzaj”, zapisz — PUT wysyła `due_date: null` i termin znika po cichu. W trybie tworzenia data startuje pusta, więc tam to nie występuje. Potwierdzone w kodzie.
- **Fix**: Nie kasuj `values.due_date` przy wyborze rytmu (ukrywaj pole i wysyłaj pusty termin tylko przy zapisie z rytmem; `dueDate` w `submit` już to robi dla `repeating`).
- **Decision**: FIXED via Fix now (changeRepeat no longer clears due_date; submit still sends none while a rhythm is selected)

### F2 — Wyścig: przeniesienie wstawione równolegle ze zmianą rytmu zostawia „ducha”

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261022120000_recurring_rhythm_change.sql:41-60, supabase/migrations/20261021120000_recurring_occurrence_actions.sql (`check_task_occurrence`)
- **Detail**: Wyzwalacz przeniesienia blokuje tylko milestone (`for share of m`), a klucz obcy wstawiania wiersza bierze tylko blokadę key-share na zadaniu, która nie konfliktuje z UPDATE zmieniającym rytm (no-key update). Karta A wstawia przeniesienie zwalidowane względem starego rytmu, karta B zmienia rytm i trigger sprzątający nie widzi niezatwierdzonego wiersza A; po commicie A zostaje wiersz `moved` od nowej daty startu — dokładnie ten „duch”, któremu migracja miała zapobiec. Okno wąskie; blokady nie były weryfikowane w uruchomieniu (wniosek z czytania SQL).
- **Fix A ⭐ Recommended**: Nowa migracja (`create or replace`) funkcji sprzątającej z `select 1 from public.tasks where id = new.id for update` na początku, żeby zaczekać na równoległe wstawienia i zobaczyć ich wiersze.
  - Strength: Dwa wiersze SQL, zamyka okno wyścigu bez zmiany wyzwalacza przeniesień; wzorzec blokady zadania już znany z innych wyzwalaczy.
  - Tradeoff: Dodatkowa migracja i krótkie oczekiwanie na blokadę przy równoległym przenoszeniu.
  - Confidence: MED — logika blokad Postgresa (FOR UPDATE vs FOR KEY SHARE) jest znana, ale nie sprawdzona tu uruchomieniem.
  - Blind spot: Zachowanie pod prawdziwą współbieżnością nie jest testowane przez pgTAP (jedna sesja).
- **Fix B**: Zaakceptuj jako znane ryzyko i zapisz w planie.
  - Strength: Zero kodu; skala aplikacji to jedna osoba z jedną-dwiema kartami.
  - Tradeoff: Przy równoległej akcji może zostać wiersz na liście niezgodny z rytmem.
  - Confidence: MED — prawdopodobieństwo niskie.
  - Blind spot: Brak danych o realnym użyciu wielu kart.
- **Decision**: FIXED via Fix A (migration 20261022130000_recurring_rhythm_change_lock.sql: cleanup takes FOR UPDATE on the task row first; pgTAP 325 pass; real concurrency not exercised)

### F3 — Podpowiedź przy „Nie powtarzaj” opisuje zmianę rytmu zamiast usunięcia

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/projects/TaskFormDialog.tsx (`repeatHint`)
- **Detail**: Dla zadania powtarzalnego opis „Zmiana rytmu działa od dziś i usuwa przyszłe przeniesienia.” pokazuje się też wtedy, gdy wybrano „Nie powtarzaj” (czyli usunięcie zadania) i gdy rytm się nie zmienił. Komunikat potwierdzenia mówi prawdę, ale opis pod polem wprowadza w błąd. Potwierdzone w kodzie.
- **Fix**: Gdy zadanie jest powtarzalne i wybrano „Nie powtarzaj”, pokaż „Zadanie zostanie usunięte razem z odhaczeniami.”.
- **Decision**: FIXED via Fix now (repeatHint shows "Zadanie zostanie usunięte razem z odhaczeniami." when a recurring task is switched to "Nie powtarzaj")

### F4 — Luki w pgTAP: granica `>=`, rola authenticated, zamknięty milestone

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/database/core_domain_recurring_rhythm_change.test.sql
- **Detail**: Testy sprawdzają źródło 21 vs start 23 i cel 24 vs start 23, ale nie wiersze dokładnie na dacie startu (granica `>=`). Całość idzie jako postgres, więc nie sprawdza działania wyzwalacza pod rolą `authenticated` przez RLS (polityka delete) ani zmiany rytmu w zamkniętym milestonie.
- **Fix**: Dodaj asercje: wiersz z `moved_to` równym dacie startu jest usuwany, a z `occurrence_date` równym dacie startu też, oraz jedną zmianę rytmu pod `set local role authenticated`.
- **Decision**: FIXED via Fix now (pgTAP plan 19: boundary moved_to == start date and a rhythm change under role authenticated; red with > instead of >=)

### F5 — Test zepsucia wyspy nie pokrywa wnętrza dialogu; `warsawToday()` liczone przy budowie tablicy

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs (krok wyspy edycji, kroki „rhythm edit:” z `warsawToday()` w `bodyEquals`)
- **Detail**: `throw` na górze `TaskFormDialog` czerwieni krok z etykietą edycji (komponent nie renderuje się w SSR), ale błąd w zagnieżdżonym `ConfirmDialog` albo w gałęzi usuwania nie zaczerwieni żadnego kroku, bo `DialogContent` nie jest renderowany przy zamkniętym dialogu. `warsawToday()` w `bodyEquals` liczy się przy budowie tablicy kroków, więc bieg przez północ w Warszawie porównałby ze starym dniem (ten sam wzorzec jest w starszych krokach).
- **Fix**: Zapisz w planie, że krok wyspy pokrywa tylko górę komponentu, a reszta jest sprawdzana ręcznie (3.7–3.10); lazy `bodyEquals` odłóż do wspólnej zmiany całego smoke.
- **Decision**: FIXED via Fix now (plan annotation: the island step covers only the top of TaskFormDialog; the rest is covered by manual steps 3.7-3.10; lazy bodyEquals deferred to a common smoke change)

### F6 — Przypadki brzegowe zaakceptowane

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/tasks.ts (`sameRhythm`, `updateTask`)
- **Detail**: Interwał 1 i wszystkie siedem dni tygodnia mają tę samą etykietę „codziennie”, ale są traktowane jako różne rytmy, więc przełączenie między nimi zeruje datę startu i usuwa przeniesienia. Nieaktualny zapis (po stronie karty) „zwykłe zadanie bez rytmu” na zadaniu, które w międzyczasie stało się powtarzalne, kończy się komunikatem `RECURRING_STATE_ERROR` o odhaczaniu, który tu myli. Żaden z przypadków nie psuje danych.
- **Fix**: Zostaw jak jest (zgodnie z ostatnim zapisem wygrywa ostatni, a skala jest mała).
- **Decision**: FIXED via Fix now (interval 1 and all seven weekdays count as one rhythm; stale ordinary-task write returns an accurate refresh message)
