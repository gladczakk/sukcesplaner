# Zarządzanie zadaniami (CRUD) Implementation Plan

## Overview

Trzeci slice roadmapy (S-03, FR-006/FR-007): w widoku projektu `/projects/[id]` pod każdym milestonem pojawia się lista zadań (tytuł, opcjonalny własny termin, status `todo`/`partial`/`done`). Użytkownik dodaje zadania, edytuje je, zmienia ich status, usuwa (z potwierdzeniem). Baza pilnuje trzech niezmienników: termin zadania nie jest późniejszy niż data milestona, zamknięty milestone nie przyjmuje niezrobionych zadań, a datę milestona nie da się przesunąć przed termin istniejącego zadania. Dzięki zmianie statusu reguła zamykania z S-02 staje się wreszcie sprawdzalna z UI.

## Current State Analysis

Stan na commit `1f4bd96` (po archiwizacji S-02).

- **Tabela `tasks` gotowa:** `title` (CHECK 1–200), `due_date` (NULL), `status` (`todo`/`partial`/`done`, domyślnie `todo`), `deferred_until` (S-05), `milestone_id` + `user_id` ze złożonym FK i kaskadą, indeksy po `milestone_id` i `user_id`, trigger `updated_at`, RLS per operacja dla `authenticated` (`supabase/migrations/20261009120000_create_core_domain_schema.sql:41-56`, `…120100_enable_core_domain_rls.sql:61-80`).
- **Reguły dat w bazie:** milestone ≤ projekt (insert/update milestona, `FOR SHARE` na projekcie) i odwrotny kierunek na projekcie (`…create_core_domain_schema.sql:85-140`). Reguła zamykania milestona (`20261014120000_milestone_close_rule.sql`) liczy zadania `status <> 'done'` bez blokad i ma w nagłówku zapisane znane ograniczenie (przegląd S-02, F2): nic nie pilnuje drugiej strony — dodania niezrobionego zadania do zamkniętego milestona.
- **UI i serwisy z S-02 do powtórzenia:** serwis z tłumaczeniem błędów po komunikacie triggera (`src/lib/services/milestones.ts:19-58`), trasy JSON z `readJsonBody`, hook na wspólnym kliencie (`src/lib/api-client.ts`, `src/components/hooks/use-milestone-api.ts`), dialog formularza i usuwania z blokadą po sukcesie (`MilestoneFormDialog.tsx`, `DeleteMilestoneDialog.tsx`), wyspa wiersza (`MilestoneRowActions.tsx`), `Field` z `required`, `ConfirmDialog` z `trigger`, `plural`/`formatDate` (`src/lib/format.ts`).
- **Widok projektu:** sekcja „Milestony" w `src/pages/projects/[id].astro:94-160` — wiersz milestona to `<li>` z nagłówkiem po lewej i `MilestoneRowActions` po prawej; `listMilestones` zwraca milestone z licznikiem zadań (`select("*, tasks(count)")`, `services/milestones.ts:60-69`).
- **Typy:** `Task`, `TaskStatus`, `TASK_STATUSES` już są w `src/types.ts:7-23`; `MilestoneListItem = Milestone & { task_count }`.
- **Middleware:** prefiks `/api/projects` chroni zagnieżdżone trasy (bez zmian).
- **Lekcje** (`context/foundation/lessons.md`): smoke musi asercją na treść sprawdzać strony z wyspami React (i test zepsucia); przed `shadcn add` sprawdzić zależności rejestru (tu nie dodajemy komponentów shadcn).
- **Testy:** brak runnera; bramki to pgTAP (`npx supabase test db`, 104 testy) i smoke (`npm run smoke`, ok. 40 kroków).

## Desired End State

- W każdym wierszu milestona widać listę zadań (tytuł, termin, kontrolka statusu, akcje „Edytuj" i „Usuń") oraz przycisk „Dodaj zadanie". Kolejność: termin rosnąco, zadania bez terminu na końcu, potem kolejność utworzenia.
- Dodanie i edycja przez dialog; pole terminu jest opcjonalne i ma `max` równe dacie milestona; termin późniejszy jest odrzucany przy polu (klient i baza), po polsku. Równość jest dozwolona.
- Status zmienia się z listy (Do zrobienia / Częściowo / Zrobione) i zapisuje od razu.
- W zamkniętym milestonie „Dodaj zadanie" jest wyłączone z podpowiedzią „Otwórz milestone, aby dodać zadanie."; próba cofnięcia zadania na niezrobione (UI lub API) kończy się komunikatem po polsku. Baza odrzuca niezrobione zadanie w zamkniętym milestonie także dla psql.
- Zmiana daty milestona na wcześniejszą niż termin któregoś zadania jest odrzucona przy polu daty komunikatem z liczbą zadań.
- Usunięcie zadania zawsze z potwierdzeniem. Zamknięcie milestona z niezrobionym zadaniem pokazuje komunikat z liczbą, a po ustawieniu wszystkich zadań na „Zrobione" się udaje (cały przepływ z UI).
- Weryfikacja: `npx supabase test db` (nowy plik), lint zmienionych plików, `npx astro check`, `npm run build`, rozszerzony `npm run smoke`; ręcznie przepływ w przeglądarce w jasnym i ciemnym motywie na 390 i 1280 px.

### Key Discoveries:

- Trigger na milestonie (`BEFORE UPDATE`) blokuje wiersz milestona na czas działania, więc `SELECT … FOR SHARE` na milestonie w triggerze zadania szereguje zapis zadania z zamykaniem i zmianą daty (wzorzec z `check_milestone_within_project_due_date`, `FOR SHARE` na projekcie). Nie trzeba zmieniać triggera zamykania z S-02.
- Komunikat reguły daty projektu zaczyna się od „Data milestona", a serwis milestonów dopasowuje błąd po tekście (`includes("Data milestona")`) — nowy komunikat o kolizji z terminami zadań musi zaczynać się inaczej („Nie mozna przesunac daty milestona…"), inaczej serwis pomyli reguły.
- Jedno zapytanie z osadzeniem `tasks(*)` w `listMilestones` daje zadania wszystkich milestonów projektu bez N+1 i liczniki z długości tablicy (zamiast `tasks(count)`).
- Zadanie jest w zakresie projektu przez milestone: trasa niesie `projectId` i `milestoneId`, a PostgREST nie filtruje zapisu po osadzonej relacji, więc serwis najpierw sprawdza milestone w projekcie, a potem pisze po `milestone_id`.
- Smoke od S-02 ma w projekcie milestone „Gamma smoke" (dawna Alfa) o dacie `2099-12-31`, otwarty po kroku P3 — bloki zadań dla smoke wstawiamy tam.

## What We're NOT Doing

- Lista na dziś, przenoszenie na jutro (`deferred_until`), filtr po obszarze życia (S-04, S-05, FR-009–FR-014); ręczne dodawanie zadania z listy na dziś (FR-008).
- Przenoszenie zadania między milestonami i zmiana `milestone_id`; zadania wolnostojące, subtaski, opis zadania, ręczne sortowanie, edycja zbiorcza.
- Etykiety „po terminie" (FR-015), pasek postępu milestona, liczniki zadań na liście projektów, zmiany w middleware i klient Supabase w `locals`.
- Zmiany w istniejących migracjach (nowa migracja); `supabase db push` na zdalny projekt (cztery migracje razem, ręcznie, przed wdrożeniem).
- Runner testów jednostkowych i `supabase test db` w CI (Moduł 3); naprawa `npm run lint` na Windowsie (CRLF + 6 plików spoza `src/`).

## Implementation Approach

Kolejność „baza → backend → UI", jak w S-02. Decyzje:

- **Trasy:** `POST /api/projects/[id]/milestones/[milestoneId]/tasks`; `PUT`, `PATCH`, `DELETE /api/projects/[id]/milestones/[milestoneId]/tasks/[taskId]`. `PATCH` z ciałem `{ "status": "todo"|"partial"|"done" }` zmienia status, `PUT` zastępuje `{title, due_date}` (`due_date: null` lub pusty ciąg czyści termin).
- **Statusy:** `201 {task}`, `200 {task}`, `204`; `422 {error, fieldErrors?}` dla walidacji, reguły daty i zamkniętego milestona; `404` dla nieznanego projektu, milestona (musi należeć do projektu ze ścieżki) lub zadania (musi należeć do milestona); `401/415/400/500` jak dotąd.
- **Reguły w bazie:** jeden trigger na `tasks` (`BEFORE INSERT OR UPDATE OF due_date, milestone_id, status`) sprawdza termin ≤ data milestona i brak niezrobionego zadania w zamkniętym milestonie; jeden trigger na `milestones` (`BEFORE UPDATE OF due_date … WHEN (new.due_date < old.due_date)`) odrzuca datę wcześniejszą niż termin któregoś zadania. Komunikaty ASCII (jak komunikat daty milestona) są kontraktem z serwisami i przypięte testem pgTAP.
- **Zamknięty milestone:** edycja tytułu i terminu zadania `done` oraz usunięcie zadania są dozwolone; dodanie zadania i cofnięcie na `todo`/`partial` odrzuca baza (UI wyłącza „Dodaj zadanie").
- **Walidacja:** `title` po przycięciu 1–200 bez NUL (wspólne `nameField`); `due_date` opcjonalna, realna data od 1000-01-01; reguła względem milestona w bazie, a w formularzu `max` i sprawdzenie (UX).
- **Lista:** `listMilestones` osadza zadania, sortowane `due_date` rosnąco (NULL na końcu), potem `created_at`; `task_count` z długości tablicy.
- **UI:** zadania w wierszu milestona (zawsze widoczne, bez rozwijania), jedna wyspa na wiersz zadania (`TaskRowActions`: status, edycja, usunięcie) i jedna na „Dodaj zadanie" per milestone; blokada po sukcesie i przeładowanie strony jak w S-02; poprawki z przeglądów stosowane od początku (`aria-label` z nazwą elementu, `role="alert"`, fokus na pierwszym błędnym polu, warunkowy zapis tam, gdzie liczy się atomowość).

## Phase 1: Reguły zadań w bazie

### Overview

Nowa migracja z triggerami na `tasks` i `milestones` oraz testy pgTAP z przypiętymi komunikatami, także dla wyścigu z zamykaniem.

### Changes Required:

#### 1. Migracja z triggerami

**File**: `supabase/migrations/20261015120000_task_rules.sql`

**Intent**: Baza pilnuje niezmienników zadań niezależnie od tego, kto zapisuje (aplikacja, S-05, psql), i domyka lukę F2 z przeglądu S-02.

**Contract**: dwie funkcje `language plpgsql`, `SECURITY INVOKER`, `set search_path = ''`, w pełni kwalifikowane nazwy, komunikaty ASCII, `errcode check_violation`.

- `public.check_task_rules()` + trigger `tasks_check_rules` jako `BEFORE INSERT OR UPDATE OF due_date, milestone_id, status ON public.tasks FOR EACH ROW`. Czyta `due_date` i `completed_at` milestona `new.milestone_id` z `FOR SHARE`; gdy `SELECT … INTO` nie zwróci wiersza (`NOT FOUND` — milestone nie istnieje albo jest niewidoczny dla roli przez RLS), funkcja zwraca `new` bez błędu, a właściwy błąd zgłaszają WITH CHECK (`42501`) i klucz obcy (`23503`), tak jak oczekują istniejące testy RLS (`core_domain_rls.test.sql:132,190`). Reguła 1: `new.due_date IS NOT NULL AND new.due_date > milestone.due_date` → `Termin zadania (%) nie moze byc pozniejszy niz data milestona (%)`. Reguła 2: `milestone.completed_at IS NOT NULL AND new.status <> 'done'` → `Zamkniety milestone nie moze miec niezrobionych zadan`. Równość terminów dozwolona; zadanie `done` w zamkniętym milestonie przechodzi (edycja tytułu/terminu).
- `public.check_milestone_date_covers_tasks()` + trigger `milestones_check_task_dates` jako `BEFORE UPDATE OF due_date ON public.milestones FOR EACH ROW WHEN (new.due_date < old.due_date)`. Liczy zadania milestona z `due_date > new.due_date`; przy liczbie większej od zera → `Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (%)` (`%` = liczba). Komunikat celowo nie zawiera frazy „Data milestona" (serwis rozróżnia reguły po tekście).
- Komentarz nagłówkowy w stylu istniejących migracji; zaktualizować komentarz „Znane ograniczenie" w `20261014120000_milestone_close_rule.sql` **nie** — zastosowanych migracji nie edytujemy; nowa migracja wspomina w nagłówku, że domyka to ograniczenie.

#### 2. Testy pgTAP

**File**: `supabase/tests/database/core_domain_task_rules.test.sql`

**Intent**: Zabezpieczyć reguły i komunikaty, które serwisy tłumaczą po tekście.

**Contract**: pgTAP (`begin; select plan(n); … select * from finish(); rollback;`), użytkownicy wstawiani do `auth.users`, ASCII jak w pozostałych plikach. Przypadki: `has_trigger` dla obu triggerów; zadanie bez terminu w otwartym milestonie przechodzi; termin równy dacie milestona przechodzi, późniejszy odrzucony z `23514` i dokładnym komunikatem; zmiana `due_date` zadania na późniejszą odrzucona; wstawienie zadania `todo`/`partial` do zamkniętego milestona odrzucone z dokładnym komunikatem, `done` przechodzi; zmiana statusu zadania `done` → `todo` w zamkniętym milestonie odrzucona, a w otwartym przechodzi; zmiana tytułu zadania `done` w zamkniętym milestonie przechodzi; przesunięcie daty milestona przed termin zadania odrzucone z liczbą (1 i 2 zadania), przesunięcie na datę równą najpóźniejszemu terminowi przechodzi, przesunięcie wstecz bez zadań z terminem przechodzi, przesunięcie w przód przechodzi; reguły działają też w roli `authenticated` z RLS (zadanie z późniejszym terminem odrzucone, poprawne przechodzi).

#### 3. Dostosowanie istniejącego testu zamykania milestona

**File**: `supabase/tests/database/core_domain_milestone_close.test.sql`

**Intent**: Nowa reguła uniemożliwia stan, który setup testu z S-02 tworzy celowo (niezrobione zadanie w już zamkniętym milestonie), więc bez zmiany cały plik padnie w setupie.

**Contract**: wokół `insert into public.tasks` (linie 34-42, zadania `t5` i `t6` w zamkniętych milestonach m5/m6) dodać `alter table public.tasks disable trigger tasks_check_rules;` przed i `alter table public.tasks enable trigger tasks_check_rules;` po wstawieniu, z komentarzem, że m5/m6 symulują stan sprzed reguły zadań; test działa jako `postgres` (właściciel tabeli), a transakcja jest wycofywana. `plan(13)` i pozostałe asercje bez zmian. Pliki `core_domain_schema.test.sql` i `core_domain_rls.test.sql` nie wymagają zmian.

### Success Criteria:

#### Automated Verification:

- Wszystkie migracje aplikują się czysto od zera: `npx supabase db reset`
- Testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db`

#### Manual Verification:

- W psql widać triggery `tasks_check_rules` i `milestones_check_task_dates`, a próby (zadanie po terminie milestona, niezrobione zadanie w zamkniętym milestonie, przesunięcie daty milestona) dają komunikaty po polsku bez diakrytyków

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Backend — walidacja, serwis, trasy, smoke

### Overview

Schemat zadania, serwis z tłumaczeniem błędów, `listMilestones` z zadaniami, cztery trasy JSON, tłumaczenie nowego błędu daty w serwisie milestonów i smoke dla API (z zamykaniem milestona przez aplikację).

### Changes Required:

#### 1. Schemat zadania

**File**: `src/lib/validation/task.ts`

**Intent**: Reguły wejścia dla zadania i dla zmiany statusu, na wspólnych polach.

**Contract**: eksporty `TASK_FIELDS = ["title", "due_date"]`, typy `TaskField`/`TaskFieldErrors`, `taskInputSchema` (`title` z `nameField` i polskimi komunikatami „Podaj tytuł zadania", „Tytuł zadania może mieć maksymalnie 200 znaków", „Tytuł zawiera niedozwolony znak"; `due_date` opcjonalna: brak, `null` i pusty ciąg → `null`, w przeciwnym razie `dateField` z komunikatami „Podaj poprawną datę terminu w formacie RRRR-MM-DD", „Termin nie może być wcześniejszy niż rok 1000"), `taskStatusSchema` (`{status}` z `z.enum(TASK_STATUSES)` i komunikatem „Podaj status: todo, partial lub done"), `taskIdSchema = z.uuid()` oraz `flattenTaskErrors(error)` (pierwszy komunikat na pole). `TaskInput = z.output<typeof taskInputSchema>` (`{title: string; due_date: string | null}`).

#### 2. Typ listy milestonów z zadaniami

**File**: `src/types.ts`

**Intent**: Widok potrzebuje zadań przy milestonie.

**Contract**: `MilestoneListItem = Milestone & { task_count: number; tasks: Task[] }` (`Task` z zawężonym statusem już istnieje).

#### 3. Serwis zadań

**File**: `src/lib/services/tasks.ts`

**Intent**: CRUD zadań i zmiana statusu z tłumaczeniem błędów triggerów i walidacją przynależności milestona do projektu.

**Contract**: eksporty `createTask(supabase, projectId, milestoneId, input)`, `updateTask(supabase, projectId, milestoneId, taskId, input)`, `setTaskStatus(supabase, projectId, milestoneId, taskId, status)`, `deleteTask(supabase, projectId, milestoneId, taskId)` oraz typy `TaskResult` (`ok` z `task` / `validation` z `error` i `fieldErrors` / `not_found` / `unavailable` z `error`) i `TaskDeleteResult`. Każda operacja najpierw czyta milestone po `id` i `project_id` (brak → `not_found`), potem pisze po `milestone_id` (zadanie obcego milestona → `not_found`, zawsze `.select()` i `data.at(0)`). `user_id`/`milestone_id` nigdy z ciała. Tłumaczenie `23514` po tekście: „Termin zadania" → `validation` z `fieldErrors.due_date` „Termin zadania nie może być późniejszy niż data milestona"; „Zamkniety milestone" → `validation` bez pola z komunikatem „Nie można dodać niezrobionego zadania do zamkniętego milestona. Otwórz milestone ponownie."; `tasks_title_length` → `fieldErrors.title`; `23503` → `not_found`; `42501` → sesja wygasła; reszta logowana przez `logError` i ogólny komunikat (wzorzec z `milestones.ts`, błędy klienta bez treści Postgresa). `status` zwracany z serwisu jest typu `TaskStatus`.

#### 4. Lista milestonów z zadaniami i nowy błąd daty milestona

**File**: `src/lib/services/milestones.ts`

**Intent**: Jedno zapytanie dla widoku i obsługa reguły „data milestona nie wcześniejsza niż termin zadania".

**Contract**: `listMilestones` robi `select("*, tasks(*)")` z `order(due_date)`, `order(seq)` dla milestonów oraz `order("due_date", {referencedTable: "tasks", ascending: true, nullsFirst: false})` i `order("created_at", {referencedTable: "tasks", ascending: true})` dla zadań; zwraca `MilestoneListItem` z `tasks` (status zawężony do `TaskStatus`) i `task_count = tasks.length`. `translateError` rozpoznaje komunikat `Nie mozna przesunac daty milestona` (przy `23514`) i zwraca `validation` z `fieldErrors.due_date` „Nie można ustawić tej daty: {N} {zadanie|zadania|zadań} ma późniejszy termin" (liczba z końcówki komunikatu istniejącą funkcją `parseOpenTaskCount`, odmiana `plural` z `format.ts`; przy braku liczby komunikat bez niej). Dotychczasowe rozpoznania bez zmian.

#### 5. Trasy zadań

**File**: `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/index.ts`, `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts`

**Intent**: Trasy JSON zadań tym samym wzorcem co trasy milestonów.

**Contract**: `export const prerender = false`; `POST` (index) → `201 {task}`; `PUT` → `200 {task}`; `PATCH` (`taskStatusSchema`) → `200 {task}`; `DELETE` → `204` bez ciała. Identyfikatory ze ścieżki walidowane `projectIdSchema`, `milestoneIdSchema`, `taskIdSchema` przed `createClient` (zły uuid → 404); `readJsonBody` wymusza `Content-Type` JSON (strażnik CSRF; `DELETE` bez ciała, chroniony sprawdzeniem Origin Astro); 422 niesie `{error, fieldErrors?}`, błędy `unavailable` → 500/503 jak w trasach milestonów; pozostałe statusy zgodnie z „Implementation Approach". Middleware bez zmian.

#### 6. Smoke dla API zadań

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć reguły zadań przez aplikację, w tym zamykanie milestona z zadaniem (dotąd tylko psql), bez przepisywania istniejącego przepływu.

**Contract**: nowy blok kroków wstawiony **bezpośrednio przed** krokiem „milestone create in unknown project returns 404" (po kroku „project page renders reopened milestone"), na milestonie „Gamma smoke" (data `2099-12-31`, otwarty, zapamiętany identyfikator), w kolejności: (T1) `POST …/tasks` z pustym tytułem → 422 z `fieldErrors.title`; (T2) `POST` z `due_date: "2100-01-01"` → 422 z `fieldErrors.due_date`; (T3) `POST` `{title: "Zadanie smoke", due_date: "2099-12-30"}` → 201 z `task.id` (zapamiętać id); marker `// (page step T4 of phase 3 goes here)`; (T5) `PATCH` milestona `{completed: true}` → 422, `bodyEquals: {error: "Nie można zamknąć milestona: ma niezrobione zadania (1)"}`; (T6) `PATCH` zadania `{status: "done"}` → 200; (T7) `PATCH` milestona `{completed: true}` → 200; marker `// (page step T8 of phase 3 goes here)`; (T9) `POST` zadania do zamkniętego milestona → 422, `bodyEquals: {error: "Nie można dodać niezrobionego zadania do zamkniętego milestona. Otwórz milestone ponownie."}`; (T10) `PATCH` zadania `{status: "todo"}` → 422 z tym samym `error`; (T11) `PUT` milestona `{name: "Gamma smoke", due_date: "2099-12-29"}` → 422 z `fieldErrors.due_date` (zadanie ma termin 2099-12-30); (T12) `PUT` zadania `{title: "Zadanie smoke 2", due_date: null}` → 200 (edycja zadania `done` w zamkniętym milestonie); (T13) `PATCH` milestona `{completed: false}` → 200 (przywraca stan); (T14) `PATCH` zadania z nieznanym uuid → 404; (T15) `DELETE` zadania → 204, powtórzone → 404. Runner wypełnia `text` tylko dla odpowiedzi `text/html` (`smoke.mjs:38-43`), więc dla JSON asercje na tekst błędu robić przez `bodyEquals` (ścisła równość) lub `bodyField` (istnienie ścieżki, np. `fieldErrors.title`), nie przez `bodyIncludes`. Identyfikator zadania z T3 zapamiętać w zmiennej `let taskId = ""` zadeklarowanej obok `milestoneA` i `completedAt`, nad tablicą kroków. Plik ma zakończenia linii CRLF — zachować; edytować narzędziami Edit/Write, nie przez shell z backslashami.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym nowe kroki API zadań (podgląd produkcyjny na :4321 i lokalny Supabase): `npm run smoke`

#### Manual Verification:

- Odpowiedzi API zadań (422, 404) są po polsku, wskazują pole i nie ujawniają treści błędów Postgresa (np. `curl` z ciasteczkiem sesji lub kroki smoke)
- Zamknięcie milestona przez API z niezrobionym zadaniem zwraca 422 z liczbą, a po `PATCH status: done` zamknięcie przechodzi

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: UI — hook, dialogi, lista zadań w widoku projektu, smoke stron

### Overview

Hook zadań, dialogi (formularz, usuwanie), wyspa akcji wiersza zadania, lista zadań w wierszu milestona i smoke dla strony z asercjami na treść.

### Changes Required:

#### 1. Hook zadań

**File**: `src/components/hooks/use-task-api.ts`

**Intent**: Jedno miejsce wywołań `fetch` do tras zadań, na wspólnym `api-client`.

**Contract**: `useTaskApi()` zwraca `createTask(projectId, milestoneId, input)`, `updateTask(projectId, milestoneId, taskId, input)`, `setTaskStatus(projectId, milestoneId, taskId, status)`, `deleteTask(projectId, milestoneId, taskId)`; wyniki rozróżnione (`ok` z zadaniem / `fieldErrors` z `error` / `notFound` / `unauthorized` / `unavailable`), 401 → `redirectToSignin()`, sieć niedostępna → `NETWORK_ERROR`; `ok` tylko gdy odpowiedź zawiera `task` z poprawnym `id` (`taskIdSchema`); `DELETE` bez ciała i bez `Content-Type`; typy wyników o nazwach unikalnych względem `ProjectApi*` i `MilestoneApi*` (np. `TaskApi*`).

#### 2. Formularz zadania

**File**: `src/components/projects/TaskFormDialog.tsx`

**Intent**: Jeden dialog dla trybów „dodaj" i „edytuj".

**Contract**: wyspa React; propsy `mode`, `projectId`, `milestone` (`id`, `due_date`, `name`), opcjonalne `task` (`id`, `title`, `due_date`) oraz `disabled` (gdy milestone zamknięty — wtedy tylko wyłączony przycisk „Dodaj zadanie"); pola: tytuł (`Input`), termin (`<input type="date">`, opcjonalny, `max={milestone.due_date}`); walidacja klienta przez `taskInputSchema` plus sprawdzenie `due_date <= milestone.due_date` z komunikatem „Termin zadania nie może być późniejszy niż data milestona ({data})"; błędy 422 przypisywane do pól, błąd ogólny (zamknięty milestone) jako `role="alert"`; fokus na pierwszym błędnym polu; `aria-required` tylko dla tytułu (termin opcjonalny); po udanym zapisie przycisk zablokowany do przeładowania (`window.location.reload()`); wyzwalacz przez `DialogTrigger asChild` („Dodaj zadanie" `secondary` `sm` w trybie dodawania, „Edytuj" `ghost` `sm` w trybie edycji) z `aria-label` zawierającym nazwę milestona/zadania; tytuły „Dodaj zadanie"/„Edytuj zadanie"; bez `DialogDescription` (`aria-describedby={undefined}`), teksty „Zapisz", „Anuluj". Wzorzec: `MilestoneFormDialog.tsx`.

#### 3. Dialog usuwania zadania

**File**: `src/components/projects/DeleteTaskDialog.tsx`

**Intent**: Potwierdzenie usunięcia (decyzja: zawsze).

**Contract**: wyspa na `ConfirmDialog` z propem `trigger` (ghost `sm` „Usuń" w `destructive-ink`, `aria-label` „Usuń zadanie {tytuł}"); tytuł „Usunąć zadanie {tytuł}?", opis „Tej operacji nie można cofnąć."; przycisk „Usuń zadanie"; po sukcesie przeładowanie strony, 404 → komunikat i przeładowanie; przyciski zablokowane po sukcesie. Wzorzec: `DeleteMilestoneDialog.tsx`.

#### 4. Akcje wiersza zadania

**File**: `src/components/projects/TaskRowActions.tsx`

**Intent**: Jedna wyspa na zadanie zamiast trzech.

**Contract**: propsy `projectId`, `milestone` (`id`, `due_date`, `name`), `task` (`id`, `title`, `due_date`, `status`); renderuje natywny `Select` statusu (opcje „Do zrobienia", „Częściowo", „Zrobione"; `aria-label` „Status zadania {tytuł}"), `TaskFormDialog` (edycja) i `DeleteTaskDialog`; zmiana statusu zapisuje od razu (`setTaskStatus`), po sukcesie przeładowanie; błąd (np. 422 zamkniętego milestona) w `role="alert"` pod wierszem, a kontrolka wraca do poprzedniej wartości; kontrolki zablokowane w trakcie i po sukcesie do przeładowania. Tylko tokeny (`select.tsx` z repo, bez nowych komponentów shadcn): komponent przyjmuje `options: {value, label}[]` i `onChange(value: string)` (nie zdarzenie), ma bazową klasę `w-full h-10`, więc w wierszu zadania nadpisać szerokość przez `className`.

#### 5. Lista zadań w widoku projektu

**File**: `src/pages/projects/[id].astro`

**Intent**: Wyświetlić zadania pod każdym milestonem i przycisk dodawania.

**Contract**: wiersz milestona (`<li>`, dziś jeden kontener flex: nagłówek po lewej, `MilestoneRowActions` po prawej) dostaje kontener kolumnowy — dotychczasowy nagłówek z akcjami zostaje w górnym wierszu flex, a pod nim sekcja zadań: `<ul>` zadań z danych `milestone.tasks` (tytuł, termin przez `formatDate`, gdy brak — „bez terminu", zadania `done` wyszarzone z przekreśleniem, `TaskRowActions` `client:load`) oraz `TaskFormDialog` (`mode="create"`, `client:load`, `disabled` gdy `milestone.completed_at`) z podpowiedzią „Otwórz milestone, aby dodać zadanie." widoczną dla zamkniętego milestona; pusty milestone: „Brak zadań w tym milestonie." (`type-meta`). Licznik zadań w nagłówku milestona z `task_count` bez zmian. Układ bez poziomego przewijania na 390 px, tylko tokeny i klasy ze skali, bez literałów kolorów.

#### 6. Smoke dla strony

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć stronę z zadaniami zgodnie z lekcją o wyspach React.

**Contract**: kroki `GET /projects/{id}` → 200 wstawiane w miejscach zaznaczonych w Fazie 2, bez przepisywania przepływu: **T4** (po T3) treść zawiera „Dodaj zadanie" i „Zadanie smoke" (`bodyOrder`: „Gamma smoke" przed „Zadanie smoke"); **T8** (po T7, milestone zamknięty) treść zawiera „Otwórz milestone, aby dodać zadanie." oraz „Zadanie smoke". Istniejące kroki bez zmian. Po dodaniu kroków zrobić test zepsucia (`throw` w komponencie wyspy) i potwierdzić, że kroki robią się czerwone.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym nowe kroki stron zadań: `npm run smoke`

#### Manual Verification:

- Pełny przepływ w przeglądarce: otwórz projekt → „Dodaj zadanie" w milestonie → pojawia się na liście → zmiana statusu → „Edytuj" → „Usuń" z potwierdzeniem; zamknięcie milestona z niezrobionym zadaniem pokazuje komunikat z liczbą, a po ustawieniu wszystkich zadań na „Zrobione" zamknięcie się udaje
- Terminy: zadanie z terminem równym dacie milestona zapisuje się, późniejszy jest niemożliwy do wybrania (`max`), a wpisany pokazuje komunikat przy polu; przesunięcie daty milestona przed termin zadania pokazuje komunikat przy polu daty z liczbą zadań; kolejność zadań: termin rosnąco, bez terminu na końcu, potem kolejność utworzenia
- Zamknięty milestone: „Dodaj zadanie" jest wyłączone z podpowiedzią, cofnięcie zadania na „Do zrobienia" pokazuje komunikat po polsku, a edycja tytułu i usunięcie zadania działają
- Regresja po zmianie `listMilestones`: dodawanie, edycja, zamykanie i usuwanie milestona oraz liczniki w dialogu usuwania nadal działają; usunięcie milestona z zadaniami kasuje je
- Wygląd i dostępność: jasny i ciemny motyw, 390 px i 1280 px bez poziomego przewijania, fokus wraca na wyzwalacz po zamknięciu dialogów (Anuluj, Esc), fokus startuje na „Anuluj" w dialogu usuwania, nawigacja klawiaturą, przyciski mają nazwy z tytułem zadania

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera; reguły w bazie pokrywa pgTAP (`core_domain_task_rules.test.sql`): komunikaty, równość terminów, zamknięty milestone, kolizja daty milestona z terminami, rola `authenticated` z RLS.
- Walidacja i tłumaczenie błędów pokrywa smoke przez API (422 z polem, 404, idempotentne usunięcie).

### Integration Tests:

- Smoke (`npm run smoke`): blok kroków zadań na milestonie „Gamma smoke" (T1–T15) i dwa kroki strony z asercją na treść (lekcja o wyspach React) oraz test zepsucia.
- pgTAP uruchamiany ręcznie (`npx supabase test db`), nie w CI (Moduł 3).

### Manual Testing Steps:

1. Dodaj zadanie z terminem i bez, sprawdź kolejność i wyświetlanie „bez terminu".
2. Spróbuj zamknąć milestone z niezrobionym zadaniem, ustaw zadania na „Zrobione", zamknij; sprawdź wyłączone „Dodaj zadanie" i komunikat po cofnięciu statusu.
3. Przesuń datę milestona przed termin zadania i sprawdź komunikat przy polu.
4. Sprawdź klawiaturę i fokus w dialogach, jasny/ciemny motyw, 390 i 1280 px.

## Performance Considerations

Widok projektu to dwa zapytania (projekt i `listMilestones` z osadzonymi zadaniami); osadzenie `tasks(*)` ładuje wszystkie zadania projektu — skala MVP mała, bez paginacji. Triggery na `tasks` robią jedno `SELECT … FOR SHARE` po kluczu głównym milestona, a trigger milestona jeden `count` po indeksie `tasks_milestone_id_idx`.

## Migration Notes

Jedna nowa migracja (`20261015120000_task_rules.sql`). Wdrożenie wymaga ręcznego `supabase db push` **czterech migracji razem** (dwie z `core-domain-schema`, `milestone_close_rule` i ta) na zdalny projekt przed wdrożeniem aplikacji. Istniejące dane: baza nie ma jeszcze zadań z terminem po milestonie ani niezrobionych zadań w zamkniętych milestonach (zadania powstają dopiero w tym slice'u); triggery działają tylko przy zapisie, więc nie ma przebudowy danych. Wycofanie: nowa migracja usuwająca triggery i funkcje; zastosowanych migracji nie edytować.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-03), PRD: `context/foundation/prd.md` (FR-006, FR-007; Business Logic dla listy na dziś)
- Lekcje: `context/foundation/lessons.md`
- Design system: `context/foundation/design-system/design-system.md`
- Poprzednie slice'y: `context/archive/2026-10-14-milestone-crud/plan.md`, `reviews/impl-review.md` (F1 warunkowy zapis, F2 niezmiennik, F3 `aria-label`), `context/archive/2026-10-09-project-crud/plan.md`
- Baza: `supabase/migrations/20261009120000_create_core_domain_schema.sql:41-56,85-140`, `20261014120000_milestone_close_rule.sql`; serwis: `src/lib/services/milestones.ts:19-69`; widok: `src/pages/projects/[id].astro:94-160`; hook: `src/components/hooks/use-milestone-api.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły zadań w bazie

#### Automated

- [x] 1.1 Wszystkie migracje aplikują się czysto od zera: `npx supabase db reset` — 0363700
- [x] 1.2 Testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db` — 0363700

#### Manual

- [x] 1.3 W psql widać triggery `tasks_check_rules` i `milestones_check_task_dates`, a próby naruszenia reguł dają komunikaty po polsku bez diakrytyków — 0363700

### Phase 2: Backend — walidacja, serwis, trasy, smoke

#### Automated

- [x] 2.1 Lint zmienionych plików bez błędów (`endOfLine: auto`)
- [x] 2.2 Sprawdzanie typów przechodzi: `npx astro check`
- [x] 2.3 Build przechodzi: `npm run build`
- [x] 2.4 Smoke przechodzi, w tym nowe kroki API zadań: `npm run smoke`

#### Manual

- [x] 2.5 Odpowiedzi API zadań (422, 404) są po polsku, wskazują pole i nie ujawniają treści błędów Postgresa
- [x] 2.6 Zamknięcie milestona przez API z niezrobionym zadaniem zwraca 422 z liczbą, a po ustawieniu statusu `done` zamknięcie przechodzi

### Phase 3: UI — hook, dialogi, lista zadań w widoku projektu, smoke stron

#### Automated

- [ ] 3.1 Lint zmienionych plików bez błędów (`endOfLine: auto`)
- [ ] 3.2 Sprawdzanie typów przechodzi: `npx astro check`
- [ ] 3.3 Build przechodzi: `npm run build`
- [ ] 3.4 Smoke przechodzi, w tym nowe kroki stron zadań: `npm run smoke`

#### Manual

- [ ] 3.5 Pełny przepływ w przeglądarce: dodanie, zmiana statusu, edycja, usunięcie zadania oraz zamknięcie milestona po ustawieniu zadań na „Zrobione"
- [ ] 3.6 Terminy: `max` i błąd przy polu, komunikat przy przesunięciu daty milestona, kolejność zadań
- [ ] 3.7 Zamknięty milestone: wyłączone „Dodaj zadanie", komunikat po cofnięciu statusu, edycja i usunięcie działają
- [ ] 3.8 Regresja milestonów po zmianie `listMilestones`: dodawanie, edycja, zamykanie, usuwanie i liczniki w dialogu
- [ ] 3.9 Wygląd i dostępność: motywy, 390 px i 1280 px, powrót fokusu po zamknięciu dialogów, klawiatura, nazwy przycisków
