# Testy poprawności listy na dziś (test-plan, Faza 1) Implementation Plan

## Overview

Dowodzimy testami, że lista na dziś jest kompletna (ryzyko #1), uporządkowana wg FR-010 (#2) i stabilna na granicach dat (#3), bez zmiany kodu produkcyjnego. W tym celu dodajemy runner testów aplikacji (vitest), rozszerzamy testy pgTAP o przejście przez kolejne dni i podpinamy `supabase test db` do CI. To spełnia bramki „required after §3 Phase 1” z `context/foundation/test-plan.md` §5.

## Current State Analysis

- Reguła listy to jedna funkcja SQL `today_list(p_today date)` (aktualna wersja: `supabase/migrations/20261021120000_recurring_occurrence_actions.sql:182`). Aplikacja tylko ją wywołuje i grupuje wiersze wg `kind` (`src/lib/services/today.ts`).
- Istniejący test `supabase/tests/database/core_domain_today_list.test.sql` pokrywa kwalifikację i kolejność, ale tylko dla jednej stałej daty `2026-10-15`; nie sprawdza przejścia dnia ani niezależności od strefy sesji bazy.
- „Dziś” liczy aplikacja: `todayInWarsaw(now = new Date())` (`src/lib/today.ts:11`), przekazywane jako `p_today`. Funkcje `todayInWarsaw`, `tomorrowInWarsaw`, `daysFromToday`, `dueChip` nie mają żadnych testów.
- Test runner aplikacji nie istnieje: `npm run test:unit` to `node --test` na trzech plikach `scripts/*.test.mjs`; `src/lib/today.ts` importuje `@/lib/format` (alias), którego `node --test` nie rozwiązuje. W repo jest Vite 8.3.0 (zainstalowany).
- Testy pgTAP (10 plików) nie są w CI. Job `smoke` w `.github/workflows/ci.yml` już startuje lokalny Supabase; `supabase` CLI jest też devDependency (`^2.23.4`).
- Guardrail 2 jest zaimplementowany tylko jako chip terminu zadania i wiersz „milestone do zamknięcia” (`dueChip`, `today.astro:43-44`).

## Desired End State

- `npm run test:app` uruchamia testy vitest (alias `@/` działa), w jobie `ci`.
- Nowy plik pgTAP dowodzi na jednym zestawie danych: żadne niedokończone zadanie nie znika przy zmianie dnia (także w dniu i po dacie milestona), zadanie przeniesione wraca w dniu `deferred_until`, kolejność wg FR-010 jest ta sama w każdym dniu, a wynik nie zależy od strefy sesji bazy ani od `now()`/`current_date`.
- `npm run test:db` (`supabase test db`) przechodzi lokalnie na wszystkich plikach pgTAP i jest krokiem w jobie `smoke`.
- `test-plan.md` ma uzupełnione §4, §5, §6.1–6.3, §7; `CLAUDE.md` zna dwa nowe polecenia.

Weryfikacja: `npm run test:app`, `npm run test:db`, `npm run lint`, `npx astro check`, zielony CI na PR.

### Key Discoveries:

- Funkcja jest `strict` i przyjmuje datę jako parametr, więc przejście dnia testuje się zmianą `p_today`, bez mockowania zegara (`20261016120000_today_list.sql`, komentarz nagłówkowy).
- Sortowanie `task_due_date asc nulls last` odpowiada FR-010 dosłownie; PRD US-01 mówi „własny lub milestona”, więc oracle jest tu rozstrzygnięty decyzją, nie kodem (patrz Implementation Approach).
- Pokrycie granic rytmów po stronie SQL już istnieje (`core_domain_recurring_tasks.test.sql:113,118,268`), więc go nie duplikujemy.
- Job `smoke` ma już działającą bazę (`ci.yml`, krok „Start local Supabase”).

## What We're NOT Doing

- Zmiany kodu produkcyjnego: bez dziedziczenia terminu milestona w sortowaniu (US-01) i bez nowego sygnału wczesnego ostrzeżenia na wierszu zadania (guardrail 2). To osobne decyzje produktowe.
- Testów ryzyk #4–#7 (akcje, rytmy po zmianie, kaskady milestona, RLS) — Fazy 2–3 test-planu.
- Testów e2e, hooków, mutation testingu i testu runtime Cloudflare Workers (workerd) — poza fazą.
- Duplikowania testów granic rytmów (ostatni dzień, start, zamknięcie) już obecnych w pgTAP.
- Testu `getToday` ze stubem klienta: grupowanie wg `kind` jest trywialne, sygnał leży w SQL.
- Migracji istniejących testów `scripts/*.test.mjs` na vitest (`test:unit` zostaje bez zmian).

## Implementation Approach

Najtańsza warstwa z realnym sygnałem dla każdego ryzyka: kwalifikacja i kolejność to SQL, więc pgTAP na prawdziwej bazie (mock bazy skłamałby o ograniczeniach); konwersja instantu na dzień Warsaw i etykiety terminów to czyste funkcje, więc vitest bez bazy. Data jest zawsze parametrem.

Oracle pochodzi z PRD i reguł domeny, nie z odczytu implementacji: oczekiwane wartości (listy tytułów, dni) są wpisane ręcznie z reguł FR-009/FR-010 i kalendarza strefy Europe/Warsaw (CEST = UTC+2, CET = UTC+1; zmiany czasu w ostatnią niedzielę marca i października), nie liczone tą samą logiką. Rozstrzygnięcia z wywiadu: kolejność wg FR-010 dosłownie (US-01 „własny lub milestona” zostaje opisane jako luka, bez testu wymagającego zmiany kodu); guardrail 2 — testy pinują obecny chip jako kontrakt bieżący (progi to decyzja implementacyjna, nie PRD) i dokumentują brak sygnału na wierszu zadania; runner — vitest; pgTAP — krok w jobie `smoke`; zakres dat — trzy warstwy (sweep w SQL, daty w vitest, chipy w vitest).

Każdy test jest sprawdzany testem zepsucia (nie tylko zielony), a asercje celują w jedną właściwość i używają parametryzacji zamiast kopii.

## Faza 1: Runner aplikacji (vitest)

### Overview

Dodać vitest z aliasem `@/`, skrypt `test:app`, krok w jobie `ci` i test startowy na granicy północy, aby potwierdzić, że runner widzi kod `src/`.

### Changes Required:

#### 1. Zależność i konfiguracja

**File**: `package.json`, `vitest.config.ts` (nowy)

**Intent**: Dodać vitest jako devDependency w wersji zgodnej z zainstalowanym Vite 8.3.0 (sprawdzić `peerDependencies` wybranej wersji w rejestrze przed instalacją; w sesji planowania brak dostępu do dokumentacji, więc to pierwszy krok implementacji) i skonfigurować alias `@` → `src`.

**Contract**: Skrypt `"test:app": "vitest run"`. `vitest.config.ts` z `resolve.alias` odpowiadającym `tsconfig.json` (`@/*` → `./src/*`) i `test.include` ograniczonym do `src/**/*.test.ts`, żeby nie zbierać `scripts/*.test.mjs` (te zostają w `test:unit`). Środowisko `node` (testy to czyste funkcje).

#### 2. Test startowy

**File**: `src/lib/today.test.ts` (nowy)

**Intent**: Jeden sparametryzowany test `todayInWarsaw` na granicy północy w czasie letnim: instant `2026-10-14T21:59:59Z` daje `2026-10-14`, a `2026-10-14T22:00:00Z` daje `2026-10-15` (Warsaw = UTC+2 do 25 października 2026).

**Contract**: `describe`/`it.each` z tabelą `[instant, oczekiwany dzień]`; oczekiwane wartości wpisane ręcznie, bez ponownego liczenia `Intl`.

#### 3. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Dodać krok `npm run test:app` w jobie `ci`, zaraz po `npm run test:unit`.

**Contract**: Krok bez sekretów i bez bazy.

### Success Criteria:

#### Automated Verification:

- Testy aplikacji przechodzą: `npm run test:app`
- Istniejące testy jednostkowe nadal przechodzą: `npm run test:unit`
- Lint i typecheck przechodzą: `npm run lint` oraz `npx astro check`
- Job `ci` zawiera krok `npm run test:app`: `grep -n "test:app" .github/workflows/ci.yml`

#### Manual Verification:

- Test zepsucia: zmiana oczekiwanego dnia w teście startowym (np. `2026-10-15` na `2026-10-14` dla instantu `22:00:00Z`) robi `npm run test:app` czerwonym; po cofnięciu znów zielony.

**Implementation Note**: Po zielonych kryteriach automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Testy dat i chipów w aplikacji

### Overview

Rozszerzyć testy o źródło „dziś” na granicach (#3) i o etykiety terminów pinujące obecny guardrail 2.

### Changes Required:

#### 1. Granice dat (`todayInWarsaw`, `tomorrowInWarsaw`, `daysFromToday`)

**File**: `src/lib/today.test.ts`

**Intent**: Pokryć przełom północy w czasie letnim i zimowym, obie zmiany czasu i przełom roku, a dla „jutro” także koniec miesiąca, roku i dzień przestępny. Oczekiwane dni wyprowadzić z reguł strefy (poniżej), nie z uruchomienia kodu.

**Contract**: Parametryzowane tabele przypadków (`it.each`):

- Zmiana jesienna (25 października 2026, koniec CEST o 01:00 UTC): `2026-10-24T22:00:00Z` → dzień `2026-10-25`; `2026-10-25T22:59:59Z` → `2026-10-25`; `2026-10-25T23:00:00Z` → `2026-10-26` (doba 25 h).
- Zmiana wiosenna (29 marca 2026, początek CEST o 01:00 UTC): `2026-03-28T22:59:59Z` → `2026-03-28`; `2026-03-28T23:00:00Z` → `2026-03-29`; `2026-03-29T21:59:59Z` → `2026-03-29`; `2026-03-29T22:00:00Z` → `2026-03-30` (doba 23 h).
- Zima i przełom roku: `2026-12-31T22:59:59Z` → `2026-12-31`; `2026-12-31T23:00:00Z` → `2027-01-01`.
- `tomorrowInWarsaw`: `2026-10-24T22:00:00Z` → `2026-10-26`; `2026-12-31T23:00:00Z` → `2027-01-02`; `2028-02-28T12:00:00Z` → `2028-02-29`; `2026-10-31T12:00:00Z` → `2026-11-01`.
- `daysFromToday`: `('2026-10-16','2026-10-15')` = 1; `('2026-10-14','2026-10-15')` = -1; `('2026-10-26','2026-10-25')` = 1 (doba zmiany czasu liczy się jako 1 dzień kalendarzowy); `('2026-11-01','2026-10-31')` = 1.

#### 2. Etykiety terminów (`dueChip`) — pinowanie guardrail 2

**File**: `src/lib/today.test.ts` (osobny `describe`)

**Intent**: Pinować obecny kontrakt etykiet, w tym granice 0, 1, 2, 7 i 8 dni, oraz brak terminu. Komentarz w teście ma jasno mówić, że progi (7 dni) są obecną decyzją implementacyjną, nie wymaganiem PRD, a PRD wymaga tylko „sygnalizacji z wyprzedzeniem”.

**Contract**: Tabela `[due, today, oczekiwany ton i etykieta]` przy `today = '2026-10-15'`: `null` → `none`, „bez terminu”; `2026-10-13` → `overdue`, „2 dni po terminie”; `2026-10-14` → `overdue`, „wczoraj”; `2026-10-15` → `today`, „dziś”; `2026-10-16` → `tomorrow`, „jutro”; `2026-10-17` → `soon`, „za 2 dni”; `2026-10-22` → `soon`, „za 7 dni”; `2026-10-23` → ton `date` (etykiety daty nie porównujemy dosłownie, tylko ton).

### Success Criteria:

#### Automated Verification:

- Testy aplikacji przechodzą: `npm run test:app`
- Lint i typecheck przechodzą: `npm run lint` oraz `npx astro check`

#### Manual Verification:

- Test zepsucia dla źródła „dziś”: tymczasowa zmiana strefy w `todayInWarsaw` na `UTC` robi czerwone co najmniej przypadki na granicy północy; po cofnięciu zielone.
- Test zepsucia dla chipów: tymczasowa zmiana progu `days <= 7` na `days <= 6` robi czerwony przypadek `2026-10-22`; po cofnięciu zielone.

**Implementation Note**: Po zielonych kryteriach automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: pgTAP dla listy na dziś i CI

### Overview

Potwierdzić, że obecny zestaw pgTAP jest zielony, dodać testy przejścia dni i niezależności od strefy dla `today_list`, a potem podpiąć `supabase test db` do CI.

### Changes Required:

#### 1. Baza odniesienia

**File**: (bez zmian w plikach) lokalna baza

**Intent**: Zanim cokolwiek dodamy, uruchomić wszystkie istniejące pliki pgTAP na bieżącym kodzie. Jeśli któryś jest czerwony, zatrzymać się i zgłosić użytkownikowi zamiast po cichu poprawiać (czerwony istniejący test to osobne ustalenie).

**Contract**: `npx supabase start` (wymaga Dockera), potem `npx supabase test db`.

#### 2. Skrypt npm

**File**: `package.json`

**Intent**: Dodać polecenie lokalne i CI-owe dla testów bazy.

**Contract**: `"test:db": "supabase test db"`.

#### 3. Test przejścia dni

**File**: `supabase/tests/database/core_domain_today_list_days.test.sql` (nowy, konwencja `core_domain_<topic>.test.sql`)

**Intent**: Na jednym zestawie danych odpytać `today_list` dla wielu dat i dowieść: (#1) niedokończone zadanie nie znika w żadnym dniu zakresu, także w dniu i po dacie milestona; zadanie przeniesione jest zawsze widoczne jako `task` lub `deferred`, a w dniu `deferred_until` i później jako `task`; milestone ze wszystkimi zadaniami `done` pozostaje widoczny każdego dnia aż do zamknięcia, a po zamknięciu następny niezamknięty milestone staje się najbliższy; (#2) kolejność według FR-010 jest identyczna w różnych dniach, a zadanie bez terminu jest widoczne w każdym z nich i na końcu; (#3) wynik nie zmienia się przy innej strefie sesji i `today_list` nie odwołuje się do `current_date`/`now()`/`current_timestamp`.

**Contract**: Szkielet jak w `core_domain_today_list.test.sql` (transakcja, `pgtap`, użytkownik `a1` w roli `authenticated` z `request.jwt.claims`, własne projekty na przypadek, jawne `created_at`). Oczekiwane wartości wpisane ręcznie z reguł FR-009/FR-010, nie liczone zapytaniem:

- Sweep: `generate_series(date '2026-10-01', date '2027-01-31', 1)` połączone z `public.today_list(d)`; asercja `is(count, 0)` dla dni, w których otwarte zadanie nie występuje w wyniku (kind `task` lub `deferred`). Zakres obejmuje datę milestona, dzień po niej i zmianę czasu 2026-10-25.
- Przeniesienie: zadanie z `deferred_until = D+1` jest `deferred` w dniu D, `task` w dniach D+1 i D+2.
- Kolejność: te same wpisane ręcznie listy tytułów dla `p_today` = D i D+3 w zestawie projektów bez przeniesień, z zadaniami bez terminu na końcu.
- Strefa: `set local timezone` na `Pacific/Kiritimati` (UTC+14) i `Etc/GMT+12` (UTC-12), te same wpisane oczekiwane wiersze dla stałego `p_today`.
- Strażnik źródła „dziś”: asercja na `prosrc` funkcji (`pg_proc`) wskazuje brak `current_date`, `now()` i `current_timestamp`. To strażnik strukturalny dopełniający test strefy; zaznaczyć to w komentarzu.
- `plan(n)` ustawić na rzeczywistą liczbę asercji; `it.each`-podobne powtórzenia realizować wspólnym zapytaniem (`values`/`generate_series`), nie kopiami asercji.

#### 4. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Dodać do jobu `smoke` krok `supabase test db`, po „Start local Supabase” i przed budowaniem.

**Contract**: Krok `run: supabase test db` (binarka z `supabase/setup-cli@v1`); bez sekretów. Job zostaje jednym jobem (decyzja z wywiadu).

### Success Criteria:

#### Automated Verification:

- Baza odniesienia: wszystkie istniejące pliki pgTAP zielone przed zmianami: `npx supabase test db`
- Nowy i istniejące testy przechodzą: `npm run test:db`
- Lint przechodzi: `npm run lint`
- Job `smoke` zawiera krok `supabase test db`: `grep -n "supabase test db" .github/workflows/ci.yml`

#### Manual Verification:

- Test zepsucia: w lokalnej bazie podmienić `today_list` wariantem z `deferred_until >= p_today` (zamiast `>`) lub z `current_date` zamiast `p_today`; `npm run test:db` jest czerwony na nowym lub starym pliku; potem `npx supabase db reset` przywraca stan.
- PR z tą zmianą: job `smoke` jest zielony i log pokazuje wykonanie `supabase test db`.

**Implementation Note**: Po zielonych kryteriach automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Faza 4: Cookbook i synchronizacja test-planu

### Overview

Zapisać wzorce i polecenia, żeby kolejne fazy (i `/10x-tdd`) wiedziały, jak dodać test w tym projekcie, oraz zsynchronizować bramki i luki.

### Changes Required:

#### 1. Test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: Uzupełnić §4 (wiersz runnera aplikacji: vitest z wersją i `checked: <data>`; wiersz pgTAP: „w CI”), §5 (bramki „database tests (pgTAP)” i „app-level unit + integration” z `required after §3 Phase 1` na `required (wired)`), §6.1 (lokalizacja `src/**/*.test.ts`, nazewnictwo, test referencyjny `src/lib/today.test.ts`, polecenie `npm run test:app`), §6.2 (polecenie `npm run test:db`), §6.3 (wzorzec: sweep dat w SQL, daty wpisane ręcznie, test strefy, zależność oracle od FR-010), §6.7 (2–3 linie: co faza ujawniła) i §7 (wpis: dziedziczenie terminu milestona w sortowaniu wg US-01 oraz sygnał milestona na wierszu zadania nie są testowane jako wymaganie, bo to nierozstrzygnięta decyzja produktowa; kiedy ponownie ocenić). Zaktualizować §8 (data weryfikacji stosu). Status wiersza §3 aktualizuje orkiestrator `/10x-test-plan`, nie ta faza.

**Contract**: Sekcje §4, §5, §6.1–6.3, §6.7, §7, §8 jako wyżej; format wpisów jak w istniejących podsekcjach.

#### 2. Polecenia dla agenta

**File**: `CLAUDE.md` (sekcja Commands w `xDevs/CLAUDE.md`)

**Intent**: Dodać dwa polecenia, bo agent bez nich nie zgadnie: `npm run test:app` (vitest, `src/**/*.test.ts`) i `npm run test:db` (pgTAP, wymaga lokalnego Supabase/Dockera).

**Contract**: Dwie linie w liście Commands, w stylu istniejących wpisów.

### Success Criteria:

#### Automated Verification:

- W test-planie nie ma już „TBD — see §3 Phase 1”: `grep -n "TBD — see §3 Phase 1" context/foundation/test-plan.md` (brak wyników)
- Polecenia opisane w cookbooku działają: `npm run test:app` oraz `npm run test:db`
- Formatowanie markdown przechodzi: `npx prettier --check context/foundation/test-plan.md CLAUDE.md`

#### Manual Verification:

- Przeczytać §6.1–6.3: osoba nowa w projekcie wie, gdzie dodać test, jak go nazwać i jak uruchomić.
- Wpis w §7 i §6.3 poprawnie opisuje lukę US-01/guardrail 2 i nie obiecuje testu, którego nie ma.

---

## Testing Strategy

### Unit Tests (vitest):

- `todayInWarsaw`/`tomorrowInWarsaw`: północ CEST/CET, obie zmiany czasu, przełom roku, dzień przestępny.
- `daysFromToday` i `dueChip`: granice −1, 0, 1, 2, 7, 8 dni oraz brak terminu.

### Integration Tests (pgTAP, prawdziwa baza):

- Sweep dat: otwarte zadanie obecne w każdym dniu zakresu; przeniesione zadanie wraca w dniu `deferred_until`.
- Kolejność FR-010 stabilna w różnych dniach; NULL na końcu, ale widoczny.
- Niezależność od strefy sesji i brak `current_date`/`now()` w funkcji.

### Manual Testing Steps:

1. Test zepsucia dla każdej warstwy (Fazy 1–3), potem cofnięcie.
2. Zielony job `smoke` na PR z krokiem `supabase test db`.

## Performance Considerations

Sweep ok. 123 dni × jedno wywołanie `today_list` na małym zestawie danych: ułamki sekundy; krok `supabase test db` w CI doda czas wykonania 10 plików pgTAP do joba `smoke` (nie startuje drugiej bazy).

## Migration Notes

Brak migracji bazy i brak zmian w danych. Wycofanie: usunięcie nowych plików testowych, skryptów npm i kroków CI.

## References

- Related research: `context/changes/testing-today-list-correctness/research.md`
- Strategia: `context/foundation/test-plan.md` §2 (ryzyka #1–#3), §3 Faza 1, §5
- Wyrocznia: `context/foundation/prd.md` (FR-009, FR-010, US-01, Business Logic, guardrails)
- Wzorzec testu SQL: `supabase/tests/database/core_domain_today_list.test.sql`
- Funkcja pod testem: `supabase/migrations/20261021120000_recurring_occurrence_actions.sql:182`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner aplikacji (vitest)

#### Automated

- [x] 1.1 Testy aplikacji przechodzą: `npm run test:app` — 626ca33
- [x] 1.2 Istniejące testy jednostkowe nadal przechodzą: `npm run test:unit` — 626ca33
- [x] 1.3 Lint i typecheck przechodzą: `npm run lint` oraz `npx astro check` — 626ca33
- [x] 1.4 Job `ci` zawiera krok `npm run test:app`: `grep -n "test:app" .github/workflows/ci.yml` — 626ca33

#### Manual

- [x] 1.5 Test zepsucia: zmiana oczekiwanego dnia w teście startowym robi `npm run test:app` czerwonym, po cofnięciu znów zielony — 626ca33

### Phase 2: Testy dat i chipów w aplikacji

#### Automated

- [x] 2.1 Testy aplikacji przechodzą: `npm run test:app` — 89fdd42
- [x] 2.2 Lint i typecheck przechodzą: `npm run lint` oraz `npx astro check` — 89fdd42

#### Manual

- [x] 2.3 Test zepsucia dla źródła „dziś”: zmiana strefy w `todayInWarsaw` na `UTC` robi czerwone przypadki granicy północy, po cofnięciu zielone — 89fdd42
- [x] 2.4 Test zepsucia dla chipów: zmiana progu `days <= 7` na `days <= 6` robi czerwony przypadek 7 dni, po cofnięciu zielone — 89fdd42

### Phase 3: pgTAP dla listy na dziś i CI

#### Automated

- [x] 3.1 Baza odniesienia: wszystkie istniejące pliki pgTAP zielone przed zmianami: `npx supabase test db` — 6980ecb
- [x] 3.2 Nowy i istniejące testy przechodzą: `npm run test:db` — 6980ecb
- [x] 3.3 Lint przechodzi: `npm run lint` — 6980ecb
- [x] 3.4 Job `smoke` zawiera krok `supabase test db`: `grep -n "supabase test db" .github/workflows/ci.yml` — 6980ecb

#### Manual

- [x] 3.5 Test zepsucia: podmiana `today_list` wariantem z `>=` zamiast `>` albo z `current_date` robi `npm run test:db` czerwonym, potem `npx supabase db reset` przywraca stan — 6980ecb
- [ ] 3.6 PR z tą zmianą: job `smoke` jest zielony i log pokazuje wykonanie `supabase test db`

### Phase 4: Cookbook i synchronizacja test-planu

#### Automated

- [x] 4.1 W test-planie nie ma już „TBD — see §3 Phase 1”: `grep -n "TBD — see §3 Phase 1" context/foundation/test-plan.md` (brak wyników) — b427c38
- [x] 4.2 Polecenia opisane w cookbooku działają: `npm run test:app` oraz `npm run test:db` — b427c38
- [ ] 4.3 Formatowanie markdown przechodzi: `npx prettier --check context/foundation/test-plan.md CLAUDE.md`

#### Manual

- [x] 4.4 §6.1–6.3 mówią nowej osobie, gdzie dodać test, jak go nazwać i jak uruchomić — b427c38
- [x] 4.5 Wpis w §7 i §6.3 poprawnie opisuje lukę US-01/guardrail 2 i nie obiecuje testu, którego nie ma — b427c38
