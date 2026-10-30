<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testy spójności danych i izolacji kont (Faza 3 rolloutu)

- **Plan**: context/changes/testing-data-integrity-isolation/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated gates re-run during review: `npm run test:db` (15 files, 495 tests, PASS), `npm run lint` (clean), `npm run test:app` (92 passed). Diff: 7 files, zero changes under `src/` or `supabase/migrations/`.

## Findings

### F1 — `throws_ok(..., '42501', null)` może przechodzić z niewłaściwego powodu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_account_isolation.test.sql:196-211, 238-246
- **Detail**: Siedem asercji (4 inserty z cudzym `user_id`, 3 przepięcia wiersza na drugie konto) podaje `null` jako komunikat. SQLSTATE 42501 zgłasza zarówno naruszenie `WITH CHECK` polityki RLS, jak i brak uprawnienia do tabeli lub kolumny. Cofnięcie grantu dla `authenticated` nie zaczerwieni tych asercji, choć test twierdzi, że dowodzi RLS.
- **Fix A ⭐ Recommended**: Przypiąć komunikat RLS (np. `new row violates row-level security policy for table "projects"`) w siedmiu asercjach.
  - Strength: Asercja dowodzi właśnie polityki, a `throws_ok(sql, errcode, errmsg, desc)` jest już użyte w `core_domain_milestone_list_integrity.test.sql`.
  - Tradeoff: Wiąże test z brzmieniem komunikatu Postgresa; dla `task_occurrences` może wchodzić w grę wyzwalacz `check_task_occurrence`, więc komunikat trzeba zaobserwować, nie założyć.
  - Confidence: MED — wzorzec istnieje w repo, ale brzmienia komunikatów dla czterech tabel nie sprawdzono.
  - Blind spot: Nie ustalono, które z siedmiu przypadków przechodzą dziś przez RLS, a które przez trigger.
- **Fix B**: Zostawić `null` i dodać break-check „revoke grantu” do notatki fazy.
  - Strength: Bez zmiany pliku testowego.
  - Tradeoff: Luka zostaje; dowód jest jednorazowy, nie trwały.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — przypięto zaobserwowany komunikat RLS (`new row violates row-level security policy for table "<tabela>"`) w 7 asercjach; test:db 495 PASS

### F2 — Przypięty wynik `23505` zamienia przyszłe utwardzenie w „regresję”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_account_isolation.test.sql:231-235
- **Detail**: Asercja przypina wyciek istnienia wiersza (`23505` zamiast `23503`). Dodanie `user_id` do klucza unikalnego poprawiłoby bezpieczeństwo, ale zaczerwieniłoby test. Nagłówek pliku i §7 opisują to jako obserwację, ale sama asercja nie ma markera w miejscu użycia.
- **Fix**: Dodać przy asercji komentarz `-- EXPECTED TO CHANGE: obserwacja znanego ryzyka (test-plan.md §7), nie wymaganie`; asercja końcowa liczności już dowodzi, że żaden wiersz nie powstał.
- **Decision**: FIXED — dodano marker EXPECTED TO CHANGE przy asercji 23505

### F3 — Kryterium 1.2 w planie błędnie przypisuje „remis” wariantowi `due_date desc`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-data-integrity-isolation/plan.md (Success Criteria Fazy 1, wiersz 1.2)
- **Detail**: Remis dat (test 10, G03) łapie tylko wariant `seq desc`. Notatka fazy i §6.7 mówią to poprawnie, ale treść kryterium 1.2 i odhaczony wiersz nadal sugerują coś innego.
- **Fix**: Poprawić sformułowanie kryterium 1.2 tak, by wskazywało wariant `seq desc` dla remisu.
- **Decision**: FIXED — poprawiono kryterium 1.2 (i bullet w Fazie 1) w plan.md

### F4 — `throws_ok` w G13 przypina także tekst komunikatu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/tests/database/core_domain_milestone_list_integrity.test.sql:395-400
- **Detail**: Plan wymagał kodu `23514`; test przypina też `Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (1)`. Komunikat istnieje w trzech migracjach (najnowsza `20261021130000_milestone_date_covers_moves.sql:33`), więc przechodzi, ale zmiana brzmienia zaczerwieni test.
- **Fix**: Zostawić (komunikat to też kontrakt dla użytkownika i liczy zadania); ewentualnie świadomie pominąć.
- **Decision**: SKIPPED — komunikat 23514 zostaje przypięty świadomie (kontrakt dla użytkownika)

### F5 — §6.5 uogólnia „projekt kontrolny” na wszystkie scenariusze

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:164 (§6.5, reguła milestona #6)
- **Detail**: Tekst mówi, że każdy scenariusz ma projekt kontrolny z identyczną strukturą. Kontrole są w G06/G07, G08/G09 i G10-G12; G01-G05 i G13 asercją sprawdzają tylko listę.
- **Fix**: Zmienić na „scenariusze usunięć mają projekt kontrolny z identyczną strukturą”.
- **Decision**: FIXED — §6.5 zawęża projekt kontrolny do scenariuszy usunięć

### F6 — Wpis §8 „Stack versions last verified” odświeżony bez weryfikacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md (§8, Stack versions last verified)
- **Detail**: Data zmieniona na 2026-10-29 przy zapisie „bez zmiany wersji”, ale wersji stosu w tej zmianie nie sprawdzano. Plan prosił o odświeżenie wpisu, więc to zgodne z literą planu, lecz data twierdzi więcej niż wykonano.
- **Fix**: Przywrócić 2026-10-27 albo uruchomić krótką weryfikację wersji (`vitest` 5.0.5) przed zachowaniem daty.
- **Decision**: FIXED — §8 przywrócono 2026-10-27

### F7 — Brak próby przejęcia wiersza przez `update ... set user_id`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_account_isolation.test.sql (sekcja prób zapisu)
- **Detail**: Próby zmiany nazwy cudzego wiersza pokrywają ścieżkę `USING`, ale nie kolumnę `user_id`. Zablokuje to ta sama klauzula `USING` (0 wierszy), więc wartość dodatkowa jest niska.
- **Fix**: Pominąć, chyba że dopisanie jednej próby w `zz_iso_run` jest tanie.
- **Decision**: SKIPPED — niska wartość dodatkowa; ta sama klauzula USING
