# Akcje na liście zadań na dziś Implementation Plan

## Overview

Piąty slice roadmapy (S-05, FR-011, FR-012): na stronie `/today` każde zadanie dostaje trzy akcje — **Zrobione**, **Częściowo** (przełącznik) i **Na jutro** — a zadania przeniesione na później są widoczne w zwijanej liście pod licznikiem z przyciskiem „Przywróć na dziś". Zapis przeniesienia (`tasks.deferred_until`) dochodzi jako drugi kształt ciała istniejącego `PATCH` zadania; datę „jutro" liczy serwer w `Europe/Warsaw`. Każda zmiana statusu czyści przeniesienie, a po akcji strona się przeładowuje (serwer przelicza listę, podsumowanie i wiersz „milestone do zamknięcia"). Baza i funkcja `today_list` zostają bez zmian.

## Current State Analysis

Stan na commit `e67a317` (po archiwizacji S-04); decyzje z wywiadu w „Implementation Approach".

- **Zmiana statusu już istnieje:** `PATCH /api/projects/[id]/milestones/[milestoneId]/tasks/[taskId]` z ciałem `{status}` → `setTaskStatus` (`src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts`, `src/lib/services/tasks.ts`); hook `useTaskApi().setTaskStatus` (`src/components/hooks/use-task-api.ts`) i wyspa `TaskRowActions` w widoku projektu z niej korzystają.
- **Zapisu `deferred_until` nie ma:** kolumna istnieje (`tasks.deferred_until date null`), czyta ją tylko funkcja `public.today_list` (ukrywa niedokończone zadanie z `deferred_until` > dziś i zwraca je jako wiersze `kind = 'deferred'` z pełnymi danymi zadania, projektu i milestona; `supabase/migrations/20261016120000_today_list.sql`). Żaden kod aplikacji jej nie zapisuje, a trigger `tasks_check_rules` nie odpala się na samej zmianie `deferred_until` (lista kolumn: `due_date, milestone_id, status`).
- **`/today` dziś:** strona SSR z wierszami zadań (chip terminu, link projektu), wierszami milestonów (z wyspą `CloseMilestoneButton`) i linijką „Przeniesione na później: N" (`src/pages/today.astro`, `src/lib/services/today.ts` — `getToday` liczy wiersze `deferred`, nie zwraca ich treści; `TodayView.deferredCount`, `src/types.ts`).
- **Pomocnicy dnia:** `todayInWarsaw()` i `daysFromToday` w `src/lib/today.ts`; brak `tomorrowInWarsaw`.
- **Wzorce do powielenia:** wyspa z `navigating` i `aria-disabled` (`src/components/today/CloseMilestoneButton.tsx`, `MilestoneRowActions.tsx`), hook na wspólnym `api-client`, trasy JSON z `readJsonBody`, smoke z asercjami na treść wysp.
- **Lekcje** (`context/foundation/lessons.md`): smoke dla strony z wyspą React musi asercją na treść sprawdzać render wyspy (tekst z wyspy, test zepsucia); przed `shadcn add` sprawdzić zależności (tu bez nowych komponentów). Z przeglądów S-02…S-04: kontrolki, które mają zachować fokus po żądaniu, dostają `aria-disabled` (+ `aria-busy`) zamiast `disabled`; przyciski w wierszach mają `aria-label` z nazwą elementu; backslashe przez shell potrafią zepsuć znaki — pliki edytować narzędziami Edit/Write.
- **Testy:** brak runnera TS; pgTAP dla bazy (143+ testów, tu bez zmian w bazie) i smoke (`npm run smoke`), który — inaczej niż w S-04 — może teraz ustawić `deferred_until` przez API.

## Desired End State

- Na `/today` pod każdym zadaniem (lub obok chipa terminu) widać przyciski: **Zrobione** (ustawia `done`), **Częściowo** (przełącza `todo` ↔ `partial`, `aria-pressed`) i **Na jutro** (przenosi na jutro bez zmiany statusu). Przyciski są zawsze widoczne (bez ukrywania do najechania), mają `aria-label` z tytułem zadania i zachowują fokus w trakcie żądania.
- Po sukcesie strona się przeładowuje: zrobione i przeniesione zadania znikają, `partial` dostaje dopisek „· częściowo", a gdy ostatnie niedokończone zadanie milestona zostanie zrobione, pojawia się wiersz „milestone do zamknięcia".
- Pod listą jest zwijana sekcja „Przeniesione na później: N" (także przy pustej liście) z zadaniami: tytuł, „Projekt · Milestone · wróci {data}" i przycisk „Przywróć na dziś" (czyści przeniesienie, zadanie wraca na listę po przeładowaniu).
- Zapis statusu (z listy lub z widoku projektu) czyści `deferred_until`; przeniesienie zrobionego zadania jest odrzucane (422), przywrócenie działa zawsze.
- Weryfikacja: lint zmienionych plików, `npx astro check`, `npm run build` i rozszerzony `npm run smoke` (kroki API i kroki strony z asercjami na tekst wysp, test zepsucia); ręcznie przepływ w przeglądarce w jasnym i ciemnym motywie na 390 i 1280 px.

### Key Discoveries:

- `today_list` już zwraca wiersze `deferred` z kompletem danych (tytuł, projekt, milestone, `task_deferred_until`), więc lista przeniesionych nie wymaga migracji ani zmian w funkcji SQL — wystarczy je odczytać w `getToday` (`supabase/migrations/20261016120000_today_list.sql`).
- Zapis samego `deferred_until` nie uruchamia triggera zadań, a zapis `status` uruchamia (`tasks_check_rules`, reguła zamkniętego milestona); `update({status, deferred_until: null})` zachowuje dotychczasowe komunikaty błędów (`src/lib/services/tasks.ts` `translateError`).
- Smoke potrafi teraz ustawić `deferred_until` przez nowy kształt `PATCH`, więc ukrywanie, licznik i przywracanie dają się sprawdzić end-to-end (w S-04 tego nie dało się zrobić).
- Smoke ma w projekcie jedno otwarte zadanie „Zadanie smoke" w milestonie „Gamma smoke" (najbliższy, remis dat po `seq`); po przeniesieniu go lista jest pusta (milestone ma niedokończone, ale przeniesione zadanie), więc zobaczymy stan pusty i sekcję przeniesionych (`scripts/smoke.mjs`).

## What We're NOT Doing

- Animacja znikania („na chwilę z przekreśleniem, potem znika"), akcje widoczne dopiero po najechaniu i komponent `TaskCheck`/`sp-*` z design systemu — przyciski są zawsze widoczne, zwykłe `Button` z repo.
- Wskaźnik przeniesienia w widoku projektu (`TaskRowActions` bez zmian wizualnych; zmiana statusu stamtąd tylko czyści przeniesienie), cofanie „Zrobione" z listy (zadanie `done` znika z listy, cofnięcie w widoku projektu), edycja i usuwanie zadań z listy.
- Dodawanie zadań z listy (S-06, FR-008), filtr po obszarze życia, kolor projektu, FR-015, podgląd kolejnych dni (poza zwijaną listą przeniesionych dzisiejszej listy).
- Zmiany w bazie: brak migracji, brak zmian `today_list` i `tasks_check_rules`; nowy konkretny termin przeniesienia (np. wybór daty) — tylko „jutro" i „przywróć".
- Runner testów jednostkowych i `supabase test db` w CI (Moduł 3); `supabase db push` (pięć migracji razem, ręcznie, przed wdrożeniem).

## Implementation Approach

Kolejność „backend → UI", jak w S-03/S-04. Decyzje z wywiadu:

- **Interakcja:** po sukcesie `window.location.reload()` (wzorzec S-02…S-04, `navigating` blokuje przyciski do przeładowania); serwer przelicza listę, podsumowanie, wiersz milestona i licznik, więc nie ma lokalnej synchronizacji stanu.
- **Przeniesione:** zwijana sekcja `<details>` pod listą z `summary` „Przeniesione na później: N", wierszami zadań i przyciskiem „Przywróć na dziś"; to nie jest podgląd innego dnia, tylko odłożone zadania dzisiejszej listy, widoczne dla użytkownika (guardrail PRD).
- **Czyszczenie przeniesienia:** każdy zapis statusu przez `PATCH {status}` ustawia też `deferred_until = NULL` (zadanie ruszone przez użytkownika wraca na listę); przeniesienie działa do pierwszej zmiany statusu.
- **Częściowo:** przełącznik `todo` ↔ `partial` (`aria-pressed`); **Zrobione** zawsze ustawia `done`; **Na jutro** nie zmienia statusu (FR-012: przenosi niedokończone lub częściowe).
- **API:** `PATCH` dostaje drugi kształt ciała `{ "deferred": "tomorrow" | null }` obok `{ "status" }`; trasa rozróżnia je po obecności klucza `deferred`. `"tomorrow"` → serwer wylicza datę (`tomorrowInWarsaw()`, `Europe/Warsaw`) i zapisuje `deferred_until`; `null` → czyści. Przeniesienie zadania ze statusem `done` kończy się `422` z komunikatem („Zrobionego zadania nie można przenieść na jutro."); wynik jak dotąd `{task}`.
- **UI:** dwie nowe wyspy w `src/components/today/` — `TodayTaskActions` (trzy przyciski wiersza zadania) i `RestoreDeferredButton` („Przywróć na dziś"); przyciski `Button` `sm` z `aria-disabled` + `aria-busy` zamiast `disabled`, błąd w `role="alert"`, `aria-label` z tytułem zadania.
- **Modele:** `TodayView` zamiast `deferredCount` zwraca listę `deferred` (zadania z `deferred_until`); strona liczy licznik z długości listy.
- **Testy:** smoke po API (przeniesienie, czyszczenie statusem, przywrócenie, `422` dla zrobionego i dla błędnej wartości) i po stronie (stan pusty + sekcja przeniesionych + tekst wyspy, akcje zadania + `aria-pressed`), test zepsucia wysp zgodnie z lekcją.

## Critical Implementation Details

- **Timing:** „jutro" jest liczone po stronie serwera jedną funkcją (`tomorrowInWarsaw`) z tej samej strefy co „dziś" na liście (`todayInWarsaw`); nie wolno liczyć go w przeglądarce ani w SQL (`current_date` to UTC), bo o północy czasu polskiego przeniesienie i filtr `deferred_until > p_today` rozjechałyby się o dzień.

## Phase 1: Backend — przeniesienie i czyszczenie

### Overview

Pomocnik „jutro", walidacja i serwis przeniesienia, czyszczenie przeniesienia przy zmianie statusu, drugi kształt `PATCH`, lista przeniesionych w `getToday` oraz smoke dla API.

### Changes Required:

#### 1. Pomocnik „jutro" w Warszawie

**File**: `src/lib/today.ts`

**Intent**: Jedno źródło daty „jutro" spójne z `todayInWarsaw`.

**Contract**: `tomorrowInWarsaw(now: Date = new Date()): string` — dzień po `todayInWarsaw(now)` jako `YYYY-MM-DD` (dodanie jednego dnia do daty kalendarzowej bez zależności od strefy serwera, np. przez `Date.UTC` na składowych `YYYY-MM-DD`).

#### 2. Walidacja przeniesienia

**File**: `src/lib/validation/task.ts`

**Intent**: Reguły wejścia dla drugiego kształtu `PATCH`.

**Contract**: eksport `taskDeferralSchema = z.object({ deferred: z.union([z.literal("tomorrow"), z.null()], { error: "Podaj przeniesienie: \"tomorrow\" albo null" }) })`; `taskStatusSchema` bez zmian.

#### 3. Serwis: przeniesienie i czyszczenie

**File**: `src/lib/services/tasks.ts`

**Intent**: Zapis `deferred_until` i niezmiennik „zmiana statusu czyści przeniesienie".

**Contract**: nowa `setTaskDeferral(supabase, projectId, milestoneId, taskId, until: string | null): Promise<TaskResult>` — najpierw `findMilestone`; `until === null` → `update({ deferred_until: null })`; `until` daty → `update({ deferred_until: until })` z warunkiem `.neq("status", "done")`; gdy zapis nie zwróci wiersza, sprawdzić istnienie zadania w milestonie: istnieje → `validation` z komunikatem „Zrobionego zadania nie można przenieść na jutro." (bez pola), brak → `not_found`; wszystkie zapisy z `.eq("id", taskId).eq("milestone_id", milestoneId).select()` i `data.at(0)` jak dotąd. `setTaskStatus` zapisuje `update({ status, deferred_until: null })`. Błędy tłumaczone istniejącym `translateError`.

#### 4. Trasa `PATCH` z drugim kształtem ciała

**File**: `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts`

**Intent**: Jeden endpoint dla statusu i przeniesienia, bez nowej trasy ani zmian w middleware.

**Contract**: w `PATCH` po `readJsonBody`: gdy ciało jest obiektem z kluczem `deferred` — walidacja `taskDeferralSchema` (błąd → `422 {error}` z pierwszym komunikatem) i `setTaskDeferral(…, deferred === "tomorrow" ? tomorrowInWarsaw() : null)`; w przeciwnym razie dotychczasowa ścieżka `taskStatusSchema` → `setTaskStatus`. Ciało zawierające jednocześnie klucze `status` i `deferred` jest odrzucane przed walidacją schematów: `422 {error: "Podaj albo status, albo przeniesienie."}` (żadna gałąź nie jest wybierana po cichu). Statusy odpowiedzi bez zmian (`200 {task}`, `422 {error, fieldErrors?}`, `404`, `401/415/400/500` jak dotąd).

#### 5. Lista przeniesionych w `getToday`

**File**: `src/lib/services/today.ts`, `src/types.ts`

**Intent**: Zwrócić przeniesione zadania (nie tylko liczbę) do zwijanej listy.

**Contract**: `TodayDeferredTask = TodayTask & { deferred_until: string }` w `src/types.ts`; `TodayView = { tasks: TodayTask[]; milestones: TodayMilestone[]; deferred: TodayDeferredTask[] }` (pole `deferredCount` usunięte; konsument — `today.astro` — liczy licznik z `deferred.length` w Fazie 2); `getToday` mapuje wiersze `kind = 'deferred'` na `deferred` w kolejności z SQL (`task_deferred_until` jako `deferred_until`), reszta bez zmian. Wszystkie trzy miejsca używające `deferredCount` są zmieniane razem (inaczej `astro check` się wywali): inicjalizator i inkrementacja w `today.ts` (`deferred: []` i dopisywanie wiersza do listy) oraz komentarz serwisu, a w `today.astro` inicjalizator `let view: TodayView = { tasks: [], milestones: [], deferred: [] }` i odczyt `view.deferred.length` zamiast `view.deferredCount`, bez zmian wizualnych.

#### 6. Smoke dla API

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć przeniesienie przez aplikację, w tym czyszczenie statusem i reguły błędów, bez przepisywania istniejącego przepływu.

**Contract**: nowe kroki wstawione w bloku zadań z S-03/S-04 **bezpośrednio po** kroku „today page lists the open task of the nearest milestone" i **przed** krokiem „milestone close rejected while it has an open task" (zadanie „Zadanie smoke" jest wtedy `todo` w otwartym „Gamma smoke"), w kolejności: (D1) `PATCH` zadania `{deferred: "tomorrow"}` → 200, `bodyField: "task.deferred_until"`; (D2) `PATCH {status: "partial"}` → 200, `bodyEquals: {"task.status": "partial", "task.deferred_until": null}` (zmiana statusu czyści przeniesienie); (D3) `PATCH {deferred: "tomorrow"}` → 200, `bodyField: "task.deferred_until"`; marker `// (page step D-deferred of phase 2 goes here)`; (D4) `PATCH {deferred: null}` → 200, `bodyEquals: {"task.deferred_until": null}`; marker `// (page step D-actions of phase 2 goes here)`; (D5) `PATCH {deferred: "yesterday"}` → 422, `bodyEquals: {error: "Podaj przeniesienie: \"tomorrow\" albo null"}`; (D7) `PATCH {status: "todo", deferred: "tomorrow"}` → 422, `bodyEquals: {error: "Podaj albo status, albo przeniesienie."}` (stan zadania bez zmian); oraz po kroku „task status done succeeds" krok (D6) `PATCH {deferred: "tomorrow"}` na zrobionym zadaniu → 422, `bodyEquals: {error: "Zrobionego zadania nie można przenieść na jutro."}`. Po D4 zadanie ma status `partial` (zmiana z D2) — kolejne istniejące kroki (blokada zamknięcia z „niezrobione zadania (1)", ustawienie `done`) pozostają prawdziwe. Runner wypełnia `text` tylko dla `text/html`, więc asercje na JSON przez `bodyEquals`/`bodyField`; plik ma zakończenia CRLF — zachować, edytować narzędziami Edit/Write lub skryptem node z pliku, nie przez shell z backslashami.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym nowe kroki API przeniesienia (podgląd produkcyjny na :4321 i lokalny Supabase): `npm run smoke`

#### Manual Verification:

- Odpowiedzi API (`PATCH {deferred}` 200/422, błędna wartość 422, zmiana statusu czyści przeniesienie) są po polsku, wskazują błąd i nie ujawniają treści błędów Postgresa (np. skrypt demo z kontem testowym lub kroki smoke)
- Zapisana data `deferred_until` to jutro w `Europe/Warsaw` (sprawdzenie w psql względem dnia warszawskiego)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: UI na `/today` — akcje wiersza i lista przeniesionych

### Overview

Rozszerzenie hooka zadań, wyspa akcji wiersza zadania, wyspa „Przywróć na dziś", zwijana lista przeniesionych w `today.astro` oraz smoke z asercjami na tekst wysp i test zepsucia.

### Changes Required:

#### 1. Hook: przeniesienie

**File**: `src/components/hooks/use-task-api.ts`

**Intent**: Jedno miejsce wywołań `fetch` także dla przeniesienia.

**Contract**: `useTaskApi()` zwraca dodatkowo `setTaskDeferral(projectId, milestoneId, taskId, deferred: "tomorrow" | null)` → `PATCH {deferred}` z wynikiem `TaskApiSaveResult` (ta sama obsługa 401 → `redirectToSignin`, 404, 422, sieci); `setTaskStatus` bez zmian.

#### 2. Wyspa akcji wiersza zadania

**File**: `src/components/today/TodayTaskActions.tsx`

**Intent**: Trzy akcje FR-011/FR-012 przy zadaniu na liście.

**Contract**: wyspa React; propsy `projectId`, `milestoneId`, `taskId`, `title`, `status` (`"todo" | "partial"`); trzy `Button` `sm`: „Zrobione" (`aria-label` „Zrobione: {tytuł}") → `setTaskStatus(…, "done")`, „Częściowo" (`aria-label` „Częściowo: {tytuł}", `aria-pressed={status === "partial"}`) → `setTaskStatus(…, status === "partial" ? "todo" : "partial")`, „Na jutro" (`aria-label` „Na jutro: {tytuł}") → `setTaskDeferral(…, "tomorrow")`; wspólna blokada żądania (`aria-disabled` + klasy `aria-disabled:pointer-events-none aria-disabled:opacity-50`, `aria-busy`, zmiany w trakcie ignorowane), po sukcesie `window.location.reload()` z `navigating` do przeładowania, 401 → przekierowanie przez hook, błąd (422, 404, sieć) w `role="alert"` pod przyciskami z komunikatem po polsku (404: „Nie znaleziono zadania. Odśwież stronę."); układ zawija przyciski (`flex-wrap`) bez poziomego przewijania na 390 px. Wzorzec: `CloseMilestoneButton.tsx`.

#### 3. Wyspa „Przywróć na dziś"

**File**: `src/components/today/RestoreDeferredButton.tsx`

**Intent**: Cofnięcie przeniesienia z listy przeniesionych.

**Contract**: wyspa React; propsy `projectId`, `milestoneId`, `taskId`, `title`; `Button` `ghost` `sm` z tekstem „Przywróć na dziś" i `aria-label` „Przywróć na dziś: {tytuł}" → `setTaskDeferral(…, null)`; ten sam wzorzec blokady, `aria-busy`, przeładowania i błędów co w `TodayTaskActions`.

#### 4. Strona `/today`

**File**: `src/pages/today.astro`

**Intent**: Pokazać akcje przy zadaniach i widoczną listę przeniesionych.

**Contract**: w wierszu zadania `TodayTaskActions` (`client:load`) z propsami z `task` (`task.project.id`, `task.milestone.id`, `task.id`, `task.title`, `task.status`; wyspa akcji tylko dla zadań ze statusem `todo` lub `partial` — jawny guard przy budowie propsów, bez rzutowania `as`, bo `TodayTask.status` ma typ `TaskStatus` z `done`, więc zadanie ze statusem `done` nie dostaje wyspy akcji; zgodnie z lintem `strictTypeChecked`), obok/pod chipem terminu (kolumna na wąskich ekranach, układ bez poziomego przewijania na 390 px, tylko tokeny i klasy ze skali); linijka „Przeniesione na później: N" zastąpiona sekcją `<details>` (widoczną także przy pustej liście): `summary` „Przeniesione na później: {N}" (`type-meta`) renderowany jako jeden ciągły węzeł tekstowy, bez osobnego elementu dla liczby (asercja smoke szuka całego ciągu w HTML), w środku `<ul>` wierszy `view.deferred` — tytuł (`type-task` z `break-words`), linia `type-meta` „{Projekt} · {Milestone} · wróci {formatDate(deferred_until)}" (projekt jako link do `/projects/{id}`) i `RestoreDeferredButton` (`client:load`); sekcja nie renderuje się, gdy `view.deferred` jest puste; reszta strony (nagłówek, podsumowanie, wiersze milestonów, stan pusty, błąd) bez zmian.

#### 5. Smoke dla wysp

**File**: `scripts/smoke.mjs`

**Intent**: Dowieść renderu wysp zgodnie z lekcją (tekst pochodzący z wysp, nie ze strony) i pokryć sekcję przeniesionych; test zepsucia.

**Contract**: w istniejącym kroku „today page lists the open task of the nearest milestone" dopisać do `bodyIncludes` fragmenty z wyspy: „Zrobione: Zadanie smoke" i „Na jutro: Zadanie smoke". Nowe kroki w miejscach zaznaczonych w Fazie 1: **po D3** (marker `D-deferred`) krok „today page lists the deferred task with a restore action": `GET /today` → 200, `bodyIncludes: ["Na dziś nic do zrobienia.", "Przeniesione na później: 1", "Przywróć na dziś: Zadanie smoke"]`, `bodyExcludes: ["Zrobione: Zadanie smoke"]` (milestone Gamma ma niedokończone, ale przeniesione zadanie, więc lista jest pusta i nie ma wiersza milestona); **po D4** (marker `D-actions`) krok „today page shows the task actions of a partial task": `GET /today` → 200, `bodyIncludes: ["Zrobione: Zadanie smoke", "Częściowo: Zadanie smoke", "Na jutro: Zadanie smoke", "· częściowo", "aria-pressed=\"true\""]`, `bodyExcludes: ["Przeniesione na później"]`. Istniejące kroki bez zmian poza dopisanymi fragmentami; plik CRLF jak w Fazie 1. Po dodaniu zrobić test zepsucia (`throw` w komponencie wyspy) i potwierdzić, że kroki stają się czerwone, a plik przywrócić.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym asercje na treść wysp i sekcję przeniesionych: `npm run smoke`

#### Manual Verification:

- W przeglądarce: „Zrobione" usuwa zadanie z listy (a ostatnie zrobione zadanie milestona zamienia się w wiersz „milestone do zamknięcia"); „Częściowo" przełącza dopisek „· częściowo" i `aria-pressed`; „Na jutro" przenosi zadanie do zwijanej sekcji „Przeniesione na później" z datą powrotu, a „Przywróć na dziś" zwraca je na listę; licznik w sekcji zgadza się z liczbą zadań
- Błędy i stany: błąd akcji (np. zadanie usunięte w innej karcie lub niedokończone zadanie dodane psql przed zamknięciem) pokazuje komunikat po polsku przy przyciskach; po zmianie statusu z widoku projektu przeniesienie jest wyczyszczone (zadanie wraca na listę)
- Wygląd i dostępność: jasny i ciemny motyw, 390 px i 1280 px bez poziomego przewijania, fokus zostaje na przycisku po żądaniu (`aria-disabled`), nawigacja klawiaturą (Tab, Enter, `details` otwierane Enterem/Spacją), przyciski mają nazwy z tytułem zadania

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera TS; reguły bazy bez zmian (pgTAP z S-04 nadal pokrywa `deferred_until` w `today_list`). Zapis przeniesienia, czyszczenie statusem, odmowa dla zrobionego zadania i błędna wartość są pokryte smoke przez API.
- `tomorrowInWarsaw` nie ma osobnego testu; wynik widać w ręcznej weryfikacji (psql) i w kroku smoke z `task.deferred_until`.

### Integration Tests:

- Smoke (`npm run smoke`): kroki D1–D6 po API i dwa kroki strony z asercją na tekst wysp (`aria-label`) oraz test zepsucia wysp (lekcja z `context/foundation/lessons.md`).
- pgTAP uruchamiany ręcznie (`npx supabase test db`), bez zmian w tym slice'ie.

### Manual Testing Steps:

1. Przygotuj dwa projekty z zadaniami o różnych terminach i statusach; sprawdź „Zrobione", „Częściowo" (włącz i wyłącz), „Na jutro" i „Przywróć na dziś".
2. Zrób ostatnie niedokończone zadanie milestona i sprawdź wiersz „milestone do zamknięcia".
3. Zmień status przeniesionego zadania w widoku projektu i sprawdź, że wraca na listę.
4. Sprawdź błędy akcji, klawiaturę, fokus, jasny/ciemny motyw, 390 i 1280 px.

## Performance Considerations

Bez zmian w liczbie zapytań na wejście na `/today` (jedno RPC); każda akcja to jedno `PATCH` (dwa zapytania w serwisie: sprawdzenie milestona i zapis, przy odmowie przeniesienia trzecie) i przeładowanie strony. Każdy wiersz zadania hydratuje jedną dodatkową wyspę (`TodayTaskActions`), a wiersze przeniesionych jedną (`RestoreDeferredButton`) — przy skali MVP (`data_volume: small`) bez `client:visible`.

## Migration Notes

Brak migracji i zmian schematu. Wdrożenie wymaga tylko ręcznego `supabase db push` **pięciu migracji razem** (z F-01, S-02, S-03 i S-04) przed wdrożeniem aplikacji, jak dotąd. Wycofanie: cofnięcie commitów aplikacji; dane (`deferred_until`) pozostają zgodne z `today_list`.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-05), PRD: `context/foundation/prd.md` (FR-011, FR-012, US-01 AC3–AC4, guardrail „bez wiedzy użytkownika")
- Poprzednie slice'y: `context/archive/2026-10-15-today-list-view/plan.md` i `reviews/impl-review.md` (lista, `deferred_until`, `aria-disabled`), `context/archive/2026-10-15-task-crud/plan.md` (status zadania, trigger zadań)
- Lekcje: `context/foundation/lessons.md`; design system: `context/foundation/design-system/reference/components/TaskRow.md`, `TaskCheck.md`
- Baza: `supabase/migrations/20261016120000_today_list.sql` (wiersze `deferred`), `20261015120000_task_rules.sql`; kod: `src/lib/services/tasks.ts`, `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts`, `src/lib/services/today.ts`, `src/pages/today.astro`, `src/components/hooks/use-task-api.ts`, `src/components/today/CloseMilestoneButton.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — przeniesienie i czyszczenie

#### Automated

- [x] 1.1 Lint zmienionych plików bez błędów (`endOfLine: auto`) — ea58144
- [x] 1.2 Sprawdzanie typów przechodzi: `npx astro check` — ea58144
- [x] 1.3 Build przechodzi: `npm run build` — ea58144
- [x] 1.4 Smoke przechodzi, w tym nowe kroki API przeniesienia: `npm run smoke` — ea58144

#### Manual

- [x] 1.5 Odpowiedzi API przeniesienia (200/422, błędna wartość, czyszczenie statusem) są po polsku i nie ujawniają treści błędów Postgresa — ea58144
- [x] 1.6 Zapisana data `deferred_until` to jutro w `Europe/Warsaw` — ea58144

### Phase 2: UI na `/today` — akcje wiersza i lista przeniesionych

#### Automated

- [x] 2.1 Lint zmienionych plików bez błędów (`endOfLine: auto`)
- [x] 2.2 Sprawdzanie typów przechodzi: `npx astro check`
- [x] 2.3 Build przechodzi: `npm run build`
- [x] 2.4 Smoke przechodzi, w tym asercje na treść wysp i sekcję przeniesionych: `npm run smoke`

#### Manual

- [x] 2.5 Przepływy w przeglądarce: Zrobione, Częściowo (przełącznik), Na jutro, Przywróć na dziś, wiersz „milestone do zamknięcia", licznik przeniesionych
- [x] 2.6 Błędy akcji po polsku, a zmiana statusu z widoku projektu czyści przeniesienie
- [x] 2.7 Wygląd i dostępność: motywy, 390 px i 1280 px, fokus po żądaniu, klawiatura, `details`, nazwy przycisków z tytułem zadania
