# Testy poprawności listy na dziś — Plan Brief

> Full plan: `context/changes/testing-today-list-correctness/plan.md`
> Research: `context/changes/testing-today-list-correctness/research.md`

## What & Why

Dowodzimy testami, że lista „na dziś” jest kompletna, uporządkowana i stabilna na granicach dat (ryzyka #1–#3 z `test-plan.md`), bez zmiany kodu produkcyjnego. Przy okazji dodajemy runner testów aplikacji i podpinamy testy bazy (pgTAP) do CI, bo bramki w test-planie §5 czekają na tę fazę.

## Starting Point

Reguła listy to jedna funkcja SQL `today_list(p_today)`; ma test pgTAP, ale tylko dla jednej stałej daty. „Dziś” liczy aplikacja (`todayInWarsaw`, strefa Europe/Warsaw) i nie ma żadnego testu. Nie ma runnera dla kodu `src/` (alias `@/` psuje `node --test`), a pgTAP nie działa w CI.

## Desired End State

`npm run test:app` i `npm run test:db` przechodzą lokalnie i w CI. Testy dowodzą, że żadne niedokończone zadanie nie znika przy zmianie dnia (także po dacie milestona), kolejność wg FR-010 jest stała, a wynik nie zależy od strefy bazy ani od zegara systemowego. Cookbook w `test-plan.md` mówi, jak dodać kolejny test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Oracle kolejności (#2) | FR-010 dosłownie; US-01 „własny lub milestona” opisane jako luka | Zgodne z kodem i z jawną decyzją w migracji; zmiana wymagałaby osobnej zmiany produktowej | Plan |
| Guardrail 2 | Testy pinują obecny chip, luka udokumentowana, bez zmiany kodu | Faza pozostaje czysto testowa; progi chipa to decyzja implementacyjna, nie PRD | Plan |
| Runner aplikacji | vitest z aliasem `@/` | Rozwiązuje alias i da mocki w Fazie 2 test-planu; zgodność z Vite 8 do sprawdzenia w 1. kroku | Plan |
| pgTAP w CI | Krok w jobie `smoke` | Baza już tam działa, bez drugiego startu Supabase | Plan |
| Zakres dat | SQL sweep, daty w vitest, chipy w vitest | Każde ryzyko dostaje najtańszą warstwę z realnym sygnałem | Plan |
| Granice rytmów w SQL | Nie duplikujemy | Już pokryte w `core_domain_recurring_tasks.test.sql` | Research |
| Źródło „dziś” | Data jako parametr, bez mockowania zegara | `today_list` jest `strict` i przyjmuje `p_today` | Research |

## Scope

**In scope:** vitest + `test:app`; testy `todayInWarsaw`/`tomorrowInWarsaw`/`daysFromToday`/`dueChip`; nowy plik pgTAP z sweepem dat; `test:db`; krok CI; cookbook w `test-plan.md` i polecenia w `CLAUDE.md`.

**Out of scope:** zmiany kodu produkcyjnego (sortowanie wg US-01, sygnał milestona na wierszu zadania), ryzyka #4–#7, e2e, hooki, mutation testing, test runtime Cloudflare Workers, `getToday` ze stubem.

## Architecture / Approach

Kwalifikacja i kolejność są w SQL, więc pgTAP na prawdziwej bazie (mock skłamałby o ograniczeniach). Konwersja instantu na dzień Warsaw i etykiety terminów to czyste funkcje, więc vitest bez bazy. Oczekiwane wartości są wpisane ręcznie z reguł PRD i kalendarza strefy, nie liczone tą samą logiką; każda warstwa dostaje test zepsucia.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Runner aplikacji | vitest, `test:app`, krok w `ci`, test startowy północy | Zgodność wersji vitest z Vite 8.3.0 |
| 2. Testy dat i chipów | Granice północy, zmiany czasu, `dueChip` | Progi chipa są decyzją implementacyjną, nie PRD |
| 3. pgTAP i CI | Sweep dat, test strefy, `test:db`, krok w `smoke` | Istniejący zestaw pgTAP może być czerwony (zgłaszamy, nie poprawiamy po cichu) |
| 4. Cookbook | §4–§7 test-planu, polecenia w `CLAUDE.md` | Opis luki US-01 nie może obiecywać nieistniejącego testu |

**Prerequisites:** Docker lokalnie (Supabase), Node 22, dostęp do rejestru npm.
**Estimated effort:** ok. 3 sesje w 4 fazach.

## Open Risks & Assumptions

- Zgodność vitest z Vite 8.3.0 niesprawdzona (brak dostępu do dokumentacji w sesji planowania).
- `Intl` ze strefą Europe/Warsaw na Cloudflare Workers niesprawdzone; testy pokrywają tylko Node.
- Lokalny `supabase test db` nie był uruchamiany; baza odniesienia (krok 3.1) jest jej pierwszym sprawdzeniem.
- Sprzeczność FR-010/US-01 pozostaje otwartą decyzją produktową poza tą fazą.

## Success Criteria (Summary)

- `npm run test:app`, `npm run test:db`, lint i `astro check` zielone; CI zielone z nowymi krokami.
- Test zepsucia w każdej warstwie robi odpowiedni test czerwonym.
- Cookbook pozwala dodać kolejny test bez zgadywania.
