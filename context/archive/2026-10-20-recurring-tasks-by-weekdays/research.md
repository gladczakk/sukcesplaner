---
date: 2026-10-20T09:27:13+02:00
researcher: Claude (Sonnet 5.5) dla Karolina Jurowicz
git_commit: 707797d692f3d2ee53d8ca88f464e8ab2e4a1fec
branch: master
repository: xDevs
topic: "Co w bazie kodu zakłada rytm „co X dni" i co musi dotknąć S-08 (zadanie z rytmem w wybrane dni tygodnia wraca na listę na dziś)"
tags: [research, codebase, recurrence, today-list, tasks, forms, weekdays]
status: complete
last_updated: 2026-10-20
last_updated_by: Claude (Sonnet 5.5) dla Karolina Jurowicz
---

# Research: S-08 — rytm w wybrane dni tygodnia

**Date**: 2026-10-20T09:27:13+02:00
**Researcher**: Claude (Sonnet 5.5) dla Karolina Jurowicz
**Git Commit**: 707797d692f3d2ee53d8ca88f464e8ab2e4a1fec
**Branch**: master
**Repository**: xDevs

## Research Question

Zmiana `recurring-tasks-by-weekdays` (S-08 w `context/foundation/roadmap.md`, FR-016, FR-017, US-02 z `context/foundation/prd-v2.md`): użytkownik wybiera przy tworzeniu zadania dni tygodnia (np. środa i piątek), a zadanie pojawia się na liście na dziś w te dni „na tych samych zasadach co zadanie z rytmem co X dni" (od dnia dodania do daty milestona włącznie albo do jego zamknięcia, na górze listy, z odhaczeniem wystąpienia). Co w obecnym kodzie (po S-07) koduje rytm jako pojedynczy interwał i co każde z tych miejsc założyłoby lub z czym by kolidowało, gdyby obok interwału pojawił się wybór dni tygodnia.

Badanie jest tylko do odczytu; nie projektuje rozwiązania ani nie rozstrzyga decyzji produktowych.

## Summary

- **Cały model rytmu opiera się na jednej kolumnie `tasks.recurrence_interval_days`.** Nie ma kolumny na dni tygodnia ani rozróżnienia rodzaju rytmu (`supabase/migrations/20261019120000_recurring_tasks.sql:24-26`). Wyszukiwanie w migracjach i testach pgTAP nie znalazło żadnej funkcji dnia tygodnia (`extract`, `isodow`, `dow`) ani typu tablicowego/bitmaski; kodowanie dni (ISO 1–7 czy 0–6) nie jest nigdzie wybrane.
- **„Zadanie powtarzalne" jest w SQL rozpoznawane wyłącznie przez `recurrence_interval_days IS [NOT] NULL`.** W sprawdzonej migracji S-07 jest to sześć miejsc: ograniczenie kształtu (`:33-37`), walidacja odhaczenia (`:107`), licznik zamknięcia milestona (`:154`), wyjątek reguły zamkniętego milestona (`:203`), wykluczenie z `open_tasks` (`:276`) i gałąź `routine` listy (`:333`). Zadanie z samym zbiorem dni tygodnia (interwał NULL) byłoby w tych miejscach traktowane jak zwykłe zadanie niepowtarzalne albo odrzucane.
- **Dwa ograniczenia bezpośrednio kolidują z zadaniem „dni tygodnia + start, bez interwału".** `tasks_recurrence_pair_check` wymaga, by interwał i data startu były oba NULL albo oba ustawione (`:31-32`), więc zadanie z samą datą startu jest odrzucane (test pgTAP tego odrzucenia: `core_domain_recurring_tasks.test.sql:186-191`). `tasks_recurrence_shape` jest zależne tylko od interwału (`:33-37`), więc zadanie z dniami tygodnia bez interwału nie podlegałoby zakazowi terminu, statusu `done`/`partial` i przeniesienia.
- **Predykat dnia wystąpienia jest zapisany dwa razy i oba wystąpienia zakładają interwał:** `(p_today - recurrence_start_date) % recurrence_interval_days = 0` w `today_list` (`:335`) i `(new.occurrence_date - task_start) % task_interval <> 0` w wyzwalaczu odhaczenia (`:123`). W wyzwalaczu dla NULL-owego interwału wynik `% NULL` jest NULL, więc warunek `<> 0` nie jest prawdziwy i taka kontrola nie odrzuciłaby żadnego dnia (poza wcześniejszym odrzuceniem „zadanie nie jest powtarzalne" z `:107`).
- **Warstwa aplikacji zakłada jedną liczbę całkowitą w każdym z sprawdzonych miejsc:** schemat zod, mapowanie formularza (`none/daily/every`), `formatRecurrence(intervalDays: number)`, typ `TodayRoutine.interval_days: number`, test „czy zadanie jest powtarzalne" na stronie projektu i w `TaskRowActions`, ustalanie daty startu w `createTask`.
- **Brak w repozytorium kontrolki do wyboru kilku z siedmiu elementów.** `src/components/ui/` zawiera tylko `LibBadge.astro`, `alert-dialog`, `button`, `confirm-dialog`, `dialog`, `field`, `input`, `select`, `textarea`; `Field` przyjmuje jedno dziecko i jeden `id`. Design system opisuje filtr „Chip" (`<button aria-pressed>`) jako zaprojektowany, ale nieprzeniesiony do kodu.
- **Dwa formularze tworzenia zadania powielają logikę rytmu**, więc każda zmiana kontrolki rytmu musi być wykonana w obu (`TaskFormDialog.tsx` i `AddTaskFromTodayDialog.tsx`), a podgląd rytmu tylko do odczytu istnieje tylko w pierwszym.

## Detailed Findings

### Baza danych: miejsca zależne od interwału

Skrót: RT = `supabase/migrations/20261019120000_recurring_tasks.sql`, MD = `supabase/migrations/20261019130000_milestone_date_covers_routines.sql`, RTT = `supabase/tests/database/core_domain_recurring_tasks.test.sql`.

- **Kolumny** `recurrence_interval_days smallint null`, `recurrence_start_date date null` (RT:24-26). Data startu jest w sprawdzonych miejscach używana tylko jako początek przedziału (`p_today between start and data milestona`).
- **`tasks_recurrence_interval_check`**: `interval between 1 and 30` (RT:29-30). NULL przechodzi, więc samo ograniczenie nie koliduje z zadaniem bez interwału.
- **`tasks_recurrence_pair_check`**: `(interval is null) = (start is null)` (RT:31-32) — kolizja opisana w Summary.
- **`tasks_recurrence_shape`**: rutyna ma `due_date IS NULL`, status `todo` i `deferred_until IS NULL`, ale tylko gdy interwał nie jest NULL (RT:33-37). Test RTT:193-225 sprawdza to dla terminu, `done`, `partial`, `deferred_until` i aktualizacji na `done`.
- **Wyzwalacz `check_task_occurrence`** (RT:82-135) odczytuje interwał, datę startu, datę i stan zamknięcia milestona; odrzuca zadanie bez interwału (`:107`), zamknięty milestone (`:112-115`), dzień poza przedziałem start..data milestona (`:117`) i dzień niepasujący do interwału (`:123`). Komunikaty zawierające `Wystapienie` są kontraktem tekstowym z `src/lib/services/tasks.ts`.
- **`check_milestone_closable`** (RT:141-164) liczy niezrobione zadania z `recurrence_interval_days IS NULL` (`:154`); zadanie z samymi dniami tygodnia i interwałem NULL zostałoby policzone jako niezrobione zadanie niepowtarzalne i blokowałoby zamknięcie (test RTT:247-252 sprawdza komunikat z liczbą 1).
- **`check_task_rules`** (RT:170-220): wyjątek dla rutyny w zamkniętym milestonie testuje `recurrence_interval_days IS NOT NULL` (`:203`); sprawdzenie startu względem daty milestona (`:212`) zależy tylko od daty startu. Lista kolumn wyzwalacza `tasks_check_rules` (RT:225) to `due_date, milestone_id, status, recurrence_start_date, recurrence_interval_days` — nowa kolumna na dni tygodnia musiałaby tam trafić, by jej sama aktualizacja uruchamiała kontrole.
- **`check_milestone_date_covers_tasks`** (MD:10-32) porównuje `t.due_date` i `t.recurrence_start_date` z nową datą milestona; zależy od daty startu, nie od rodzaju rytmu. W sprawdzonych plikach nie ma kontroli „w przedziale start..data milestona jest co najmniej jedno wystąpienie" dla żadnego rytmu.
- **`today_list(date)`** (RT:240-369): `open_tasks` wyklucza zadania z interwałem (`:276`), a gałąź `routine` wymaga `recurrence_interval_days IS NOT NULL` i `(p_today - start) % interval = 0` (`:333-335`). Ostatnia kolumna wyniku to `task_recurrence_interval_days smallint`; zmiana kolumn wyniku wymaga ponownego `drop function` + `create function` (jak w S-07), z uzupełnieniem kolumn pomocniczych `null::…` w gałęziach `union all` (RT:295, 312, 329).
- **`task_occurrences`** (RT:47-77): klucz główny `(task_id, occurrence_date)`, `state` ograniczony do `done`, trzy polityki RLS bez update — nie zawiera założeń o rodzaju rytmu i dopuszcza jedno odhaczenie na dzień.

### Arytmetyka dat w SQL

- W migracjach S-07 i ich testach użyte są `date - date` (liczba całkowita dni), `%`, `between` i operatory porównania; `p_today` jest zwykłym parametrem `date` (funkcja `strict`, `stable`) przekazywanym przez aplikację jako data warszawska. SQL nie ma obsługi stref czasowych.
- Wyszukiwanie `grep -n "extract\|isodow\|dow"` w `supabase/migrations/*.sql` zwróciło jedno trafienie: komentarz w RT:233, gdzie `dow` jest fragmentem słowa „dowolnego". To nie jest użycie żadnej funkcji dnia tygodnia, więc w sprawdzonych migracjach `extract`/`isodow` nie występują. Wybór kodowania dni tygodnia i typu przechowywania (tablica, bitmaska, osobne kolumny logiczne) nie jest rozstrzygnięty w repozytorium.

### Warstwa aplikacji (TypeScript, UI, smoke)

- **`src/lib/validation/task.ts`**: `TASK_FIELDS` zawiera `recurrence_interval_days`; `taskCreateSchema` ma jedno pole liczbowe 1..30 z komunikatem „Podaj liczbę dni od 2 do 30" i regułę wykluczania z `due_date`; `RecurrenceMode = "none"|"daily"|"every"`, `RECURRENCE_MODE_OPTIONS`, `readRecurrenceInterval(mode, days)` mapuje tryb i tekst na `{value: number|null, error?}`. `taskInputSchema` (PUT) nie ma rytmu, więc zod go pomija. Błędy pól są przekazywane do UI tylko dla kluczy z `TASK_FIELDS` (`flattenTaskErrors`, `readFieldErrors` w `use-task-api.ts`).
- **`src/lib/format.ts:39-42`** `formatRecurrence(intervalDays: number)` zwraca „codziennie" albo „co N dni"; przyjmuje liczbę, więc nie opisuje zbioru dni.
- **`src/lib/services/tasks.ts`**: `createTask` rozwija wejście do `insert` i ustawia `recurrence_start_date = interval === null ? null : todayInWarsaw()` (`:103-110`), więc data startu zależy od interwału; `translateError` mapuje `tasks_recurrence_shape`, `Powtarzanie zadania` (pole `recurrence_interval_days`) i `tasks_recurrence_interval_check`; `completeOccurrence` nie zależy od rodzaju rytmu, a odrzucenie dnia pochodzi z komunikatu `Wystapienie` wyzwalacza.
- **Typy i odczyt listy**: `TodayRoutine.interval_days: number` (`src/types.ts`), `src/lib/services/today.ts:32` mapuje `task_recurrence_interval_days`; wygenerowany typ wyniku RPC oznacza tę kolumnę jako nienullowalną, mimo że SQL zwraca NULL poza wierszami `routine`.
- **Widoki**: `src/pages/today.astro` pokazuje etykietę przez `formatRecurrence(routine.interval_days)`; `src/pages/projects/[id].astro:187-188` pokazuje etykietę z `recurrence_interval_days`, a `:202` przekazuje to pole do `TaskRowActions`, gdzie `:65` ukrywa przełącznik statusu, gdy `recurrence_interval_days !== null` — to jedyne miejsce na stronie projektu rozpoznające rutynę.
- **Formularze**: `TaskFormDialog.tsx` i `AddTaskFromTodayDialog.tsx` mają identyczny stan (`repeat` + tekst liczby dni), ten sam szkielet submit (`readRecurrenceInterval` → `taskCreateSchema.safeParse` → scalenie błędu rytmu → kontrola terminu) i ten sam markup (`Select` trybu + `Field` z `Input type="number"` dla „Co X dni"); tylko `TaskFormDialog` ma tryb edycji z rytmem tylko do odczytu (`formatRecurrence`).
- **Smoke** (`scripts/smoke.mjs`): kroki rutyn zakładają rytm jako `recurrence_interval_days: 3`, etykietę „co 3 dni" i licznik „2 pozycje"; pozostają ważne, o ile interwał nadal działa i pole `recurrence_interval_days` wraca w ciele zadania.

### Kontrolki i zasady repozytorium

- `Select` to natywny `<select>` (`options`, `onChange(value)`); `Field` klonuje jedno dziecko, dodając `aria-invalid`, `aria-describedby`, `aria-required`, i renderuje jedną etykietę dla jednego `id`, więc grupa kontrolek wymaga opakowania (np. `fieldset`) poza `Field`.
- Lekcje w `context/foundation/lessons.md`: smoke musi asercją na treść sprawdzać wyspę React, a przed `npx shadcn@latest add` trzeba sprawdzić `registryDependencies` i nie nadpisywać dostosowanego `button.tsx`. `CLAUDE.md` wymaga sprawdzenia `src/components/ui/` przed tworzeniem komponentu, dodawania shadcn przez CLI, klas tokenowych zamiast kolorów/wartości arbitralnych i braku `"use client"`.
- `context/foundation/design-system/design-system.md` zawiera wpis „Chip (filter)" jako `<button aria-pressed>` (nieprzeniesiony do kodu) oraz zasady: pierścień fokusu 2 px, cele dotykowe ≥ 40 px, polskie odmiany i daty przez `Intl.DateTimeFormat('pl-PL')`, kalendarz od poniedziałku.

### Etykiety dni tygodnia po polsku

- W repozytorium nie ma pomocnika ani stałych z nazwami dni tygodnia; `src/lib/today.ts:43-53` ma `Intl.DateTimeFormat("pl-PL", { weekday: "long", ..., timeZone: "UTC" })` do nagłówka listy, a `src/lib/format.ts` formatuje daty tym samym wzorcem (`timeZone: "UTC"`). Funkcji zwracającej dzień tygodnia dla daty `YYYY-MM-DD` nie znaleziono w sprawdzonych plikach.

## Code References

- `supabase/migrations/20261019120000_recurring_tasks.sql:24-37` — kolumny rytmu i ograniczenia `interval_check`, `pair_check`, `shape`
- `supabase/migrations/20261019120000_recurring_tasks.sql:82-135` — wyzwalacz odhaczenia (`:107` rozpoznanie rutyny, `:123` predykat interwału)
- `supabase/migrations/20261019120000_recurring_tasks.sql:141-164` — `check_milestone_closable` (`:154`)
- `supabase/migrations/20261019120000_recurring_tasks.sql:170-227` — `check_task_rules` (`:203`) i lista kolumn wyzwalacza (`:225`)
- `supabase/migrations/20261019120000_recurring_tasks.sql:240-369` — `today_list` (`:276`, `:333-335`)
- `supabase/migrations/20261019130000_milestone_date_covers_routines.sql:10-32` — pokrycie daty milestona
- `supabase/tests/database/core_domain_recurring_tasks.test.sql:11,179-225` — plan 61 i testy ograniczeń
- `src/lib/validation/task.ts` — schemat, tryby formularza, `readRecurrenceInterval`
- `src/lib/format.ts:39-42` — `formatRecurrence`
- `src/lib/services/tasks.ts:49-63,103-110,193-215` — mapowanie błędów, data startu, odhaczenie
- `src/lib/services/today.ts:32`, `src/types.ts` — `TodayRoutine.interval_days`
- `src/pages/projects/[id].astro:187-202`, `src/components/projects/TaskRowActions.tsx:13,65`
- `src/components/projects/TaskFormDialog.tsx`, `src/components/today/AddTaskFromTodayDialog.tsx`
- `src/components/ui/` — dostępne prymitywy (brak checkboxa, przełącznika, wyboru wielu)

## Architecture Insights

- Rozpoznawanie rutyny przez `interval IS NOT NULL` jest rozproszone po sześciu miejscach SQL i pięciu miejscach TS; wprowadzenie drugiego rodzaju rytmu zmienia sens tego predykatu wszędzie naraz, więc plan musi albo wprowadzić jedno wspólne miejsce definicji „zadanie powtarzalne", albo świadomie zmienić każde z tych miejsc.
- Reguły kształtu i reguły milestona są egzekwowane w bazie, a komunikaty błędów są kontraktem tekstowym z serwisami TS (podejście z S-07); to samo dotyczy każdej nowej reguły dla dni tygodnia.
- Kwalifikacja pozycji listy mieszka w jednej funkcji SQL testowanej w pgTAP ze stałą datą (CI nie uruchamia pgTAP); logika dnia tygodnia nadal wymaga testu ze stałym `p_today`.

## Historical Context (from prior changes)

- `context/archive/2026-10-19-recurring-tasks-by-interval/plan.md` — S-07 świadomie wyłączył dni tygodnia z zakresu („What We're NOT Doing", pierwszy punkt) i zbudował model pod interwał (poparte: czytane w tej sesji).
- `context/archive/2026-10-19-recurring-tasks-by-interval/research.md` — model wystąpień jest wyliczany w SQL (nie wiersze), a stan zapisuje tylko `task_occurrences`; ta decyzja dotyczy też S-08 (poparte).
- `context/archive/2026-10-19-recurring-tasks-by-interval/reviews/impl-review.md` — F1: data milestona przesunięta przed start rutyny była po cichu usuwana z listy i została naprawiona w MD; ta sama kontrola zależy od daty startu, nie od rodzaju rytmu (poparte). F2: odhaczenie liczone po stronie serwera dla dnia „dziś" jest znanym, zaakceptowanym ograniczeniem (poparte).
- `context/foundation/prd-v2.md` — „Rytm tygodniowy i miesięczny (co tydzień, co miesiąc)" jest w Non-Goals, a „wybrane dni tygodnia" w zakresie (FR-016); PRD nie definiuje, czy wybór jednego dnia tygodnia jest równoważny rytmowi „co tydzień" (poparte: tekst PRD v2 sekcje Scope of Change i Non-Goals).

## Related Research

- `context/archive/2026-10-19-recurring-tasks-by-interval/research.md`

## Open Questions

Luki i decyzje, które muszą zapaść w planie (nie są rozstrzygnięte tym badaniem):

1. **Przechowywanie zbioru dni.** Kolumna tablicowa, bitmaska czy siedem kolumn logicznych oraz kodowanie dni (ISO 1–7 czy 0–6); a także czy rodzaj rytmu dostaje jawny dyskryminator, czy wynika z tego, która kolumna jest ustawiona.
2. **Wzajemne wykluczanie rytmów.** Czy zadanie może mieć jednocześnie interwał i dni tygodnia (zapewne nie), i jakim ograniczeniem to wymusić, skoro `tasks_recurrence_pair_check` i `tasks_recurrence_shape` są dziś oparte na samym interwale.
3. **Wspólna definicja „zadania powtarzalnego".** Jak zastąpić sześć miejsc SQL i pięć miejsc TS opartych na `interval IS NOT NULL` (jeden predykat/funkcja czy rozszerzenie każdego miejsca).
4. **Pierwsze wystąpienie.** Zadanie dodane w dzień niewybrany: pierwsze wystąpienie to najbliższy wybrany dzień po dniu dodania. Zadanie dodane w wybrany dzień: czy wystąpienie jest tego dnia (analogicznie do interwału „pierwsze wystąpienie jest tego dnia") — PRD tego dla dni tygodnia nie mówi wprost.
5. **Granice zbioru dni.** Minimum jeden dzień? Czy wybór wszystkich siedmiu dni jest równoważny „codziennie"? Czy wybór jednego dnia jest „co tydzień", które PRD wyłącza w Non-Goals?
6. **Kontrolka wyboru dni** (siedem przycisków przełączanych, pola wyboru, inne) i sposób jej dodania w świetle lekcji o `shadcn add`, reguły „sprawdź `src/components/ui/`" i niezaimplementowanego „Chip" z design systemu; plus obsługa `Field` (jedno dziecko).
7. **Etykieta rytmu** w liście i na stronie projektu (np. skróty dni, „w środy i piątki") oraz kolejność dni (tydzień od poniedziałku wg design systemu).
8. **Kolumny wyniku `today_list`.** Nowa kolumna z dniami tygodnia lub typem rytmu wymaga ponownego `drop function` + `create function` i zmiany `TodayRoutine` (dziś `interval_days: number`).
9. **Kolizje z równoległymi zmianami.** S-09 (pominięte i przenoszenie) i S-10 (edycja rytmu) dotykają tych samych funkcji SQL i widoków; kolejność migracji i wspólna definicja „zadania powtarzalnego" muszą to uwzględnić.
10. **Testy.** Zmiana semantyki `tasks_recurrence_pair_check` i `tasks_recurrence_shape` wymaga zmiany asercji w `core_domain_recurring_tasks.test.sql` (m.in. `:179-225`) i dopasowania `plan(61)`; smoke nie sprawdza dziś żadnego dnia tygodnia, a CI nie uruchamia pgTAP.
