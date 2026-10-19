# Zadanie z rytmem „codziennie / co X dni" wraca na listę na dziś Implementation Plan

## Overview

S-07 (M-2, FR-016/FR-017, US-02) pozwala przy tworzeniu zadania ustawić rytm „codziennie" albo „co X dni" (X od 2 do 30). Zadanie z rytmem pojawia się na liście na dziś na samej górze w pasujące dni, od dnia dodania do daty milestona włącznie, także gdy ten milestone nie jest najbliższy. Wystąpienia są wyliczane w SQL z rytmu i daty startu; w bazie zapisuje się tylko odhaczenie dnia („Zrobione"). Zadania powtarzalne nie blokują zamknięcia milestona. Zadania bez rytmu działają dokładnie jak dotąd.

## Current State Analysis

- Lista na dziś to jedna funkcja SQL `public.today_list(p_today date)` zwracająca wiersze `task`, `milestone`, `deferred`; kwalifikacja bierze tylko zadania najbliższego niezamkniętego milestona projektu i sortuje po własnym `due_date` zadania (`supabase/migrations/20261016120000_today_list.sql:31-123`).
- Brak modelu rytmu: `tasks` ma tylko `title`, `due_date`, `status`, `deferred_until` (`20261009120000_create_core_domain_schema.sql:41-53`).
- Zamknięcie milestona blokuje każde zadanie ze statusem innym niż `done` (`20261014120000_milestone_close_rule.sql:21-24`), a zamknięty milestone nie przyjmuje niezrobionych zadań (`20261015120000_task_rules.sql:48-51`); komunikaty SQL są kontraktem z `src/lib/services/tasks.ts` i `milestones.ts`.
- Istniejące „Zrobione" ustawia `tasks.status = done` (`src/lib/services/tasks.ts:109-128`), co zakończyłoby zadanie powtarzalne na zawsze.
- Są dwa formularze tworzenia zadania, zduplikowane, wysyłające dane tą samą trasą POST i tym samym `taskInputSchema`: `TaskFormDialog.tsx` i `AddTaskFromTodayDialog.tsx`.
- Data „dziś" to data warszawska liczona w TS i przekazywana do SQL (`src/lib/today.ts`); testy zależne od dnia można robić tylko w pgTAP ze stałą datą, a CI nie uruchamia pgTAP.

## Desired End State

Użytkownik tworzy zadanie z rytmem w obu formularzach; na `/today` rutyna jest na górze listy z etykietą rytmu, można ją odhaczyć („Zrobione"), znika do następnego wystąpienia wg rytmu; po dacie milestona albo po jego zamknięciu nie wraca; milestone z samymi rutynami da się zamknąć. Weryfikacja: `npx supabase test db`, `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke` oraz ręczny przegląd UI.

### Key Discoveries:

- `today_list` jest `strict`, `stable`, `security invoker` z `grant execute` tylko dla `authenticated`; zmiana typu zwracanego wymaga `drop function` + `create function` o tej samej sygnaturze `(date)` i ponownego nadania uprawnień (`today_list.sql:125-126`).
- `open_tasks` w `today_list` (`:59-64`) decyduje też o „milestone do zamknięcia" (`:98-99`); wykluczenie zadań powtarzalnych z `open_tasks` załatwia oba miejsca.
- `tasks_check_rules` odpala się tylko przy `insert or update of due_date, milestone_id, status` (`task_rules.sql:57-59`), więc nowe kolumny rytmu trzeba dopisać do listy kolumn wyzwalacza.
- `taskInputSchema` jest wspólny dla POST i PUT (`src/lib/validation/task.ts:9`); schemat zod domyślnie pomija nieznane klucze (strip), więc PUT bez rozszerzenia nie zmieni rytmu.
- `readSaveResponse` w `use-task-api.ts:38-58` akceptuje 200/201 z `body.task.id` — trasa odhaczenia może zwracać zadanie i ponownie użyć tego kontraktu.
- Astro serializuje propsy wysp do HTML, więc asercje `bodyExcludes` w smoke trzeba pisać po treści wyspy, nie po obecności tekstu w propsach (przeglądy S-04/S-06).
- Tabela `tasks` nie ma `unique (id, user_id)` (milestones ma), więc złożony klucz obcy z nowej tabeli wymaga dodania tego ograniczenia.

## What We're NOT Doing

- Dni tygodnia (S-08), „pominięte" i przenoszenie wystąpienia (S-09), zmiana rytmu i wyłączenie powtarzania (S-10).
- Edycja rytmu w formularzu edycji (zadanie z rytmem pokazuje w edycji rytm tylko do odczytu).
- Odznaki, kolory i inne oznaczenia powtarzalności poza krótką etykietą rytmu (FR-018 zostaje w Parked).
- Wyodrębnienie hooka `use-reload-action` i refaktoryzacja szkieletu wysp (dług z przeglądów S-03–S-06 zostaje).
- Stan „częściowo zrobione" dla wystąpień (decyzja z PRD v2: tylko zrobione).
- Własny deadline rutyny, przenoszenie rutyny na jutro i cofanie odhaczenia wystąpienia.
- Zmiany w CI (pgTAP nadal ręcznie), zdalny `db push` wykonywany przez użytkownika.

## Implementation Approach

Logika kwalifikacji zostaje w SQL (testowalna w pgTAP ze stałym `p_today`), a niezmienniki w wyzwalaczach i ograniczeniach, jak w poprzednich zmianach. Zasada: rutyna to zwykłe zadanie z dwiema nowymi kolumnami (`recurrence_interval_days`, `recurrence_start_date`), a odhaczenia dnia to wiersze w nowej tabeli `task_occurrences`. Ograniczenie na `tasks` gwarantuje, że rutyna nie ma własnego terminu, jej status to zawsze `todo` i nie ma przeniesienia (`deferred_until`), więc istniejące akcje „Zrobione/Częściowo/Na jutro" nie mogą jej zakończyć. Fazy idą od bazy do UI: schemat i testy, tworzenie z rytmem, widoczność na liście, odhaczenie.

Decyzje z wywiadu: wystąpienia wyliczane w SQL (nie wiersze dzienne); ostatni dzień to data milestona włącznie; rutyna tworzy poziom na szczycie listy, nad przeterminowanymi; S-07 zawiera „Zrobione" na wystąpieniu, więc S-09 kurczy się do „pominięte" i przenoszenia; ponowne otwarcie milestona przywraca rutynę, bo zamknięcie wynika ze stanu milestona; akcja „Zrobione" to wariant `TodayTaskActions`.

## Critical Implementation Details

- **State sequencing.** Nowa migracja musi zdjąć stare ograniczenia/funkcje i odtworzyć je w jednej transakcji: `today_list(date)` przez `drop function` + `create function` (zmiana kolumn wyniku), potem `revoke ... from public, anon` i `grant execute ... to authenticated`; funkcje `check_milestone_closable` i `check_task_rules` przez `create or replace`.
- **Warsaw date.** `recurrence_start_date` ustawia serwis TS z `todayInWarsaw()`, nie `current_date` ani rzutowanie `created_at`; inaczej zadanie dodane tuż po północy dostałoby błędny dzień startu.
- **Typy.** Generuj `src/db/database.types.ts` w Git Bash (`npx supabase gen types typescript --local > src/db/database.types.ts`), nie w PowerShell 5.1 (UTF-16 z BOM); po wygenerowaniu sprawdź, że diff dotyczy tylko nowych kolumn, tabeli i funkcji `today_list` (wg `context/archive/2026-10-15-today-list-view/plan.md`).

## Faza 1: Baza danych — rytm, odhaczenia i lista

### Overview

Jedna migracja dodaje kolumny rytmu z ograniczeniami, tabelę odhaczeń wystąpień z RLS i walidacją, zmienia trzy funkcje i dostarcza testy pgTAP oraz zregenerowane typy. Po tej fazie logika kwalifikacji działa i jest przetestowana bez UI.

### Changes Required:

#### 1. Migracja rytmu i odhaczeń

**File**: `supabase/migrations/20261019120000_recurring_tasks.sql` (nowy)

**Intent**: Dodać do `tasks` rytm i datę startu z ograniczeniami gwarantującymi kształt rutyny oraz osobną tabelę na odhaczenia wystąpień. Komentarze po polsku, jak w istniejących migracjach.

**Contract**:
- `tasks`: kolumny `recurrence_interval_days smallint null`, `recurrence_start_date date null`; ograniczenia `tasks_recurrence_interval_check` (1..30, gdzie 1 = codziennie), `tasks_recurrence_pair_check` (obie kolumny NULL albo obie ustawione), `tasks_recurrence_shape` (rutyna ma `due_date IS NULL`, `status = 'todo'`, `deferred_until IS NULL`); `unique (id, user_id)` jako `tasks_id_user_id_key`.
- Tabela `public.task_occurrences`: `task_id uuid`, `user_id uuid default auth.uid()`, `occurrence_date date`, `state text` (check `state in ('done')`, default `'done'`), `created_at timestamptz default now()`; klucz główny `(task_id, occurrence_date)`; złożony klucz obcy `(task_id, user_id)` → `tasks(id, user_id)` `on delete cascade`.
- RLS: włączone, `revoke all` z `public, anon`, `grant select, insert, delete` dla `authenticated`, trzy polityki per operacja `user_id = (select auth.uid())` (wzór: `20261009120100_enable_core_domain_rls.sql`); brak polityki update.
- Wyzwalacz `before insert` na `task_occurrences` (funkcja `security invoker`, `search_path = ''`): odrzuca wstawienie, gdy zadanie nie jest powtarzalne, milestone jest zamknięty, data wystąpienia nie mieści się w `recurrence_start_date .. data milestona` albo `(occurrence_date - recurrence_start_date) % recurrence_interval_days <> 0`; błąd `check_violation` z komunikatem zawierającym `Wystapienie` (bez zwrotu „Data milestona").

#### 2. Reguły zamykania i zadań

**File**: `supabase/migrations/20261019120000_recurring_tasks.sql`

**Intent**: Wyłączyć rutyny z blokady zamknięcia milestona, dopuścić ich niezrobiony stan w zamkniętym milestonie i dopilnować, by powtarzanie miało sens względem daty milestona.

**Contract**:
- `check_milestone_closable`: licznik niezrobionych zadań pomija zadania z `recurrence_interval_days IS NOT NULL`; komunikat „Milestone nie moze zostac zamkniety: niezrobione zadania (N)" i sposób parsowania numeru bez zmian.
- `check_task_rules`: reguła „zamknięty milestone przyjmuje tylko `done`" ma wyjątek tylko dla rutyny w `UPDATE` bez zmiany `milestone_id`; wstawienie rutyny do zamkniętego milestona i przeniesienie rutyny do zamkniętego milestona nadal odrzucane tym samym komunikatem „Zamkniety milestone nie moze miec niezrobionych zadan"; nowa reguła: `recurrence_start_date` późniejsza niż data milestona jest odrzucana komunikatem zawierającym `Powtarzanie zadania`.
- Wyzwalacz `tasks_check_rules`: lista kolumn rozszerzona o `recurrence_start_date` i `recurrence_interval_days`.

#### 3. Funkcja listy na dziś

**File**: `supabase/migrations/20261019120000_recurring_tasks.sql`

**Intent**: Dodać do listy rutyny jako osobny rodzaj wiersza na szczycie, nie psując istniejących trzech rodzajów.

**Contract**: `drop function public.today_list(date)` i `create function public.today_list(p_today date)` z identyczną sygnaturą i tymi samymi kolumnami plus `task_recurrence_interval_days smallint` (NULL dla wierszy innych niż `routine`). `open_tasks` pomija zadania powtarzalne (dzięki temu milestone z samymi rutynami jest „do zamknięcia"). Nowy rodzaj `routine`: zadanie powtarzalne niezamkniętego milestona (dowolnego, nie tylko najbliższego), dla którego `p_today` mieści się w `recurrence_start_date .. data milestona` włącznie, `(p_today - recurrence_start_date) % recurrence_interval_days = 0` i brak wiersza w `task_occurrences` dla `(task, p_today)`. Kolejność: `case kind when 'routine' then 0 when 'task' then 1 when 'milestone' then 2 else 3`; pozostałe klucze sortowania bez zmian. Funkcja pozostaje `strict`, `stable`, `security invoker`, `revoke all ... from public, anon`, `grant execute ... to authenticated`. Warunek wystąpienia jest nieoczywisty, więc jego postać ma być ustalona jednym predykatem:

```sql
p_today between t.recurrence_start_date and m.due_date
and (p_today - t.recurrence_start_date) % t.recurrence_interval_days = 0
```

#### 4. Testy pgTAP

**File**: `supabase/tests/database/core_domain_recurring_tasks.test.sql` (nowy); korekty w `core_domain_schema.test.sql`, `core_domain_rls.test.sql` tylko tam, gdzie addytywny schemat psuje istniejące asercje

**Intent**: Pokryć ze stałym `p_today` kwalifikację, granice dat, ograniczenia, odhaczenia i izolację RLS; istniejące testy mają dalej przechodzić.

**Contract**: przypadki z nazwami po polsku: rutyna codzienna na dzień 0, co 2 dni w dniach 0/2/4 i nie w 1/3; ostatni dzień równy dacie milestona widoczny, następny dzień nie; start po dacie milestona odrzucony; rutyna z dalszego (nie najbliższego) milestona widoczna; zamknięty milestone ukrywa rutynę, a ponowne otwarcie ją przywraca; rutyna nad zadaniem przeterminowanym; odhaczenie dnia ukrywa wystąpienie, a następny pasujący dzień wraca; niepasujący dzień i dzień po dacie milestona nie wstawiają odhaczenia; zamknięcie milestona z samą rutyną przechodzi, a z niezrobionym zadaniem niepowtarzalnym nadal jest blokowane; milestone z samymi rutynami jest wierszem „do zamknięcia"; ograniczenia `tasks_recurrence_*` (X = 0, 31, jedna kolumna, `due_date`, status `done`/`partial`, `deferred_until`); RLS: drugi użytkownik nie widzi ani nie wstawia odhaczeń cudzego zadania.

#### 5. Typy bazy

**File**: `src/db/database.types.ts` (generowany)

**Intent**: Odzwierciedlić nowe kolumny `tasks`, tabelę `task_occurrences` i nową kolumnę wyniku `today_list`.

**Contract**: wynik `npx supabase gen types typescript --local > src/db/database.types.ts` po `npx supabase db reset`, uruchomiony w Git Bash; diff ma dotyczyć wyłącznie tych trzech obszarów, w razie innych zmian przywrócić plik z gita i dopisać ręcznie w tym samym kształcie.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się czysto na świeżej bazie: `npx supabase db reset`
- Wszystkie testy pgTAP przechodzą, także zaktualizowane istniejące: `npx supabase test db`
- Typy zawierają `recurrence_interval_days`, `recurrence_start_date`, tabelę `task_occurrences` i `task_recurrence_interval_days` w wyniku `today_list`, a diff pliku jest ograniczony do tych zmian
- Lint i sprawdzenie typów przechodzą: `npm run lint` oraz `npx astro check`

#### Manual Verification:

- Na lokalnych danych bez zadań powtarzalnych `select * from public.today_list(<dziś>)` zwraca ten sam zestaw i kolejność wierszy co przed migracją
- Ręczne `update milestones set completed_at = now()` na milestonie z jedną rutyną i bez innych niezrobionych zadań kończy się sukcesem

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Faza 2: Tworzenie zadania z rytmem

### Overview

Walidacja, trasa i serwis tworzenia przyjmują rytm; oba formularze dostają kontrolkę rytmu; strona projektu poprawnie pokazuje rutynę i nie oferuje jej przełącznika statusu.

### Changes Required:

#### 1. Walidacja

**File**: `src/lib/validation/task.ts`

**Intent**: Dodać pole rytmu wyłącznie do schematu tworzenia, zostawiając `taskInputSchema` dla PUT bez zmian (zod pominie nieznane klucze, więc edycja nie zmieni rytmu).

**Contract**: nowy `taskCreateSchema` = `taskInputSchema` rozszerzony o `recurrence_interval_days` (liczba całkowita 1..30 albo null; pusty łańcuch i brak = null) z regułą, że rytm i `due_date` się wykluczają (błąd na polu `due_date`: „Zadanie powtarzalne nie ma własnego terminu"); `TASK_FIELDS` zyskuje `"recurrence_interval_days"`, więc `FIELD_IDS` w obu formularzach muszą mieć nowy klucz; `TaskCreateInput` jako typ wyjścia.

#### 2. Serwis i trasa tworzenia

**File**: `src/lib/services/tasks.ts`, `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/index.ts`

**Intent**: Zapisać rytm razem z datą startu i tłumaczyć nowe błędy bazy na komunikaty użytkownika.

**Contract**: `createTask(supabase, projectId, milestoneId, input: TaskCreateInput)`: przy `recurrence_interval_days != null` wstawia `recurrence_start_date = todayInWarsaw()`, w przeciwnym razie obie kolumny NULL; trasa POST parsuje `taskCreateSchema`, trasa PUT dalej `taskInputSchema`. `translateError` (kod `23514`) dostaje: komunikat zawierający `tasks_recurrence_shape` → „Zadania powtarzalnego nie można oznaczyć jako zrobione ani przenieść. Odhacz jego wystąpienie na liście Dziś." (bez pól); komunikat zawierający `Powtarzanie zadania` → błąd na polu `recurrence_interval_days` („Termin milestona jest wcześniejszy niż dziś — powtarzanie nie miałoby kiedy się zacząć"); `tasks_recurrence_interval_check` → błąd na polu rytmu.

#### 3. Typy zadania i hook

**File**: `src/components/hooks/use-task-api.ts`, `src/types.ts`

**Intent**: Przenieść typ wejścia tworzenia przez hook i odzwierciedlić rytm w typach UI.

**Contract**: `TaskApiInput` dla `createTask` oparty o `TaskCreateInput` z `due_date` jako `string | null`; `updateTask` zachowuje dotychczasowy typ; `Task` dziedziczy nowe kolumny z `database.types.ts`.

#### 4. Kontrolka rytmu w formularzach

**File**: `src/components/projects/TaskFormDialog.tsx`, `src/components/today/AddTaskFromTodayDialog.tsx`

**Intent**: Dodać w trybie tworzenia pole „Powtarzanie" (Nie powtarzaj / Codziennie / Co X dni) z polem liczby dni dla „Co X dni" i ukrywać pole terminu, gdy rytm jest ustawiony; w trybie edycji pokazać rytm tylko do odczytu i ukryć termin zadania powtarzalnego.

**Contract**: komponenty `Select` i `Input type="number"` z `src/components/ui/` (bez `shadcn add`, więc lekcja o rejestrze nie wchodzi w grę); mapowanie formularza: „Codziennie" → 1, „Co X dni" → X (2..30), „Nie powtarzaj" → null; klucz `recurrence_interval_days` w `FormValues`, w obu `initialValues` i w `FIELD_IDS`; `EditableTask` w `TaskFormDialog` rozszerzony o `recurrence_interval_days`. Dopuszczalne jest powielenie markupu w obu formularzach (dług z przeglądów); wspólny element wyodrębniać tylko, jeśli wychodzi mniej kodu.

#### 5. Strona projektu

**File**: `src/pages/projects/[id].astro`, `src/components/projects/TaskRowActions.tsx`

**Intent**: Rutyna nie ma terminu ani zmiany statusu; zamiast tego pokazuje etykietę rytmu, a akcje edytuj i usuń działają jak dotąd.

**Contract**: wiersz zadania z `recurrence_interval_days != null` zamiast „bez terminu" wyświetla etykietę (np. „codziennie", „co 2 dni") i nie renderuje przełącznika statusu w `TaskRowActions` (nowe pole `recurrence_interval_days` w propsach); pomocnik formatujący etykietę rytmu w jednym miejscu (`src/lib/today.ts` lub `src/lib/format.ts`), z użyciem polskiej odmiany przez istniejące `plural`. Należy upewnić się, że zapytanie listujące zadania milestona zwraca nowe kolumny.

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć w smoke ścieżki API tworzenia z rytmem.

**Contract**: kroki z asercjami `bodyEquals` (nie `!== undefined`): POST z rytmem → 201 i zadanie z `recurrence_interval_days` oraz `recurrence_start_date` równą dzisiejszej dacie warszawskiej; POST z rytmem i `due_date` → 422 z błędem pola `due_date`; POST z X = 31 → 422; PATCH `status: done` na zadaniu powtarzalnym → 422; PUT zadania powtarzalnego z samym tytułem nie zeruje rytmu. Dane testowe z milestonem w 2099 roku, sprzątanie po teście jak w istniejących krokach.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build`
- Smoke przechodzi, w tym nowe kroki tworzenia z rytmem: `npm run smoke`

#### Manual Verification:

- W obu formularzach (strona projektu i `/today`) działa wybór „Codziennie" i „Co X dni", pole liczby dni waliduje zakres 2–30, a pole terminu znika przy rytmie
- Na stronie projektu zadanie powtarzalne ma etykietę rytmu, nie ma przełącznika statusu, a edycja otwiera się z rytmem tylko do odczytu; usunięcie działa
- Dodanie zadania powtarzalnego do milestona z datą wcześniejszą niż dziś pokazuje czytelny błąd zamiast cichego zadania, które nigdy się nie pojawi

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Faza 3: Rutyny na liście na dziś

### Overview

Odczyt listy i strona `/today` obsługują wiersze `routine`: rutyny są na górze z etykietą rytmu i wliczają się w licznik, bez akcji (akcję dodaje faza 4).

### Changes Required:

#### 1. Typy i odczyt

**File**: `src/types.ts`, `src/lib/services/today.ts`

**Intent**: Wprowadzić do widoku listy nowy rodzaj pozycji.

**Contract**: `TodayRoutine` (`id`, `title`, `interval_days`, `project`, `milestone` jak w `TodayTask`) i pole `routines: TodayRoutine[]` w `TodayView`; `getToday` obsługuje `row.kind === "routine"` (kolumny zadania czytane tylko dla wierszy `task`/`routine`/`deferred`, zgodnie z komentarzem w pliku) i zachowuje kolejność z SQL.

#### 2. Strona listy

**File**: `src/pages/today.astro`

**Intent**: Wyrenderować rutyny przed zadaniami i uwzględnić je w licznikach i pustym stanie.

**Contract**: wiersze rutyn pierwsze w `<ul>`, ten sam układ co wiersz zadania, ale zamiast `DueChip` etykieta rytmu; `itemCount` obejmuje rutyny, `overdueCount` ich nie liczy; pusty stan „Na dziś nic do zrobienia." pojawia się tylko, gdy brak także rutyn; bez przycisków akcji (na tym etapie).

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć treść `/today` z rutyną zgodnie z lekcją o asercjach na treść wysp.

**Contract**: kroki: rutyna na górze listy przed zadaniem niepowtarzalnym z terminem (asercja kolejności po treści wiersza, nie po propsach), etykieta rytmu w wierszu, licznik pozycji, milestone z samą rutyną jako „do zamknięcia", zamknięcie takiego milestona przez API przechodzi (200) i rutyna znika z listy; zadania niepowtarzalne w istniejących krokach bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build`
- Smoke przechodzi, w tym kroki rutyny na liście i zamknięcia milestona z rutyną: `npm run smoke`

#### Manual Verification:

- Na `/today` rutyna jest na samym szczycie, nad zadaniem przeterminowanym, z etykietą rytmu, a licznik „N pozycji" ją zawiera
- Rutyna z milestona, który nie jest najbliższy w projekcie, jest widoczna na liście
- Po zamknięciu milestona z rutyną (ze strony projektu lub z wiersza „do zamknięcia") rutyna znika, a po ponownym otwarciu wraca

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Faza 4: Odhaczenie wystąpienia

### Overview

Użytkownik może odhaczyć dzisiejsze wystąpienie rutyny; znika z listy do następnego wystąpienia wg rytmu.

### Changes Required:

#### 1. Trasa odhaczenia

**File**: `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId]/occurrences.ts` (nowy)

**Intent**: Udostępnić odhaczenie dzisiejszego wystąpienia; serwer sam liczy datę „dziś", klient jej nie podaje.

**Contract**: `POST`, brak ciała; identyfikatory walidowane jak w sąsiednich trasach (`projectIdSchema`, `milestoneIdSchema`, `taskIdSchema`); data = `todayInWarsaw()`; odpowiedź 201 z `{ task }` (zadanie właściciela), by użyć istniejącego kontraktu `readSaveResponse`; mapowanie wyników serwisu: `validation` → 422, `not_found` → 404, `unavailable` → 500.

#### 2. Serwis

**File**: `src/lib/services/tasks.ts`

**Intent**: Wstawić odhaczenie idempotentnie i przetłumaczyć błędy walidacji wystąpienia.

**Contract**: `completeOccurrence(supabase, projectId, milestoneId, taskId, date)`: `findMilestone`, odczyt zadania (`not_found`, gdy brak lub nie należy do milestona), insert do `task_occurrences`; konflikt klucza (`23505`) traktowany jako sukces (podwójne kliknięcie); `23514` z komunikatem zawierającym `Wystapienie` → `validation` „To wystąpienie nie jest dziś aktualne. Odśwież stronę."; wynik `{ status: "ok", task }`.

#### 3. Hook

**File**: `src/components/hooks/use-task-api.ts`

**Intent**: Wystawić metodę dla wyspy.

**Contract**: `completeOccurrence(projectId, milestoneId, taskId)` jako `saveTask(<url>/occurrences, "POST", {})`, zwracająca `TaskApiSaveResult`, i dopisanie do zwracanego obiektu hooka.

#### 4. Wariant wyspy akcji

**File**: `src/components/today/TodayTaskActions.tsx`, `src/pages/today.astro`

**Intent**: Wiersz rutyny pokazuje tylko „Zrobione"; wiersze zadań zachowują trzy przyciski bez zmian.

**Contract**: nowy opcjonalny prop (np. `recurring`) w `TodayTaskActionsProps`; dla rutyny jeden przycisk z `aria-label` `Zrobione: <tytuł>`, wołający `completeOccurrence`, z tym samym szkieletem pending/`aria-disabled`/błędu/`window.location.reload()`; przyciski „Częściowo" i „Na jutro" nie są renderowane dla rutyny; `today.astro` renderuje wyspę z tym wariantem w wierszach rutyn.

#### 5. Smoke i test zepsucia

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć odhaczenie i potwierdzić, że asercje na treści wyspy naprawdę łapią błąd renderowania.

**Contract**: kroki: POST `…/occurrences` → 201, powtórka → 201 (idempotencja), `/today` bez rutyny po odhaczeniu, wiersz rutyny zawiera `aria-label="Zrobione: <tytuł>"` i nie zawiera etykiet „Częściowo"/„Na jutro"; wiersz zadania niepowtarzalnego nadal ma trzy akcje. Po dodaniu kroków wykonać test zepsucia z `context/foundation/lessons.md:5-10`: tymczasowy `throw` w `TodayTaskActions` musi zaczerwienić krok smoke; po teście zmianę wycofać.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build`
- Smoke przechodzi, w tym kroki odhaczenia i treści wyspy: `npm run smoke`
- Test zepsucia (tymczasowy `throw` w `TodayTaskActions`) zaczerwienia krok smoke z treścią wyspy; po wycofaniu `npm run smoke` jest zielony
- Testy pgTAP nadal przechodzą: `npx supabase test db`

#### Manual Verification:

- Na `/today` przycisk „Zrobione" na rutynie odhacza ją i po odświeżeniu znika; zadania niepowtarzalne nadal mają „Zrobione", „Częściowo" i „Na jutro"
- Symulacja następnego dnia (`select * from public.today_list(<jutro>)` w psql) pokazuje rutynę codzienną ponownie, a rutynę co 2 dni dopiero po dwóch dniach
- Podwójne kliknięcie „Zrobione" nie powoduje błędu widocznego dla użytkownika

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów TS w repozytorium; logika zależna od dnia jest testowana wyłącznie w pgTAP ze stałym `p_today` (Faza 1).
- Kluczowe przypadki brzegowe: dzień 0, dni pasujące i niepasujące do „co 2 dni", dzień daty milestona włącznie i dzień po niej, start po dacie milestona, zamknięcie i ponowne otwarcie milestona, rutyna nad zadaniem przeterminowanym, odhaczenie dnia i powrót w następnym pasującym dniu.

### Integration Tests:

- `npm run smoke`: tworzenie z rytmem i błędy 422, rutyna na `/today` (kolejność, etykieta, licznik), milestone z samą rutyną jako „do zamknięcia" i jego zamknięcie, odhaczenie wystąpienia z idempotencją, treść wyspy rutyny. Smoke nie kontroluje daty „dziś", więc nie sprawdza powrotu rutyny następnego dnia.

### Manual Testing Steps:

1. Utwórz milestone z datą w przyszłości i dodaj zadanie „Codziennie" ze strony projektu; sprawdź etykietę na stronie projektu.
2. Dodaj zadanie „Co 2 dni" z formularza na `/today`; sprawdź, że oba są na szczycie listy z etykietami.
3. Odhacz jedno; sprawdź, że znika, a drugie zostaje.
4. Zamknij milestone z niezrobioną rutyną; sprawdź, że rutyna znika, otwórz go ponownie i sprawdź, że wraca.
5. Spróbuj dodać zadanie powtarzalne do milestona z datą przeszłą; sprawdź komunikat błędu.

## Performance Considerations

Lista wylicza wystąpienia dla zadań powtarzalnych użytkownika w jednym zapytaniu; skala jest mała (jedno konto, rząd dziesiątek zadań), więc osobny indeks nie jest planowany. Cel z PRD (ładowanie listy poniżej 1 s) obowiązuje; nie dodajemy zapytań do renderu strony poza już istniejącym `today_list`.

## Migration Notes

Migracja jest addytywna: istniejące zadania mają `recurrence_*` NULL i działają bez zmian, a `today_list` dla nich zwraca ten sam wynik (sprawdzane ręcznie w Fazie 1). Zdalna baza wymaga ręcznego wypchnięcia migracji (jak w poprzednich zmianach); CI nie uruchamia pgTAP, więc bramką jest lokalne `npx supabase test db`. Wycofanie: osobna migracja usuwająca tabelę `task_occurrences`, kolumny i ograniczenia rytmu oraz przywracająca funkcje `check_milestone_closable`, `check_task_rules` i `today_list` ze stanu sprzed zmiany.

## References

- Related research: `context/changes/recurring-tasks-by-interval/research.md`
- Wymagania: `context/foundation/prd-v2.md` (FR-016, FR-017, US-02), `context/foundation/roadmap.md` (S-07)
- Lista na dziś: `supabase/migrations/20261016120000_today_list.sql:31-123`
- Reguły zamykania: `supabase/migrations/20261014120000_milestone_close_rule.sql:12-40`, `supabase/migrations/20261015120000_task_rules.sql:20-59`
- Istniejące akcje i serwis zadań: `src/components/today/TodayTaskActions.tsx`, `src/lib/services/tasks.ts:109-161`
- Lekcje: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza danych — rytm, odhaczenia i lista

#### Automated

- [x] 1.1 Migracja stosuje się czysto na świeżej bazie: `npx supabase db reset` — c0facc5
- [x] 1.2 Wszystkie testy pgTAP przechodzą, także zaktualizowane istniejące: `npx supabase test db` — c0facc5
- [x] 1.3 Typy zawierają `recurrence_interval_days`, `recurrence_start_date`, tabelę `task_occurrences` i `task_recurrence_interval_days` w wyniku `today_list`, a diff pliku jest ograniczony do tych zmian — c0facc5
- [x] 1.4 Lint i sprawdzenie typów przechodzą: `npm run lint` oraz `npx astro check` — c0facc5

#### Manual

- [x] 1.5 Na lokalnych danych bez zadań powtarzalnych `select * from public.today_list(<dziś>)` zwraca ten sam zestaw i kolejność wierszy co przed migracją — c0facc5
- [x] 1.6 Ręczne `update milestones set completed_at = now()` na milestonie z jedną rutyną i bez innych niezrobionych zadań kończy się sukcesem — c0facc5

### Phase 2: Tworzenie zadania z rytmem

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — e923770
- [x] 2.2 Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build` — e923770
- [x] 2.3 Smoke przechodzi, w tym nowe kroki tworzenia z rytmem: `npm run smoke` — e923770

#### Manual

- [x] 2.4 W obu formularzach (strona projektu i `/today`) działa wybór „Codziennie" i „Co X dni", pole liczby dni waliduje zakres 2–30, a pole terminu znika przy rytmie — e923770
- [x] 2.5 Na stronie projektu zadanie powtarzalne ma etykietę rytmu, nie ma przełącznika statusu, a edycja otwiera się z rytmem tylko do odczytu; usunięcie działa — e923770
- [x] 2.6 Dodanie zadania powtarzalnego do milestona z datą wcześniejszą niż dziś pokazuje czytelny błąd zamiast cichego zadania, które nigdy się nie pojawi — e923770

### Phase 3: Rutyny na liście na dziś

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — 8ac880b
- [x] 3.2 Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build` — 8ac880b
- [x] 3.3 Smoke przechodzi, w tym kroki rutyny na liście i zamknięcia milestona z rutyną: `npm run smoke` — 8ac880b

#### Manual

- [x] 3.4 Na `/today` rutyna jest na samym szczycie, nad zadaniem przeterminowanym, z etykietą rytmu, a licznik „N pozycji" ją zawiera — 8ac880b
- [x] 3.5 Rutyna z milestona, który nie jest najbliższy w projekcie, jest widoczna na liście — 8ac880b
- [x] 3.6 Po zamknięciu milestona z rutyną (ze strony projektu lub z wiersza „do zamknięcia") rutyna znika, a po ponownym otwarciu wraca — 8ac880b

### Phase 4: Odhaczenie wystąpienia

#### Automated

- [x] 4.1 Lint przechodzi: `npm run lint`
- [x] 4.2 Sprawdzenie typów i build przechodzą: `npx astro check` oraz `npm run build`
- [x] 4.3 Smoke przechodzi, w tym kroki odhaczenia i treści wyspy: `npm run smoke`
- [x] 4.4 Test zepsucia (tymczasowy `throw` w `TodayTaskActions`) zaczerwienia krok smoke z treścią wyspy; po wycofaniu `npm run smoke` jest zielony
- [x] 4.5 Testy pgTAP nadal przechodzą: `npx supabase test db`

#### Manual

- [x] 4.6 Na `/today` przycisk „Zrobione" na rutynie odhacza ją i po odświeżeniu znika; zadania niepowtarzalne nadal mają „Zrobione", „Częściowo" i „Na jutro"
- [x] 4.7 Symulacja następnego dnia (`select * from public.today_list(<jutro>)` w psql) pokazuje rutynę codzienną ponownie, a rutynę co 2 dni dopiero po dwóch dniach
- [x] 4.8 Podwójne kliknięcie „Zrobione" nie powoduje błędu widocznego dla użytkownika
