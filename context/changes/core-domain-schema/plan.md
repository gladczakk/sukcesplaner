# Domenowy schemat danych (projects / milestones / tasks) Implementation Plan

## Overview

Pierwsza migracja Supabase dla SukcesPlaner (roadmapa F-01): trzy tabele `projects` → `milestones` → `tasks` z RLS (jedno konto = prywatny zestaw danych), kaskadowym usuwaniem i regułą bazodanową „data milestona nie wykracza poza termin projektu". Zmiana dostarcza też typy TypeScript i testy pgTAP. Nie ma w niej UI ani API — odblokowuje S-01, S-02 i S-03.

## Current State Analysis

- `supabase/` zawiera tylko `config.toml` (`project_id = "10x-astro-starter"`); katalogu `supabase/migrations/` nie ma, seed jest włączony w configu (`supabase/config.toml:60-65`), ale pliku `seed.sql` brak.
- Brak typów domenowych: nie ma `src/types.ts`, klient Supabase jest nietypowany (`src/lib/supabase.ts:9` — `createServerClient(SUPABASE_URL, SUPABASE_KEY, …)` bez generyka `Database`).
- Auth działa (baseline roadmapy); `auth.users` jest źródłem tożsamości. `PROTECTED_ROUTES` w `src/middleware.ts:4` zna tylko `/dashboard` — poza zakresem tej zmiany.
- Brak runnera testów (strategia testów to Moduł 3). CI (`.github/workflows/ci.yml`) uruchamia lint, `astro check`, build oraz job `smoke` ze `supabase start` — migracje z tej zmiany zaaplikują się tam automatycznie.
- Docker Desktop nie działał w momencie planowania — wymagany do `supabase start`, `db reset`, `test db` i `gen types --local`.
- `context/foundation/lessons.md` nie istnieje (zakłada go `/10x-lesson` przy pierwszym użyciu) — brak dodatkowych reguł projektu poza `CLAUDE.md`.

## Desired End State

Po `npx supabase db reset` w lokalnej bazie istnieją tabele `projects`, `milestones`, `tasks`:

- każdy rekord ma właściciela (`user_id`), a zalogowany użytkownik widzi i modyfikuje wyłącznie własne rekordy; rola `anon` nie ma dostępu;
- usunięcie projektu kasuje jego milestony i zadania, usunięcie milestona kasuje jego zadania;
- baza odrzuca milestone z datą późniejszą niż termin projektu oraz zmianę terminu projektu, która wypchnęłaby istniejący milestone poza niego;
- `src/types.ts` eksportuje typy `Project`, `Milestone`, `Task` (+ Insert/Update), `LifeArea`, `TaskStatus`, a klient Supabase jest sparametryzowany typem `Database`;
- `npx supabase test db`, `npm run lint`, `npx astro check` i `npm run build` przechodzą.

### Key Discoveries:

- PRD FR-002/FR-003/FR-004/FR-005 narzucają pola i reguły: termin projektu i data milestona są obowiązkowe, duplikaty dat milestonów dozwolone (kolejność remisu = kolejność utworzenia), milestone bez zadań jest poprawny, usuwanie kaskadowe.
- PRD Business Logic wymaga stanów, których PRD nie nazywa w danych: „zamknięty milestone" i „przeniesione na jutro" (FR-012) — rozstrzygnięte w tym planie (`milestones.completed_at`, `tasks.deferred_until`).
- Kontrole krzyżowe (data milestona ≤ termin projektu) nie dają się wyrazić `CHECK` — potrzebny trigger, i to po obu stronach (milestone i projekt), bo PRD FR-003 wprost wymienia „edycję terminu projektu rozjeżdżającą się z milestonami".
- `CLAUDE.md`: migracje w `supabase/migrations/` nazwane `YYYYMMDDHHmmss_short_description.sql`, RLS zawsze włączone z granularnymi politykami per operacja i per rola; współdzielone typy w `src/types.ts`.
- Kontrole FK w Postgresie omijają RLS, więc złożone klucze obce `(parent_id, user_id)` wymuszają, że dziecko ma tego samego właściciela co rodzic — próba podpięcia rekordu pod cudzy projekt kończy się błędem FK.

## What We're NOT Doing

- `supabase db push` na zdalny projekt — ręczny krok przed wdrożeniem S-01 (migracje wchodzą do produkcji osobno od deployu Cloudflare).
- Jakiekolwiek UI, trasy API, zmiany w `PROTECTED_ROUTES` i walidacja zod — to zakres S-01..S-03.
- Logika/zapytanie listy na dziś i reguła kwalifikacji (S-04) oraz zachowanie akcji zrobione/częściowo/na jutro (S-05) — F-01 dostarcza tylko kolumny `status`, `deferred_until`, `completed_at`.
- Seed z danymi demonstracyjnymi (`supabase/seed.sql` pozostaje nieistniejący).
- Walidacja deadline'u zadania względem daty milestona/terminu projektu — PRD jej nie wymaga (założenie planu: zadanie może mieć deadline dowolny).
- Osobna tabela obszarów życia, role, udostępnianie, zadania wolnostojące, powtarzalność, subtaski (Non-Goals PRD).
- Uruchamianie `supabase test db` w CI — bramki jakości to Moduł 3.
- Obsługa równoległych edycji tego samego projektu przez wielu klientów w triggerach dat (jedno konto, niski ruch — patrz Open Risks w briefie).

## Implementation Approach

Trzy fazy, każda kończy się stanem weryfikowalnym przez `db reset` + pgTAP: (1) schemat i integralność, (2) RLS jako osobna migracja, (3) typy i bramka jakości aplikacji. `user_id` jest zdenormalizowane na wszystkich trzech tabelach, żeby polityki RLS były proste i tanie (bez joinów), a spójność właściciela pilnują złożone FK. Statusy i obszar życia to `text` + `CHECK` (łatwiejsza ewolucja niż typ `enum` Postgresa). Testy pgTAP leżą w `supabase/tests/database/` i startują jako użytkownicy testowi wstawieni do `auth.users` z ustawianym kontekstem JWT.

## Phase 1: Schemat i integralność

### Overview

Tabele, klucze, ograniczenia, indeksy, kaskady, trigger `updated_at` i triggery walidujące daty — bez RLS (włącza go Faza 2).

### Changes Required:

#### 1. Migracja schematu

**File**: `supabase/migrations/20261009120000_create_core_domain_schema.sql`

**Intent**: Utworzyć `projects`, `milestones`, `tasks` z kaskadowym usuwaniem, ograniczeniami domenowymi i indeksami pod przyszłą listę na dziś.

**Contract**:
- `projects`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `name text not null` (CHECK: po `btrim` długość 1–200), `description text null`, `life_area text not null` (CHECK `in ('dom','sport','praca')`), `due_date date not null`, `created_at`/`updated_at timestamptz not null default now()`; `unique (id, user_id)`.
- `milestones`: te same kolumny tożsamości/czasu; `project_id uuid not null`, `name text not null` (CHECK jak wyżej), `due_date date not null`, `completed_at timestamptz null`, `seq bigint generated always as identity`; FK `(project_id, user_id) → projects(id, user_id) on delete cascade`; `unique (id, user_id)`; indeks `(project_id, due_date, seq)` (porządek: data, remis wg kolejności utworzenia). `seq` zamiast `created_at` rozstrzyga remis deterministycznie, bo `now()` daje ten sam czas dla wierszy z jednej transakcji.
- `tasks`: `milestone_id uuid not null`, `title text not null` (CHECK jak wyżej), `due_date date null`, `status text not null default 'todo'` (CHECK `in ('todo','partial','done')`), `deferred_until date null`; FK `(milestone_id, user_id) → milestones(id, user_id) on delete cascade`; indeks `(milestone_id)`. Indeks pod zapytanie listy na dziś (np. po `status`) dodaje S-04, gdy znany jest jego kształt.
- Wszystkie funkcje triggerów z `set search_path = ''` i w pełni kwalifikowanymi nazwami.

#### 2. Triggery

**File**: `supabase/migrations/20261009120000_create_core_domain_schema.sql`

**Intent**: Utrzymać `updated_at` oraz wymusić regułę dat z FR-003 w obu kierunkach.

**Contract**:
- `set_updated_at()` — `BEFORE UPDATE` na każdej z trzech tabel.
- `milestones`: `BEFORE INSERT OR UPDATE OF due_date, project_id` — odrzuca (`errcode 'check_violation'`) wiersz, gdy `new.due_date` > `projects.due_date` projektu.
- `projects`: `BEFORE UPDATE OF due_date` — odrzuca (`check_violation`), gdy istnieje milestone tego projektu z `due_date` > `new.due_date`. Równość daty jest dozwolona w obu kierunkach.
- Brak walidacji deadline'u zadania (patrz What We're NOT Doing).

#### 3. Testy schematu

**File**: `supabase/tests/database/core_domain_schema.test.sql`

**Intent**: Zabezpieczyć kształt schematu i reguły integralności przed regresją.

**Contract**: pgTAP (`begin; select plan(n); … select * from finish(); rollback;`) sprawdza: istnienie tabel/kolumn/CHECK-ów; kaskadę projekt → milestony → zadania i milestone → zadania; odrzucenie `life_area` spoza listy i `status` spoza listy; duplikat daty milestonów w jednym projekcie jest dozwolony, a milestony wstawione jednym zapytaniem z tą samą datą mają rosnące `seq` w kolejności wstawienia; trigger — milestone po terminie projektu odrzucony, milestone równy terminowi przyjęty, skrócenie terminu projektu poniżej istniejącego milestona odrzucone; złożony FK odrzuca milestone z `user_id` innym niż właściciel projektu. Jeśli rozszerzenie nie jest dostępne domyślnie, test zaczyna się od `create extension if not exists pgtap with schema extensions`.

### Success Criteria:

#### Automated Verification:

- Lokalny Supabase startuje: `npx supabase start`
- Migracja aplikuje się czysto od zera: `npx supabase db reset`
- Testy schematu przechodzą: `npx supabase test db`

#### Manual Verification:

- W Supabase Studio (`http://127.0.0.1:54323`) widać tabele `projects`, `milestones`, `tasks` z oczekiwanymi kolumnami, kluczami obcymi (kaskady) i triggerami

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Row Level Security

### Overview

Włączenie RLS na wszystkich trzech tabelach z politykami per operacja dla roli `authenticated` oraz odcięcie roli `anon`.

### Changes Required:

#### 1. Migracja RLS

**File**: `supabase/migrations/20261009120100_enable_core_domain_rls.sql`

**Intent**: Zagwarantować, że konto widzi i zmienia wyłącznie własne rekordy, a niezalogowany nie ma dostępu do niczego.

**Contract**:
- `alter table … enable row level security` dla `projects`, `milestones`, `tasks`.
- Dla każdej tabeli cztery osobne polityki `to authenticated`: `select` (`using user_id = (select auth.uid())`), `insert` (`with check` tego samego warunku), `update` (`using` i `with check` tego samego warunku — blokuje zmianę właściciela), `delete` (`using`). Nazwy polityk czytelne i jednoznaczne per tabela/operacja.
- `revoke all on projects, milestones, tasks from anon` — rola `anon` nie ma nawet uprawnień tabelarycznych.
- `grant select, insert, update, delete on projects, milestones, tasks to authenticated` — jawnie, bez polegania na domyślnych uprawnieniach Supabase (mogą się różnić między wersjami); polityki RLS zawężają dostęp do własnych wierszy.
- Wywołanie `auth.uid()` opakowane w `(select …)` dla wydajności (initPlan), zgodnie z zaleceniami Supabase.

#### 2. Testy RLS

**File**: `supabase/tests/database/core_domain_rls.test.sql`

**Intent**: Udowodnić izolację danych między kontami i zamknięcie dla `anon`.

**Contract**: pgTAP z dwoma użytkownikami testowymi (wiersze w `auth.users`; przełączanie `set local role authenticated` + `request.jwt.claim.sub`): RLS włączone na trzech tabelach (`pg_class.relrowsecurity`); użytkownik A nie widzi, nie edytuje i nie usuwa rekordów B (`select` → 0 wierszy, `update`/`delete` → 0 dotkniętych); A nie wstawi wiersza z `user_id` B; A nie przepnie własnego wiersza na `user_id` B; A nie podepnie milestona pod projekt B (błąd FK); rola `anon` dostaje `permission denied` (`42501`).

### Success Criteria:

#### Automated Verification:

- Obie migracje aplikują się czysto od zera: `npx supabase db reset`
- Wszystkie testy (schemat + RLS) przechodzą: `npx supabase test db`
- Zapytanie REST z kluczem `anon` do `/rest/v1/projects` jest odrzucone (`permission denied`): `curl` z `ANON_KEY` z `npx supabase status -o env` na `API_URL`

#### Manual Verification:

- W Studio (Authentication → Policies) każda z trzech tabel ma włączone RLS i cztery polityki (SELECT/INSERT/UPDATE/DELETE) dla roli `authenticated`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Typy i bramka jakości

### Overview

Typy TypeScript generowane ze schematu, aliasy i DTO w `src/types.ts`, sparametryzowanie klienta Supabase oraz pełna bramka lint/typy/build/smoke.

Warunek wstępny dla build i smoke: w repo nie ma `.env` ani `.dev.vars`. Przed kryteriami 3.4/3.5 skopiuj `API_URL` i `ANON_KEY` z `npx supabase status -o env` jako `SUPABASE_URL`/`SUPABASE_KEY` do `.dev.vars` i `.env` (oba gitignored), a smoke uruchom przy działającym `npm run preview` (`BASE_URL=http://localhost:4321`).

### Changes Required:

#### 1. Typy generowane

**File**: `src/db/database.types.ts`

**Intent**: Mieć typy zawsze zgodne z migracjami, bez ręcznego dryfu.

**Contract**: wynik `npx supabase gen types typescript --local` (typ `Database`, schemat `public`). Plik generowany — nie edytować ręcznie; jeśli ESLint/Prettier go odrzucają, dodać go do ignorowanych w istniejącej konfiguracji zamiast formatować.

#### 2. Aliasy i DTO

**File**: `src/types.ts`

**Intent**: Dać kolejnym slice'om (S-01..S-06) stabilne nazwy typów zgodnie z konwencją `CLAUDE.md`.

**Contract**: eksporty `Project`, `Milestone`, `Task` (`Tables<…>`), odpowiadające `ProjectInsert`/`ProjectUpdate` itd. (`TablesInsert`/`TablesUpdate`), oraz zawężone typy dziedzinowe `LifeArea` (`'dom' | 'sport' | 'praca'`) i `TaskStatus` (`'todo' | 'partial' | 'done'`) wraz ze stałymi tablicami wartości do użycia w walidacji zod. Typy `Project.life_area` i `Task.status` zawężone do tych unii.

#### 3. Typowany klient

**File**: `src/lib/supabase.ts`

**Intent**: Zapytania do nowych tabel mają być sprawdzane przez kompilator.

**Contract**: `createServerClient<Database>(…)`; sygnatura `createClient(requestHeaders, cookies)` bez zmian, aby middleware i trasy auth działały bez modyfikacji.

### Success Criteria:

#### Automated Verification:

- Typy wygenerowane i zawierają trzy tabele: `npx supabase gen types typescript --local` zapisane do `src/db/database.types.ts`; plik zawiera `projects`, `milestones`, `tasks`
- Linting przechodzi: `npm run lint`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke auth przechodzi na uruchomionym serwerze (`npm run preview`): `npm run smoke`

#### Manual Verification:

- `src/types.ts` eksportuje `Project`, `Milestone`, `Task`, warianty Insert/Update, `LifeArea` i `TaskStatus` — nazwy zgodne z tym, czego potrzebują S-01..S-06 w roadmapie

**Deviation note (3.2)**: `npm run lint` w dosłownym brzmieniu nie przechodzi z przyczyn sprzed tej zmiany: ~1170 błędów CRLF (`core.autocrlf=true` na Windowsie, prettier oczekuje LF) oraz 6 plików spoza `src/` (`.claude/skills/*/scripts/*.mjs`, `context/foundation/design-system/reference/legacy/tailwind.preset.v3.js`). Kryterium zaliczone po lincie plików tej zmiany (`src/types.ts`, `src/lib/supabase.ts`, `eslint.config.js`) z `endOfLine: auto` — 0 błędów; `src/db/database.types.ts` jest celowo ignorowany. Naprawa lintu repozytorium to osobna zmiana.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak testów jednostkowych aplikacji (brak runnera, Moduł 3). Logika jest w bazie i jest pokryta pgTAP.

### Integration Tests:

- `supabase/tests/database/core_domain_schema.test.sql` — struktura, CHECK-i, kaskady, trigger dat (oba kierunki, równość dozwolona), złożone FK.
- `supabase/tests/database/core_domain_rls.test.sql` — izolacja dwóch użytkowników, zablokowane podszywanie się pod `user_id`, `anon` odcięty.
- `npm run smoke` — regresja przepływu auth po sparametryzowaniu klienta typem `Database`.

### Manual Testing Steps:

1. `npx supabase db reset`, następnie w Studio sprawdź tabele, FK, triggery i polityki.
2. W Studio SQL editor (działa jako `postgres`, bez JWT, więc `auth.uid()` jest NULL i RLS jest omijane) wstaw projekt z jawnym `user_id` istniejącego konta z `auth.users` (np. z rejestracji w UI), terminem 2026-12-31, a następnie milestone z datą 2027-01-01 — spodziewany błąd `check_violation`. Izolację RLS sprawdza wyłącznie pgTAP, nie Studio.
3. Usuń projekt z milestonami i zadaniami — wszystkie dzieci znikają.

## Performance Considerations

Indeksy `(project_id, due_date, seq)` na milestonach i `(milestone_id)` na zadaniach obsługują przyszłe zapytanie listy na dziś (NFR: poniżej 1 s) przy małej skali (target_scale: small); ewentualny indeks po stanie zadania dodaje S-04. Polityki używają `(select auth.uid())`, więc planista liczy tożsamość raz na zapytanie.

## Migration Notes

Brak istniejących danych ani migracji — to pierwsza migracja projektu. Wypchnięcie na zdalny projekt Supabase (`npx supabase link` + `npx supabase db push`) jest ręcznym krokiem poza tym planem i musi nastąpić przed wdrożeniem pierwszego slice'a korzystającego z tabel (S-01). Wycofanie: nowa migracja naprawcza (`drop table … cascade`) — nie edytować zastosowanych migracji.

## References

- Roadmapa: `context/foundation/roadmap.md` (F-01, `core-domain-schema`)
- PRD: `context/foundation/prd.md` (FR-002..FR-007, Business Logic, Access Control)
- Konwencje: `CLAUDE.md` (migracje, RLS, `src/types.ts`)
- Klient Supabase: `src/lib/supabase.ts:9`
- Konfiguracja lokalnego Supabase: `supabase/config.toml:53-65`
- CI smoke ze `supabase start`: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schemat i integralność

#### Automated

- [x] 1.1 Lokalny Supabase startuje: `npx supabase start` — 8d63196
- [x] 1.2 Migracja aplikuje się czysto od zera: `npx supabase db reset` — 8d63196
- [x] 1.3 Testy schematu przechodzą: `npx supabase test db` — 8d63196

#### Manual

- [x] 1.4 W Supabase Studio widać tabele `projects`, `milestones`, `tasks` z oczekiwanymi kolumnami, kluczami obcymi (kaskady) i triggerami — 8d63196

### Phase 2: Row Level Security

#### Automated

- [x] 2.1 Obie migracje aplikują się czysto od zera: `npx supabase db reset` — f5df142
- [x] 2.2 Wszystkie testy (schemat + RLS) przechodzą: `npx supabase test db` — f5df142
- [x] 2.3 Zapytanie REST z kluczem `anon` do `/rest/v1/projects` jest odrzucone (`permission denied`) — f5df142

#### Manual

- [x] 2.4 W Studio każda z trzech tabel ma włączone RLS i cztery polityki (SELECT/INSERT/UPDATE/DELETE) dla roli `authenticated` — f5df142

### Phase 3: Typy i bramka jakości

#### Automated

- [x] 3.1 Typy wygenerowane do `src/db/database.types.ts` i zawierają trzy tabele
- [x] 3.2 Linting przechodzi: `npm run lint`
- [x] 3.3 Sprawdzanie typów przechodzi: `npx astro check`
- [x] 3.4 Build przechodzi: `npm run build`
- [x] 3.5 Smoke auth przechodzi na uruchomionym serwerze: `npm run smoke`

#### Manual

- [x] 3.6 `src/types.ts` eksportuje `Project`, `Milestone`, `Task`, warianty Insert/Update, `LifeArea` i `TaskStatus` zgodne z potrzebami S-01..S-06
