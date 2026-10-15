# Lista zadań na dziś Implementation Plan

## Overview

Czwarty slice roadmapy (S-04, US-01, FR-009, FR-010) i „gwiazda przewodnia" produktu: nowa chroniona strona `/today` pokazuje użytkownikowi jedną, automatycznie wygenerowaną listę niedokończonych zadań (`todo` i `partial`) z najbliższego niezamkniętego milestona każdego projektu, posortowaną od najbliższego własnego terminu do najdalszego (zadania bez terminu na końcu). Gdy w najbliższym milestonie nie ma niedokończonych zadań (wszystkie `done` albo milestone bez zadań), na końcu listy pojawia się wiersz „milestone do zamknięcia" z przyciskiem zamknięcia. Zadania przeniesione na jutro (`deferred_until` > dziś) są ukryte i policzone w linijce pod listą. Regułę liczy funkcja SQL `today_list(p_today)` z testami pgTAP; „dziś" to bieżący dzień w `Europe/Warsaw`.

## Current State Analysis

Stan na commit `d6750bf` (po archiwizacji S-03); fakty z `context/changes/today-list-view/research.md`.

- **Dane gotowe:** reguła używa istniejących kolumn: `tasks.status` (`todo|partial|done`), `tasks.due_date`, `tasks.deferred_until` (nikt jej dziś nie zapisuje ani nie czyta), `milestones.completed_at`, `milestones.due_date`, `milestones.seq`, `projects.name`/`life_area` (`supabase/migrations/20261009120000_create_core_domain_schema.sql:8-56`). Indeks `milestones_project_due_seq_idx (project_id, due_date, seq)` odpowiada kolejności „najbliższy milestone projektu". RLS: `select` po `user_id = auth.uid()` na wszystkich trzech tabelach (`…120100_enable_core_domain_rls.sql`).
- **Niezmienniki w bazie (S-02/S-03):** zamknięty milestone nie ma zadań `todo`/`partial`; termin zadania ≤ data milestona ≤ termin projektu. Otwarty milestone, w którym wszystkie zadania są `done` lub nie ma zadań, jest stanem dopuszczalnym — to właśnie „milestone do zamknięcia" (`20261014120000_milestone_close_rule.sql`, `20261015120000_task_rules.sql`).
- **Brak widoku i odczytu zbiorczego:** nie ma trasy `/today`; `/dashboard` to angielski placeholder starteru poza `AppLayout` (`src/pages/dashboard.astro:2,7-26`); serwisy działają per `projectId`; w repo nie ma funkcji SQL/RPC do odczytu (tylko funkcje triggerowe).
- **Routing i nawigacja:** logowanie przekierowuje na `/projects` (`src/pages/api/auth/signin.ts:19`); `AppLayout` ma logo i jedno łącze „Projekty" (`src/layouts/AppLayout.astro:15-22`), prop tylko `title`; `PROTECTED_ROUTES = ["/dashboard", "/projects"]` (`src/middleware.ts:4`).
- **Wzorce do powielenia:** strona SSR z danymi i trzema stanami (`src/pages/projects/index.astro:11-63`: `prerender = false`, `createClient`, `try/catch` + `logError`, błąd/pusto/lista), wyspa z `useMilestoneApi().setMilestoneCompleted` (`src/components/hooks/use-milestone-api.ts`), `formatDate`/`plural` (`src/lib/format.ts`), tokeny typografii `type-eyebrow|display|task|meta` i chipów `warning|info|destructive-soft/ink` (`context/foundation/design-system/design-system.md:60-90`).
- **Design system:** ekran „Dziś" jest opisany (`design-system.md:132-133`, `reference/components/TaskRow.md`, `Chip.md`), ale nie ma w kodzie komponentów Chip, TaskCheck, ProjectDot, MilestoneCard; kolumny „kolor projektu" nie ma w bazie.
- **PRD niespójne:** Business Logic i roadmapa opisują inny zbiór niż AC1 w US-01; rozstrzygnięcia z wywiadu w „Implementation Approach".
- **Testy:** brak runnera TS; pgTAP (`npx supabase test db`, 124 testy w 4 plikach) działa lokalnie, smoke (`npm run smoke`) uderza w serwer i nie kontroluje daty „dziś" ani nie ustawi `deferred_until` (brak API do jego zapisu).
- **Lekcje** (`context/foundation/lessons.md`): smoke dla stron z wyspami React musi asercją na treść sprawdzać render wyspy (i test zepsucia); przed `shadcn add` sprawdzić zależności (tu bez nowych komponentów shadcn). Z przeglądów S-02/S-03: kontrolki, które mają zachować fokus po żądaniu, dostają `aria-disabled` zamiast `disabled`; przyciski w wierszach mają `aria-label` z nazwą elementu.

## Desired End State

- `/today` (po zalogowaniu, w `AppLayout`, link „Dziś" w nawigacji, `aria-current="page"` gdy aktywny) pokazuje nagłówek „Dziś" z datą (np. „czwartek, 15 października") i podsumowaniem („9 pozycji · 2 po terminie · 1 milestone do zamknięcia"; człony zerowe pomijane), a pod nim płaską listę.
- Wiersz zadania: tytuł, linia „Projekt · Milestone" (nazwa projektu jest linkiem do `/projects/{id}`), dopisek „· częściowo" dla `partial`, chip terminu (kolor + słowo + ikona): „po terminie" (`wczoraj` / `N dni po terminie`), „dziś", „jutro", „za N dni" (2–7 dni), data (`formatDate`) dla dalszych terminów, „bez terminu".
- Kolejność zadań: własny termin rosnąco (miniony przed dzisiejszym), zadania bez terminu na końcu; remis: wcześniejsza data milestona, potem kolejność utworzenia. Po zadaniach wiersze milestonów do zamknięcia (kolejność wg daty milestona, remis wg `seq`).
- Projekt bez niezamkniętych milestonów nie ma wierszy. Najbliższy niezamknięty milestone to ten z najmniejszą `due_date` (także po terminie), remis rozstrzyga `seq` (jeden milestone na projekt).
- Zadania z `deferred_until` > dziś są ukryte i liczone w linijce „Przeniesione na jutro: N" pod listą; zadanie z `deferred_until` = dziś lub wcześniejszym jest na liście. Milestone z samymi przeniesionymi zadaniami nie jest „do zamknięcia" (ma niedokończone zadania).
- Wiersz milestona do zamknięcia ma przycisk „Zamknij milestone" (istniejące `PATCH` z S-02); po sukcesie przeładowanie strony, błąd w `role="alert"`.
- Pusty wynik: „Na dziś nic do zrobienia." z linkiem do projektów (i linijką o przeniesionych, jeśli są); błąd odczytu: komunikat `role="alert"` bez wycieku treści błędów.
- Po zalogowaniu użytkownik trafia na `/today`; niezalogowany na `/today` jest przekierowany na `/auth/signin`.
- Weryfikacja: `npx supabase test db` (nowy plik z regułą), lint zmienionych plików, `npx astro check`, `npm run build`, rozszerzony `npm run smoke`; ręcznie: lista dla przygotowanych danych, jasny i ciemny motyw na 390 i 1280 px.

### Key Discoveries:

- Reguła nie wymaga daty „dziś" do kwalifikacji, tylko do filtra `deferred_until` oraz do oznaczeń terminu; funkcja SQL przyjmuje `p_today` jako parametr, więc testy pgTAP są deterministyczne (`research.md`, Specyfikacja pkt 6).
- Brak precedensu RPC w repo i niezweryfikowane działanie `limit` per rodzic na osadzonej tabeli PostgREST to powody wyboru funkcji SQL (`research.md`, Dostęp do danych).
- Zamknięty milestone nie ma zadań niedokończonych, a termin zadania ≤ data milestona, więc zadania najbliższego milestona są zawsze zgodne z kolejnością terminów milestonów (S-02/S-03).
- Smoke ma w projekcie milestony „Gamma smoke" (dawna Alfa, niższy `seq`) i „Beta smoke" o tej samej dacie `2099-12-31`; Gamma jest więc najbliższy (remis po `seq`), a po jej zamknięciu najbliższy staje się Beta (`scripts/smoke.mjs`).
- `smoke.mjs` nie ma asercji „treść nie zawiera" — potrzebna jest opcja runnera `bodyExcludes`.

## What We're NOT Doing

- Akcje na zadaniach z listy (status, edycja, usuwanie, „Na jutro", „Częściowo") i zapis `deferred_until` — S-05; ręczne dodawanie zadania z listy — S-06 (FR-008). Wiersz zadania ma tylko link do projektu.
- Filtr po obszarze życia (FR-013), kolor projektu / ProjectDot (FR-014), etykiety „po terminie" na liście projektów i w widoku projektu (FR-015), grupowanie listy, sidebar, rail „Najbliższe milestony", dolny tabbar, kalendarz i podgląd kolejnych dni (Non-Goals PRD).
- Sygnalizacja „zbliżającego się deadline'u milestona z wyprzedzeniem" (guardrail `prd.md:38`) — żaden FR ani slice jej dziś nie pokrywa; zapisane w „Open Risks".
- Zmiany `/dashboard` i `Topbar.astro` (zostają jak są; do czasu `/10x-ui` po S-04 publiczny landing nadal linkuje zalogowanego do placeholdera `/dashboard` — znane ryzyko), automatyczne odświeżanie listy o północy (lista liczona przy każdym wejściu na stronę), nowy indeks na `tasks` (skala MVP mała, patrz „Performance Considerations").
- Runner testów jednostkowych i `supabase test db` w CI (Moduł 3); `supabase db push` na zdalny projekt (pięć migracji razem, ręcznie, przed wdrożeniem); naprawa `npm run lint` na Windowsie (CRLF + 6 plików spoza `src/`).

## Implementation Approach

Kolejność „baza → odczyt i strona → akcja", jak w S-02 i S-03. Decyzje z wywiadu:

- **Reguła kwalifikacji:** Business Logic (nie AC1): niedokończone zadania (`status <> 'done'`) najbliższego niezamkniętego milestona każdego projektu; AC1 z US-01 jest tylko przykładem.
- **Najbliższy milestone:** najmniejsza `due_date` wśród niezamkniętych (także po terminie), remis: mniejszy `seq` (jeden milestone na projekt).
- **Sortowanie:** FR-010 dosłownie, bez dziedziczenia terminu milestona: własny termin rosnąco, `NULL` na końcu; remis: wcześniejsza `due_date` milestona, potem `created_at`, potem `id`. Wiersze milestonów po zadaniach, wg `due_date` milestona i `seq`.
- **Milestone do zamknięcia:** pojawia się, gdy najbliższy niezamknięty milestone nie ma żadnych niedokończonych zadań (w tym brak zadań w ogóle); zadania z `deferred_until` > dziś są nadal niedokończone, więc taki milestone nie jest „do zamknięcia".
- **`deferred_until`:** S-04 ukrywa zadania z `deferred_until` > `p_today` i zwraca je jako wiersze `kind = 'deferred'` (UI liczy je, nie wypisuje); zadanie z `deferred_until` ≤ `p_today` jest zwykłym zadaniem listy. S-05 tylko zapisze kolumnę i nie zmieni zapytania.
- **„Dziś":** `Europe/Warsaw`, liczone raz na żądanie po stronie serwera funkcją pomocniczą (`YYYY-MM-DD`) i przekazywane do SQL oraz do oznaczeń terminu.
- **Funkcja SQL:** `public.today_list(p_today date)`, `language sql`, `stable`, `security invoker`, `set search_path = ''`; zwraca wiersze o kształcie `kind` (`task|milestone|deferred`), projekt (`project_id`, `project_name`, `life_area`), milestone (`milestone_id`, `milestone_name`, `milestone_due_date`), zadanie (`task_id`, `task_title`, `task_due_date`, `task_status`, `task_deferred_until`, `NULL` dla wierszy milestona). Widoczność użytkownika zapewnia RLS (invoker).
- **Strona:** nowa trasa `/today` w `AppLayout`, płaska lista tylko na tokenach i klasach ze skali; komponenty Chip/ProjectDot z design systemu nie są budowane (chip to lokalny fragment `.astro`); wizualny polish później przez `/10x-ui`.
- **Routing:** `/today` w `PROTECTED_ROUTES`, przekierowanie po logowaniu na `/today`, logo i link „Dziś" w nawigacji; `/dashboard` bez zmian.
- **Testy:** pgTAP dla reguły (funkcja z datą jako parametrem), smoke dla strony (treść, kolejność, `bodyExcludes`) i dla wyspy zamknięcia (asercja na tekst wyspy + test zepsucia, zgodnie z lekcją).

## Critical Implementation Details

- **Timing:** „dziś" liczone jest jeden raz na żądanie (`Intl.DateTimeFormat` z `timeZone: "Europe/Warsaw"`, format `YYYY-MM-DD`) i tą samą wartością filtrowane są `deferred_until` w SQL oraz wyliczane chipy; nie wolno liczyć dnia osobno w SQL (`current_date` to UTC) i w TS, bo o północy czasu polskiego lista i chipy rozjechałyby się o dzień.

## Phase 1: Funkcja `today_list` w bazie

### Overview

Nowa migracja z funkcją liczącą listę na dziś oraz testy pgTAP z datą jako parametrem; regeneracja typów bazy.

### Changes Required:

#### 1. Migracja z funkcją

**File**: `supabase/migrations/20261016120000_today_list.sql`

**Intent**: Reguła kwalifikacji „gwiazdy przewodniej" w jednym, testowalnym miejscu w bazie; dostęp użytkownika ogranicza RLS.

**Contract**: `public.today_list(p_today date) returns table (kind text, project_id uuid, project_name text, life_area text, milestone_id uuid, milestone_name text, milestone_due_date date, task_id uuid, task_title text, task_due_date date, task_status text, task_deferred_until date)`, `language sql stable security invoker set search_path = ''`, w pełni kwalifikowane nazwy, `grant execute` tylko dla `authenticated` (`revoke … from public, anon`). Logika: (1) „najbliższe" = dla każdego `project_id` jeden niezamknięty milestone (`completed_at is null`) o najmniejszym `(due_date, seq)` (`distinct on (project_id)`); (2) niedokończone zadania najbliższych milestonów (`status <> 'done'`); (3) wiersze `task` — niedokończone z `deferred_until is null or deferred_until <= p_today`; wiersze `deferred` — niedokończone z `deferred_until > p_today`; wiersze `milestone` — najbliższe milestony bez żadnego niedokończonego zadania (`not exists`), z `NULL` w kolumnach zadania. Kolejność wyniku: `task` (po `task_due_date` rosnąco, `NULL` na końcu, `milestone_due_date`, `created_at` zadania, `id`), potem `milestone` (po `milestone_due_date`, `seq`), na końcu `deferred`. Komentarz nagłówkowy w stylu istniejących migracji (opis reguły i decyzji z wywiadu); komunikaty i komentarze ASCII.

#### 2. Testy pgTAP

**File**: `supabase/tests/database/core_domain_today_list.test.sql`

**Intent**: Zabezpieczyć każdy przypadek reguły ustalony w wywiadzie.

**Contract**: pgTAP (`begin; select plan(n); … select * from finish(); rollback;`), użytkownicy w `auth.users`, ASCII, stała data (np. `'2026-10-15'`) przekazywana do funkcji; zapytania w roli `authenticated` z kontekstem JWT (`set local role authenticated`, `request.jwt.claims`) jak w `core_domain_task_rules.test.sql`. Przypadki: `has_function`; użytkownik bez danych → 0 wierszy; zadania najbliższego milestona w kolejności termin rosnąco, `NULL` na końcu, remis wg daty milestona i `created_at`; `partial` na liście, `done` poza listą; remis dat milestonów w projekcie → zadania tylko pierwszego po `seq`; niezamknięty milestone po terminie (data < `p_today`) jest nadal najbliższy; zamknięty milestone pomijany, najbliższy to następny niezamknięty; projekt ze wszystkimi milestonami zamkniętymi i projekt bez milestonów → brak wierszy; milestone ze wszystkimi zadaniami `done` oraz milestone bez zadań → jeden wiersz `milestone` i brak wierszy `task`; milestone z niedokończonym zadaniem → brak wiersza `milestone`; `deferred_until` > `p_today` → wiersz `deferred` (nie `task`), `deferred_until` = `p_today` → wiersz `task`; wszystkie zadania przeniesione → brak wiersza `milestone`, są wiersze `deferred`; dwa projekty → wiersze obu, zadania posortowane globalnie, wiersze `milestone` po zadaniach; dane innego użytkownika niewidoczne (RLS); wywołanie jako `anon` odrzucone. Zamknięte milestony wstawiać z `completed_at`, a ich zadania (tylko `done`) zwykłym insertem — triggery zadań tego nie blokują, więc nie wyłączać ich w teście.

#### 3. Typy bazy

**File**: `src/db/database.types.ts`

**Intent**: Typowany wynik `rpc("today_list")` dla serwisu.

**Contract**: regeneracja `npx supabase gen types typescript --local > src/db/database.types.ts` (baza po `db reset`); polecenie uruchomić w Git Bash (nie w PowerShell 5.1, gdzie `>` zapisuje UTF-16 z BOM) albo zapisać wynik skryptem node; po wygenerowaniu sprawdzić, że plik pozostał UTF-8 z końcami LF i że diff dotyczy wyłącznie sekcji `Functions` schematu `public` (`today_list` z `Args: { p_today: string }` i tablicą `Returns`); jeśli generator zmienia inne fragmenty (format, nowy blok `__InternalSupabase`, kolejność), przywrócić plik z gita i dopisać `today_list` ręcznie w tym samym kształcie.

### Success Criteria:

#### Automated Verification:

- Wszystkie migracje aplikują się czysto od zera: `npx supabase db reset`
- Testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db`
- Typy się zgadzają: `npx astro check`

#### Manual Verification:

- W psql wywołanie `select * from public.today_list('2026-10-15')` jako użytkownik z danymi zwraca oczekiwane wiersze `task`, `milestone` i `deferred` w poprawnej kolejności (np. na danych z krótkiego skryptu pomocniczego w scratchpadzie)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Odczyt i strona `/today`

### Overview

Serwis i pomocnicy, strona `/today` z listą, chipami, stanem pustym i linijką o przeniesionych, ochrona trasy, nawigacja, przekierowanie po logowaniu oraz smoke z nową asercją `bodyExcludes`.

### Changes Required:

#### 1. Pomocnicy „dziś" i chipa terminu

**File**: `src/lib/today.ts`

**Intent**: Jedno źródło dnia „dziś" i opisu terminu na liście, niezależne od kodu strony.

**Contract**: `todayInWarsaw(now = new Date()): string` (`YYYY-MM-DD`, składane z `formatToParts` ze strefą `Europe/Warsaw` — bez zależności od separatora locale); `daysFromToday(isoDate: string, today: string): number` (różnica dni kalendarzowych, ujemna dla minionych); `dueChip(due: string | null, today: string): { tone: "overdue" | "today" | "tomorrow" | "soon" | "date" | "none"; label: string }` — `overdue`: „wczoraj" dla −1, „N dni po terminie" dla ≤ −2; `today`: „dziś"; `tomorrow`: „jutro"; `soon`: „za N dni" dla 2–7; `date`: `formatDate(due)` dla dalszych; `none`: „bez terminu"; `formatTodayHeading(today: string): string` („czwartek, 15 października", `Intl` `pl-PL`, `timeZone: "UTC"` na dacie `YYYY-MM-DD`).

#### 2. Serwis listy na dziś

**File**: `src/lib/services/today.ts`, `src/types.ts`

**Intent**: Odczyt listy przez RPC i zamiana wierszy na model widoku.

**Contract**: `getToday(supabase, today)` wywołuje `supabase.rpc("today_list", { p_today: today })`, błąd rzuca `readFailure(error)` (wzorzec `milestones.ts`); zwraca `TodayView = { tasks: TodayTask[]; milestones: TodayMilestone[]; deferredCount: number }` z wierszy `kind` (`task`, `milestone`, `deferred`), zachowując kolejność z SQL; `TodayTask` (`id`, `title`, `due_date`, `status: TaskStatus`, `project: {id, name}`, `milestone: {id, name, due_date}`), `TodayMilestone` (`id`, `name`, `due_date`, `project: {id, name}`); typy w `src/types.ts`. Status zawężany do `TaskStatus` jak w `toTask`.

#### 3. Strona `/today`

**File**: `src/pages/today.astro`

**Intent**: Widok „Dziś" w `AppLayout` ze wzorcem stron SSR.

**Contract**: `export const prerender = false`; `createClient(...)`; `today = todayInWarsaw()`; `try { getToday } catch { logError("today-list", error); komunikat "Nie udało się wczytać listy na dziś. Odśwież stronę za chwilę." }` (`role="alert"`, `type-quote text-destructive-ink`); gdy `!supabase`: „Aplikacja nie jest teraz dostępna. Spróbuj ponownie za chwilę."; nagłówek `type-eyebrow` „Dziś" + `type-display` z `formatTodayHeading`; podsumowanie „{N} {pozycja|pozycje|pozycji} · {M} po terminie · {K} milestone do zamknięcia" (`plural`, człony zerowe pomijane); `<ul>` z wierszami zadań (tytuł `type-task` z `break-words`, linia `type-meta` „{Projekt} · {Milestone}" z linkiem projektu do `/projects/{id}`, dopisek „· częściowo", chip terminu: tokeny `destructive-soft/ink` + ikona `triangle-alert` dla „po terminie", `warning-soft/ink` + `sun` dla „dziś", `info-soft/ink` + `arrow-right` dla „jutro", tło neutralne dla „za N dni"/daty/„bez terminu"; ikony jako inline `<svg aria-hidden>`; kolor + słowo + ikona, nigdy sam kolor) i wiersze milestonów po zadaniach (nazwa `font-serif`, tekst „Wszystkie zadania zrobione — milestone do zamknięcia", data milestona, link „Otwórz projekt"; przycisk zamknięcia dochodzi w Fazie 3); stan pusty `type-quote` w ciągłej ramce jak na `/projects` (`rounded-md border border-border bg-card p-6 shadow-card`) „Na dziś nic do zrobienia." z linkiem „Projekty"; linijka `type-meta` „Przeniesione na jutro: N" gdy `deferredCount > 0` (także przy pustej liście); układ bez poziomego przewijania na 390 px, tylko tokeny i klasy ze skali, bez literałów kolorów; brak wysp React w tej fazie.

#### 4. Routing i nawigacja

**File**: `src/middleware.ts`, `src/pages/api/auth/signin.ts`, `src/layouts/AppLayout.astro`

**Intent**: Chroniony, osiągalny widok „Dziś" jako ekran startowy po zalogowaniu.

**Contract**: `/today` dopisane do `PROTECTED_ROUTES`; `signin.ts` przekierowuje po sukcesie na `/today`; `AppLayout` dostaje opcjonalny prop `current?: "today" | "projects"`, logo prowadzi do `/today`, nawigacja ma linki „Dziś" (`/today`) i „Projekty" (`/projects`), aktywny link ma `aria-current="page"`; strony `projects/index.astro` i `projects/[id].astro` przekazują `current="projects"`, `today.astro` — `current="today"`.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć stronę i reguły widoczne w treści oraz przekierowania, zgodnie z lekcją o treści stron.

**Contract**: runner dostaje opcję `bodyExcludes` (string lub tablica fragmentów, które NIE mogą wystąpić w `text`) obok `bodyIncludes`/`bodyOrder`: warunek dopisany w `matches()` oraz jako dodatek do wyniku `describeExpected()` (funkcja zwraca tylko pierwszy zdefiniowany człon łańcucha `??`, więc `bodyExcludes` nie może być kolejnym ogniwem łańcucha). Zmiany i nowe kroki (plik ma zakończenia CRLF — zachować, edytować narzędziami Edit/Write lub skryptem node z pliku, nie przez shell z backslashami): „signin accepts correct password" oczekuje `location: "/today"`; krok anonimowy `GET /today` → 302 `/auth/signin` obok istniejącego kroku `/projects`; po „projects page renders add button" krok „today page renders empty state" (`GET /today` → 200, `bodyIncludes: ["Dziś", "Na dziś nic do zrobienia."]`); w bloku zadań z S-03: po kroku „project page renders task list" krok „today page lists the open task of the nearest milestone" (`bodyIncludes: ["Zadanie smoke", "Gamma smoke"]`, `bodyExcludes: ["Beta smoke"]` — remis dat, nearest po `seq`), po kroku „task status done succeeds" krok „today page shows the milestone ready to close" (`bodyIncludes: ["Gamma smoke", "Wszystkie zadania zrobione"]`, `bodyExcludes: ["Zadanie smoke"]`; fragment „Wszystkie zadania zrobione" pochodzi z wiersza milestona — sam tekst „milestone do zamknięcia" spełnia już podsumowanie i nie dowodzi wiersza), po kroku „milestone close succeeds once its tasks are done" krok „today page moves on to the next milestone" (`bodyIncludes: ["Beta smoke", "Wszystkie zadania zrobione"]`, `bodyExcludes: ["Gamma smoke"]`). Istniejące kroki bez zmian (poza oczekiwanym `location` logowania); nowe kroki wstawiać tylko w wymienionych miejscach.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym nowe kroki strony i przekierowania (podgląd produkcyjny na :4321 i lokalny Supabase): `npm run smoke`

#### Manual Verification:

- W przeglądarce: po zalogowaniu ląduję na `/today`; dla przygotowanych danych (dwa projekty, remis dat milestonów, zadanie `partial`, zadanie po terminie, zadanie bez terminu, milestone po terminie, zamknięty milestone) lista zawiera dokładnie zadania najbliższych niezamkniętych milestonów w kolejności termin rosnąco, bez terminu na końcu, a wiersz milestona do zamknięcia jest po zadaniach
- Chipy terminu mają kolor, słowo i ikonę („po terminie", „dziś", „jutro", „za N dni", data, „bez terminu"); podsumowanie liczy pozycje, po terminie i milestony do zamknięcia; zadanie z `deferred_until` w przyszłości (ustawione przez psql) jest ukryte, a linijka „Przeniesione na jutro" pokazuje liczbę
- Stan pusty, błąd odczytu (np. po zatrzymaniu Supabase) i niezalogowane wejście na `/today` zachowują się zgodnie z opisem; link „Dziś" i logo prowadzą do `/today`, aktywny link ma `aria-current`
- Wygląd i dostępność: jasny i ciemny motyw, 390 px i 1280 px bez poziomego przewijania, nawigacja klawiaturą (linki projektów, focus ring), czytnik odczytuje chipy jako tekst (słowo, nie sama ikona)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Zamknięcie milestona z listy

### Overview

Wyspa z przyciskiem „Zamknij milestone" w wierszu milestona do zamknięcia i smoke z asercją na treść wyspy.

### Changes Required:

#### 1. Wyspa zamknięcia milestona

**File**: `src/components/today/CloseMilestoneButton.tsx`

**Intent**: Jedyna akcja listy w S-04 — domknięcie pętli „ostatni krok do zamknięcia".

**Contract**: wyspa React; propsy `projectId`, `milestoneId`, `milestoneName`; `Button` `secondary` `sm` z tekstem „Zamknij milestone" i `aria-label` „Zamknij milestone {nazwa}"; klik wywołuje `useMilestoneApi().setMilestoneCompleted(projectId, milestoneId, true)`; po sukcesie `window.location.reload()` z blokadą do przeładowania (wzorzec `navigating`), błąd (422 „niezrobione zadania (N)", 404, sieć) w `role="alert"` obok przycisku; w trakcie żądania `aria-disabled` zamiast `disabled` (fokus zostaje), zmiany w trakcie ignorowane; 401 → `redirectToSignin` przez hook. Wzorzec: `MilestoneRowActions.tsx`.

#### 2. Podłączenie w stronie

**File**: `src/pages/today.astro`

**Intent**: Pokazać przycisk w wierszach milestonów.

**Contract**: w wierszu `TodayMilestone` renderować `CloseMilestoneButton` (`client:load`) obok linku „Otwórz projekt"; reszta strony bez zmian.

#### 3. Smoke dla wyspy

**File**: `scripts/smoke.mjs`

**Intent**: Dowieść renderu wyspy zgodnie z lekcją (tekst pochodzący z wyspy, nie ze strony) i test zepsucia.

**Contract**: w krokach „today page shows the milestone ready to close" i „today page moves on to the next milestone" (z Fazy 2) dopisać do `bodyIncludes` fragmenty tekstu z wyspy: „Zamknij milestone Gamma smoke" oraz „Zamknij milestone Beta smoke" (`aria-label` renderowany przez wyspę). Po dodaniu zrobić test zepsucia (`throw` w komponencie wyspy) i potwierdzić, że kroki robią się czerwone.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym asercje na treść wyspy: `npm run smoke`

#### Manual Verification:

- W przeglądarce: „Zamknij milestone" w wierszu milestona zamyka go, strona się przeładowuje, a lista przechodzi do następnego milestona projektu (albo wiersz znika, gdy to był ostatni); gdy w międzyczasie (psql) pojawi się niedokończone zadanie w tym milestonie, komunikat błędu jest po polsku
- Fokus po żądaniu zostaje na przycisku (`aria-disabled`), przycisk ma nazwę z nazwą milestona, wygląd w jasnym i ciemnym motywie, 390 px i 1280 px bez poziomego przewijania

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera TS; regułę kwalifikacji pokrywa pgTAP (`core_domain_today_list.test.sql`) z datą jako parametrem: remis dat, `partial`, milestone po terminie, zamknięte milestony, pusty milestone i wszystkie zadania `done`, `deferred_until` (> dziś i = dziś), wiele projektów, RLS.
- Pomocnicy `today.ts` (dzień w Warszawie, chip terminu) nie mają osobnych testów; ich wynik jest widoczny w ręcznej weryfikacji, a regułę dnia w SQL pilnuje parametr `p_today`.

### Integration Tests:

- Smoke (`npm run smoke`): przekierowania i ochrona `/today`, stan pusty, lista z zadaniem najbliższego milestona (remis dat po `seq`, `bodyExcludes` dla drugiego milestona), przejście do „milestone do zamknięcia" i do następnego milestona; asercja na treść wyspy i test zepsucia (lekcja z `context/foundation/lessons.md`).
- pgTAP uruchamiany ręcznie (`npx supabase test db`), nie w CI (Moduł 3).

### Manual Testing Steps:

1. Przygotuj dwa projekty: remis dat milestonów, zadania z terminem po/dziś/jutro/za tydzień i bez terminu, jedno `partial`, jeden milestone po terminie, jeden zamknięty; ustaw `deferred_until` jednego zadania przez psql.
2. Sprawdź listę, chipy, podsumowanie, linijkę o przeniesionych, stan pusty i komunikat błędu.
3. Zamknij milestone z listy i sprawdź przejście do następnego milestona.
4. Sprawdź klawiaturę, fokus, jasny/ciemny motyw, 390 i 1280 px.

## Performance Considerations

Jedno wywołanie RPC na wejście na `/today`; funkcja czyta milestony po indeksie `(project_id, due_date, seq)` i zadania po `tasks_milestone_id_idx`; przy skali MVP (`data_volume: small`, `prd.md:8-12`) nie dodajemy indeksu po `tasks.status` (plan F-01 zostawiał tę decyzję S-04). NFR „lista poniżej 1 sekundy" (`prd.md:100`) nie jest mierzony automatycznie; do sprawdzenia ręcznie na lokalnych danych. `max_rows = 1000` w `supabase/config.toml:18` ucina odpowiedź PostgREST powyżej tysiąca wierszy (dla skali MVP nieistotne).

## Migration Notes

Jedna nowa migracja (`20261016120000_today_list.sql`, tylko funkcja, brak zmian danych ani schematu tabel). Wdrożenie wymaga ręcznego `supabase db push` **pięciu migracji razem** (dwie z `core-domain-schema`, `milestone_close_rule`, `task_rules` i ta) na zdalny projekt przed wdrożeniem aplikacji. Wycofanie: nowa migracja `drop function public.today_list(date)`; zastosowanych migracji nie edytować. Regeneracja `database.types.ts` po zastosowaniu migracji lokalnie.

## References

- Badanie: `context/changes/today-list-view/research.md`; roadmapa: `context/foundation/roadmap.md` (S-04, S-05); PRD: `context/foundation/prd.md` (US-01, FR-009, FR-010, Business Logic, guardrails)
- Lekcje: `context/foundation/lessons.md`; design system: `context/foundation/design-system/design-system.md`, `reference/components/TaskRow.md`, `Chip.md`
- Poprzednie slice'y: `context/archive/2026-10-15-task-crud/plan.md`, `reviews/impl-review.md` (aria-disabled, aria-label), `context/archive/2026-10-14-milestone-crud/plan.md`
- Baza: `supabase/migrations/20261009120000_create_core_domain_schema.sql:8-56`, `20261014120000_milestone_close_rule.sql`, `20261015120000_task_rules.sql`; strona: `src/pages/projects/index.astro:11-63`; nawigacja: `src/layouts/AppLayout.astro:15-22`; routing: `src/middleware.ts:4`, `src/pages/api/auth/signin.ts:19`; wyspa: `src/components/projects/MilestoneRowActions.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Funkcja `today_list` w bazie

#### Automated

- [x] 1.1 Wszystkie migracje aplikują się czysto od zera: `npx supabase db reset`
- [x] 1.2 Testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db`
- [x] 1.3 Typy się zgadzają: `npx astro check`

#### Manual

- [x] 1.4 W psql `select * from public.today_list('2026-10-15')` zwraca oczekiwane wiersze `task`, `milestone` i `deferred` w poprawnej kolejności

### Phase 2: Odczyt i strona `/today`

#### Automated

- [ ] 2.1 Lint zmienionych plików bez błędów (`endOfLine: auto`)
- [ ] 2.2 Sprawdzanie typów przechodzi: `npx astro check`
- [ ] 2.3 Build przechodzi: `npm run build`
- [ ] 2.4 Smoke przechodzi, w tym nowe kroki strony i przekierowania: `npm run smoke`

#### Manual

- [ ] 2.5 Po zalogowaniu ląduję na `/today`, a lista dla przygotowanych danych ma zadania najbliższych niezamkniętych milestonów w poprawnej kolejności i milestone do zamknięcia na końcu
- [ ] 2.6 Chipy terminu (kolor, słowo, ikona), podsumowanie i linijka „Przeniesione na jutro" są poprawne
- [ ] 2.7 Stan pusty, błąd odczytu, niezalogowane wejście oraz nawigacja (`aria-current`) działają zgodnie z opisem
- [ ] 2.8 Wygląd i dostępność: motywy, 390 px i 1280 px, klawiatura, chipy czytelne jako tekst

### Phase 3: Zamknięcie milestona z listy

#### Automated

- [ ] 3.1 Lint zmienionych plików bez błędów (`endOfLine: auto`)
- [ ] 3.2 Sprawdzanie typów przechodzi: `npx astro check`
- [ ] 3.3 Build przechodzi: `npm run build`
- [ ] 3.4 Smoke przechodzi, w tym asercje na treść wyspy: `npm run smoke`

#### Manual

- [ ] 3.5 „Zamknij milestone" z listy zamyka milestone i lista przechodzi do następnego; błąd (niedokończone zadanie dodane psql) jest po polsku
- [ ] 3.6 Fokus zostaje na przycisku, nazwa z nazwą milestona, wygląd w obu motywach i na 390 px oraz 1280 px
