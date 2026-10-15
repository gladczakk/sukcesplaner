# Zarządzanie milestonami (CRUD) Implementation Plan

## Overview

Drugi slice roadmapy (S-02, FR-004/FR-005): w widoku projektu `/projects/[id]` użytkownik dodaje milestony z obowiązkową datą, edytuje je, usuwa (z potwierdzeniem i licznikiem zadań, które znikną) oraz zamyka i otwiera ponownie. Zamknięcie milestona z niezrobionymi zadaniami jest zablokowane regułą w bazie (trigger), tak jak reguła daty z S-01. Lista jest uporządkowana wg daty (remis wg kolejności utworzenia), a data milestona nie może przekroczyć terminu projektu.

## Current State Analysis

Stan na commit `38e2c54` (po archiwizacji S-01 i F-01).

- **Baza gotowa:** tabela `milestones` ma `name` (CHECK 1–200), `due_date` (NOT NULL), `completed_at` (NULL), `seq` (identity, deterministyczny remis dat), `project_id` + `user_id` ze złożonym FK i kaskadą, indeks `(project_id, due_date, seq)`. Trigger odrzuca milestone po terminie projektu (`23514`, komunikat „Data milestona (%) nie moze byc pozniejsza niz termin projektu (%)", `supabase/migrations/20261009120000_create_core_domain_schema.sql:90-115`). RLS per operacja dla `authenticated`.
- **Brak reguły zamykania:** nic w bazie ani w kodzie nie opisuje zamknięcia milestona; `completed_at` jest nieużywane, a S-04 zakłada „najbliższy niezamknięty milestone".
- **Wzorce z S-01 do przeniesienia:** serwis z tłumaczeniem błędów po komunikacie (`src/lib/services/projects.ts:38-57`), trasy JSON z `readJsonBody` (`src/lib/api.ts:24-34`), middleware chroni cały prefiks `/api/projects` (`src/middleware.ts:5`), hook z `fetch` (`src/components/hooks/use-project-api.ts`), `ConfirmDialog` z propem `trigger`, `Field` z `required`, smoke z asercjami na treść.
- **Widok projektu** ma miejsce na milestony: placeholder „Milestony pojawią się tutaj wkrótce." (`src/pages/projects/[id].astro:80-86`); „Utworzono" formatuje znacznik czasu przez `formatDate` w UTC (`[id].astro:102-103`, `src/lib/format.ts:1-12`).
- **Duplikacja do uniknięcia:** reguły nazwy i daty żyją w `src/lib/validation/project.ts:10-31` (stałe `NUL`, `MIN_DUE_DATE` nieeksportowane), a pomocniki klienta `fetch` w `use-project-api.ts:19-47`.
- **Lekcje:** `context/foundation/lessons.md` — smoke musi sprawdzać treść stron z wyspami React (Astro połyka błąd SSR wyspy); przed `shadcn add` sprawdzić zależności rejestru (w tym slice'u nie dodajemy komponentów shadcn).
- **Testy:** brak runnera; bramki to pgTAP (`npx supabase test db`, 91 testów) i smoke (24 kroki) uruchamiany w CI na lokalnym Supabase.

## Desired End State

- W `/projects/[id]` widać sekcję „Milestony": przycisk „Dodaj milestone", lista wg daty (romb, nazwa, data, liczba zadań, akcje „Edytuj", „Zamknij milestone"/„Otwórz ponownie", „Usuń"), stan pusty „Ten projekt nie ma jeszcze milestonów.".
- Dodanie i edycja przez dialog; pole daty ma `max` równe terminowi projektu, a data późniejsza niż termin jest odrzucana przy polu (po stronie klienta i bazy) po polsku. Data równa terminowi projektu jest dozwolona.
- Milestony z tą samą datą są wyświetlane w kolejności utworzenia.
- Zamknięcie milestona bez zadań lub z wszystkimi zadaniami `done` działa; przy niezrobionych zadaniach (`todo` lub `partial`) baza je odrzuca, a UI pokazuje „Nie można zamknąć milestona: ma niezrobione zadania (N)". Otwarcie ponowne działa zawsze.
- Usunięcie milestona zawsze z potwierdzeniem; treść: „Usuniesz też N zadań." (z odmianą) albo „Milestone nie ma zadań.".
- Weryfikacja: `npx supabase test db` (z nowym testem), lint zmienionych plików, `npx astro check`, `npm run build` i rozszerzony `npm run smoke` przechodzą; ręcznie: przepływ w przeglądarce w jasnym i ciemnym motywie na 390 i 1280 px.

### Key Discoveries:

- Reguła daty działa już na poziomie bazy, więc UI i serwis tylko tłumaczą błąd; po raz pierwszy da się ją sprawdzić przez aplikację (S-01 testował ją tylko przez psql).
- CHECK i trigger mają ten sam kod `23514`, więc rozróżnienie wymaga komunikatu — komunikaty triggerów są kontraktem i muszą być przypięte testem pgTAP (wniosek z przeglądu planu S-01, F5).
- `tasks(count)` w `select` daje liczniki zadań wszystkich milestonów w jednym zapytaniu (osadzenie `milestones(count)` zaobserwowano w S-01; to samo dla `tasks(count)` jest do potwierdzenia w fazie 2).
- Zamknięcie milestona z otwartymi zadaniami usunęłoby zadania z listy na dziś bez wiedzy użytkownika (guardrail PRD), dlatego reguła jest egzekwowana w bazie, a nie tylko w serwisie.
- Aplikacja jeszcze nie potrafi tworzyć zadań (S-03), więc blokadę zamknięcia i liczniki usuwania da się zobaczyć wyłącznie na zadaniach wstawionych przez psql.
- Astro nie pozwala asercjami statusu wykryć błędu wyspy React (lekcja); kroki smoke dla strony z milestonami sprawdzają treść i kolejność.

## What We're NOT Doing

- UI zadań i sekcje zadań w milestonie (S-03); lista na dziś i jej akcje (S-04, S-05).
- Opis milestona (tabela nie ma kolumny), przenoszenie milestona do innego projektu, zmiana `project_id`.
- Chipy „po terminie" i „ryzyko" (FR-015), pasek postępu, oś czasu `MilestoneSection` z rozwijaniem, karty `MilestoneCard` w panelu.
- Liczniki milestonów na liście projektów, współdzielony klient Supabase w `locals`, zmiany w istniejących migracjach.
- `supabase db push` na zdalny projekt: trzy migracje (dwie z `core-domain-schema` i nowa) trzeba wypchnąć razem, ręcznie, przed wdrożeniem.
- Blokada dodawania otwartego zadania do zamkniętego milestona — to reguła S-03.
- Runner testów jednostkowych i `supabase test db` w CI (Moduł 3); naprawa `npm run lint` na Windowsie (CRLF + 6 plików spoza `src/`).

## Implementation Approach

Kolejność „baza → backend → UI". Faza 1 dodaje regułę zamykania w bazie wraz z testem pgTAP. Faza 2 dokłada wspólne reguły walidacji, serwis i trzy trasy JSON wraz ze smoke dla API. Faza 3 wydziela wspólnego klienta `fetch`, dodaje dialogi i listę w widoku projektu oraz smoke dla strony. Decyzje:

- **Trasy:** `POST /api/projects/[id]/milestones`; `PUT`, `PATCH`, `DELETE /api/projects/[id]/milestones/[milestoneId]`. `PATCH` z ciałem `{ "completed": boolean }` zamyka i otwiera. Middleware bez zmian (prefiks `/api/projects` chroni zagnieżdżone trasy).
- **Statusy:** `201 {milestone}`, `200 {milestone}`, `204`; `422 {error, fieldErrors?}` dla walidacji, reguły daty i zablokowanego zamknięcia; `404` dla nieznanego projektu lub milestona (milestone musi należeć do projektu z ścieżki); `401/415/400/500` jak w S-01.
- **Walidacja:** `name` po przycięciu 1–200 bez znaku NUL; `due_date` realna data od 1000-01-01; ten sam zestaw reguł co projekt, wyciągnięty do wspólnego pliku. Zależność od terminu projektu pilnuje baza (serwer) oraz `max` i sprawdzenie w formularzu (UX).
- **Lista:** `order(due_date).order(seq)`; zamknięty milestone zostaje na swoim miejscu (wyszarzona nazwa + chip „zamknięty {data}"); data zamknięcia w strefie `Europe/Warsaw`.
- **Zamknięty milestone:** edycja nazwy i daty oraz usunięcie pozostają dozwolone (wiersz ma te same akcje, z „Otwórz ponownie" zamiast „Zamknij milestone"); ponowne zamknięcie i ponowne otwarcie są idempotentne (bez zapisu, gdy stan już jest zgodny).
- **UI:** jedna wyspa na wiersz (`MilestoneRowActions`) z edycją, zamknięciem i usunięciem zamiast trzech wysp; dialogi z `trigger asChild`.
- **Poprawki z przeglądu S-01 stosowane od początku:** blokada przycisków po udanym zapisie (`navigating`), fokus na pierwszym błędnym polu, `aria-required`, `role="alert"` dla błędów, logowanie błędów serwera przez `logError`, walidacja kształtu odpowiedzi w hooku.

## Phase 1: Reguła zamykania milestona w bazie

### Overview

Nowa migracja z triggerem blokującym zamknięcie milestona z niezrobionymi zadaniami oraz testy pgTAP z przypiętym komunikatem.

### Changes Required:

#### 1. Migracja z triggerem

**File**: `supabase/migrations/20261014120000_milestone_close_rule.sql`

**Intent**: Zamknięcie (`completed_at` z NULL na wartość) jest możliwe tylko wtedy, gdy milestone nie ma zadań o statusie innym niż `done`; baza pilnuje niezmiennika niezależnie od tego, kto zapisuje (S-05, psql).

**Contract**: funkcja `public.check_milestone_closable()` (`returns trigger`, `language plpgsql`, `set search_path = ''`, w pełni kwalifikowane nazwy, `SECURITY INVOKER`) i trigger `milestones_check_closable` jako `BEFORE UPDATE OF completed_at ON public.milestones FOR EACH ROW WHEN (old.completed_at IS NULL AND new.completed_at IS NOT NULL)`. Liczy `public.tasks` z `milestone_id = new.id` i `status <> 'done'`; przy liczbie większej od zera rzuca `check_violation` z komunikatem `Milestone nie moze zostac zamkniety: niezrobione zadania (%)` (ASCII, jak komunikat daty; `%` = liczba). Nie sprawdza: ponownego otwarcia (`completed_at` → NULL), zmiany innych kolumn zamkniętego milestona ani ponownego zapisu `completed_at` już zamkniętego (ponowne zamknięcie jest odpowiedzialnością serwisu, który jest idempotentny — Faza 2). Plik zawiera komentarz nagłówkowy w stylu istniejących migracji.

#### 2. Testy pgTAP

**File**: `supabase/tests/database/core_domain_milestone_close.test.sql`

**Intent**: Zabezpieczyć regułę i komunikat, który aplikacja tłumaczy po tekście.

**Contract**: pgTAP (`begin; select plan(n); … select * from finish(); rollback;`), użytkownicy wstawiani do `auth.users`, ASCII jak w pozostałych plikach. Przypadki: zamknięcie milestona z zadaniem `todo` odrzucone z `23514` i dokładnym komunikatem z liczbą 1; zadanie `partial` też liczy się jako otwarte (liczba 2 przy dwóch otwartych); zamknięcie po ustawieniu wszystkich zadań na `done` przechodzi; milestone bez zadań zamyka się; ponowne otwarcie zamkniętego milestona z otwartym zadaniem (dodanym po zamknięciu) przechodzi; zmiana nazwy zamkniętego milestona z otwartym zadaniem przechodzi; reguła działa także w kontekście roli `authenticated` z RLS (zamknięcie własnego milestona z otwartym zadaniem odrzucone, bez otwartych zadań przechodzi).

### Success Criteria:

#### Automated Verification:

- Wszystkie trzy migracje aplikują się czysto od zera: `npx supabase db reset`
- Testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db`

#### Manual Verification:

- W bazie widać trigger `milestones_check_closable` na `milestones` (np. `\d public.milestones` w psql), a próba zamknięcia milestona z niezrobionym zadaniem daje komunikat po polsku bez diakrytyków

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Backend — walidacja, serwis, trasy, smoke

### Overview

Wspólne reguły walidacji, schemat milestona, serwis z tłumaczeniem błędów, trzy trasy JSON i smoke dla API (włącznie z regułą daty przez aplikację).

### Changes Required:

#### 1. Wspólne pola walidacji

**File**: `src/lib/validation/fields.ts`, `src/lib/validation/project.ts`

**Intent**: Jedno źródło reguł nazwy i daty (NUL, zakres lat), zamiast kopiowania ich do schematu milestona.

**Contract**: `fields.ts` eksportuje stałe `NUL`, `MIN_DUE_DATE` oraz konstruktory `nameField(messages)` (przycięta, 1–200, bez NUL, komunikaty podawane przez wywołującego) i `dateField(messages)` (`z.iso.date()` od `MIN_DUE_DATE`). `project.ts` używa ich z **tymi samymi komunikatami co dziś** (zachowanie schematu projektu bez zmian: te same odpowiedzi 422, w tym dla NUL i roku 0000).

#### 2. Schemat milestona

**File**: `src/lib/validation/milestone.ts`

**Intent**: Reguły wejścia dla milestona i dla przełączania zamknięcia.

**Contract**: eksporty `MILESTONE_FIELDS = ["name", "due_date"]`, typy `MilestoneField`/`MilestoneFieldErrors`, `milestoneInputSchema` (`{name, due_date}` z `nameField`/`dateField`, polskie komunikaty: „Podaj nazwę milestona", „Podaj poprawną datę milestona w formacie RRRR-MM-DD"…), `milestoneCompletionSchema` (`{completed: boolean}` z komunikatem, gdy brak lub zły typ), `milestoneIdSchema = z.uuid()` oraz `flattenMilestoneErrors(error)` (pierwszy komunikat na pole). Typ `MilestoneInput = z.output<typeof milestoneInputSchema>`.

#### 3. Typ pozycji listy

**File**: `src/types.ts`

**Intent**: Wspólny kształt wiersza listy z licznikiem zadań dla serwisu, strony i wysp.

**Contract**: `MilestoneListItem = Milestone & { task_count: number }` (zgodnie z `CLAUDE.md`: DTO w `src/types.ts`).

#### 4. Wspólne elementy serwisów

**File**: `src/lib/services/postgrest.ts`, `src/lib/services/projects.ts`

**Intent**: Nie powielać `readFailure` i stałych komunikatów między serwisem projektów i milestonów.

**Contract**: `postgrest.ts` eksportuje `readFailure(error)` (`new Error("<code>: <message>")`), `GENERIC_ERROR`, `SESSION_ERROR`; `projects.ts` importuje je zamiast lokalnych definicji (zachowanie bez zmian).

#### 5. Serwis milestonów

**File**: `src/lib/services/milestones.ts`

**Intent**: Dostęp do `milestones` i tłumaczenie błędów w jednym miejscu.

**Contract**: funkcje przyjmujące typowany klient: `listMilestones(supabase, projectId)` → `MilestoneListItem[]` (`select("*, tasks(count)")`, `eq("project_id")`, `order("due_date")` potem `order("seq")`; liczba zadań z `tasks[0].count`, brak → 0; błąd odczytu → `throw readFailure`); `createMilestone(supabase, projectId, input)`; `updateMilestone(supabase, projectId, id, input)`; `setMilestoneCompleted(supabase, projectId, id, completed)` (idempotentne: najpierw odczyt bieżącego stanu po `id` i `project_id` — brak → `not_found`; stan już zgodny z żądanym → `ok` z istniejącym milestonem **bez zapisu**, więc pierwotna `completed_at` nie jest nadpisywana, a reguła zamykania nie jest omijana ponownym zamknięciem; w przeciwnym razie zapis `completed_at` = bieżący czas albo `null`); `deleteMilestone(supabase, projectId, id)`. Aktualizacje i usunięcia filtrują po `id` **i** `project_id` oraz używają `.select()`, więc pusty wynik = `not_found` (też gdy milestone należy do innego projektu). Wynik rozróżniony: `ok` / `validation` / `not_found` / `unavailable`. Tłumaczenie błędów (zaobserwowane/przypięte testem): `23514` z „Data milestona" → pole `due_date` („Data milestona nie może być późniejsza niż termin projektu"); `23514` z `milestones_name_length` → pole `name`; `23514` z „Milestone nie moze zostac zamkniety" → `validation` bez pola, błąd „Nie można zamknąć milestona: ma niezrobione zadania (N)" z `N` wyłuskanym z komunikatu (brak liczby → wersja bez liczby); `23503` przy `INSERT` (projekt nie istnieje lub należy do kogoś innego) → `not_found`; `42501` → sesja; pozostałe → `logError` + komunikat ogólny. `ProjectFieldErrors`-podobny typ pól z `milestone.ts`.

#### 6. Trasy API

**File**: `src/pages/api/projects/[id]/milestones/index.ts` (POST), `src/pages/api/projects/[id]/milestones/[milestoneId].ts` (PUT, PATCH, DELETE)

**Intent**: Udostępnić mutacje milestonów dla wysp, z walidacją zod i uwierzytelnieniem opartym o sesję.

**Contract**: `export const prerender = false`; wielkie nazwy metod; klient przez `createClient(headers, cookies)` (brak konfiguracji → 500 JSON); niepoprawny uuid projektu → 404 „Nie znaleziono projektu", niepoprawny uuid milestona → 404 „Nie znaleziono milestona"; `POST`/`PUT` czytają ciało przez `readJsonBody` i walidują `milestoneInputSchema` (zły kształt → 422 z `fieldErrors`); `PATCH` waliduje `milestoneCompletionSchema`; `DELETE` nie czyta ciała (chroni go kontrola `Origin` Astro). Odpowiedzi: `POST` → `201 {milestone}`, `PUT`/`PATCH` → `200 {milestone}`, `DELETE` → `204`, `validation` → `422 {error, fieldErrors?}`, `not_found` → 404, `unavailable` → 500. `user_id` i `project_id` nigdy z ciała (projekt ze ścieżki).

#### 7. Smoke dla API milestonów

**File**: `scripts/smoke.mjs`

**Intent**: Bramka CI dla kontraktu API milestonów; pierwsze sprawdzenie reguły daty przez aplikację.

**Contract**: nowe kroki wstawione po kroku tworzenia projektu (projekt ma termin 2099-12-31), w tej kolejności; nazwy milestonów są odrębne i żadna nie jest podciągiem innej: „Alfa smoke", „Beta smoke", po zmianie nazwy „Gamma smoke". (1) `POST` z pustą nazwą → 422 z `fieldErrors.name`; (2) `POST` z datą 2100-01-01 (po terminie projektu) → 422 z `fieldErrors.due_date` o polskiej treści; (3) `POST` „Alfa smoke" na dzień terminu projektu 2099-12-31 → 201 (zapamiętać `id` jako A); (4) `POST` „Beta smoke" na ten sam dzień → 201 (B, remis); **[miejsce kroku strony P1 z Fazy 3]**; (5) `PUT` nazwy A na „Gamma smoke" → 200 z nową nazwą; (6) `PUT` daty A po terminie projektu → 422 z `fieldErrors.due_date`; (7) `PATCH {completed:true}` na A → 200 z ustawionym `milestone.completed_at` (zapamiętać wartość); (7b) powtórny `PATCH {completed:true}` → 200 z **tą samą** `completed_at` (idempotencja; porównanie w kroku przez zapamiętaną wartość); **[miejsce kroku strony P2]**; (8) `PATCH {completed:false}` → 200 z `completed_at` równym `null`; (8b) powtórny `PATCH {completed:false}` → 200 z `null`; **[miejsce kroku strony P3]**; (9) `POST` do poprawnego, nieistniejącego uuid projektu → 404; (10) `PUT` nieistniejącego uuid milestona → 404; (11) `DELETE` milestona B → 204, powtórny → 404. Milestone A zostaje do końca przepływu i znika kaskadowo z projektem. Kroki o istniejących nazwach bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym nowe kroki API milestonów (lokalny Supabase, `npm run preview`, `BASE_URL=http://localhost:4321 npm run smoke`)

#### Manual Verification:

- Odpowiedzi API milestonów (422, 404) są po polsku, wskazują pole i nie ujawniają treści błędów Postgresa (sprawdzone `curl`-em z sesją)
- `PATCH {completed:true}` na milestonie z niezrobionym zadaniem wstawionym przez psql zwraca 422 z komunikatem o liczbie zadań

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: UI — dialogi, lista w widoku projektu, smoke stron

### Overview

Wspólny klient `fetch`, hook milestonów, dialogi (formularz, usuwanie), wyspa akcji wiersza, sekcja „Milestony" w widoku projektu oraz smoke dla strony z asercjami na treść i kolejność.

### Changes Required:

#### 1. Wspólny klient fetch

**File**: `src/lib/api-client.ts`, `src/components/hooks/use-project-api.ts`

**Intent**: Wyciągnąć z hooka projektów pomocniki odpowiedzi/błędów, które milestony powtórzyłyby (`isRecord`, `readJson`, `readError`, `readFieldErrors`, `redirectToSignin`, komunikaty sieci i ogólny).

**Contract**: `api-client.ts` eksportuje `NETWORK_ERROR`, `GENERIC_ERROR`, `isRecord`, `readJson`, `readError`, `readFieldErrors(body, fields)` (pola przekazywane jako tablica) i `redirectToSignin()`; `use-project-api.ts` importuje je zamiast lokalnych kopii, **bez zmiany zachowania** (te same statusy wyników, redirect na 401, walidacja `id` odpowiedzi). Regresja jest sprawdzana ręcznie (tworzenie, edycja i usuwanie projektu).

#### 2. Hook milestonów

**File**: `src/components/hooks/use-milestone-api.ts`

**Intent**: Jedno miejsce wywołań `fetch` do tras milestonów.

**Contract**: `useMilestoneApi()` zwraca `createMilestone(projectId, input)`, `updateMilestone(projectId, id, input)`, `setMilestoneCompleted(projectId, id, completed)`, `deleteMilestone(projectId, id)`; wyniki rozróżnione (`ok` z milestonem / `fieldErrors` z `error` / `notFound` / `unauthorized` / `unavailable`), 401 → przekierowanie na `/auth/signin`, sieć niedostępna → komunikat ogólny po polsku; `ok` tylko gdy odpowiedź zawiera `milestone` z poprawnym `id` (`milestoneIdSchema`); `DELETE` bez ciała i bez `Content-Type`; typy wyników o nazwach unikalnych względem `ProjectApi*`.

#### 3. Formularz milestona

**File**: `src/components/projects/MilestoneFormDialog.tsx`

**Intent**: Jeden dialog dla trybów „dodaj" i „edytuj".

**Contract**: wyspa React; propsy `mode`, `projectId`, `projectDueDate`, opcjonalny `milestone` (`id`, `name`, `due_date`); pola: nazwa (`Input`), data (`<input type="date">` z `max={projectDueDate}`); walidacja klienta przez `milestoneInputSchema` plus sprawdzenie `due_date <= projectDueDate` z komunikatem „Data milestona nie może być późniejsza niż termin projektu ({termin})"; błędy 422 przypisywane do pól, dialog pozostaje otwarty; fokus na pierwszym błędnym polu; `aria-required` dla obu pól; po udanym zapisie przycisk pozostaje zablokowany do przeładowania strony (`window.location.reload()`); wyzwalacz przez `DialogTrigger asChild` („Dodaj milestone" jako przycisk główny w trybie dodawania, „Edytuj" jako `ghost` `sm` w trybie edycji); teksty „Zapisz", „Anuluj", tytuł „Dodaj milestone"/„Edytuj milestone".

#### 4. Dialog usuwania milestona

**File**: `src/components/projects/DeleteMilestoneDialog.tsx`

**Intent**: Potwierdzenie usunięcia z licznikiem zadań (decyzja: zawsze, także bez zadań).

**Contract**: wyspa na `ConfirmDialog` z propem `trigger` (ghost `sm` „Usuń" w `destructive-ink`); tytuł „Usunąć milestone {nazwa}?"; gdy `taskCount > 0`: „Usuniesz też {N} {zadanie|zadania|zadań}." (odmiana `plural` z `format.ts`), inaczej „Milestone nie ma zadań."; przycisk „Usuń milestone"; po sukcesie przeładowanie strony, 404 → komunikat i przeładowanie; przyciski zablokowane po sukcesie.

#### 5. Akcje wiersza

**File**: `src/components/projects/MilestoneRowActions.tsx`

**Intent**: Jedna wyspa na wiersz zamiast trzech.

**Contract**: propsy: `projectId`, `projectDueDate`, `milestone` (`id`, `name`, `due_date`, `completed_at`), `taskCount`; renderuje `MilestoneFormDialog` (edycja), przycisk zamknięcia/otwarcia (`secondary` `sm`: „Zamknij milestone" gdy `completed_at` jest `null`, „Otwórz ponownie" w przeciwnym razie) oraz `DeleteMilestoneDialog`; przy 422 z zamknięcia pokazuje komunikat obok przycisków (`role="alert"`, np. „Nie można zamknąć milestona: ma niezrobione zadania (2)"); przycisk zablokowany w trakcie i po sukcesie do przeładowania.

#### 6. Sekcja w widoku projektu

**File**: `src/pages/projects/[id].astro`, `src/lib/format.ts`

**Intent**: Wypełnić placeholder listą milestonów i poprawić datę „Utworzono".

**Contract**: w `[id].astro` zastąpić placeholder (linie 80-86) sekcją „Milestony": nagłówek `type-section` z `MilestoneFormDialog` (dodawanie), dane z `listMilestones` w `try/catch` z `logError` i komunikatem „Nie udało się wczytać milestonów…" (strona nadal renderuje projekt); stan pusty „Ten projekt nie ma jeszcze milestonów." w `type-quote` z przerywaną ramką; lista `<ol>` — wiersz: romb (znacznik z klas ze skali, wypełniony dla zamkniętego), nazwa (`font-serif`, wyszarzona gdy zamknięty), data (`formatDate`), licznik „{N} {zadanie|zadania|zadań}", chip „zamknięty {data}" (ikona + słowo) oraz `MilestoneRowActions`. Układ bez poziomego przewijania na 390 px, tylko tokeny. `format.ts` dostaje `formatTimestamp(iso)` (dzień, miesiąc skrótowo, rok w strefie `Europe/Warsaw`), używany dla daty zamknięcia i dla „Utworzono" (naprawa obserwacji z przeglądu S-01: dzień poprzedni w nocy lokalnie).

#### 7. Smoke dla strony

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć stronę z milestonami zgodnie z lekcją o wyspach React i regułą remisu dat.

**Contract**: runner dostaje opcję `bodyOrder` (lista fragmentów, które muszą wystąpić w treści w podanej kolejności). Kroki strony `GET /projects/{id}` → 200 wstawiane są dokładnie w miejscach zaznaczonych w Fazie 2, bez przepisywania przepływu: **P1** (po kroku 4) treść zawiera „Dodaj milestone", „Zamknij milestone" oraz „Alfa smoke" przed „Beta smoke" (`bodyOrder`; remis dat, kolejność utworzenia); **P2** (po kroku 7b) treść zawiera „Otwórz ponownie" i „zamknięty"; **P3** (po kroku 8b) treść zawiera znów „Zamknij milestone". Istniejące kroki bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym nowe kroki strony milestonów i kolejność remisu: `npm run smoke`

#### Manual Verification:

- Pełny przepływ w przeglądarce: otwórz projekt → „Dodaj milestone" → pojawia się na liście → „Edytuj" → „Zamknij milestone" → „Otwórz ponownie" → „Usuń" z potwierdzeniem
- Data graniczna: milestone na dzień terminu projektu zapisuje się; późniejsza data jest niemożliwa do wybrania (`max`), a wymuszona (wpisana) pokazuje komunikat przy polu daty; dwa milestony z tą samą datą są w kolejności utworzenia
- Po wstawieniu zadań przez psql: zamknięcie milestona z niezrobionym zadaniem pokazuje komunikat z liczbą, a dialog usuwania pokazuje liczniki z poprawną odmianą (np. 1, 2, 12, 22 zadań)
- Regresja po wydzieleniu klienta: tworzenie, edycja i usuwanie projektu nadal działają w przeglądarce
- Wygląd i dostępność: jasny i ciemny motyw, 390 px i 1280 px bez poziomego przewijania, fokus wraca na wyzwalacz po zamknięciu dialogów (Anuluj, Esc), fokus startuje na „Anuluj" w dialogu usuwania, nawigacja klawiaturą

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera (Moduł 3). Reguły logiki są w bazie i pokryte pgTAP; czyste funkcje (`formatTimestamp`, tłumaczenie błędów) sprawdza smoke i ręczna weryfikacja.

### Integration Tests:

- pgTAP `core_domain_milestone_close.test.sql`: blokada zamknięcia (todo, partial), zamknięcie po `done`, bez zadań, ponowne otwarcie, zmiana nazwy zamkniętego, rola `authenticated` z RLS; przypięty komunikat.
- Smoke (CI, lokalny Supabase): walidacja nazwy i daty (422), granica daty projektu (201), remis dat, edycja, zamknięcie/otwarcie (także powtórne, idempotentne), 404 dla nieznanych id, usunięcie i powtórne usunięcie, a na stronie: obecność wysp i kolejność remisu.

### Manual Testing Steps:

1. Przepływ z Fazy 3 w jasnym i ciemnym motywie, na 390 i 1280 px.
2. Zadania przez psql (do sprawdzenia blokady i liczników): `insert into public.tasks (user_id, milestone_id, title, status) select user_id, id, 't'||g, 'todo' from public.milestones, generate_series(1, 2) g where id = '<milestone_id>'`, potem zamknięcie w UI, zmiana statusów na `done` i ponowna próba.
3. Edycja terminu projektu poniżej daty milestona w dialogu projektu (błąd z S-01) oraz milestone na dzień terminu projektu.

## Performance Considerations

Lista milestonów to jedno zapytanie z osadzonym licznikiem zadań, korzystające z indeksu `(project_id, due_date, seq)`; liczniki w widoku projektu (`getProjectCounts`) zostają dla dialogu usuwania projektu. Skala mała, bez paginacji.

## Migration Notes

Jedna nowa migracja (`20261014120000_milestone_close_rule.sql`). Wdrożenie wymaga ręcznego `supabase db push` **trzech migracji razem** (dwie z `core-domain-schema` i ta) na zdalny projekt przed wdrożeniem aplikacji. Wycofanie: nowa migracja usuwająca trigger i funkcję; nie edytować zastosowanych migracji.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-02), PRD: `context/foundation/prd.md` (FR-004, FR-005)
- Lekcje: `context/foundation/lessons.md`
- Design system: `context/foundation/design-system/design-system.md`, `reference/components/MilestoneSection.md`, `MilestoneCard.md`, `ConfirmDialog.md`
- Poprzedni slice: `context/archive/2026-10-09-project-crud/plan.md`, `reviews/impl-review.md`
- Baza: `supabase/migrations/20261009120000_create_core_domain_schema.sql:90-115`; serwis: `src/lib/services/projects.ts:38-57`; hook: `src/components/hooks/use-project-api.ts:19-47`; widok: `src/pages/projects/[id].astro:80-86`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła zamykania milestona w bazie

#### Automated

- [x] 1.1 Wszystkie trzy migracje aplikują się czysto od zera: `npx supabase db reset` — 0960870
- [x] 1.2 Testy pgTAP przechodzą, w tym nowy plik: `npx supabase test db` — 0960870

#### Manual

- [x] 1.3 W bazie widać trigger `milestones_check_closable`, a próba zamknięcia milestona z niezrobionym zadaniem daje komunikat po polsku — 0960870

### Phase 2: Backend — walidacja, serwis, trasy, smoke

#### Automated

- [x] 2.1 Lint zmienionych plików bez błędów (`endOfLine: auto`) — 636fb53
- [x] 2.2 Sprawdzanie typów przechodzi: `npx astro check` — 636fb53
- [x] 2.3 Build przechodzi: `npm run build` — 636fb53
- [x] 2.4 Smoke przechodzi, w tym nowe kroki API milestonów — 636fb53

#### Manual

- [x] 2.5 Odpowiedzi API milestonów (422, 404) są po polsku, wskazują pole i nie ujawniają treści błędów Postgresa — 636fb53
- [x] 2.6 `PATCH {completed:true}` na milestonie z niezrobionym zadaniem (psql) zwraca 422 z komunikatem o liczbie zadań — 636fb53

### Phase 3: UI — dialogi, lista w widoku projektu, smoke stron

#### Automated

- [x] 3.1 Lint zmienionych plików bez błędów (`endOfLine: auto`) — a832612
- [x] 3.2 Sprawdzanie typów przechodzi: `npx astro check` — a832612
- [x] 3.3 Build przechodzi: `npm run build` — a832612
- [x] 3.4 Smoke przechodzi, w tym nowe kroki strony milestonów i kolejność remisu: `npm run smoke` — a832612

#### Manual

- [x] 3.5 Pełny przepływ w przeglądarce: dodanie, edycja, zamknięcie, otwarcie ponowne, usunięcie milestona — a832612
- [x] 3.6 Data graniczna, błąd daty przy polu i kolejność milestonów z tą samą datą — a832612
- [x] 3.7 Blokada zamknięcia i liczniki usuwania z odmianą (zadania wstawione przez psql) — a832612
- [x] 3.8 Regresja po wydzieleniu klienta: tworzenie, edycja i usuwanie projektu nadal działają — a832612
- [x] 3.9 Wygląd i dostępność: motywy, 390 px i 1280 px, powrót fokusu po zamknięciu dialogów, klawiatura — a832612
