---
date: 2026-10-20T20:55:00+0200
researcher: Claude Sonnet 5.5 (na zlecenie Karoliny Jurowicz)
git_commit: 1d8fbaa
branch: master
repository: xDevs
topic: "S-10 recurring-task-edit-disable: jak dziś wygląda edycja zadania i co robi baza przy zmianie rytmu lub wyłączeniu powtarzania istniejącego zadania powtarzalnego"
tags: [research, codebase, tasks, task_occurrences, today_list, recurrence, TaskFormDialog]
status: complete
last_updated: 2026-10-20
last_updated_by: Claude Sonnet 5.5
---

# Research: zmiana rytmu i wyłączenie powtarzania (S-10)

**Date**: 2026-10-20T20:55:00+0200
**Researcher**: Claude Sonnet 5.5
**Git Commit**: 1d8fbaa
**Branch**: master
**Repository**: xDevs

## Research Question

Slice S-10 (`context/foundation/roadmap.md`, blok S-10, FR-020): użytkownik może zmienić rytm albo wyłączyć powtarzanie istniejącego zadania; historia i dzisiejsze wystąpienie zostają, a zmiana działa od dziś. Co aplikacja i baza robią dziś z polami rytmu przy edycji, co stałoby się przy zmianie lub wyłączeniu rytmu, i które decyzje produktowe zostają otwarte przed `/10x-plan`?

## Summary

- **Dziś rytmu nie da się zmienić z aplikacji.** Pełna edycja to PUT, który parsuje ciało schematem z samym `title` i `due_date`; pola rytmu są po cichu odrzucane (`src/lib/validation/task.ts:9-23`, komentarz w linii 32; `src/lib/services/tasks.ts:137-156`). Dialog edycji pokazuje rytm tylko do odczytu (`src/components/projects/TaskFormDialog.tsx:242-246`), a select trybu, pole interwału i `WeekdayPicker` renderują się tylko poza edycją (`TaskFormDialog.tsx:247-298`).
- **Baza pozwala właścicielowi zmienić kolumny rytmu bezpośrednio.** `tasks` ma grant update dla `authenticated` i politykę `tasks_update_own` (`supabase/migrations/20261009120100_enable_core_domain_rls.sql:16,72`); testy pgTAP wręcz wykonują `update public.tasks set recurrence_...` w zamkniętym milestonie (`core_domain_recurring_tasks.test.sql:285-287`, `core_domain_recurring_weekdays.test.sql:314-316`). Żaden test nie sprawdza zmiany rytmu przy istniejących odhaczeniach, wyłączenia rytmu ani odrzucenia wyłączenia w zamkniętym milestonie.
- **Wyłączenie rytmu zostawia zwykłe zadanie otwarte.** Gdy w jednym UPDATE rytm i `recurrence_start_date` są NULL, baza to przyjmuje (`tasks_recurrence_pair_check`, `20261020120000_recurring_weekdays.sql:58-62`). Zadanie zostaje `todo`, bez terminu; `is_recurring` staje się fałszem. Konsekwencje wynikające z odczytanego SQL:
  - `today_list` traktuje je jako zwykłe zadanie (`open_tasks`, `20261021120000_recurring_occurrence_actions.sql:214-220`), widoczne tylko gdy jego milestone jest najbliższym otwartym w projekcie;
  - `check_milestone_closable` liczy je jako niezrobione i **blokuje zamknięcie milestona** (`20261020120000_recurring_weekdays.sql:136-159`), czego jako zadanie powtarzalne nie robiło;
  - w **zamkniętym** milestonie takie wyłączenie jest odrzucane przez `check_task_rules` („Zamkniety milestone nie moze miec niezrobionych zadan”, `:197-206`), bo wyjątek dla rutyny dotyczy tylko wiersza, który nadal jest powtarzalny.
- **Zapisane wystąpienia stają się sierotami, nie są nigdzie rewalidowane.** Wyzwalacz `check_task_occurrence` działa tylko BEFORE INSERT, a `task_occurrences` nie ma grantu update (`20261019120000_recurring_tasks.sql:62-65`, test 42501 w `core_domain_recurring_tasks.test.sql:402-405`). Wiersze przeżywają UPDATE zadania (klucz obcy z kaskadą tylko przy usunięciu zadania). `today_list` czyta wiersz `moved` po `moved_to`, bez sprawdzania rytmu, więc przeniesione wystąpienie nadal daje wiersz „routine”, dopóki zadanie jest powtarzalne i mieści się w zakresie (`20261021120000_recurring_occurrence_actions.sql:265-312`). Po wyłączeniu rytmu żaden z tych wierszy nie jest czytany.
- **`recurrence_start_date` jest kotwicą interwału** (`(d - start) % interwał`, `is_rhythm_day`, `:35-54`) i dolną granicą zakresu rutyny (`p_today between start and data milestona`) oraz „pominiętego” (`p_today - 1 between …`). Dla dni tygodnia jest tylko dolną granicą. Baza pozwala ustawić datę startu na dowolny dzień do daty milestona, więc „od dziś” byłoby polityką aplikacji.
- **PRD nie rozstrzyga najważniejszych słów S-10** (patrz Open Questions): co zostaje z zadaniem po „wyłączeniu”, czy zmiana interwału zeruje kotwicę, czy „pominięte wczoraj” liczy się z rytmu starego czy nowego, los przyszłych wierszy `moved`.

## Detailed Findings

### Aplikacja — dzisiejszy przepływ edycji

- **PUT** (`src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts`, linie ok. 22-52): ciało parsuje `taskInputSchema` (`title`, `due_date`); klucze spoza schematu są odrzucane. `updateTask` (`services/tasks.ts:137-156`) wykonuje `.update(input)` tylko z tymi dwoma polami, więc kolumny rytmu i `recurrence_start_date` nie są nigdy zapisywane przez edycję.
- **PATCH** (route ok. 54-99) przyjmuje wyłącznie `{status}` (`setTaskStatus`, zeruje też `deferred_until`) albo `{deferred: "tomorrow" | null}`; ciało z obydwoma kluczami to 422, a każde inne jest parsowane jako status.
- **Tworzenie** (`services/tasks.ts:121-131`) jedyne ustawia `recurrence_start_date = todayInWarsaw()`, gdy podano rytm. `translateError` zna już wszystkie ograniczenia rytmu i mapuje je na polskie komunikaty z argumentem `rhythmField` (`:44-94`).
- **Dialog edycji** (`TaskFormDialog.tsx`): `editedRhythm = formatRecurrence(...)` dla `isEdit && task.is_recurring` (`:79-84`); pole „Powtarzanie” tylko do odczytu bez komunikatu (`:242-246`); pole „Termin (opcjonalny)” jest ukryte, gdy `repeating` (`:299-312`); w edycji rytm jest wymuszany na `{value: null}` i używany jest `taskInputSchema` (`:127-136`, komentarz o PUT w linii 134).
- **Strona projektu** (`src/pages/projects/[id].astro:187-208`): dla `is_recurring === true` wiersz pokazuje `formatRecurrence(...)` zamiast terminu, a `TaskRowActions` dostaje `is_recurring` i oba pola rytmu, które trafiają dalej do `TaskFormDialog`.
- **Gdzie podpiąć zmianę** (wniosek, nie decyzja): usunąć strażników `!isEdit` z linii 247, 266 i 287 i zastąpić pole tylko do odczytu istniejącymi kontrolkami (`RECURRENCE_MODE_OPTIONS`, `WeekdayPicker`); wyprowadzić `repeat` z zadania w `initialValues`; rozszerzyć schemat PUT albo dodać osobny na bazie `taskCreateSchema` (jej dwa refines — jeden rytm naraz oraz brak terminu przy rytmie — nadają się bez zmian, `validation/task.ts:63-73`); `updateTask` musi umieć zapisać rytm i datę startu; rozszerzyć `TaskApiInput` w `use-task-api.ts`.
- **Reguły, które zmieniony rytm musi spełnić:** interwał 1..30 w bazie, a w formularzu „Codziennie” = 1 i „Co X dni” = 2..30 (`validation/task.ts:37-45,91-100`); dni tygodnia 1–7, różne (`:46-61`, `weekdays_valid`); jeden rytm naraz; zadanie powtarzalne ma `due_date` NULL, `status = 'todo'`, `deferred_until` NULL (`tasks_recurrence_shape`), więc włączenie rytmu na zadaniu zrobionym albo przeniesionym wymagałoby zresetowania tych pól; data startu nie później niż data milestona (`check_task_rules`).

### Baza — ograniczenia i wyzwalacze przy UPDATE kolumn rytmu

- Ograniczenia: `tasks_recurrence_weekdays_check`, `tasks_recurrence_one_rhythm_check` (zmiana interwał → dni wymaga wyzerowania interwału w tym samym UPDATE), `tasks_recurrence_pair_check` (rytm ustawiony wtedy i tylko wtedy, gdy `recurrence_start_date` ustawiona; trzy kolumny NULL przechodzą, rytm NULL przy niepustej dacie nie), `tasks_recurrence_shape`, `tasks_recurrence_interval_check` (`20261019120000_recurring_tasks.sql:29-30`) — `20261020120000_recurring_weekdays.sql:54-67`.
- Wyzwalacz `tasks_check_rules` odpala się przy zmianie dowolnej z kolumn rytmu (`:220-224`) i wymusza: data startu nie po dacie milestona (`:208-212`); zamknięty milestone przyjmuje tylko zadania `done`, z wyjątkiem wiersza, który po zmianie nadal jest powtarzalny (`:197-206`).
- Wyłączenie rytmu w otwartym milestonie (trzy kolumny NULL) jest przyjmowane i nie ma wyzwalacza porządkującego `task_occurrences`.

### Baza — wiersze `task_occurrences` po zmianie rytmu (scenariusze z odczytu SQL, niewykonane)

- **Wed+Fri → Sob po przeniesieniu środy na sobotę:** wiersz „routine” w tę sobotę pokazuje się raz (dzień rytmu lub dzień przeniesienia); przyszłe środy przestają być dniami rytmu.
- **Wed+Fri → Wt+Cz po przeniesieniu środy na czwartek:** czwartek jest już dniem rytmu, więc wiersz „routine” pokazuje się raz, a przeniesione i własne wystąpienie zlewają się w jedno.
- **Przeniesienie na dzień, który po zmianie nie jest dniem rytmu, ale pozostaje `moved_to`:** nadal daje wiersz „routine” („duch”), a „pominięte wczoraj” może odpalić dla takiego dnia.
- **Interwał 3 → 2 bez zmiany daty startu:** kratka dni przesuwa się; odhaczenia na dniach, które przestały być dniami rytmu, są martwe; dni z przeszłości bez wiersza, które stały się dniami rytmu, wchodzą w grę tylko dla „wczoraj”.
- **Interwał 3 → 2 z datą startu = dziś:** wszystkie wcześniejsze odhaczenia i przeniesienia o `occurrence_date` przed nową datą startu stają się sierotami poza zakresem; wiersz przeniesienia o `moved_to` w nowym zakresie nadal się pokazuje, bo wyszukiwanie idzie po `moved_to`.
- **Klucz główny `(task_id, occurrence_date)`:** istniejący wiersz `done` na dniu, który stał się dniem rytmu, blokuje wstawienie wiersza `moved` na ten dzień.
- Właściciel może usunąć wiersze (grant delete) — sieroty da się posprzątać; kaskada działa tylko przy usunięciu zadania.

### Historia i decyzje wcześniejszych zmian dotyczące S-10

- Oba rytmy zostawiły edycję rytmu na S-10: „zadanie z rytmem pokazuje w edycji rytm tylko do odczytu” (S-07 `plan.md:33`), „w edycji rytm dni tygodnia jest tylko do odczytu” (S-08 `plan.md:33`), obydwa w `context/archive/`.
- Wymaganie z przeglądu S-09 (F3): zmiana rytmu działa od dziś, historia zostaje, przyszłe wiersze `moved` mają być usuwane albo ignorowane, gdy źródło przestaje być dniem rytmu lub cel nim zostaje; „pominięte wczoraj” jest wyliczane z aktualnego rytmu i trzeba zdecydować, czy to akceptujemy (`context/archive/2026-10-20-recurring-occurrence-actions/follow-ups/review-fixes.md`).
- Zakres S-09 wprost wyłączył decyzję o wpływie zmiany rytmu na „pominięte z wczoraj” (S-09 `plan.md`, sekcja „What We're NOT Doing”).
- Wspólna definicja „dzień rytmu” (`is_rhythm_day`) jest jedna dla wyzwalacza, `today_list` i dostępności przycisku; S-10 powinno używać jej, nie kopiować warunku (S-09 `plan.md`, Critical Implementation Details).
- Strażnik daty milestona dotyczy `due_date`, `recurrence_start_date` i `moved_to` zadań (`20261019130000_...`, `20261021130000_...`); każdy zapis rytmu w S-10 musi go zachować.
- PRD o wyłączeniu: „Wyłączenie powtarzania zachowuje historię i dzisiejsze wystąpienie” (`prd-v2.md:64`); „zmiana działa od dziś (wyłączenie usuwa tylko przyszłe wystąpienia)” (`:79`); „Zmiana rytmu i wyłączenie powtarzania działają od dziś; historia i dzisiejsze wystąpienie zostają” (`:96`). PRD nie mówi, czym jest zadanie po wyłączeniu, ani czy edycja zeruje kotwicę „co X dni”.

## Code References

- `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts` — PUT/PATCH/DELETE zadania; PUT bez rytmu.
- `src/lib/validation/task.ts:9-23,37-73,79-100` — `taskInputSchema`, schemat tworzenia z rytmem, refines, `RECURRENCE_MODE_OPTIONS`, `readRecurrence*`.
- `src/lib/services/tasks.ts:44-94,121-131,137-156` — `translateError`, `createTask` (data startu = dziś), `updateTask`.
- `src/components/projects/TaskFormDialog.tsx:79-136,242-312` — edycja z rytmem tylko do odczytu, strażnicy `!isEdit`.
- `src/pages/projects/[id].astro:187-208` — etykieta rytmu i przekazanie pól rytmu do akcji.
- `src/components/hooks/use-task-api.ts` — `updateTask` (PUT bez rytmu), `TaskApiCreateInput` z rytmem.
- `supabase/migrations/20261020120000_recurring_weekdays.sql:44-67,136-159,165-224` — `is_recurring`, ograniczenia rytmu, `check_milestone_closable`, `check_task_rules` i jego wyzwalacz.
- `supabase/migrations/20261021120000_recurring_occurrence_actions.sql:35-54,214-351` — `is_rhythm_day`, `today_list` (gałęzie zwykłych zadań, `routine`, `skipped`).
- `supabase/migrations/20261019120000_recurring_tasks.sql:47-77` — `task_occurrences`, granty bez update.
- `supabase/migrations/20261009120100_enable_core_domain_rls.sql:16,72` — grant update i polityka `tasks_update_own`.
- `supabase/tests/database/core_domain_recurring_tasks.test.sql:285-287,402-405` oraz `core_domain_recurring_weekdays.test.sql:314-316` — dotychczasowe UPDATE-y kolumn rytmu i brak update na `task_occurrences`.

## Architecture Insights

- Stan wystąpień jest rozproszony: rytm i data startu na `tasks`, odhaczenia i przeniesienia w `task_occurrences`, „pominięte” wyliczane. Zmiana rytmu jest więc operacją na trzech rzeczach naraz; żadne ograniczenie nie wiąże wierszy `task_occurrences` z bieżącym rytmem po wstawieniu.
- Ścieżka rozstrzygnięcia „co z historią” ma dwa tory: porządkowanie (usuń przyszłe wiersze od dziś, przez DELETE, który właściciel już ma) albo ignorowanie w `today_list` (np. wymagać, by wiersz `moved` miał źródło będące dniem rytmu i cel nim nie był). Pierwszy zmienia dane, drugi funkcję SQL.
- Wyłączenie rytmu zmienia klasę zadania (powtarzalne → zwykłe), a od klasy zależą trzy reguły: lista na dziś, zamykanie milestona i wyjątek w zamkniętym milestonie. To jest decyzja produktowa, nie szczegół implementacji.
- Ograniczenia znane z wcześniejszych zmian: strona otwarta przez północ i kliknięta po niej działa na kolejny dzień (S-07 F2, zaakceptowane); CI nie uruchamia pgTAP; smoke nie steruje datą; jedyny test TS to `npm run test:unit` dla `weekdays.ts`.

## Historical Context (from prior changes)

- `context/archive/2026-10-19-recurring-tasks-by-interval/plan.md` — model wystąpień wyliczanych i odhaczeń w osobnej tabeli; edycja rytmu poza zakresem.
- `context/archive/2026-10-20-recurring-tasks-by-weekdays/plan.md` — drugi rytm; jawny predykat zamiast `is_recurring` w wyzwalaczach BEFORE ROW.
- `context/archive/2026-10-20-recurring-occurrence-actions/` — stan `moved`, „pominięte” wyliczane, `is_rhythm_day`, przegląd z wymaganiem F3 dla S-10.

## Related Research

- `context/archive/2026-10-20-recurring-occurrence-actions/research.md` — model wystąpień i akcji na wystąpieniu.
- `context/archive/2026-10-20-recurring-tasks-by-weekdays/research.md` — rytm dni tygodnia.

## Open Questions

Decyzje produktowe, których PRD v2 nie rozstrzyga, a plan musi podjąć albo zadać użytkowniczce. Najmniejszy przypadek: zadanie codzienne dodane w poniedziałek, we środę nieodhaczone, użytkowniczka wyłącza powtarzanie.

1. **Czym jest zadanie po wyłączeniu?** Dziś (bez zmian w SQL) byłoby zwykłym otwartym zadaniem `todo` bez terminu, widocznym na liście tylko jeśli jego milestone jest najbliższy, i blokowałoby zamknięcie milestona. Alternatywy: zadanie oznaczone jako zrobione, usunięte albo zwykłe zadanie z terminem. Różnica jest widoczna na liście, przy zamykaniu milestona i w zamkniętym milestonie (wyłączenie jest tam dziś odrzucane).
2. **Dzisiejsze wystąpienie po wyłączeniu:** zostaje jako wiersz „routine” do końca dnia (zgodnie z kryterium akceptacji), czy znika od razu, bo zadanie przestało być powtarzalne? Dziś znika od razu.
3. **Kotwica „co X dni”:** czy zmiana interwału zeruje datę startu na dziś („od dziś”), czy zachowuje starą? Skutek: inne dni rytmu, inne sieroty, i możliwy konflikt klucza głównego z istniejącym `done`.
4. **„Pominięte wczoraj” po zmianie rytmu:** liczone ze starego czy z nowego rytmu (dziś z nowego, więc może zniknąć albo pojawić się)?
5. **Przyszłe wiersze `moved`:** usuwać przy zmianie rytmu czy ignorować w `today_list`; co z `moved` o dacie dzisiejszej.
6. **Czy zmiana rytmu jest dozwolona, gdy dzisiejsze wystąpienie jest już zrobione albo przeniesione.**
7. **Skąd można zmienić rytm:** tylko z formularza zadania pod milestonem, czy też z listy na dziś (FR-016 mówi „przy dodawaniu i edycji”, a dziś działa tylko tworzenie).
8. **Czy dozwolona jest zmiana typu rytmu** (interwał ↔ dni tygodnia) i **ponowne włączenie** wcześniej wyłączonego zadania (nowa historia czy ciągła).

Luki w badaniu (nie dotyczą zakresu pytań): scenariusze sierot i „duchów” wynikają z czytania SQL i nie były wykonane na lokalnej bazie; nie czytałam `src/types.ts`, `TaskRowActions` ani pełnego pliku RLS pod kątem ograniczeń kolumnowych na `tasks`; nie weryfikowałam, czy `initialValues` w `TaskFormDialog` wypełnia `repeat` z zadania (linie 59-68).
