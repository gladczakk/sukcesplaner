# Rytm w wybrane dni tygodnia Implementation Plan

## Overview

S-08 (M-2, FR-016/FR-017, US-02) dodaje drugi rytm obok „codziennie / co X dni": przy tworzeniu zadania użytkownik wybiera od 1 do 7 dni tygodnia (np. środa i piątek), a zadanie pojawia się na liście na dziś w te dni, na tych samych zasadach co rytm interwałowy (od dnia dodania do daty milestona włącznie albo do jego zamknięcia, na górze listy, z odhaczeniem wystąpienia). Dni są przechowywane w osobnej kolumnie tablicowej (ISO 1–7), wykluczającej się z interwałem; „zadanie powtarzalne" to jedna kolumna wyliczana zamiast rozproszonych testów `interval IS NOT NULL`.

## Current State Analysis

- Cały model rytmu opiera się na `tasks.recurrence_interval_days` (smallint, 1..30) i `recurrence_start_date`; nie ma kolumny na dni tygodnia ani rozróżnienia rodzaju rytmu (`supabase/migrations/20261019120000_recurring_tasks.sql:24-26`).
- „Zadanie powtarzalne" to w SQL `recurrence_interval_days IS [NOT] NULL` w sześciu miejscach: `tasks_recurrence_shape` (`:33-37`), `check_task_occurrence` (`:107`), `check_milestone_closable` (`:154`), wyjątek w `check_task_rules` (`:203`), `open_tasks` (`:276`) i gałąź `routine` w `today_list` (`:333`) (`research.md`).
- `tasks_recurrence_pair_check` wymaga, by interwał i data startu były oba NULL albo oba ustawione (`:31-32`); zadanie z samymi dniami tygodnia (start bez interwału) byłoby odrzucone, a `tasks_recurrence_shape` nie obejmowałoby go zakazem terminu, statusu `done`/`partial` i przeniesienia.
- Predykat dnia wystąpienia jest zapisany dwa razy i oba zakładają interwał: `(p_today - start) % interval = 0` w `today_list` (`:335`) i w wyzwalaczu odhaczenia (`:123`); przy interwale NULL wyzwalacz nie odrzuciłby żadnego dnia (`% NULL`).
- W SQL nie ma funkcji dnia tygodnia (`extract`, `isodow`); `p_today` to data warszawska przekazywana z aplikacji.
- Warstwa aplikacji zakłada jedną liczbę: schemat zod `taskCreateSchema`, `RECURRENCE_MODE_OPTIONS` (`none/daily/every`), `readRecurrenceInterval`, `formatRecurrence(intervalDays: number)`, `TodayRoutine.interval_days: number`, test „powtarzalne" w `TaskRowActions.tsx:65` i `projects/[id].astro:187-188`, data startu w `createTask` (`tasks.ts:103-110`).
- `src/components/ui/` nie ma kontrolki do wyboru kilku z siedmiu pozycji; `Field` przyjmuje jedno dziecko; design system opisuje „Chip (filter)" (`<button aria-pressed>`) jako nieprzeniesiony do kodu. Formularze `TaskFormDialog.tsx` i `AddTaskFromTodayDialog.tsx` powielają logikę rytmu.

## Desired End State

Użytkownik tworzy zadanie z rytmem „W wybrane dni tygodnia" w obu formularzach, wybierając dni przyciskami pn–nd (min. 1). Na stronie projektu i na liście na dziś rytm jest opisany skrótami („pn, śr, pt", a komplet siedmiu dni jako „codziennie"). W wybrane dni zadanie jest na górze listy `/today` i można je odhaczyć; dzień dodania liczy się jako wystąpienie, jeśli jest wybrany. Zamknięcie milestona nie jest blokowane, a po dacie milestona rutyna nie wraca. Zadania z interwałem działają bez zmian. Weryfikacja: `npx supabase test db`, `npm run lint` (pliki zmiany), `npx astro check`, `npm run build`, `npm run smoke`, ręczny przegląd UI.

### Key Discoveries:

- Wartość stored generated column nie jest dostępna w wyzwalaczach `BEFORE ROW` (Postgres liczy ją po nich), więc wyzwalacze i ograniczenia muszą używać jawnego warunku `recurrence_interval_days IS NOT NULL OR recurrence_weekdays IS NOT NULL`; kolumna `is_recurring` służy zapytaniom (`today_list`, `check_milestone_closable`, odczyt w TS).
- Ograniczenia `tasks_recurrence_pair_check` i `tasks_recurrence_shape` są dopasowywane po nazwie przez serwis TS i testy pgTAP (`src/lib/services/tasks.ts:49-63`, `core_domain_recurring_tasks.test.sql:179-225`), więc należy je odtworzyć pod tą samą nazwą z nową treścią.
- Tablicy nie da się walidować w `CHECK` podzapytaniem, więc niepustość, zakres 1–7 i brak duplikatów wymagają funkcji pomocniczej `immutable` używanej w ograniczeniu.
- `extract(isodow from date)` zwraca typ liczbowy nie `smallint`, więc porównanie z `smallint[]` wymaga rzutowania.
- `today_list` trzeba odtworzyć (`drop function` + `create function`, ta sama sygnatura `(date)`, ponowne nadanie uprawnień) przy zmianie kolumn wyniku, z uzupełnieniem kolumn `null::…` w każdej gałęzi `union all` (`recurring_tasks.sql:295,312,329`).
- Wzorzec komunikatów błędów SQL↔TS (dopasowanie po tekście) i wzorzec testów pgTAP ze stałą datą `p_today` obowiązują tak jak w S-07.
- Znana pułapka środowiska: `npm run build` przy działającym `astro preview` pada na blokadzie `dist`; przed buildem zawsze `npx astro preview stop` (S-07).

## What We're NOT Doing

- „Pominięte" i przenoszenie wystąpienia (S-09), zmiana rytmu i wyłączenie powtarzania (S-10): w edycji rytm dni tygodnia jest tylko do odczytu.
- Osobna opcja „co tydzień" ani rytm miesięczny; jeden wybrany dzień daje tygodniowy efekt bez nowej opcji.
- Zmiany zachowania rytmu interwałowego.
- Własny deadline rutyny, liczniki i statystyki, odznaki i kolory (FR-018 pozostaje w Parked).
- Wyodrębnienie hooka `use-reload-action` i refaktoryzacja szkieletu wysp; wspólny komponent dla duplikatu formularzy (duplikacja zostaje, jak w S-07).
- Normalizacja kolejności dni w bazie (kolejność wyświetlania jest ustalana w etykiecie).
- Zmiany w CI i zdalny `db push` (robi użytkownik).

## Implementation Approach

Logika kwalifikacji zostaje w SQL (testowalna w pgTAP ze stałą datą), niezmienniki w ograniczeniach i wyzwalaczach, komunikaty błędów jako kontrakt tekstowy z serwisami — jak w S-07. Jeden rytm na zadanie: interwał albo dni tygodnia, wymuszone ograniczeniem. Fazy idą od bazy do UI: schemat i testy, tworzenie przez API z etykietą, kontrolka i formularze, lista na dziś.

Decyzje z wywiadu: od 1 do 7 wybranych dni (jeden dzień = tygodniowo, doprecyzowanie Non-Goal w PRD); wystąpienie jest tego samego dnia, jeśli dzień dodania jest wybrany (spójne z interwałem); dni w kolumnie tablicowej ISO 1–7 plus wyliczana `is_recurring`; kontrolka to siedem przycisków przełączanych (`aria-pressed`) według „Chip (filter)" z design systemu, bez shadcn; etykieta to skróty w kolejności od poniedziałku („pn, śr, pt"), komplet siedmiu dni jako „codziennie".

## Critical Implementation Details

- **State sequencing.** Migracja w jednej transakcji: dodaj kolumny i funkcję walidacji, zdejmij `tasks_recurrence_pair_check` i `tasks_recurrence_shape`, dodaj je ponownie pod tą samą nazwą z nową treścią, dopiero potem `create or replace` funkcji zależnych i na końcu `drop function` + `create function today_list(date)` z ponownym nadaniem uprawnień. Istniejące wiersze mają same interwały lub NULL, więc nowe ograniczenia przechodzą.
- **Predykat rutyny w wyzwalaczach i ograniczeniach.** Używaj jawnego `interval IS NOT NULL OR weekdays IS NOT NULL` (nie `is_recurring`), bo kolumna wyliczana nie jest jeszcze widoczna w `BEFORE ROW`; `is_recurring` stosuj w zapytaniach i w TypeScript.
- **Dzień tygodnia.** Dzień z daty to `extract(isodow from <data>)::smallint` (1 = poniedziałek … 7 = niedziela) na dacie warszawskiej `p_today` i na `occurrence_date`; porównanie przez `= any(recurrence_weekdays)`. Nigdy nie używaj `current_date`.

## Faza 1: Baza danych — dni tygodnia i lista

### Overview

Jedna migracja dodaje kolumnę dni z ograniczeniami, kolumnę `is_recurring`, dostosowuje ograniczenia kształtu, wyzwalacze i `today_list`, a testy pgTAP z przykładem środa + piątek i zregenerowane typy zamykają fazę. Po niej logika kwalifikacji działa i jest przetestowana bez UI.

### Changes Required:

#### 1. Migracja dni tygodnia

**File**: `supabase/migrations/20261020120000_recurring_weekdays.sql` (nowy)

**Intent**: Dodać do `tasks` zbiór dni tygodnia jako drugi rytm, wykluczający się z interwałem, oraz wspólny wskaźnik „zadanie powtarzalne". Komentarze po polsku, ASCII, jak w istniejących migracjach.

**Contract**:
- Kolumna `recurrence_weekdays smallint[] null` (numery dni ISO: 1 = poniedziałek … 7 = niedziela).
- Funkcja pomocnicza `public.weekdays_valid(smallint[])` (`immutable`, `security invoker`, `search_path = ''`): prawda, gdy tablica ma od 1 do 7 elementów, żaden nie jest NULL ani spoza 1..7 i nie ma duplikatów; ograniczenie `tasks_recurrence_weekdays_check`: `recurrence_weekdays is null or public.weekdays_valid(recurrence_weekdays)`.
- Ograniczenie `tasks_recurrence_one_rhythm_check`: nie wolno mieć jednocześnie interwału i dni tygodnia.
- Kolumna wyliczana `is_recurring boolean generated always as (recurrence_interval_days is not null or recurrence_weekdays is not null) stored`.
- `tasks_recurrence_pair_check` odtworzone pod tą samą nazwą: `(recurrence_interval_days is not null or recurrence_weekdays is not null) = (recurrence_start_date is not null)`.
- `tasks_recurrence_shape` odtworzone pod tą samą nazwą: gdy rytm jest ustawiony (interwał lub dni), zadanie ma `due_date IS NULL`, `status = 'todo'`, `deferred_until IS NULL`.

#### 2. Wyzwalacze i reguły zamykania

**File**: `supabase/migrations/20261020120000_recurring_weekdays.sql`

**Intent**: Rozpoznać zadanie z dniami tygodnia jako powtarzalne w każdym miejscu, które dziś testuje interwał, i sprawdzać zgodność odhaczenia z dniami.

**Contract**:
- `check_task_occurrence` (`create or replace`): czyta także `recurrence_weekdays`; odrzuca zadanie bez żadnego rytmu komunikatem `Wystapienie dotyczy zadania, ktore nie jest powtarzalne`; dla interwału zachowuje predykat modulo, a dla dni tygodnia odrzuca dzień, którego `isodow` nie należy do tablicy, komunikatem `Wystapienie (%) nie pasuje do rytmu zadania` (ten sam tekst); zakres start..data milestona i zamknięty milestone bez zmian. Gałęzie są rozłączne, by NULL nie przepuszczał dnia.
- `check_milestone_closable` (`create or replace`): licznik niezrobionych zadań pomija zadania z `is_recurring`; komunikat bez zmian.
- `check_task_rules` (`create or replace`): wyjątek dla rutyny w zamkniętym milestonie używa jawnego warunku `interval is not null or weekdays is not null` (nie `is_recurring`); reszta bez zmian.
- Wyzwalacz `tasks_check_rules`: lista kolumn rozszerzona o `recurrence_weekdays`.

#### 3. Funkcja listy na dziś

**File**: `supabase/migrations/20261020120000_recurring_weekdays.sql`

**Intent**: Pokazać rutyny z dniami tygodnia jako wiersze `routine` i zwrócić dni do etykiety, nie zmieniając zachowania pozostałych rodzajów.

**Contract**: `drop function public.today_list(date)` i `create function public.today_list(p_today date)` z tą samą sygnaturą i kolumnami plus `task_recurrence_weekdays smallint[]` (NULL poza wierszami `routine`). `open_tasks` pomija zadania z `is_recurring`. Gałąź `routine`: zadanie z `is_recurring` w niezamkniętym milestonie, dla którego `p_today between recurrence_start_date and data milestona` i spełniony jest właściwy dla rytmu warunek: interwał `(p_today - start) % interval = 0` albo dni `extract(isodow from p_today)::smallint = any(recurrence_weekdays)`, oraz brak odhaczenia dla `(task, p_today)`. Kolejność, `strict`, `stable`, `security invoker`, `revoke`/`grant` bez zmian; do każdej gałęzi `union all` dopisana kolumna `null::smallint[]` tam, gdzie nie dotyczy.

#### 4. Testy pgTAP

**File**: `supabase/tests/database/core_domain_recurring_weekdays.test.sql` (nowy)

**Intent**: Pokryć ze stałą datą dni tygodnia, granice, ograniczenia, odhaczenia i nietknięty interwał.

**Contract**: przykład środa + piątek: zadanie z dniami `{3,5}`, start 2026-10-21 (środa), milestone do 2026-10-30 (piątek). Przypadki po polsku: wystąpienie w środę 21 i piątek 23, 28 i 30, brak w pn/wt/cz/so/nd i przed startem; dzień dodania jest wystąpieniem, gdy jest wybrany; ostatni dzień równy dacie milestona widoczny (piątek 30), następny nie; zadanie z jednym dniem; komplet siedmiu dni daje wystąpienie codziennie; odhaczenie wybranego dnia ukrywa wystąpienie, niewybranego jest odrzucone komunikatem `nie pasuje do rytmu`; dzień po dacie milestona odrzucony; zamknięcie milestona z samą rutyną dni przechodzi, a z niezrobionym zadaniem niepowtarzalnym nadal jest blokowane; rutyna dni nad zadaniem przeterminowanym; ograniczenia: interwał razem z dniami, pusta tablica, wartość 0 i 8, duplikat, NULL w tablicy, dni bez daty startu, dni z `due_date`, `done`, `partial` i `deferred_until`; kolumna `is_recurring` prawdziwa dla dni i interwału, fałszywa dla zwykłego zadania; przesunięcie daty milestona przed start rutyny dni odrzucone (istniejący wyzwalacz); interwał nadal działa (kilka asercji regresji). Istniejące pliki testów bez zmian poza ewentualnymi poprawkami zgodnymi z nowymi ograniczeniami.

#### 5. Typy bazy

**File**: `src/db/database.types.ts` (generowany)

**Intent**: Odzwierciedlić `recurrence_weekdays`, `is_recurring` i `task_recurrence_weekdays` w `today_list`.

**Contract**: wynik `npx supabase gen types typescript --local > src/db/database.types.ts` po `npx supabase db reset`, uruchomiony w Git Bash (nie PowerShell 5.1: UTF-16 z BOM); diff ma dotyczyć wyłącznie tych trzech obszarów, w razie innych zmian przywrócić plik z gita i dopisać ręcznie w tym samym kształcie; plik pozostaje UTF-8 z końcami LF.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się czysto na świeżej bazie: `npx supabase db reset`
- Wszystkie testy pgTAP przechodzą, istniejące 209 i nowe: `npx supabase test db`
- Typy zawierają `recurrence_weekdays`, `is_recurring` i `task_recurrence_weekdays` w wyniku `today_list`, a diff pliku jest ograniczony do tych zmian
- Lint plików zmiany i sprawdzenie typów przechodzą: `npm run lint` (z zastrzeżeniem bazowych błędów spoza S-08) oraz `npx astro check`

#### Manual Verification:

- Na lokalnych danych z rutynami interwałowymi z S-07 `select * from public.today_list(<dziś>)` zwraca ten sam zestaw i kolejność wierszy co przed migracją
- Ręczne `update milestones set completed_at = now()` na milestonie z jedną rutyną dni tygodnia i bez innych niezrobionych zadań kończy się sukcesem

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Faza 2: Tworzenie zadania z dniami tygodnia (API)

### Overview

Walidacja, serwis i etykieta rytmu obsługują dni tygodnia; strona projektu rozpoznaje rutynę przez `is_recurring`; kroki smoke pokrywają tworzenie przez API. Kontrolka w formularzach jest w fazie 3.

### Changes Required:

#### 1. Walidacja i helpery

**File**: `src/lib/validation/task.ts`

**Intent**: Dodać dni tygodnia do schematu tworzenia i do mapowania formularza, z wzajemnym wykluczaniem z interwałem.

**Contract**: `TASK_FIELDS` zyskuje `"recurrence_weekdays"`, więc `FIELD_IDS` w obu formularzach muszą mieć nowy klucz. `taskCreateSchema` zyskuje `recurrence_weekdays` (tablica liczb całkowitych 1..7 bez duplikatów, 1–7 elementów, albo null; brak i pusty łańcuch = null) z regułami: interwał i dni się wykluczają (błąd na polu `recurrence_weekdays`) oraz rytm dowolnego rodzaju wyklucza `due_date` (błąd na `due_date`, jak dziś). `RecurrenceMode` rozszerzone o `"weekdays"`, `RECURRENCE_MODE_OPTIONS` o „W wybrane dni tygodnia"; nowy `readRecurrenceWeekdays(mode, selected)` zwraca `{ value: number[] | null, error? }` z komunikatem „Wybierz co najmniej jeden dzień tygodnia". `taskInputSchema` (PUT) bez zmian. Wspólne stałe dni w jednym miejscu: numery ISO i skróty „pn, wt, śr, cz, pt, so, nd" w kolejności od poniedziałku.

#### 2. Etykieta rytmu

**File**: `src/lib/format.ts`

**Intent**: Opisać rytm niezależnie od rodzaju, w jednym miejscu.

**Contract**: `formatRecurrence` przyjmuje opis rytmu z interwałem i dniami (np. `{ intervalDays: number | null; weekdays: readonly number[] | null }`) i zwraca „codziennie" (interwał 1 albo komplet siedmiu dni), „co N dni" (z odmianą przez `plural`) lub skróty dni posortowane od poniedziałku („pn, śr, pt"). Wywołania w `today.astro`, `projects/[id].astro` i `TaskFormDialog.tsx` są dostosowane do nowej sygnatury.

#### 3. Serwis i błędy

**File**: `src/lib/services/tasks.ts`

**Intent**: Zapisać dni razem z datą startu i tłumaczyć nowe błędy bazy.

**Contract**: `createTask` ustawia `recurrence_start_date = todayInWarsaw()`, gdy podano interwał albo dni, w przeciwnym razie NULL; trasa POST (`.../tasks/index.ts`) nie wymaga zmian poza typem wejścia. `translateError` (kod `23514`): `tasks_recurrence_weekdays_check` → błąd pola `recurrence_weekdays` „Wybierz co najmniej jeden dzień tygodnia"; komunikat `Powtarzanie zadania` kierowany do pola aktywnego rytmu (`recurrence_weekdays`, gdy zadanie ma dni, w przeciwnym razie `recurrence_interval_days`); `tasks_recurrence_one_rhythm_check` → ogólny błąd walidacji; `tasks_recurrence_shape` bez zmian. Treść `RECURRING_STATE_ERROR` pozostaje (smoke ją sprawdza).

#### 4. Typy i rozpoznawanie rutyny w UI

**File**: `src/components/hooks/use-task-api.ts`, `src/components/projects/TaskRowActions.tsx`, `src/pages/projects/[id].astro`

**Intent**: Rozpoznawać zadanie powtarzalne przez `is_recurring` i pokazać etykietę z dniami.

**Contract**: `TaskApiCreateInput` podąża za typem schematu; `TaskRowActions` dostaje `is_recurring` (zamiast testu interwału) i dla rutyny nie renderuje przełącznika statusu; strona projektu pokazuje etykietę rytmu z interwałem lub dniami zamiast „bez terminu" i przekazuje `is_recurring` do wyspy. `Task` dziedziczy `recurrence_weekdays` i `is_recurring` z `database.types.ts`.

#### 5. Smoke API

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć w smoke tworzenie zadania z dniami tygodnia i błędy przez API.

**Contract**: kroki z asercjami `bodyEquals`: POST z `recurrence_weekdays: [3, 5]` → 201, zadanie z tymi dniami, `recurrence_interval_days` null, `recurrence_start_date` równa dzisiejszej dacie warszawskiej, `is_recurring` true; POST z dniami i interwałem → 422 z błędem pola; POST z pustą tablicą, z wartością 8 i z duplikatem → 422 z błędem pola `recurrence_weekdays`; POST z dniami i `due_date` → 422 na `due_date`; PATCH `status: done` na takim zadaniu → 422 (`recurringStateError`); PUT samego tytułu zachowuje dni; strona projektu zawiera etykietę „śr, pt" i nie zawiera `Status zadania <tytuł>`; sprzątanie jak w istniejących krokach (milestone z 2099, bez milestona z datą przeszłą zostawionego na liście).

### Success Criteria:

#### Automated Verification:

- Lint plików zmiany przechodzi: `npm run lint` (z zastrzeżeniem bazowych błędów spoza S-08)
- Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build` (po `npx astro preview stop`)
- Smoke przechodzi, w tym nowe kroki tworzenia z dniami tygodnia: `npm run smoke`

#### Manual Verification:

- Zadanie z dniami utworzone przez API ma na stronie projektu etykietę „śr, pt" (skróty od poniedziałku), nie ma przełącznika statusu, a edycja i usunięcie działają
- Odpowiedź API na dni razem z interwałem i na pustą tablicę zawiera czytelny komunikat błędu pola

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Faza 3: Kontrolka wyboru dni w formularzach

### Overview

Nowy komponent „siedem przycisków przełączanych" i jego podpięcie w obu formularzach tworzenia zadania oraz podgląd rytmu w edycji.

### Changes Required:

#### 1. Komponent wyboru dni

**File**: `src/components/ui/weekday-picker.tsx` (nowy; nazwa do potwierdzenia z konwencją plików w `ui/`)

**Intent**: Dać wybór dowolnej liczby z siedmiu dni tygodnia jako grupę przycisków przełączanych, zgodnie z wpisem „Chip (filter)" z design systemu, bez `shadcn add`.

**Contract**: komponent React bez `"use client"`, w grupie (`fieldset` lub `role="group"`) z widoczną etykietą „Dni tygodnia" i komunikatem błędu dla całej grupy (`role="alert"`/`aria-describedby`); siedem `<button type="button" aria-pressed>` z etykietą skrótu (pn–nd) i pełną nazwą w `aria-label`, od poniedziałku; wartość to `number[]` (ISO 1–7), zmiana wywołuje `onChange` z tablicą posortowaną rosnąco; klasy wyłącznie tokenowe (`cn()`), pierścień fokusu 2 px, cele dotykowe ≥ 40 px, bez literałów kolorów i wartości arbitralnych; stan wciśnięty rozróżnialny nie tylko kolorem. Przed pisaniem przeczytać opis „Chip (filter)" i zasady fokusu w `design-system.md`.

#### 2. Podpięcie w formularzach

**File**: `src/components/projects/TaskFormDialog.tsx`, `src/components/today/AddTaskFromTodayDialog.tsx`

**Intent**: Dodać tryb „W wybrane dni tygodnia" z wyborem dni, ukrywać termin przy dowolnym rytmie i pokazać rytm w edycji.

**Contract**: stan formularza zyskuje `recurrence_weekdays: number[]`; opcja „W wybrane dni tygodnia" w `Select` trybu pokazuje `WeekdayPicker` (zamiast pola „Co X dni"); mapowanie przy zapisie: tryb dni → `recurrence_weekdays = wybrane dni`, `recurrence_interval_days = null`; walidacja przez `readRecurrenceWeekdays` i `taskCreateSchema`; `FIELD_IDS` i `focusFirstInvalid` kierują błąd rytmu dni na grupę; zmiana trybu czyści termin i błędy; w `TaskFormDialog` w edycji pole „Powtarzanie" tylko do odczytu pokazuje etykietę z `formatRecurrence` (interwał lub dni) i ukrywa termin zadania powtarzalnego. `EditableTask` rozszerzone o `recurrence_weekdays` i `is_recurring`. Duplikacja markupu w obu formularzach jest dopuszczalna.

### Success Criteria:

#### Automated Verification:

- Lint plików zmiany przechodzi: `npm run lint` (z zastrzeżeniem bazowych błędów spoza S-08)
- Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build` (po `npx astro preview stop`)
- Smoke przechodzi (kroki z faz 1–2 i istniejące): `npm run smoke`

#### Manual Verification:

- W obu formularzach (strona projektu i `/today`) po wyborze „W wybrane dni tygodnia" pojawia się siedem przycisków pn–nd, które da się przełączać myszą i klawiaturą; zapis bez wybranego dnia pokazuje błąd grupy, a pole terminu znika
- Zadanie z dniami utworzone z formularza zapisuje się z poprawnymi dniami, a w edycji pole „Powtarzanie" pokazuje etykietę (np. „pn, śr, pt") tylko do odczytu
- Układ przycisków działa na wąskim ekranie (ok. 390 px) i w trybie ciemnym, a stan wciśnięty jest widoczny bez polegania na samym kolorze

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Faza 4: Rutyny z dniami tygodnia na liście na dziś

### Overview

Lista na dziś opisuje rutyny z dniami tygodnia, a smoke sprawdza prawdziwy dzień tygodnia i odhaczenie; PRD v2 dostaje doprecyzowanie Non-Goal.

### Changes Required:

#### 1. Typ i odczyt listy

**File**: `src/types.ts`, `src/lib/services/today.ts`

**Intent**: Przenieść dni tygodnia z wiersza `routine` do widoku.

**Contract**: `TodayRoutine.interval_days` staje się `number | null` i zyskuje `weekdays: number[] | null`; `getToday` mapuje `task_recurrence_interval_days` i `task_recurrence_weekdays` dla wierszy `routine` (generowany typ RPC jest nienullowalny — odczyt kolumn zadania tylko dla `task`/`routine`/`deferred`, jak w komentarzu pliku).

#### 2. Wiersz rutyny

**File**: `src/pages/today.astro`

**Intent**: Pokazać etykietę rytmu z dniami w wierszu rutyny.

**Contract**: etykieta w linii meta wiersza przez `formatRecurrence` z interwałem lub dniami; reszta wiersza (kolejność, licznik, wyspa „Zrobione") bez zmian.

#### 3. Smoke listy z prawdziwym dniem tygodnia

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić na prawdziwej dacie, że rutyna z dniami pojawia się tylko w wybrane dni i da się ją odhaczyć, zgodnie z lekcją o asercjach na treść wysp.

**Contract**: skrypt wylicza ISO dzień tygodnia dzisiejszej daty warszawskiej i tworzy dwa zadania powtarzalne w milestonie z 2099: jedno z dniami zawierającymi dzisiejszy dzień (np. dziś i dziś + 3 dni) i jedno z dniami wyłącznie niedzisiejszymi; kroki: `/today` zawiera tytuł pierwszego wraz z etykietą dni i wiersz z `aria-label="Zrobione: <tytuł>"`, a drugiego nie zawiera; odhaczenie przez `POST …/occurrences` → 201 i znika z listy; sprzątanie. Po dodaniu kroków wykonać test zepsucia z `context/foundation/lessons.md:5-10` (tymczasowy `throw` w `TodayTaskActions` zaczerwieni krok z treścią wyspy; zmianę wycofać).

#### 4. Doprecyzowanie PRD v2

**File**: `context/foundation/prd-v2.md`

**Intent**: Zapisać decyzje S-08 tam, gdzie wcześniej były niedoprecyzowane.

**Contract**: w `Non-Goals` doprecyzować, że wyłączona jest osobna opcja „co tydzień/co miesiąc", a wybór jednego dnia tygodnia jest dozwolony i daje efekt tygodniowy; w FR-016/FR-017 lub Business Logic Changes dopisać, że dla dni tygodnia wystąpienie jest też w dniu dodania, jeśli ten dzień jest wybrany, oraz że dozwolone jest od 1 do 7 dni (komplet = codziennie w etykiecie). Bez zmian w pozostałych sekcjach.

### Success Criteria:

#### Automated Verification:

- Lint plików zmiany przechodzi: `npm run lint` (z zastrzeżeniem bazowych błędów spoza S-08)
- Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build` (po `npx astro preview stop`)
- Smoke przechodzi, w tym kroki rutyn z dniami tygodnia na `/today` i odhaczenia: `npm run smoke`
- Test zepsucia (tymczasowy `throw` w `TodayTaskActions`) zaczerwienia krok smoke z treścią wyspy rutyny z dniami; po wycofaniu smoke jest zielony
- Testy pgTAP przechodzą: `npx supabase test db`

#### Manual Verification:

- Na `/today` rutyna z dniami zawierającymi dzisiejszy dzień jest na szczycie z etykietą dni (np. „pn, śr, pt"), przycisk „Zrobione" odhacza ją i po odświeżeniu znika
- Rutyna z dniami nie obejmującymi dzisiaj nie jest na liście, a na stronie projektu ma swoją etykietę
- Treść PRD v2 (Non-Goals i opis dni tygodnia) odpowiada decyzjom z planu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów TS; logika zależna od dnia jest testowana w pgTAP ze stałą datą (Faza 1) na przykładzie środa + piątek (2026-10-21 środa, milestone do piątku 2026-10-30) oraz regresji interwału.
- Kluczowe przypadki brzegowe: dzień dodania wybrany i niewybrany, ostatni dzień równy dacie milestona, jeden dzień i komplet siedmiu, odrzucenie niewybranego dnia przy odhaczeniu, ograniczenia tablicy (pusta, 0, 8, duplikat, NULL), wzajemne wykluczanie z interwałem, `is_recurring`.

### Integration Tests:

- `npm run smoke`: tworzenie z dniami i błędy 422 (Faza 2), strona projektu z etykietą, rutyna z dniami na `/today` w prawdziwy dzień tygodnia i jej brak w niedzisiejsze dni, odhaczenie (Faza 4). Smoke nie kontroluje daty, więc dni „inne niż dziś" są wyliczane względem dzisiejszej daty warszawskiej.

### Manual Testing Steps:

1. Utwórz milestone z datą w przyszłości i dodaj zadanie „W wybrane dni tygodnia" z formularza na stronie projektu (np. dziś i za 3 dni); sprawdź etykietę.
2. Dodaj podobne zadanie z formularza na `/today` z dniami nie obejmującymi dzisiaj; sprawdź, że nie ma go na liście.
3. Odhacz zadanie z dzisiejszym dniem; sprawdź, że znika.
4. Spróbuj zapisać rytm dni bez wybranego dnia; sprawdź błąd.
5. Zamknij milestone z rutyną dni; sprawdź, że rutyna znika i że zamknięcie nie jest blokowane.

## Performance Considerations

`today_list` wylicza wystąpienia w jednym zapytaniu; dzień tygodnia to jedno porównanie z tablicą do siedmiu elementów na zadanie, więc przy skali jednego konta nie planuje się indeksów. Cel z PRD (lista poniżej 1 s) obowiązuje; nie dodajemy zapytań do renderu strony.

## Migration Notes

Migracja jest addytywna: istniejące zadania mają `recurrence_weekdays` NULL, a `is_recurring` wylicza się z interwału, więc zadania z S-07 działają bez zmian (sprawdzane ręcznie w Fazie 1); ograniczenia `pair_check` i `shape` są odtwarzane pod tymi samymi nazwami. Dodanie kolumny wyliczanej przepisuje tabelę `tasks` (mała skala). Zdalna baza wymaga ręcznego wypchnięcia migracji; CI nie uruchamia pgTAP, więc bramką jest lokalne `npx supabase test db`. Wycofanie: osobna migracja usuwająca kolumny `recurrence_weekdays` i `is_recurring`, funkcję i ograniczenia dni oraz przywracająca poprzednie ograniczenia i funkcje (`check_task_occurrence`, `check_milestone_closable`, `check_task_rules`, `today_list`) ze stanu po S-07.

## References

- Related research: `context/changes/recurring-tasks-by-weekdays/research.md`
- Poprzednia zmiana: `context/archive/2026-10-19-recurring-tasks-by-interval/` (plan, research, przegląd)
- Wymagania: `context/foundation/prd-v2.md` (FR-016, FR-017, US-02), `context/foundation/roadmap.md` (S-08)
- Migracja S-07: `supabase/migrations/20261019120000_recurring_tasks.sql:24-37,82-135,141-227,240-369`
- Warstwa TS: `src/lib/validation/task.ts`, `src/lib/format.ts:39-42`, `src/lib/services/tasks.ts:49-63,103-110`
- Formularze: `src/components/projects/TaskFormDialog.tsx`, `src/components/today/AddTaskFromTodayDialog.tsx`
- Lekcje: `context/foundation/lessons.md`; design system: `context/foundation/design-system/design-system.md` („Chip (filter)")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza danych — dni tygodnia i lista

#### Automated

- [x] 1.1 Migracja stosuje się czysto na świeżej bazie: `npx supabase db reset` — cead948
- [x] 1.2 Wszystkie testy pgTAP przechodzą, istniejące 209 i nowe: `npx supabase test db` — cead948
- [x] 1.3 Typy zawierają `recurrence_weekdays`, `is_recurring` i `task_recurrence_weekdays` w wyniku `today_list`, a diff pliku jest ograniczony do tych zmian — cead948
- [x] 1.4 Lint plików zmiany i sprawdzenie typów przechodzą: `npm run lint` (z zastrzeżeniem bazowych błędów spoza S-08) oraz `npx astro check` — cead948

#### Manual

- [x] 1.5 Na lokalnych danych z rutynami interwałowymi z S-07 `select * from public.today_list(<dziś>)` zwraca ten sam zestaw i kolejność wierszy co przed migracją — cead948
- [x] 1.6 Ręczne `update milestones set completed_at = now()` na milestonie z jedną rutyną dni tygodnia i bez innych niezrobionych zadań kończy się sukcesem — cead948

### Phase 2: Tworzenie zadania z dniami tygodnia (API)

#### Automated

- [x] 2.1 Lint plików zmiany przechodzi: `npm run lint` (z zastrzeżeniem bazowych błędów spoza S-08) — 34c398a
- [x] 2.2 Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build` (po `npx astro preview stop`) — 34c398a
- [x] 2.3 Smoke przechodzi, w tym nowe kroki tworzenia z dniami tygodnia: `npm run smoke` — 34c398a

#### Manual

- [x] 2.4 Zadanie z dniami utworzone przez API ma na stronie projektu etykietę „śr, pt" (skróty od poniedziałku), nie ma przełącznika statusu, a edycja i usunięcie działają — 34c398a
- [x] 2.5 Odpowiedź API na dni razem z interwałem i na pustą tablicę zawiera czytelny komunikat błędu pola — 34c398a

### Phase 3: Kontrolka wyboru dni w formularzach

#### Automated

- [x] 3.1 Lint plików zmiany przechodzi: `npm run lint` (z zastrzeżeniem bazowych błędów spoza S-08) — a657ffa
- [x] 3.2 Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build` (po `npx astro preview stop`) — a657ffa
- [x] 3.3 Smoke przechodzi (kroki z faz 1–2 i istniejące): `npm run smoke` — a657ffa

#### Manual

- [x] 3.4 W obu formularzach po wyborze „W wybrane dni tygodnia" pojawia się siedem przycisków pn–nd przełączanych myszą i klawiaturą; zapis bez wybranego dnia pokazuje błąd grupy, a pole terminu znika — a657ffa
- [x] 3.5 Zadanie z dniami utworzone z formularza zapisuje się z poprawnymi dniami, a w edycji pole „Powtarzanie" pokazuje etykietę tylko do odczytu — a657ffa
- [x] 3.6 Układ przycisków działa na wąskim ekranie (ok. 390 px) i w trybie ciemnym, a stan wciśnięty jest widoczny bez polegania na samym kolorze — a657ffa

### Phase 4: Rutyny z dniami tygodnia na liście na dziś

#### Automated

- [x] 4.1 Lint plików zmiany przechodzi: `npm run lint` (z zastrzeżeniem bazowych błędów spoza S-08) — 60574fb
- [x] 4.2 Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build` (po `npx astro preview stop`) — 60574fb
- [x] 4.3 Smoke przechodzi, w tym kroki rutyn z dniami tygodnia na `/today` i odhaczenia: `npm run smoke` — 60574fb
- [x] 4.4 Test zepsucia (tymczasowy `throw` w `TodayTaskActions`) zaczerwienia krok smoke z treścią wyspy rutyny z dniami; po wycofaniu smoke jest zielony — 60574fb
- [x] 4.5 Testy pgTAP przechodzą: `npx supabase test db` — 60574fb

#### Manual

- [x] 4.6 Na `/today` rutyna z dniami zawierającymi dzisiejszy dzień jest na szczycie z etykietą dni, przycisk „Zrobione" odhacza ją i po odświeżeniu znika
- [x] 4.7 Rutyna z dniami nie obejmującymi dzisiaj nie jest na liście, a na stronie projektu ma swoją etykietę — 60574fb
- [x] 4.8 Treść PRD v2 (Non-Goals i opis dni tygodnia) odpowiada decyzjom z planu — 60574fb
