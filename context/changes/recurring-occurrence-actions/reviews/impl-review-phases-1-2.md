<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Akcje na wystąpieniu zadania powtarzalnego

- **Plan**: context/changes/recurring-occurrence-actions/plan.md
- **Scope**: Phases 1 and 2 of 3 (Faza 3 ma oczekujące kroki ręczne 3.6–3.8 i jest poza pokryciem)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success Criteria uruchomione ponownie w tym przeglądzie: `npx supabase test db` PASS (305 testów, nowy plik `plan(42)`), `npx astro check` 0 błędów 0 ostrzeżeń. Lint, build i smoke przeszły przy bramkach faz 2 i 3 na tym samym drzewie roboczym.

## Findings

### F1 — Odhaczenie po przeniesieniu zwraca 201 bez zapisu „zrobione”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/tasks.ts:227
- **Detail**: `completeOccurrence` traktuje każdy błąd 23505 jako sukces (idempotencja z S-07). Od S-09 wiersz dla `(task_id, occurrence_date)` może mieć stan `moved`: gdy karta A przeniosła dzisiejsze wystąpienie na jutro, a nieodświeżona karta B kliknie „Zrobione”, B dostaje 201, choć stan to `moved`, a nie `done`. `moveOccurrenceToTomorrow` robi odwrotnie i rozróżnia stan (tasks.ts:260-274). Potwierdzone w kodzie.
- **Fix**: Przy 23505 odczytaj wiersz dla `(task_id, date)` i dla stanu `moved` zwróć błąd walidacji (np. „To wystąpienie zostało już przeniesione na jutro.”), dla `done` zostaw sukces.
- **Decision**: FIXED via Fix now (completeOccurrence reads the row on 23505; state moved returns validation OCCURRENCE_MOVED_ERROR)

### F2 — Przesunięcie daty milestona nie uwzględnia dnia docelowego przeniesienia

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261019130000_milestone_date_covers_routines.sql:10-22
- **Detail**: Wyzwalacz daty milestona sprawdza tylko `due_date` i `recurrence_start_date` zadań (potwierdzone w migracji), nie `moved_to`. Gdy milestone zostanie przesunięty przed dzień docelowy przeniesienia, `today_list` ukryje to wystąpienie (wymóg `p_today ≤ data milestona`) i nigdy nie policzy go jako pominiętego. To ta sama klasa luki co F1 z przeglądu S-07, tylko dla nowego pola.
- **Fix A ⭐ Recommended**: Rozszerz wyzwalacz (nowa migracja `create or replace`) o wiersze `task_occurrences.moved_to > nowa data`, plus test pgTAP.
  - Strength: Zamyka lukę tak jak poprawka z S-07 i zachowuje regułę „data milestona obejmuje wszystko, co zaplanowane”.
  - Tradeoff: Dodatkowa migracja i test; przesunięcie milestona na wczoraj bywa blokowane przez przeniesienie, o którym użytkownik nie wie.
  - Confidence: HIGH — dokładnie ten wzorzec już zastosowano dla `recurrence_start_date`.
  - Blind spot: Nie sprawdzono, czy UI milestona poprawnie wyświetla ten komunikat błędu.
- **Fix B**: Zaakceptuj jako znane ryzyko i zapisz w planie.
  - Strength: Zero kodu; scenariusz wymaga przeniesienia na jutro i przesunięcia daty milestona do dziś.
  - Tradeoff: Wystąpienie znika bez śladu, wbrew guardrailowi z PRD.
  - Confidence: MEDIUM — prawdopodobieństwo niskie, ale skutek sprzeczny z regułą.
  - Blind spot: Brak danych, jak często użytkownicy przesuwają daty milestonów.
- **Decision**: FIXED via Fix A (migration 20261021130000_milestone_date_covers_moves.sql + test core_domain_recurring_milestone_moves.test.sql; test red without the migration, green with it)

### F3 — Zmiana rytmu po przeniesieniu może unieważnić zapisane przeniesienia

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261021120000_recurring_occurrence_actions.sql:80-162
- **Detail**: Wyzwalacz działa tylko przy INSERT. Zmiana rytmu zadania (S-10) po przeniesieniu może sprawić, że dzień źródłowy nie jest już dniem rytmu albo dzień docelowy staje się dniem rytmu; wtedy jedno wystąpienie na dzień docelowy zlewa się w jeden wiersz i jedno „zrobione” zaspokaja oba. Dziś nie ma ścieżki w aplikacji zmieniającej rytm (zapis `recurrence_*` tylko przy tworzeniu zadania, tasks.ts:121-131), więc nic się nie psuje przed S-10.
- **Fix**: Zapisz w badaniu S-10 jako wymóg: zmiana rytmu działa od dziś, a przyszłe wiersze `moved` są usuwane albo ignorowane, gdy ich źródło nie jest dniem rytmu lub cel nim jest.
- **Decision**: FIXED via Fix now (requirement queued in follow-ups/review-fixes.md and noted in roadmap S-10 Unknowns)

### F4 — Luki asercji w testach nowych kroków

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:1002-1040, supabase/tests/database/core_domain_recurring_occurrence_actions.test.sql
- **Detail**: Dwa kroki smoke z 422 sprawdzają tylko istnienie pola `error`, więc przeszłyby też przy zamienionych komunikatach. Krok „moved twice” nie odróżnia prawdziwej idempotencji od połkniętego błędu. W pgTAP asercje naruszeń unikalności nie rozróżniają klucza głównego od indeksu; brak testów dla `completeOccurrence` względem dnia z przeniesieniem, dla granicy miesiąca i dla startu zadania równego dziś.
- **Fix**: W smoke asercja na dokładny tekst `MOVE_ERROR` i `OCCURRENCE_ERROR`; w pgTAP asercja na nazwę ograniczenia oraz dwa brakujące przypadki graniczne.
- **Decision**: FIXED via Fix now (smoke: exact error texts + new step "marking a moved occurrence as done is rejected"; pgTAP: constraint names in unique violations + month-boundary and start-today skipped cases, plan 44)

### F5 — Dwa drobne dodatki ponad plan

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20261021120000_recurring_occurrence_actions.sql:281-290, src/lib/services/tasks.ts (gałąź 23514)
- **Detail**: `task_can_move` dodatkowo wymaga, by jutro nie było już dniem docelowym innego przeniesienia (nieosiągalne z API, obronne), a tłumaczenie 23514 obejmuje też ograniczenia `task_occurrences_moved_to_check` i `moved_shape`. Oba dodatki są zgodne z intencją planu i niskiego ryzyka, ale nie ma ich w planie.
- **Fix**: Dopisz oba w planie jako adnotację, bez zmian w kodzie.
- **Decision**: FIXED via Fix now (annotations added to Phase 1 and Phase 2 blocks of plan.md)
