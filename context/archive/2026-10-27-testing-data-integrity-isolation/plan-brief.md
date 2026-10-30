# Spójność danych i izolacja kont — Plan Brief

> Full plan: `context/changes/testing-data-integrity-isolation/plan.md`
> Research: `context/changes/testing-data-integrity-isolation/research.md`

## What & Why

Dowodzimy ryzyk #6 i #7 z test-planu testami pgTAP na prawdziwej bazie: po edycji lub usunięciu milestona/projektu lista na dziś pokazuje właściwy najbliższy niezamknięty milestone, a konto B nie czyta ani nie zmienia danych konta A (i odwrotnie). Bez tego regresja w regule milestona albo w politykach RLS przeszłaby niezauważona, bo dziś reguła jest testowana statycznie, a izolacja tylko w jednym kierunku.

## Starting Point

Reguła „najbliższy niezamknięty milestone" i kaskady żyją w SQL (`today_list`, klucze obce `on delete cascade`), a izolację wymuszają RLS i złożone klucze obce. Istnieje 13 plików pgTAP: test RLS sprawdza tylko A→B na trzech tabelach, a żaden test nie zmienia ani nie usuwa milestona i nie czyta potem listy.

## Desired End State

Dwa nowe pliki w `supabase/tests/database/` przechodzą w `npm run test:db`, a każda ich asercja przeszła break-check. Cookbook `test-plan.md` §6.5 opisuje wzorzec, więc kolejny test spójności lub własności powstaje bez ponownego researchu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Warstwa testów | pgTAP na prawdziwej bazie, bez `vitest` i bez HTTP | Stub klienta nie ma RLS ani kaskad, a test HTTP na dwóch kontach to infrastruktura Fazy 4 | Research |
| Lokalizacja reguły #6 | SQL (`today_list`, FK), nie serwisy | Serwisy tylko mapują komunikaty, więc hot-spot `src/lib/services` jest dla #6 mylący | Research |
| Układ plików | Dwa nowe pliki, istniejący test RLS bez zmian | Dopisywanie asercji wymusza zmianę `plan(61)` stabilnego testu | Research |
| Wyrocznia | Ręcznie z PRD i decyzji, nigdy z kodu funkcji | Test liczony tą samą logiką przechodzi mimo błędu (implementacja lustrzana) | Research |
| Izolacja | Ten sam zestaw prób A→B i B→A, stan ofiary sprawdzany jako `postgres` | RLS milczy przy `update`/`delete` cudzego rekordu, więc brak błędu niczego nie dowodzi | Research |
| Wariant `23505` (wyciek istnienia wiersza) | Przypięty w teście z kodem zaobserwowanym, zapisany jako znane ryzyko, bez migracji | Faza jest tylko testowa, a wyciek wymaga znajomości UUID zadania | Plan |
| Podział na fazy | 3 fazy: #6, #7, cookbook | Jedna faza na ryzyko, każda jako osobny commit do przeglądu | Plan |

## Scope

**In scope:** nowy plik pgTAP dla #6, nowy plik pgTAP dla #7, break-check każdej asercji, wypełnienie §6.5, notatka w §6.7, wpisy w §7 i status fazy w §3.

**Out of scope:** `vitest` i HTTP/e2e, zmiany schematu i kodu aplikacji, współbieżność (deadlock `40P01`), dziedziczenie terminu milestona w kolejności listy, sprawdzenie typu produkcyjnego klucza `SUPABASE_KEY`.

## Architecture / Approach

Każdy test to sekwencja w jednej transakcji: dane jako `postgres`, potem `set local role authenticated` z JWT danego konta, mutacja lub atak i odczyt `today_list('2026-10-15')` albo stanu ofiary po `reset role`. Dla #6 oczekiwane wiersze są wpisane ręcznie; dla #7 jeden zestaw prób wykonuje się dla obu kierunków przez pętlę lub funkcję pomocniczą, bez kopiowania asercji.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. pgTAP #6 | Plik `core_domain_milestone_list_integrity.test.sql`: edycja, zamknięcie, ponowne otwarcie i usunięcie milestona/projektu z odczytem listy, plus kaskady do odhaczeń | Oczekiwania przypadkiem skopiowane z zachowania funkcji zamiast z PRD |
| 2. pgTAP #7 | Plik `core_domain_account_isolation.test.sql`: izolacja dwukierunkowa na 4 tabelach i na liście, wariant `23505` | Wynik `23505` okaże się wyciekiem i trzeba go świadomie przypiąć, nie naprawić |
| 3. Cookbook | §6.5, notatka §6.7, wpisy §7, status w §3 | `prettier --check` na `test-plan.md` mógł nie przechodzić już przed zmianą (Faza 1 tak zanotowała) |

**Prerequisites:** lokalny Supabase (`npx supabase start`) i Docker; zielony `npm run test:db` przed startem.
**Estimated effort:** ~3 sesje, po jednej na fazę (głównie break-check wariantów w kontenerze).

## Open Risks & Assumptions

- Wariant `23505` jest hipotezą z research, nieuruchamianą; plan zakłada zapisanie kodu zaobserwowanego, nie spodziewanego.
- Czy produkcyjny `SUPABASE_KEY` to klucz anon, nie da się ustalić z repo; jeśli to service role, #7 jest nieosłonięte niezależnie od RLS (poza zakresem testów).
- Plan nie testuje przenoszenia zadań między milestonami, bo API tego nie udostępnia (schemat wejścia nie ma `milestone_id`).

## Success Criteria (Summary)

- `npm run test:db` zielone z dwoma nowymi plikami, a każda nowa asercja ma zaliczony break-check (czerwone po zepsuciu, zielone po przywróceniu).
- Po edycji, zamknięciu, ponownym otwarciu i usunięciu milestona lub projektu lista zgadza się z ręcznie wpisaną wyrocznią z PRD.
- Konto B nie czyta ani nie zmienia niczego z konta A (i odwrotnie), a dzieci ofiary pozostają nietknięte.
