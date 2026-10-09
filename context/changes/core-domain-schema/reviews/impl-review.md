<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Domenowy schemat danych (projects / milestones / tasks)

- **Plan**: context/changes/core-domain-schema/plan.md
- **Scope**: Full plan (3 of 3 phases)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Success criteria (re-run during review)

- 1.1/1.2/2.1 supabase running, `db reset` applies both migrations: PASS
- 1.3/2.2 `supabase test db`: PASS (88/88)
- 2.3 anon REST on projects/milestones/tasks: PASS (HTTP 401, 42501)
- 3.1 types contain 3 tables: PASS
- 3.2 `npm run lint`: literal command FAILS on pre-existing causes (CRLF autocrlf + 6 files outside src/); changed files clean with endOfLine auto. Accepted scoped in implementation (deviation note in plan.md). 
- 3.3 `astro check`: PASS (0 errors) / 3.4 build: PASS / 3.5 smoke: PASS (8/8)
- Manual 1.4, 2.4, 3.6: checked [x] after the user confirmed via psql evidence (Studio not running); observable evidence exists in the diff.

## Findings

### F1 — authenticated zachowuje TRUNCATE, REFERENCES i TRIGGER na tabelach

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261009120100_enable_core_domain_rls.sql:13-15
- **Detail**: Migracja robi `revoke all … from anon` i dodaje `grant select, insert, update, delete … to authenticated`, ale nie odbiera domyślnych uprawnień Supabase dla `authenticated`. Zweryfikowane na żywej bazie: `has_table_privilege('authenticated', …)` zwraca true dla TRUNCATE, REFERENCES i TRIGGER na wszystkich trzech tabelach. TRUNCATE omija RLS i wyczyściłby dane wszystkich kont. PostgREST go nie udostępnia, więc osiągalność jest niska, ale plan zakładał jawne, wąskie uprawnienia.
- **Fix**: dodać `revoke all on public.projects, public.milestones, public.tasks from authenticated` przed istniejącym `grant` oraz test pgTAP `has_table_privilege('authenticated', …, 'TRUNCATE')` = false.
- **Decision**: FIXED (Fix now) — `revoke all … from anon, authenticated` przed `grant` + 3 asercje has_table_privilege(TRUNCATE)=false w core_domain_rls.test.sql (plan 58→61); zweryfikowane: authenticated ma dokładnie SELECT,INSERT,UPDATE,DELETE; 91/91

### F2 — Tabele powstają bez RLS; RLS dopiero w drugiej migracji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20261009120000_create_core_domain_schema.sql:8-52 oraz 20261009120100_enable_core_domain_rls.sql
- **Detail**: CLAUDE.md: „Always enable RLS on new tables”. Migracja 1 tworzy tabele z domyślnymi uprawnieniami, a RLS i REVOKE dla anon dopiero migracja 2. `db push` stosuje pliki po kolei, każdy w osobnej transakcji, więc nieudana migracja 2 zostawiłaby tabele czytelne i zapisywalne dla anon przez PostgREST. Podział na dwie migracje był zatwierdzoną decyzją planu (osobna faza RLS), ale wynikające z niego okno ekspozycji nie było rozważone.
- **Fix A ⭐ Recommended**: przenieść `enable row level security` i `revoke all … from anon, authenticated` do migracji 1 (RLS bez polityk = brak dostępu), a w migracji 2 zostawić polityki i `grant`.
  - Strength: nigdy nie ma stanu „tabela bez RLS”; zgodne z CLAUDE.md; migracje nie były jeszcze wypchnięte na zdalny projekt, więc edycja jest bezpieczna.
  - Tradeoff: faza 1 przestaje być „bez RLS” (testy schematu muszą działać jako postgres, co już robią), a plan opisuje inny podział.
  - Confidence: HIGH — testy fazy 1 działają jako rola postgres, która omija RLS.
  - Blind spot: testy schematu nie sprawdzają zachowania ról, więc trzeba przeliczyć plany testów.
- **Fix B**: zostawić dwie migracje, ale wypychać je razem i nie robić `db push` pojedynczo.
  - Strength: zero zmian w kodzie.
  - Tradeoff: ochrona zależy od dyscypliny, nie od struktury.
  - Confidence: MEDIUM — okno jest wąskie, ale realne przy błędzie migracji 2.
  - Blind spot: CI `smoke` stosuje obie migracje razem, więc go nie wykryje.
- **Decision**: FIXED via Fix B (process) — zostają dwie migracje; wypychać je zawsze razem (`db push` bez pojedynczych plików). Bez zmian w kodzie

### F3 — Brak indeksów po user_id

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261009120000_create_core_domain_schema.sql:8, 20, 38
- **Detail**: Potwierdzone w `pg_indexes`: nie ma indeksu na `user_id` w żadnej tabeli. Polityki RLS filtrują po `user_id`, a usunięcie konta kasuje kaskadowo przez FK `user_id`. Przy target_scale small to nie boli, a indeks `(user_id, status)` został celowo usunięty w przeglądzie planu, bo kształt zapytania S-04 jest nieznany.
- **Fix**: dodać indeksy po `user_id` (np. `projects(user_id, due_date)`) w S-01/S-04, gdy znany jest kształt zapytań.
- **Decision**: FIXED (Fix now) — indeksy projects(user_id, due_date), milestones(user_id), tasks(user_id); uwaga: wykracza poza listę indeksów z planu (plan nie zawierał indeksów user_id)

### F4 — Wyścig między dwoma triggerami dat

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261009120000_create_core_domain_schema.sql:94-96
- **Detail**: W READ COMMITTED wstawienie milestona i równoległe skrócenie terminu projektu mogą oba przejść (każdy trigger nie widzi niezatwierdzonej zmiany drugiego) i naruszyć regułę FR-003. Plan świadomie to zaakceptował (jedno konto, niski ruch), ale zabezpieczenie jest tanie.
- **Fix**: dodać `for share` do `select p.due_date … from public.projects p` w funkcji triggera milestona. Wymaga weryfikacji testem, że `FOR SHARE` działa pod rolą authenticated z RLS.
- **Decision**: FIXED (Fix now) — `for share` w SELECT projektu w triggerze milestona; zweryfikowane pod rolą authenticated (insert w terminie przechodzi, ponad terminem odrzucony) oraz przez istniejące testy RLS; 91/91

### F5 — Luki siły testów pgTAP

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_rls.test.sql:46-57; core_domain_schema.test.sql:79-82
- **Detail**: (1) test „cztery polityki” liczy polityki dla roli authenticated, ale nie sprawdza `cmd`, więc cztery SELECT-y by przeszły; (2) `throws_ok` na 23514 nie odróżnia CHECK-a od triggera dat (SQLSTATE ten sam); (3) test statusu domyślnego to tylko `lives_ok`, bez asercji `todo`; (4) brak testów: trigger `updated_at`, ścieżka `UPDATE OF project_id` w triggerze milestona, akceptacja `partial`/`done`. Pozostałe asercje są niepuste (sprawdzone w teście zepsucia).
- **Fix**: doprecyzować test polityk o `cmd` i dodać cztery brakujące asercje.
- **Decision**: SKIPPED — luki drobne; testy przeszły test zepsucia

### F6 — Higiena: btrim, opis bez limitu, EXECUTE funkcji triggerów

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261009120000_create_core_domain_schema.sql:11, 12, 58-136
- **Detail**: `btrim(name)` obcina tylko spacje (nazwa złożona z samych tabulatorów przejdzie); `description` nie ma limitu długości; funkcje triggerów w `public` są wykonywalne przez PUBLIC (nieosiągalne przez RPC, ale hałas w doradcy bezpieczeństwa Supabase). Nic z tego nie wynika z PRD.
- **Fix**: pominąć w F-01; ewentualnie obsłużyć walidacją zod w S-01 i limitem w osobnej migracji.
- **Decision**: SKIPPED — poza zakresem F-01; walidacja zod w S-01
