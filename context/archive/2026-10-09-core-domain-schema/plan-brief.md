# Domenowy schemat danych (projects / milestones / tasks) — Plan Brief

> Full plan: `context/changes/core-domain-schema/plan.md`

## What & Why

Budujemy fundament danych SukcesPlaner: tabele `projects` → `milestones` → `tasks` w Supabase z RLS, kaskadami i regułą dat po stronie bazy. Każdy kolejny slice roadmapy (CRUD, lista na dziś) czyta i zapisuje te tabele, więc błąd w schemacie propaguje się wszędzie — dlatego F-01 idzie pierwsze i ma własne testy.

## Starting Point

Działa auth (Supabase + middleware), ale `supabase/migrations/` nie istnieje, nie ma `src/types.ts`, a klient Supabase jest nietypowany. Nie ma runnera testów; Docker nie był uruchomiony podczas planowania.

## Desired End State

Po `npx supabase db reset` baza ma trzy tabele izolowane per konto: usuwanie kaskaduje w dół, a baza odrzuca milestone po terminie projektu (i skrócenie terminu poniżej istniejącego milestona). Aplikacja ma typy `Project`/`Milestone`/`Task` i typowany klient; `supabase test db`, lint, `astro check` i build przechodzą.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Przeniesienie na jutro (FR-012) | `tasks.deferred_until date null` | Zachowuje własny deadline zadania i nie wymaga migracji w S-05. | Plan |
| Zamknięcie milestona | `milestones.completed_at timestamptz null` | Działa też dla milestona bez zadań i daje datę pod FR-015. | Plan |
| Obszar życia | `text` + CHECK `dom`/`sport`/`praca` | Spójne wartości pod filtr FR-013 i kolory FR-014. | Plan |
| Typy TS | `supabase gen types` → `src/db/database.types.ts` + aliasy w `src/types.ts` | Typy nie dryfują względem migracji. | Plan |
| Weryfikacja | pgTAP w `supabase/tests/database/` (`supabase test db`) | Powtarzalna bramka dla RLS/kaskad/triggerów, gotowa pod CI w Module 3. | Plan |
| Własność rekordów | `user_id` na każdej tabeli + złożone FK `(parent_id, user_id)` | Proste polityki RLS bez joinów i wymuszona spójność właściciela. | Plan |
| Reguła dat (FR-003) | Triggery na `milestones` i `projects` | `CHECK` nie obejmuje tabel; edycja terminu projektu też musi być pilnowana. | Plan |
| Statusy | `text` + CHECK (`todo`/`partial`/`done`) | Łatwiejsza ewolucja niż `enum` Postgresa. | Plan |
| Kolejność milestonów przy remisie dat | `milestones.seq` (identity) w indeksie `(project_id, due_date, seq)` | `now()` jest stały w transakcji, więc `created_at` nie rozstrzyga remisu (FR-004). | Plan review |
| Uprawnienia | Jawny `GRANT … TO authenticated`, `REVOKE … FROM anon` | Polityki RLS nie mogą zależeć od domyślnych uprawnień Supabase. | Plan review |

## Scope

**In scope:**
- Migracja schematu (tabele, CHECK-i, indeksy, kaskady, triggery)
- Migracja RLS (polityki per operacja dla `authenticated`, `anon` odcięty)
- Testy pgTAP: schemat i izolacja RLS
- `src/db/database.types.ts`, `src/types.ts`, typowany klient Supabase

**Out of scope:**
- `db push` na zdalny projekt (ręcznie przed S-01)
- UI, API, zod, `PROTECTED_ROUTES`
- Lista na dziś i akcje na zadaniach (S-04/S-05)
- Seed demo, walidacja deadline'u zadania, `test db` w CI

## Architecture / Approach

Dwie migracje (`…_create_core_domain_schema.sql`, `…_enable_core_domain_rls.sql`) w `supabase/migrations/` i dwa pliki testów pgTAP. Hierarchia `projects ← milestones ← tasks` ma kaskady `ON DELETE CASCADE`, a każda tabela niesie `user_id` (default `auth.uid()`) spięte złożonymi FK z rodzicem. Triggery `BEFORE` pilnują reguły dat w obu kierunkach. Na końcu typy generowane ze schematu zasilają `src/types.ts` i klienta `createServerClient<Database>`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schemat i integralność | 3 tabele, CHECK-i, kaskady, indeksy, triggery dat + testy pgTAP | Błędna reguła dat lub kaskady propaguje się na cały roadmap |
| 2. Row Level Security | Polityki per operacja, `anon` odcięty + testy izolacji | Luka w RLS (np. zmiana `user_id` przy UPDATE) ujawnia cudze dane |
| 3. Typy i bramka jakości | `database.types.ts`, `src/types.ts`, typowany klient, lint/check/build/smoke | Typowanie klienta może wywołać błędy w istniejącym kodzie auth |

**Prerequisites:** działający Docker Desktop (`npx supabase start`), Node 22 i zależności zainstalowane.
**Estimated effort:** ~2–3 sesje po-godzinowe w 3 fazach (głównie SQL i testy pgTAP).

## Open Risks & Assumptions

- Docker nie działał podczas planowania — bez niego żadna faza nie da się zweryfikować lokalnie.
- Założenie: deadline zadania nie jest ograniczony terminem milestona/projektu (PRD milczy); jeśli to się zmieni, wymaga osobnej migracji.
- Triggery dat nie blokują wierszy rodzica — przy równoległej edycji tego samego projektu z dwóch klientów reguła może zostać obejście (akceptowane: jedno konto, niski ruch).
- Build i smoke (Faza 3) wymagają `.env`/`.dev.vars` z kluczami lokalnego Supabase — w repo ich nie ma.
- Migracja trafi do CI (`smoke` robi `supabase start`) — błąd w SQL wywali CI; na produkcję wymaga ręcznego `db push` przed S-01.
- `deferred_until` i `completed_at` są nieużywane do czasu S-04/S-05; ich semantyka (np. czy przeniesione zadanie wraca na listę dokładnie w dniu `deferred_until`) zostanie sfinalizowana tam.

## Success Criteria (Summary)

- Konto A nigdy nie widzi ani nie modyfikuje danych konta B, a `anon` nie ma dostępu do tabel.
- Usunięcie projektu/milestona kasuje wszystkie zależne rekordy, a data milestona nigdy nie przekracza terminu projektu.
- Typy `Project`/`Milestone`/`Task` są gotowe dla S-01..S-06, a lint, `astro check`, build i smoke przechodzą.
