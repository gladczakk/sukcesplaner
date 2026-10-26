---
date: 2026-10-26
researcher: Claude (Sonnet 5.5)
git_commit: ddcbf3711e226f60a45da33f65dbca90c3f6f6ff
branch: master
repository: xDevs
topic: "Faza 1 test-planu: poprawność listy na dziś (ryzyka #1, #2, #3), runner testów aplikacji i pgTAP w CI"
tags: [research, codebase, today-list, today_list, pgtap, date-boundaries, test-runner, ci]
status: complete
last_updated: 2026-10-26
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Poprawność listy na dziś (Faza 1)

**Date**: 2026-10-26 · **Git Commit**: ddcbf37 (czyste drzewo poza nieśledzonym `context/foundation/test-plan.md`) · **Branch**: master

## Research Question

Dla ryzyk #1, #2, #3 z `context/foundation/test-plan.md` ustalić: (a) gdzie powstaje lista na dziś i co już pokrywają testy, (b) czy guardrail 2 („zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem”) jest w ogóle zaimplementowany, (c) skąd pochodzi „dziś” i jak wstrzyknąć datę, (d) jaki runner testów aplikacji i jak podpiąć pgTAP do CI. Wyrocznia pochodzi z PRD, nie z kształtu implementacji.

## Summary

- **Lista powstaje w jednym miejscu: funkcja SQL `public.today_list(p_today date)`**, ostatnio zdefiniowana w `supabase/migrations/20261021120000_recurring_occurrence_actions.sql:182` (poprzednie wersje są zastępowane przez `drop function` + `create`). Aplikacja tylko ją wywołuje (`src/lib/services/today.ts`) i grupuje wiersze wg `kind`. Warstwa SQL ma już test pgTAP `core_domain_today_list.test.sql` (kolejność, NULL na końcu, remisy, milestone po terminie, zamknięty milestone, `deferred_until` =/</> dnia, RLS, `NULL`), ale tylko dla jednej stałej daty `2026-10-15`.
- **„Dziś” pochodzi wyłącznie z aplikacji**: `todayInWarsaw()` (`src/lib/today.ts:11`) liczy datę kalendarzową w `Europe/Warsaw` przez `Intl.DateTimeFormat` i przekazuje ją jako `p_today`. Funkcja SQL jest `strict` (NULL daje 0 wierszy) i nie sięga do `current_date`/`now()` — **datę można wstrzyknąć na obu warstwach już dziś**: `todayInWarsaw(now: Date)` oraz `getToday(supabase, today)` oraz `p_today`. Strona `/today` wywołuje `todayInWarsaw()` bez argumentu (`src/pages/today.astro:27`).
- **Guardrail 2 jest zaimplementowany tylko częściowo i wyłącznie wizualnie**: etykieta (`dueChip`, `src/lib/today.ts:32-41`) dla własnego terminu zadania (do 7 dni „za N dni”) i dla wiersza „milestone do zamknięcia”. Wiersz zadania nie pokazuje daty milestona, a zadanie bez własnego terminu dostaje „bez terminu”. Sortowanie nie dziedziczy terminu milestona (decyzja jawnie opisana w komentarzu migracji). To jest **sprzeczność w PRD**, nie tylko luka testowa (patrz Open Questions).
- **Brak runnera testów aplikacji**: `npm run test:unit` to `node --experimental-strip-types --test` na 3 plikach w `scripts/`. `src/lib/today.ts` importuje `@/lib/format` (alias), którego `node --test` nie rozwiązuje, więc wprost nie da się go zaimportować w teście bez dodania obsługi aliasu. Testy pgTAP **nie są w CI** (`.github/workflows/ci.yml`: job `ci` nie ma `supabase test db`; job `smoke` startuje lokalny Supabase, ale uruchamia tylko `npm run smoke`).

## Detailed Findings

### 1. Reguła kwalifikacji i kolejność (ryzyka #1 i #2)

Oracle z PRD (`context/foundation/prd.md`, Business Logic ~l.106; FR-009, FR-010; US-01): lista zawiera niedokończone zadania najbliższego niezamkniętego milestona każdego projektu, posortowane od najbliższego terminu, zadania bez terminu na końcu ale widoczne; gdy wszystkie zadania milestona są zrobione, pojawia się sam milestone. Dla zadań powtarzalnych reguła z `prd-v2.md` (FR-017): pojawiają się w dni rytmu od dnia startu do daty milestona lub jego zamknięcia, niezależnie od tego, czy milestone jest najbliższy.

Implementacja (dla ścieżki: `today_list` w wersji z `20261021120000_*.sql`):

- Najbliższy milestone projektu: `distinct on (project_id)` wśród `completed_at is null`, `order by project_id, due_date, seq` (l.207-212) — milestone po terminie nadal jest „najbliższy”; remis dat rozstrzyga `seq`.
- Zadania niepowtarzalne: `status <> 'done'` i `not is_recurring` w najbliższym milestonie (l.214-219). `kind` = `'deferred'`, gdy `deferred_until > p_today`, w przeciwnym razie `'task'` (l.224). Wiersz `'milestone'` powstaje, gdy w najbliższym milestonie nie ma żadnego niedokończonego zadania niepowtarzalnego.
- Zadania powtarzalne: rodzaje `'routine'` (l.266; warunek `p_today between recurrence_start_date and m.due_date` l.301, milestone niezamknięty) i `'skipped'` (l.315; ten sam warunek dla `p_today - 1`, l.335).
- Kolejność wyniku (l.372): routine, skipped, task, milestone, deferred; w obrębie `task` termin zadania rosnąco z NULL na końcu, potem data milestona, `seq`, `created_at`, `id`.

Zaobserwowane vs wymagane:

- Sortowanie `task_due_date asc nulls last` odpowiada FR-010 dosłownie. US-01 mówi jednak „bliższy deadline (własny lub milestona)”, a implementacja **nie dziedziczy** terminu milestona dla zadań bez własnego terminu (komentarz `20261016120000_today_list.sql`, sekcja „Sortowanie wg FR-010 doslownie, bez dziedziczenia terminu milestona”). Dla tej sprawdzonej ścieżki zadanie bez terminu z milestona za 1 dzień trafia za zadanie z własnym terminem za 30 dni (data milestona jest tylko tie-breakerem po `task_due_date`).
- Istniejący test pgTAP pinuje ten kształt (kolejność P01, P02–P06 w `core_domain_today_list.test.sql`), więc „zielony test” nie rozstrzyga, który zapis PRD jest wyrocznią (patrz Open Questions #1).

Istniejące pokrycie (`supabase/tests/database/core_domain_today_list.test.sql`, `plan(24)`, stała data `2026-10-15`):

- pokryte: kolejność z NULL na końcu, partial, done poza listą, wiele projektów, remis daty milestona i `seq`, milestone po terminie, zamknięty milestone, brak milestonów, wiersze `milestone`, `deferred_until` po/równe/przed dniem, wszystko przeniesione, done z `deferred_until`, `NULL`, RLS, anon.
- niepokryte w tym pliku: **inny `p_today` dla tych samych danych** (przełom dnia: zadanie przeniesione na jutro wraca jako `task` dnia następnego; zadanie, które „wczoraj” było `task`, dziś nadal jest), **spójność z akcjami** (zrobione → znika, partial → zostaje) jako sekwencja stanów — to ryzyko #4 / Faza 2, ale „nic nie znika po akcji ani zmianie dnia” z #1 wymaga co najmniej przejścia dnia.
- rytmy mają własne testy z granicami (`core_domain_recurring_tasks.test.sql:113` „ostatni dzień równy dacie milestona widoczny, następny nie”; `:118` „przed dniem startu rutyna niewidoczna”; `:268` zamknięty milestone ukrywa rutynę; weekdays l.106) — granica ostatniego dnia rytmu dla SQL jest więc już pokryta, nie trzeba jej duplikować.

### 2. Skąd „dziś” (ryzyko #3)

- Jedno źródło: `todayInWarsaw(now = new Date())` (`src/lib/today.ts:11-15`) — część kalendarzowa daty w strefie `Europe/Warsaw`; używane przez stronę (`today.astro:27`), `createTask`/`updateTask` dla `recurrence_start_date` (`src/lib/services/tasks.ts:124-132, 202, 217`), `completeOccurrence` (`.../occurrences.ts:28`), przeniesienie wystąpienia (`.../occurrences/move.ts:28-35`) i „na jutro” (`.../tasks/[taskId].ts:80`, `tomorrowInWarsaw`).
- `tomorrowInWarsaw` dodaje 1 dzień do daty kalendarzowej w UTC, więc strefa serwera nie ma znaczenia (`today.ts:20-23`).
- Sprawdzone w Node v24.13.0 (ręczne uruchomienie `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" })`): 2026-10-14T21:59:59Z → `2026-10-14`, T22:00:00Z → `2026-10-15` (przełom północy CEST); 2026-10-24T22:00:00Z → `2026-10-25` (doba zmiany czasu CEST→CET trwa 25 h, następny przełom dopiero 2026-10-25T23:00:00Z → `2026-10-26`); 2026-03-28T22:59:59Z → `2026-03-28`, T23:00:00Z → `2026-03-29` (CET→CEST). Zachowanie na runtime Cloudflare Workers (workerd) **nie zostało sprawdzone** w tym badaniu.
- Baza nie ma własnego „dziś” dla listy: `today_list` używa tylko `p_today`; kolumny `created_at`/`completed_at` używają `now()` oraz `new Date().toISOString()` (`src/lib/services/milestones.ts:134`) — nie wpływają na kwalifikację listy, ale `completed_at` jest instantem UTC, a nie dniem Warsaw (zamknięcie decyduje przez `completed_at is null`, nie przez porównanie dat).
- Etykiety terminów (`dueChip`, `daysFromToday`, `today.ts:26-41`) liczą różnicę dat jako różnicę dni w UTC na datach ISO — bez strefy, więc poprawne dla dwóch dat kalendarzowych.
- Istnieje ryzyko „dwóch dni” w jednym żądaniu: `today.astro` liczy `today` raz (l.27) i używa go do `getToday` oraz do chipów, więc lista i oznaczenia nie rozjeżdżają się w obrębie żądania; strona ustawia `Cache-Control: no-store` (l.22). Natomiast akcje (`complete`, `move`, `deferral`) wywołują `todayInWarsaw()` osobno w momencie żądania, więc akcja kliknięta po północy na starej stronie działa na nowym dniu (zaobserwowane z kodu, bez testu).
- Pokrycie testami: **żadnego** testu `todayInWarsaw`, `tomorrowInWarsaw`, `dueChip`, `daysFromToday` (3 pliki w `scripts/`: `weekdays`, `auth-errors`, `check-hardcoded-values`).

### 3. Guardrail 2 — wczesne ostrzeżenie

Sprawdzony zakres: `src/**/*.{ts,tsx,astro}` (grep `wyprzedz|approaching|early|soon|zbliża`), `today.astro`, `TaskRow.astro`, `today.ts`.

- Jedyny mechanizm: `dueChip` (`today.ts:32-41`): `overdue` (≤ −1), `today`, `tomorrow`, `soon` (2–7 dni, etykieta „za N dni”), potem data. Stosowany do `task.due_date` (`today.astro:43`) i `milestone.due_date` wiersza „milestone do zamknięcia” (`today.astro:44`).
- Wiersz zadania (`today.astro`, pętla `rows`) pokazuje chip własnego terminu zadania i nazwę milestona, **nie** jego datę. Dla zadania bez terminu etykieta to „bez terminu”.
- Brak jakiejkolwiek logiki „milestone za N dni, a zostało M zadań” ani podnoszenia pozycji w miarę zbliżania terminu milestona; wiersz `milestone` pojawia się dopiero po ukończeniu zadań i jest sortowany po zadaniach.
- PRD FR-015 / Resolved Open Question 2 (2026-09-21) wprost ogranicza przeterminowanie do wizualnego oznaczenia i mówi, że kwalifikacja się nie zmienia. FR-012 powołuje się na guardrail 2 jako zabezpieczenie przed maskowaniem zaległości przez ciągłe „na jutro”. **Dla tej sprawdzonej ścieżki mechanizm chroniący przed tym scenariuszem jest ograniczony do chipa terminu zadania** (nie ma chipa milestona na wierszu zadania) — to wniosek z kodu, wymaga decyzji produktowej, czy to spełnia guardrail 2.

### 4. Runner testów aplikacji i CI (do wyboru w `/10x-plan`)

- Obecnie: `package.json` `test:unit` = `node --experimental-strip-types --test scripts/weekdays.test.mjs scripts/auth-errors.test.mjs scripts/check-hardcoded-values.test.mjs`; brak vitest/jest (`ls vitest* vite.config*` — nie istnieją; grep w `package.json` nie wskazuje innych runnerów). `tsconfig` ma alias `@/*` → `./src/*`.
- Ograniczenie: `src/lib/today.ts` importuje `@/lib/format`; `format.ts` importuje `@/lib/weekdays`. Istniejący test importuje `../src/lib/weekdays.ts` względną ścieżką, bo `weekdays.ts` nie ma importów z aliasem. Test `today.ts` pod `node --test` wymaga (a) obsługi aliasu (np. loader/`--import`), (b) zmiany importów na względne, albo (c) runnera z aliasem (np. vitest z `resolve.alias`). Wybór runnera nie jest zadaniem badania; wymaga aktualnej dokumentacji (§4 test-planu: brak Context7/web search w sesji, `checked: 2026-10-26`).
- Co jest czysto jednostkowe (bez bazy): `todayInWarsaw`, `tomorrowInWarsaw`, `daysFromToday`, `dueChip` (wszystkie przyjmują datę jako argument). Co wymaga bazy: kolejność/kwalifikacja (`today_list`). `getToday` przyjmuje klienta Supabase i `today` — można go testować z hermetycznym stubem `rpc`, ale grupowanie wg `kind` jest trywialne; wartość sygnału leży w SQL.
- CI: `ci.yml` job `smoke` już uruchamia lokalny Supabase (`supabase start -x ...`, supabase/setup-cli@v1, `version: latest`), więc `supabase test db` może zostać dodany do tego jobu bez nowej infrastruktury; job `ci` (lint, astro check, `test:unit`, build) nie ma kroku bazy. Nie sprawdzono, czy lokalne `supabase test db` przechodzi dziś w całości (10 plików pgTAP); nie uruchamiano go w tym badaniu. `supabase/config.toml`: `major_version = 17`.

## Code References

- `supabase/migrations/20261021120000_recurring_occurrence_actions.sql:182-388` — aktualna `today_list` (nearest l.207-212, open_tasks l.214-219, kind l.224, routine l.266/301, skipped l.315/335, order by l.372)
- `supabase/migrations/20261016120000_today_list.sql:1-30` — decyzje: brak dziedziczenia terminu milestona, `p_today` zamiast `current_date`, `strict`
- `supabase/tests/database/core_domain_today_list.test.sql` — pokrycie reguły (stała data 2026-10-15)
- `supabase/tests/database/core_domain_recurring_tasks.test.sql:113,118,268` — granice rytmu (ostatni dzień, start, zamknięcie)
- `src/lib/today.ts:11-41` — `todayInWarsaw`, `tomorrowInWarsaw`, `daysFromToday`, `dueChip`
- `src/lib/services/today.ts` — `getToday(supabase, today)` (wstrzykiwana data), `getTaskTargets`
- `src/pages/today.astro:22,27,43-44` — `no-store`, jedno `today` na żądanie, chipy
- `src/lib/services/tasks.ts:124-132,202,217,237-290` — `todayInWarsaw()` przy zapisach, `setTaskStatus`, `setTaskDeferral`
- `src/lib/services/milestones.ts:134` — `completed_at` jako instant UTC
- `.github/workflows/ci.yml` — joby `ci` i `smoke`, brak `supabase test db`
- `package.json:15` — `test:unit`

## Architecture Insights

- Reguła biznesowa żyje w SQL (jedno testowalne miejsce), aplikacja nie powiela kwalifikacji — dlatego najtańszą warstwą dla #1 i większości #2 jest pgTAP, a nie test serwisu.
- Data jest parametrem, nie zegarem bazy: to dobra właściwość dla testów #3 (dowolna data wchodzi do `today_list` bez mockowania zegara). Ryzyko leży po stronie aplikacji (konwersja instantu → dzień Warsaw) i akcji liczących własny `todayInWarsaw()`.
- Komentarze w migracjach są kontraktem decyzji (np. „FR-010 dosłownie”); test, który kopiuje kolejność z implementacji, byłby lustrem — oracle musi wynikać z PRD, a PRD ma tu dwa zapisy (FR-010 vs US-01).

## Historical Context (from prior changes)

- `context/archive/2026-10-15-today-list-view/` — wprowadzenie `today_list` i strony `/today` (commity `ec9cde7`, `e40808a`, `7b0e5b5`: poprawki F1–F7 po review).
- `context/archive/2026-10-16-today-list-actions/` — przeniesienie na jutro i czyszczenie (`ea58144`).
- `context/archive/2026-10-19-recurring-tasks-by-interval/`, `2026-10-20-recurring-tasks-by-weekdays`, `2026-10-20-recurring-occurrence-actions`, `2026-10-20-recurring-task-edit-disable` — rozszerzenia `today_list` o `routine`/`skipped`; ich plany i raporty review nie były czytane w tym badaniu (zakres: kod, PRD, test-plan, migracje, testy).

## Related Research

Nie dotyczy (inne research.md w `context/archive/` nie były czytane).

## Open Questions

1. **Wyrocznia kolejności (#2)**: FR-010 („zadania bez własnego deadline'u na koniec”) vs US-01 („bliższy deadline własny lub milestona wyżej”). Czy zadanie bez terminu w milestonie za 1 dzień ma być niżej niż zadanie z własnym terminem za 30 dni? Bieżące zachowanie i test pgTAP przyjmują FR-010 dosłownie. Plan musi to rozstrzygnąć (zatwierdzić jako „znane ograniczenie” albo zgłosić jako zmianę), zanim powstanie asercja.
2. **Guardrail 2**: czy chip terminu zadania + wiersz „milestone do zamknięcia” wystarcza jako „sygnalizacja z wyprzedzeniem”, czy wiersz zadania powinien pokazywać termin milestona? Tego nie rozstrzyga kod; zmiana byłaby osobną zmianą produktową, a nie testem.
3. **Runtime workerd**: czy `Intl.DateTimeFormat` z `timeZone: "Europe/Warsaw"` na Cloudflare Workers daje te same wyniki na granicach północy i zmiany czasu — niesprawdzone (sprawdzono tylko Node v24.13.0).
4. **Akcja po północy na starej stronie**: akcje liczą własny `todayInWarsaw()` (nie dzień wyświetlonej listy). Czy to zamierzone? Dotyczy głównie #4 (Faza 2), ale granica dnia jest wspólna.
5. **Stan lokalnego `supabase test db`**: nie uruchomiono; zanim zostanie bramką CI, plan powinien założyć wstępną weryfikację, że wszystkie 10 plików przechodzi.
6. **Wybór runnera aplikacji**: do rozstrzygnięcia w `/10x-plan` po sprawdzeniu aktualnej dokumentacji (alias `@/`, tryb strip-types vs vitest); `test-plan.md` §4 zostawia to Fazie 1.
