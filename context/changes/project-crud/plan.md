# Zarządzanie projektem (CRUD) Implementation Plan

## Overview

Pierwsza warstwa aplikacyjna nad gotową bazą (roadmapa S-01, FR-002/FR-003): zalogowany użytkownik tworzy, edytuje i usuwa projekt (nazwa, termin, opcjonalny opis, obszar życia) na stronach `/projects` (lista) i `/projects/[id]` (minimalny widok). Formularz działa w dialogu i woła trasy JSON, usunięcie wymaga potwierdzenia z licznikami milestonów i zadań, a baza pilnuje reguły „termin projektu nie wcześniejszy niż jego milestony". Zmiana dostarcza też kontraktowe komponenty UI (Button, dialogi, pola) i minimalny nagłówek aplikacji.

## Current State Analysis

Wszystko poniżej wynika z `context/changes/project-crud/research.md` (stan na commit `14dd019`).

- **Baza gotowa:** `projects` ma `name` (CHECK 1–200 po `btrim`), `description` (NULL), `life_area` (`dom|sport|praca`), `due_date` NOT NULL; trigger odrzuca skrócenie terminu poniżej milestona (`23514`, komunikat „Termin projektu (…) nie moze byc wczesniejszy niz data istniejacego milestona"); RLS per operacja dla `authenticated`; kaskada na milestony i zadania. Typy `Project`/`ProjectInsert`/`ProjectUpdate`, `LIFE_AREAS` i typowany klient istnieją (`src/types.ts:3-12`, `src/lib/supabase.ts:10`).
- **Zachowanie PostgREST (zaobserwowane):** CHECK i trigger daty mają ten sam kod `23514` i różnią się komunikatem; edycja/usunięcie cudzego lub nieistniejącego rekordu daje pusty wynik bez błędu; `anon` dostaje 401; zliczanie przez `count=exact` i osadzenia działa.
- **Aplikacja:** brak stron i tras dla projektów, brak powłoki z nawigacją, brak komponentów formularza i dialogu, `zod` nie jest zadeklarowany w `package.json`. Trasy auth (`src/pages/api/auth/signin.ts:5-19`) to formularz POST + redirect z `?error=`, bez walidacji i bez `prerender`. `PROTECTED_ROUTES = ["/dashboard"]` z dopasowaniem prefiksowym (`src/middleware.ts:4,18`); niezalogowany dostaje 302 także na `/api/*`.
- **UI:** `button.tsx` to stockowy shadcn (`rounded-md`, `h-9`, `ring-[3px]`) niezgodny z kontraktem design systemu (`src/components/ui/button.tsx:8-30`). Strony poza `Layout.astro`/`global.css` (dashboard, Topbar, Welcome, auth) używają literałów kolorów i angielskiego tekstu — nie są wzorem stylu. Tokeny z design-system.md są opublikowane w `src/styles/global.css`.
- **Testy:** brak runnera; jedyna bramka aplikacyjna to `scripts/smoke.mjs` (formularze + `Origin`, kontrola statusu i `Location`) uruchamiany w CI na lokalnym Supabase; pgTAP uruchamiany ręcznie.

## Desired End State

- Zalogowany użytkownik po wejściu na `/projects` widzi swoje projekty (posortowane po terminie), może dodać projekt w dialogu, wejść w `/projects/[id]`, edytować go (w tym obszar życia) i usunąć po potwierdzeniu w ConfirmDialog z dokładnymi licznikami („Usuniesz też 3 milestony i 12 zadań"). Pusty projekt też wymaga potwierdzenia.
- Niezalogowany: `/projects*` przekierowuje na `/auth/signin`, `/api/projects*` zwraca 401 JSON.
- Walidacja po stronie serwera (zod) zwraca błędy pól po polsku; reguła dat z bazy jest tłumaczona na polski komunikat przy polu terminu.
- Po zalogowaniu redirect idzie na `/projects`.
- Weryfikacja: `npx supabase test db`, lint zmienionych plików, `npx astro check`, `npm run build` i rozszerzony `npm run smoke` przechodzą; ręcznie: przepływ w przeglądarce w jasnym i ciemnym motywie na 390 i 1280 px.

### Key Discoveries:

- Błędy CHECK i triggera daty rozróżnia się wyłącznie po `message` (`supabase/migrations/20261009120000_create_core_domain_schema.sql:119-142`; plan-review F5 z `core-domain-schema`), więc komunikat triggera staje się kontraktem, który trzeba przypiąć testem.
- Astro `checkOrigin` obejmuje tylko żądania z form-podobnym `Content-Type`; JSON nie jest sprawdzany (research, „Trasy API i walidacja"). Ochrona tras JSON opiera się więc na wymuszeniu `Content-Type: application/json` i na tym, że przeglądarka nie wyśle takiego żądania cross-site bez preflightu CORS.
- Zapytanie o cudzy lub nieistniejący projekt nie zwraca błędu, tylko pustą tablicę (research, tabela PostgREST) — „nie znaleziono" trzeba wykrywać po pustym wyniku (`.select()` po `update`/`delete`).
- Wyniki odczytu mają `life_area: string`, nie `LifeArea` (`src/types.ts:10`) — potrzebny strażnik w czasie wykonania; w repo go nie ma.
- Dopóki S-02 nie istnieje, aplikacja nie potrafi stworzyć milestona, więc licznik w dialogu usuwania i błąd triggera daty da się zobaczyć tylko na danych wstawionych poza aplikacją (psql/REST).
- `components.json:18` wskazuje alias hooków `@/hooks`, a `CLAUDE.md` mówi `src/components/hooks/`; plan stosuje `CLAUDE.md` (alias z `components.json` nie jest używany przez żaden z dodawanych komponentów).

## What We're NOT Doing

- UI milestonów i zadań (S-02, S-03) oraz sekcje na nie w widoku projektu poza pustym miejscem.
- Kolor projektu i `ProjectDot` — tabela nie ma kolumny, FR-014 jest odłożony (roadmapa `## Parked`).
- FR-013 (filtr obszaru), FR-015 (chip „po terminie").
- Pełna nawigacja z design systemu (sidebar, tabbar, fab, Dziś/Kalendarz) — dojdzie przy S-04.
- Restyling stron auth, `Topbar`, `Welcome`, `dashboard.astro`, `Banner.astro` — zostają na starych literałach (zakres `/10x-ui`); jedyna zmiana w auth to redirect po zalogowaniu.
- Zmiany schematu bazy (brak migracji), `supabase db push` na zdalny projekt (ręcznie przed wdrożeniem, obie migracje razem).
- Runner testów jednostkowych/e2e i `supabase test db` w CI (Moduł 3); kroki smoke dla błędu triggera daty (wymagają milestona, którego aplikacja jeszcze nie tworzy).
- Paginacja listy, wyszukiwanie, archiwizacja projektów, ograniczenie terminu w przeszłości (baza go dopuszcza, FR-015 zakłada przeterminowane projekty).
- Naprawa `npm run lint` na Windowsie (CRLF + 6 plików spoza `src/`) — znany stan sprzed zmiany.

## Implementation Approach

Kolejność zgodna ze wzorcem „baza → serwis → API → UI": Faza 1 dostarcza serwis, walidację, ochronę tras i trasy JSON wraz z testami (pgTAP + smoke), więc kontrakt backendu jest zweryfikowany bez interfejsu. Faza 2 buduje komponenty zgodne z design systemem. Faza 3 składa strony i wyspy React na gotowym API. Decyzje transportowe: trasy `POST /api/projects`, `PUT /api/projects/[id]`, `DELETE /api/projects/[id]` z `Content-Type: application/json`; odpowiedzi `201 {project}`, `200 {project}`, `204`; błędy `{error, fieldErrors?}` ze statusami 400 (zły JSON), 401, 404, 415, 422 (walidacja i reguła dat), 500. Liczniki do potwierdzenia usunięcia liczy strona `/projects/[id]` po stronie serwera przy renderze (wynik doradczy, bez blokady). Po utworzeniu następuje przejście na `/projects/[id]`, po edycji odświeżenie widoku, po usunięciu przejście na `/projects`. Pole obszaru życia to natywny `<select>` na tokenach (bez dodatkowej zależności Radix, dobre na telefonie). Walidacja zod: `name` po przycięciu białych znaków (w tym tabulatorów) 1–200, `description` opcjonalny (pusty → `null`, maks. 2000 znaków — limit wybrany przez plan, PRD go nie podaje), `life_area` z `LIFE_AREAS`, `due_date` jako realna data `YYYY-MM-DD` (terminy w przeszłości dozwolone).

## Phase 1: Backend — walidacja, serwis, ochrona tras, API, smoke

### Overview

Zależność `zod`, schematy walidacji, serwis projektów z tłumaczeniem błędów, ochrona tras w middleware, trzy trasy JSON, asercja komunikatu triggera w pgTAP i rozszerzony smoke. Bez UI.

### Changes Required:

#### 1. Zależność zod

**File**: `package.json`, `package-lock.json`

**Intent**: Zadeklarować `zod` jako bezpośrednią zależność (dziś występuje tylko tranzytywnie), zgodnie z `CLAUDE.md`.

**Contract**: `npm install zod` (wersja 4.x, spójna z już obecną tranzytywnie); wpis w `dependencies`.

#### 2. Schematy walidacji

**File**: `src/lib/validation/project.ts`

**Intent**: Jedno źródło prawdy dla reguł wejścia projektu po stronie serwera i klienta; komunikaty błędów po polsku.

**Contract**: eksporty `projectInputSchema` (obiekt `{name, description, life_area, due_date}`: `name` przycięte, 1–200; `description` opcjonalny, pusty lub same białe znaki → `null`, maks. 2000; `life_area` z `LIFE_AREAS`; `due_date` realna data `YYYY-MM-DD`, np. przez `z.iso.date()`), `projectIdSchema` (uuid) oraz funkcja spłaszczająca błąd zod do `Record<"name"|"description"|"life_area"|"due_date", string>`. Tablica `LIFE_AREAS` z `src/types.ts` jest jedynym źródłem wartości obszaru. Nie duplikować reguł CHECK ponad to, co wynika z PRD/bazy.

#### 3. Serwis projektów

**File**: `src/lib/services/projects.ts`

**Intent**: Zamknąć dostęp do `projects` i tłumaczenie błędów w jednym miejscu, tak aby strony i trasy nie znały kodów PostgREST.

**Contract**: funkcje przyjmujące typowany klient (`SupabaseClient<Database>`): `listProjects` (sortowanie `due_date` rosnąco, potem `created_at`), `getProject(id)` (brak → `null`), `getProjectCounts(id)` → `{milestones, tasks}` (liczenie przez `select(..., { count: "exact", head: true })`; zadania przez osadzenie `milestones!inner(project_id)` z filtrem `milestones.project_id`), `createProject`, `updateProject`, `deleteProject`. Odczyt przechodzi przez strażnik `toProject(row)` zawężający `life_area` do `LifeArea` w czasie wykonania. Mutacje zwracają wynik rozróżniony (`ok` / `validation` / `not_found` / `unavailable`) i zawsze używają `.select()` po `update`/`delete`, żeby pusty wynik oznaczał `not_found`. Mapowanie błędów Postgresa (zaobserwowane): `23514` z komunikatem zawierającym `Termin projektu` → błąd pola `due_date` („Termin projektu nie może być wcześniejszy niż data istniejącego milestona"); `23514` z `projects_name_length` / `projects_life_area_check` → błędy pól `name` / `life_area`; `42501` → `unavailable` (sesja); pozostałe → `unavailable` z ogólnym komunikatem, bez ujawniania treści błędu bazy.

#### 4. Ochrona tras

**File**: `src/middleware.ts`

**Intent**: Chronić `/projects` i `/api/projects`, przy czym niezalogowane API dostaje 401 JSON zamiast przekierowania HTML.

**Contract**: lista chronionych stron `["/dashboard", "/projects"]` (redirect 302 na `/auth/signin` jak dziś) oraz chronionych tras API `["/api/projects"]` (odpowiedź `401` z `{ "error": "Wymagane logowanie" }` i `Content-Type: application/json`). Dopasowanie z granicą segmentu: ścieżka równa trasie albo zaczynająca się od `trasa + "/"` (dziś `startsWith` bez granicy).

#### 5. Pomocnik odpowiedzi JSON

**File**: `src/lib/api.ts`

**Intent**: Wspólna obsługa trasy JSON (parsowanie ciała i kształt odpowiedzi), żeby trasy nie powielały ochrony i błędów.

**Contract**: funkcje: `json(body, status)`, `readJsonBody(request)` zwracająca 415 gdy `Content-Type` nie jest `application/json` i 400 gdy ciało nie jest poprawnym JSON-em. Kształt błędu: `{ error: string, fieldErrors?: Record<string,string> }`. Wymuszenie `Content-Type: application/json` jest główną ochroną przed CSRF dla tras z ciałem (`POST`, `PUT`; Astro `checkOrigin` nie sprawdza JSON-a). `DELETE` nie czyta ciała i nie wymaga `Content-Type`: chroni go domyślna kontrola `Origin` Astro (żądanie bez `Content-Type` musi mieć zgodny `Origin`), więc klient wysyła `DELETE` bez ciała.

#### 6. Trasy API

**File**: `src/pages/api/projects/index.ts` (POST), `src/pages/api/projects/[id].ts` (PUT, DELETE)

**Intent**: Udostępnić mutacje projektu dla dialogów, z walidacją zod i uwierzytelnieniem opartym o sesję.

**Contract**: `export const prerender = false`; wielkie nazwy metod (`POST`, `PUT`, `DELETE`); klient przez `createClient(headers, cookies)` (brak konfiguracji → 500 JSON); `[id]` walidowane `projectIdSchema` (zły format → 404). Odpowiedzi: `POST` → `201 {project}`; `PUT` (pełne ciało edytowalnych pól) → `200 {project}`; `DELETE` → `204`; walidacja i reguła dat → `422 {error, fieldErrors}`; brak rekordu → `404 {error}`. `user_id` nigdy nie jest przyjmowane z ciała (ustawia go baza).

#### 7. Przypięcie komunikatu triggera testem

**File**: `supabase/tests/database/core_domain_schema.test.sql`

**Intent**: Mapowanie błędu daty po tekście komunikatu jest kontraktem między bazą a aplikacją, więc test ma go chronić.

**Contract**: dwie asercje `throws_ok` na skrócenie terminu projektu poniżej milestona (i, jeśli istnieje, ta dla milestona po terminie projektu) zastąpić asercjami sprawdzającymi wzorzec komunikatu (np. `throws_like` z `Termin projektu (%) nie moze byc wczesniejszy niz data istniejacego milestona`), zachowując liczbę asercji w `plan(n)`.

#### 8. Rozszerzenie smoke

**File**: `scripts/smoke.mjs`

**Intent**: Dać CI bramkę dla kontraktu API projektów (jedyna bramka aplikacyjna w repo).

**Contract**: pomocnik `request` obsługuje ciało JSON (`Content-Type: application/json`) i zwraca sparsowane ciało; zachowuje wysyłanie `Origin`. Nowe kroki w tej kolejności: (1) bez sesji `POST /api/projects` → 401; po zalogowaniu (2) `POST` z pustą nazwą → 422 z `fieldErrors.name`; (3) `POST` poprawny → 201 (zapamiętać `id`); (4) `PUT` poprawny → 200; (5) `PUT` z innym poprawnym uuid → 404; (6) `DELETE` → 204; (7) powtórny `DELETE` → 404. Faza 3 wstawia kroki stron `GET /projects/{id}` → 200 po kroku (3) i → 404 po kroku (6), nie przepisując przepływu. Istniejące kroki auth bez zmian (w tym oczekiwany redirect `/` po zalogowaniu — zmienia się dopiero w Fazie 3).

### Success Criteria:

#### Automated Verification:

- Zależność zod zadeklarowana bezpośrednio: `grep '"zod"' package.json`
- Testy pgTAP przechodzą (w tym asercje komunikatu triggera): `npx supabase test db`
- Lint zmienionych plików bez błędów (Windows: `endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym nowe kroki API projektów (lokalny Supabase, `npm run preview`, `BASE_URL=http://localhost:4321 npm run smoke`)

#### Manual Verification:

- Komunikaty błędów z API (422, 404, 401) są po polsku, wskazują pole i nie ujawniają treści błędów Postgresa (sprawdzone na odpowiedziach `curl` z sesją)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Fundament UI — Button, komponenty, nagłówek aplikacji

### Overview

Komponenty zgodne z design systemem i kontraktem repo (tylko tokeny, `cn()`, polska treść): przebudowany `Button`, dialogi, pola formularza, helpery formatowania oraz layout aplikacji z minimalnym nagłówkiem. Bez nowych stron.

### Changes Required:

#### 1. Komponenty shadcn na tokenach (najpierw — przed adaptacją Buttona)

**File**: `src/components/ui/dialog.tsx`, `alert-dialog.tsx`, `input.tsx`, `textarea.tsx` (+ `package.json`/lock: pakiety Radix)

**Intent**: Dodać prymitywy potrzebne formularzowi i potwierdzeniu, bez drugiego `shadcn init`.

**Contract**: `npx shadcn@latest add dialog alert-dialog input textarea` (pakiety Radix dociąga CLI — obecnie zunifikowany `radix-ui`). `alert-dialog` ma w rejestrze zależność `button`, więc CLI zaproponuje nadpisanie istniejącego `src/components/ui/button.tsx`: **odmówić nadpisania** (nie używać `--overwrite`/`--yes` dla tego pliku) i po komendzie sprawdzić `git diff src/components/ui/button.tsx` — plik ma pozostać nietknięty do pkt 2. Wygenerowane pliki doprowadzić do konwencji repo: usunąć dyrektywę `"use client"` (CLAUDE.md zabrania dyrektyw Next.js), zastąpić literał koloru nakładki (`bg-black/50`) i cień (`shadow-lg`) tokenami (`shadow-pop`, warstwa z tokenów), usunąć wartości arbitralne (`top-[50%]`, `max-w-[calc(100%-2rem)]` itp.) na rzecz klas z skali. Klasy dopasować do kontraktu: pola 40px, `border-input`, `rounded-md`, etykiety `type-meta`, treść dialogu `bg-card`, `shadow-pop`, `rounded-md` (dialog), na telefonie (<768px) panel dołączony do dołu z `rounded-lg` jako bottom sheet; bez literałów kolorów, palety i wartości arbitralnych. Etykiety jako zwykłe `<label>` na tokenach (bez dodatkowego pakietu Radix).

#### 2. Button zgodny z kontraktem (po dodaniu komponentów shadcn)

**File**: `src/components/ui/button.tsx`

**Intent**: Doprowadzić istniejący (jedyny) Button do specyfikacji design systemu zamiast tworzyć drugi.

**Contract**: wykonywać dopiero po pkt 1 (wygenerowane `alert-dialog` używa `Button` i jego wariantów `default`/`outline`, które muszą pozostać). Wariant podstawowy = primary (`bg-primary`/`primary-hover`, `text-primary-foreground`), `secondary`, `ghost`, `destructive` (danger; używany wyłącznie w potwierdzeniach), zachowane nazwy `default`/`outline`/`link`, żeby nie złamać `SubmitButton` i formularzy auth. Kształt `rounded-pill`, rozmiar domyślny 40px, `sm` 32px, `icon` 40px, `type-button`, fokus 2px z offsetem 2px na tokenach (`ring`), bez wartości arbitralnych i literałów (`text-white`, `ring-[3px]`, `shadow-xs` do usunięcia). Zgodnie z `reference/components/Button.md` i `design-system.md:106`.

#### 3. Pole wyboru obszaru życia

**File**: `src/components/ui/select.tsx`

**Intent**: Dostępny, mobilny wybór spośród trzech obszarów bez dodatkowej zależności.

**Contract**: komponent `Select` renderujący natywny `<select>` ostylowany tokenami (wysokość 40px, `border-input`, `rounded-md`, focus jak w Button), przyjmujący `id`, `value`, `onChange`, opcje `{value,label}` i atrybuty a11y (`aria-invalid`, `aria-describedby`).

#### 4. Wrapper pola formularza

**File**: `src/components/ui/field.tsx`

**Intent**: Jednolita etykieta + kontrolka + błąd z poprawnymi powiązaniami a11y (istniejący `auth/FormField` wymaga ikony i nie ma `id` błędu).

**Contract**: komponent z propsami `id`, `label`, `error?`, `hint?` i dziećmi (kontrolka dostaje `aria-invalid` i `aria-describedby` wskazujące `id` komunikatu); błąd renderowany jako tekst `destructive-ink` z ikoną i słowem, `role` nie wymagany. Nie modyfikuje `src/components/auth/*`.

#### 5. ConfirmDialog

**File**: `src/components/ui/confirm-dialog.tsx`

**Intent**: Jeden komponent potwierdzenia destrukcyjnych akcji zgodny z `ConfirmDialog.md`.

**Contract**: oparty na `alert-dialog`; propsy `open`, `onOpenChange`, `title` (pytanie nazywające obiekt), `description`, `confirmLabel` (powtarza czasownik), `onConfirm`, `pending`, `error?`; przycisk „Anuluj" (ghost) i danger; fokus startuje na „Anuluj", Esc zamyka, brak `window.confirm`.

#### 6. Helpery formatowania

**File**: `src/lib/format.ts`

**Intent**: Polskie daty i liczby mnogie w jednym miejscu (używane w liście, widoku i dialogu usuwania).

**Contract**: `formatDate(iso)` → np. „20 cze 2027" przez `Intl.DateTimeFormat("pl-PL")` w strefie UTC (żeby data `YYYY-MM-DD` nie przesuwała się o dzień); `plural(n, [jedna, kilka, wiele])` według reguły: 1 → jedna; n%10 w 2–4 i n%100 poza 12–14 → kilka; reszta (w tym 0, 5–21 oraz 12–14) → wiele. Przykłady graniczne do przypięcia w komentarzu/użyciu: 0 zadań, 1 zadanie, 2 zadania, 12 zadań, 22 zadania, 25 zadań; 1 milestone, 3 milestony, 5 milestonów.

#### 7. Layout aplikacji

**File**: `src/layouts/AppLayout.astro`

**Intent**: Minimalna powłoka dla chronionych widoków (decyzja: pełna nawigacja dopiero przy S-04).

**Contract**: opakowuje `Layout.astro` (propsy `title`), renderuje nagłówek: nazwa produktu „SukcesPlaner" (`font-serif`, link do `/projects`), link „Projekty", e-mail użytkownika z `Astro.locals.user` oraz przycisk „Wyloguj" jako formularz POST na `/api/auth/signout`; `<main>` z kontenerem i marginesami 16px na telefonie; wyłącznie klasy tokenów, polska treść, brak poziomego przewijania.

#### 8. Smoke dla stron auth

**File**: `scripts/smoke.mjs`

**Intent**: Wykryć błąd renderowania po stronie serwera po zmianie Buttona — dziś smoke nie pobiera stron z wyspami używającymi Buttona (`scripts/smoke.mjs:38-59`).

**Contract**: dwa nowe kroki bez sesji: `GET /auth/signin` → 200 i `GET /auth/signup` → 200; istniejące kroki bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke (regresja auth po zmianie Buttona) przechodzi: `npm run smoke`

#### Manual Verification:

- Strony `/auth/signin` i `/auth/signup` nadal renderują się i działają po przebudowie Buttona (przegląd w przeglądarce)
- Komponenty `button`, `dialog`, `alert-dialog`, `input`, `textarea`, `select`, `field`, `confirm-dialog` używają wyłącznie tokenów (przegląd kodu: brak hex/rgb/oklch, klas palety i wartości arbitralnych)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Strony i wyspy — lista, widok projektu, dialogi

### Overview

Strony `/projects` i `/projects/[id]` renderowane po stronie serwera, wyspy React dla dialogów dodawania/edycji i usuwania, redirect po zalogowaniu oraz końcowa weryfikacja przepływu.

### Changes Required:

#### 1. Hook mutacji

**File**: `src/components/hooks/use-project-api.ts`

**Intent**: Jedno miejsce wywołań `fetch` do tras projektów i tłumaczenia odpowiedzi na stan UI (zgodnie z `CLAUDE.md`: hooki w `src/components/hooks/`).

**Contract**: funkcje tworzenia, edycji i usuwania z `Content-Type: application/json`; zwracają wynik rozróżniony (`ok` z projektem / `fieldErrors` / `notFound` / `unauthorized` / `unavailable`); na `401` przekierowują na `/auth/signin`; sieć niedostępna → komunikat ogólny po polsku.

#### 2. Dialog dodawania i edycji

**File**: `src/components/projects/ProjectFormDialog.tsx`

**Intent**: Jeden formularz dla trybów „utwórz" i „edytuj" (decyzja: obszar życia edytowalny).

**Contract**: wyspa React (`client:load`) z propsem trybu i opcjonalnym projektem; pola: nazwa, termin (`<input type="date">`), obszar (`Select` z trzema opcjami: Dom, Sport, Praca), opis (`Textarea`); walidacja klienta lustrzana do `projectInputSchema` (te same reguły), błędy pól z serwera (422) przypisywane do pól, dialog pozostaje otwarty; przycisk „Zapisz" w stanie oczekiwania. Po utworzeniu przejście na `/projects/[id]`, po edycji odświeżenie widoku. Tekst: „Dodaj projekt", „Edytuj", „Zapisz", „Anuluj".

#### 3. Dialog usuwania

**File**: `src/components/projects/DeleteProjectDialog.tsx`

**Intent**: Potwierdzenie usunięcia z dokładnymi licznikami (decyzja: zawsze, także dla pustego projektu).

**Contract**: wyspa na `ConfirmDialog`; propsy: nazwa projektu i liczniki `{milestones, tasks}` z serwera. Treść: tytuł „Usunąć projekt {nazwa}?"; gdy `milestones + tasks > 0`: „Usuniesz też {m} {milestony|milestonów|milestone} i {t} {zadania|zadań|zadanie}." (odmiana przez `plural`, np. „3 milestony i 12 zadań"); gdy oba 0: „Projekt nie ma milestonów ani zadań."; przycisk „Usuń projekt". Po sukcesie przejście na `/projects`; błąd 404 → komunikat i odświeżenie.

#### 4. Strona listy

**File**: `src/pages/projects/index.astro`

**Intent**: Lista projektów użytkownika z punktem wejścia „Dodaj projekt".

**Contract**: `export const prerender = false`; `AppLayout`; dane z `listProjects` (brak konfiguracji Supabase → komunikat o niedostępności, nie wyjątek); nagłówek: eyebrow „PROJEKTY", `type-display` „Projekty", główny przycisk „Dodaj projekt" (wyspa `ProjectFormDialog` w trybie utwórz); każdy wiersz: nazwa (`font-serif`), obszar (Dom/Sport/Praca), „Termin: {formatDate}", link do `/projects/[id]`; stan pusty w `type-quote` („Nie masz jeszcze projektów.") z tym samym przyciskiem. Tylko tokeny, układ bez poziomego przewijania na 390 px.

#### 5. Widok projektu

**File**: `src/pages/projects/[id].astro`

**Intent**: Minimalny widok projektu wg `project-view.md` (bez milestonów, które dochodzą w S-02).

**Contract**: `export const prerender = false`; identyfikator walidowany `projectIdSchema`, nieistniejący/cudzy → odpowiedź 404 z komunikatem „Nie znaleziono projektu" i linkiem do `/projects`; dane z `getProject` i `getProjectCounts`; nagłówek: link „Projekty", eyebrow „Projekt · {Obszar}", nazwa w `type-display`, opis w `type-quote` (gdy jest), „Termin projektu: {formatDate}", przycisk „Edytuj" (wyspa w trybie edycji); panel „Szczegóły" (obszar życia, termin, utworzono) oraz ghost „Usuń projekt…" w `destructive-ink` otwierający `DeleteProjectDialog`; miejsce na przyszłe milestony oznaczone krótkim, neutralnym komunikatem pustego stanu.

#### 6. Redirect po zalogowaniu

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Wprowadzić użytkownika od razu w aplikację zamiast na stronę startową.

**Contract**: sukces logowania przekierowuje na `/projects` (jedna linia; reszta trasy bez zmian).

#### 7. Smoke dla stron i redirectu

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć strony i zmieniony redirect.

**Contract**: oczekiwany `Location` po poprawnym logowaniu zmienia się na `/projects`; nowe kroki: bez sesji `GET /projects` → 302 `/auth/signin`; po zalogowaniu `GET /projects` → 200; `GET /projects/{id}` utworzonego projektu → 200; `GET /projects/{id}` po usunięciu → 404.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym nowe kroki stron i redirect po zalogowaniu: `npm run smoke`

#### Manual Verification:

- Pełny przepływ w przeglądarce: logowanie → `/projects` (stan pusty) → „Dodaj projekt" → przejście do widoku → „Edytuj" (zmiana nazwy i obszaru) → „Usuń projekt…" → powrót na listę
- Walidacja: pusta nazwa, brak lub zły termin pokazują polskie błędy przy polach, a dialog pozostaje otwarty
- Reguła terminu: po wstawieniu milestona poza aplikacją (psql/REST) skrócenie terminu poniżej jego daty pokazuje polski komunikat przy polu terminu; dialog usuwania takiego projektu pokazuje liczniki z poprawną odmianą
- Wygląd i dostępność: jasny i ciemny motyw, 390 px i 1280 px bez poziomego przewijania, fokus dialogu usuwania startuje na „Anuluj", Esc zamyka dialog, porównanie z `reference/screens/project-view.html` i zrzutami
- Niezalogowany użytkownik wchodzący na `/projects` trafia na logowanie, a po zalogowaniu na `/projects`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera (Moduł 3). Czyste funkcje (`plural`, `formatDate`, `toProject`, mapowanie błędów) weryfikuje się przez smoke i ręcznie; przykłady graniczne odmiany są w kontrakcie `format.ts`.

### Integration Tests:

- pgTAP: asercje komunikatu triggera daty (kontrakt z mapowaniem błędu w aplikacji).
- Smoke (CI, lokalny Supabase): 401 bez sesji; 422 z `fieldErrors.name`; 201/200/204; 404 dla obcego/nieistniejącego uuid i powtórnego usunięcia; strony `/projects` i `/projects/[id]` (302/200/404); redirect po zalogowaniu.

### Manual Testing Steps:

1. Przepływ z Fazy 3 w jasnym i ciemnym motywie, na 390 i 1280 px.
2. Wstaw milestone do projektu przez psql: `insert into public.milestones (user_id, project_id, name, due_date) values ('<user_id>', '<project_id>', 'm', '2026-12-20')`, a potem skróć termin projektu w UI poniżej tej daty.
3. Edycja projektu na termin równy dacie milestona (dozwolone) i na termin w przeszłości (dozwolone).

## Performance Considerations

Lista sortuje po `due_date, created_at` i korzysta z istniejącego indeksu `(user_id, due_date)`. Liczniki do usuwania to dwa zapytania `count=exact` przy renderze widoku projektu (skala: mała). Wynik jest doradczy i może się rozminąć z równoległą zmianą (akceptowane).

## Migration Notes

Brak migracji bazy. Wdrożenie wymaga wcześniej ręcznego `supabase db push` obu migracji z `core-domain-schema` razem (nie pojedynczo) na zdalny projekt. Dodanie `zod` i pakietów Radix zmienia `package-lock.json`.

## References

- Research: `context/changes/project-crud/research.md`
- Roadmapa: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-002, FR-003)
- Design system: `context/foundation/design-system/design-system.md` (Button `:106`, ConfirmDialog `:117`, widok projektu `:138-139`, formularze `:141-142`, copy `:144-151`)
- Wzorzec trasy: `src/pages/api/auth/signin.ts:5-19`; middleware: `src/middleware.ts:4,18-20`; klient: `src/lib/supabase.ts:10`; typy: `src/types.ts:3-12`
- Kontrakt bazy: `supabase/migrations/20261009120000_create_core_domain_schema.sql:8-20,119-142`, `supabase/migrations/20261009120100_enable_core_domain_rls.sql:14-35`
- Poprzednia zmiana: `context/changes/core-domain-schema/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — walidacja, serwis, ochrona tras, API, smoke

#### Automated

- [x] 1.1 Zależność zod zadeklarowana bezpośrednio: `grep '"zod"' package.json` — f6f9252
- [x] 1.2 Testy pgTAP przechodzą (w tym asercje komunikatu triggera): `npx supabase test db` — f6f9252
- [x] 1.3 Lint zmienionych plików bez błędów (Windows: `endOfLine: auto`) — f6f9252
- [x] 1.4 Sprawdzanie typów przechodzi: `npx astro check` — f6f9252
- [x] 1.5 Build przechodzi: `npm run build` — f6f9252
- [x] 1.6 Smoke przechodzi, w tym nowe kroki API projektów — f6f9252

#### Manual

- [x] 1.7 Komunikaty błędów z API (422, 404, 401) są po polsku, wskazują pole i nie ujawniają treści błędów Postgresa — f6f9252

### Phase 2: Fundament UI — Button, komponenty, nagłówek aplikacji

#### Automated

- [x] 2.1 Lint zmienionych plików bez błędów (`endOfLine: auto`)
- [x] 2.2 Sprawdzanie typów przechodzi: `npx astro check`
- [x] 2.3 Build przechodzi: `npm run build`
- [x] 2.4 Smoke (regresja auth po zmianie Buttona) przechodzi: `npm run smoke`

#### Manual

- [x] 2.5 Strony `/auth/signin` i `/auth/signup` nadal renderują się i działają po przebudowie Buttona
- [x] 2.6 Komponenty `button`, `dialog`, `alert-dialog`, `input`, `textarea`, `select`, `field`, `confirm-dialog` używają wyłącznie tokenów

### Phase 3: Strony i wyspy — lista, widok projektu, dialogi

#### Automated

- [ ] 3.1 Lint zmienionych plików bez błędów (`endOfLine: auto`)
- [ ] 3.2 Sprawdzanie typów przechodzi: `npx astro check`
- [ ] 3.3 Build przechodzi: `npm run build`
- [ ] 3.4 Smoke przechodzi, w tym nowe kroki stron i redirect po zalogowaniu: `npm run smoke`

#### Manual

- [ ] 3.5 Pełny przepływ w przeglądarce: logowanie, lista, dodanie, edycja, usunięcie
- [ ] 3.6 Walidacja pokazuje polskie błędy przy polach, a dialog pozostaje otwarty
- [ ] 3.7 Reguła terminu: polski komunikat przy polu terminu i liczniki z poprawną odmianą w dialogu usuwania
- [ ] 3.8 Wygląd i dostępność: jasny i ciemny motyw, 390 px i 1280 px, fokus na „Anuluj", Esc, zgodność z referencją
- [ ] 3.9 Niezalogowany użytkownik na `/projects` trafia na logowanie, a po zalogowaniu na `/projects`
