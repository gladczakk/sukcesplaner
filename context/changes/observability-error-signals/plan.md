# Widoczne i diagnozowalne błędy produkcyjne Implementation Plan

## Overview

Zmiana domyka najważniejsze luki z audytu obserwowalności (`context/audits/observability/2026-10-30_auth-today-list-project-writes.md`, ustalenia P1, P2, P3, P4, A5, L1, L4, W4): błąd produkcyjny ma zostawiać w logu jedną linię JSON ze stosem, `cause`, kodem PostgREST/Auth i kontekstem (`userId`, `requestId`, ids zasobów), bez danych osobowych. Middleware przestaje zamieniać awarię Supabase Auth w ciche „wylogowanie”, a zero wierszy po UPDATE/DELETE, kod 23503 i „lost race” są logowane z ids przy niezmienionych odpowiedziach HTTP (404 wymaga smoke). Każda faza zaczyna się od testu, który najpierw jest czerwony (zasada M3L5), a poprawki nie ukrywają błędów (bez pustych `catch`, bez zamiany awarii w redirect).

## Current State Analysis

- `logError(scope, error)` (`src/lib/log.ts:5-9`) zapisuje do `console.error` tylko `[scope] message`: stos, `cause`, kod, status, `details`, `hint` i jakiekolwiek ids giną. Ma 10 miejsc wywołania; jedyna asercja na log to `tasks.test.ts:213-214`.
- `readFailure` (`src/lib/services/postgrest.ts:6-8`) tworzy `new Error("<code>: <message>")` bez `cause`; cztery strony łapią błąd już po spłaszczeniu.
- `src/middleware.ts:15-18` odrzuca `error` z `getUser()`: gość i awaria Supabase Auth są nieodróżnialne (302/401, zero logu). `src/lib/supabase.ts:7-9` zwraca `null` bez logu, `signout.ts:7` ignoruje wynik `signOut()`.
- Zero wierszy po UPDATE/DELETE i kod 23503 to w usługach `not_found` (404) bez logu i bez `userId` w zasięgu (`tasks.ts:254-255,89-92`, `milestones.ts:59-62,128,147`, `projects.ts:96-97,106`); „lost race” w `setMilestoneCompleted` zwraca `ok` bez śladu (`milestones.ts:144-147`).
- Zweryfikowane na lokalnym Supabase: gość daje `AuthSessionMissingError` (400), niedostępny backend `AuthRetryableFetchError` (status 0), uszkodzony token `AuthApiError` 403 `bad_jwt`; `anon` daje 401 `42501`, wygasły JWT 401 `PGRST303`, a ciche zero wierszy (200 `[]`) tylko przy ważnym JWT i wierszu brakującym lub ukrytym przez RLS.

## Desired End State

Każdy błąd usługi, strony, middleware i `signOut` zostawia w logu jeden wpis JSON z polami diagnostycznymi i kontekstem; awaria Supabase Auth zwraca 503 (trasy chronione) i jest zalogowana, gość nadal dostaje 302/401; zero wierszy, 23503 i „lost race” są widoczne w logu jako osobne zdarzenia z ids, a użytkownik widzi te same 404/422/500 co dziś (poza komunikatem sesji dla `PGRST301/303`). Weryfikacja: nowe testy vitest przeszły po fazie czerwonej, smoke/e2e/pgTAP bez regresji, a ponowny audyt `--verify` oznacza P1, P2, P3, P4, A5, L4, W4 jako `fixed` i zawęża L1.

### Key Discoveries:

- `getUser()` zwraca `AuthError`, nie rzuca; predykat: awaria = `AuthRetryableFetchError` lub `status >= 500`, gość = brak błędu lub `AuthSessionMissingError` (`@supabase/auth-js` `GoTrueClient.js:2673-2730`, `fetch.js:35-89`; zweryfikowane uruchomieniem).
- `locals.user` jest ustawiane w middleware (`src/env.d.ts:3`, `middleware.ts:15-18`), a trasy API go nie czytają: `userId` jest dostępny bez nowej sieci; `cf-ray` jest w `request.headers`; id żądania nie istnieje w repo.
- Smoke wymaga 404 dla zera wierszy w 11 scenariuszach (`scripts/smoke.mjs:635-1420`) i 302/401 dla gościa (`:163-168`): zmienić można tylko logowanie, nie semantykę `not_found`.
- Moduły `astro:*` nie importują się w vitest (`vitest.config.ts:1-11`); `vi.mock("astro:middleware")` i `vi.mock("astro:env/server")` w pliku testu są najtańszą drogą (do potwierdzenia przy pierwszym uruchomieniu).
- Pliki `*.test.ts` w `src/pages/` Astro potraktowałby jako trasy, więc testy tras i middleware idą do `src/lib/__tests__/`.
- ESLint: `no-console: warn` (nowe `console.*` wymaga `eslint-disable` jak w `log.ts:7`), `restrict-template-expressions` tylko dla liczb, `prefer-nullish-coalescing` (hook po edycji blokuje `||` na wartościach nullable).

## What We're NOT Doing

- Klasyfikacja błędów auth „awaria vs pomyłka użytkownika” w logowaniu/rejestracji (A3, A4, A8, A9) i try/catch w handlerach (A2, W2): osobna zmiana.
- Lista na dziś: nieznany `kind`, `Promise.allSettled`, log zapytania (L2, L3) oraz klasyfikacja po fragmentach komunikatów 23514 (L5, W5).
- Raportowanie błędów z klienta, globalne handlery, granica błędów React, strona 500, tag wydania (P5–P8, L6).
- Zmiana semantyki `not_found`, kodów HTTP tras API ani komunikatów dla użytkownika (poza `SESSION_ERROR` dla `PGRST301/303` i 503 przy awarii Auth).
- Logowanie haseł, e-maili, adresów IP; haszowanie e-maila i IP (osobny temat A9).
- Drugie zapytanie do bazy w celu odróżnienia „usunięte” od „RLS”; sygnałem jest zdarzenie z ids i widoczność rodzica.
- Zmiany schematu bazy i testów pgTAP.

## Implementation Approach

Pięć faz, jedna po drugiej, każda jako osobny commit. Fundament idzie pierwszy, bo wszystkie następne korzystają z `logError(scope, error, ctx)` i `locals.requestId`. Każda faza: najpierw test, który zawodzi (oracle wpisany ręcznie z decyzji i audytu, nie z kodu), potem poprawka, potem break-check (zepsuć kod, test czerwony na asercji ryzyka, przywrócić). Kontekst przekazujemy jawnie jako opcjonalny ostatni argument `ctx` funkcji zapisu, więc istniejące wywołania i testy działają bez zmian; trasy podają `{ userId: locals.user?.id, requestId: locals.requestId }`. Klasyfikacja błędów Auth żyje w czystym module `src/lib/auth-health.ts`, testowalnym bez mocków `astro:*`.

## Critical Implementation Details

- **Zakres zmiany zachowania:** jedyne zmiany widoczne dla użytkownika to 503 przy awarii Supabase Auth na trasach chronionych i komunikat sesji dla `PGRST301/303`; wszystko inne to wyłącznie logowanie. Przed każdym commitem faz 2–4 smoke musi przejść bez zmian oczekiwań.
- **Nagłówek `x-request-id`:** ustawianie nagłówka na odpowiedzi z `next()` może rzucić `TypeError`, jeśli `Response` ma niemutowalne nagłówki. Implementujący sprawdza to testem i e2e; jeśli trzeba, tworzy nową `Response` z tym samym ciałem i statusem zamiast ustawiać nagłówek w miejscu.
- **Serializator logu:** `JSON.stringify(new Error(...))` daje `{}`, a `AuthError.toJSON()` pomija stos i `cause`. Serializator zbiera jawnie `name`, `message`, `stack`, łańcuch `cause` (do głębokości 3) oraz `code`, `status`, `details`, `hint`; dla nie-`Error` zwraca czytelną wartość, nigdy `[object Object]`. Klucze kontekstu pochodzą z jawnej listy dozwolonych (`userId`, `requestId`, `projectId`, `milestoneId`, `taskId`, `op`, `step`), żeby przypadkowo nie wyciec PII.
- **Poziomy:** błędy to `console.error`, zdarzenia oczekiwane/podejrzane (zero wierszy, 23503, nieważna sesja) to `console.warn` z polem `event`. Każde nowe `console.*` tylko w `log.ts` z `eslint-disable no-console`.
- **Test-first jako warunek fazy:** wiersz „test czerwony przed zmianą” w kryteriach to dowód, że asercja kiedyś mogła zawieść; implementujący odnotowuje w notatce fazy, który test był czerwony i dlaczego.

## Phase 1: Logger i kontekst żądania

### Overview

Zastępujemy jednowierszowy tekst ustrukturyzowanym wpisem JSON i zachowujemy przyczynę błędu PostgREST. Dodajemy typ `requestId` w `locals`, z którego korzystają kolejne fazy.

### Changes Required:

#### 1. Logger z serializatorem

**File**: `src/lib/log.ts`, nowy `src/lib/log.test.ts`

**Intent**: `logError(scope, error, ctx?)` emituje jedną linię JSON przez `console.error`; dodajemy `logWarn(scope, event, ctx?)` dla zdarzeń nieoznaczających wyjątku. Testy powstają pierwsze i są czerwone.

**Contract**: wpis zawiera `level`, `scope`, `event?`, `name`, `message`, `stack`, `cause[]` (do 3 poziomów), `status`, `code`, `details`, `hint` oraz pola kontekstu z listy dozwolonych; helper `logContextFrom(locals)` zwraca `{ userId, requestId }`. Oczekiwane wartości testów wpisane ręcznie z decyzji (JSON jedna linia, bez PII, stos i `cause` obecne).

#### 2. Zachowanie przyczyny w `readFailure`

**File**: `src/lib/services/postgrest.ts`

**Intent**: `readFailure` dołącza oryginalny `PostgrestError` jako `cause`, żeby strony i usługi, które łapią błąd po spłaszczeniu, nadal miały kod, `details` i `hint`.

**Contract**: `new Error(\`${code}: ${message}\`, { cause: error })`; komunikat bez zmian (zgodność z asercjami `stringContaining`).

#### 3. Typ id żądania

**File**: `src/env.d.ts`

**Intent**: Dodać `requestId: string` do `App.Locals`, ustawiane w fazie 2.

**Contract**: `interface Locals { user: User | null; requestId: string }`.

#### 4. Przepisana asercja logowania

**File**: `src/lib/services/tasks.test.ts`

**Intent**: Asercję z `tasks.test.ts:213-214` przepisać na parsowanie wpisu JSON (scope, code, message), nie na `stringContaining`.

**Contract**: `consoleError` typowany na pojedynczy ciąg JSON; `JSON.parse` w teście.

### Success Criteria:

#### Automated Verification:

- Testy loggera były czerwone przed zmianą i są zielone po: `npx vitest run src/lib/log.test.ts`
- Break-check serializatora: usunięcie `stack` albo łańcucha `cause` z wyjścia zaczerwienia testy; po przywróceniu zielone
- Zestaw aplikacji zielony po przepisaniu asercji: `npm run test:app`
- Typy i lint: `npx astro check` oraz `npm run lint`

#### Manual Verification:

- Przykładowa linia logu (z `readFailure` + `logError` dla błędu PostgREST) zawiera stos, `cause`, `code`, `details`, `hint` i ctx, a nie zawiera hasła ani e-maila

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Middleware, klient Supabase i signOut

### Overview

Middleware odróżnia gościa od awarii Supabase Auth: gość bez zmian, awaria na trasach chronionych daje 503 i log. Brak konfiguracji klienta i błąd `signOut()` przestają być ciche. Każda odpowiedź niesie `x-request-id`.

### Changes Required:

#### 1. Klasyfikator błędów Auth (czysta funkcja)

**File**: nowy `src/lib/auth-health.ts`, nowy `src/lib/__tests__/auth-health.test.ts`

**Intent**: Jedno miejsce decyzji „gość / nieważna sesja / awaria”, testowalne bez mocków `astro:*`.

**Contract**: `classifyAuthError(error): "none" | "anonymous" | "invalid_session" | "outage"`; `outage` dla `name === "AuthRetryableFetchError"` lub `status >= 500`; `anonymous` dla `AuthSessionMissingError`; `invalid_session` dla pozostałych 400/401/403. Oczekiwania wpisane z zweryfikowanych odpowiedzi (gość 400, status 0 „fetch failed”, 403 `bad_jwt`).

#### 2. Middleware

**File**: `src/middleware.ts`, nowy `src/lib/__tests__/middleware.test.ts`

**Intent**: Czytać `error` z `getUser()`; ustawiać `locals.requestId` (`cf-ray` albo `crypto.randomUUID()`); przy `outage` logować błąd i dla tras chronionych (`/today`, `/projects`, `/api/projects`) zwracać 503; `invalid_session` logować jako ostrzeżenie i traktować jak gościa; gość bez zmian (302 / 401 JSON). Test używa `vi.mock("astro:middleware")` i `vi.mock("@/lib/supabase")`.

**Contract**: 503 dla API: `errorResponse(503, "Usługa uwierzytelniania jest chwilowo niedostępna. Spróbuj ponownie za chwilę.")`; dla stron odpowiedź tekstowa z tym samym komunikatem, statusem 503 i `Retry-After`; `x-request-id` na odpowiedziach (zob. Critical Implementation Details); trasy publiczne (`/auth/*`) działają z `user = null` przy awarii.

#### 3. Klient Supabase bez cichego `null`

**File**: `src/lib/supabase.ts`, nowy `src/lib/__tests__/supabase.test.ts`

**Intent**: Gdy brakuje `SUPABASE_URL` lub `SUPABASE_KEY`, zalogować raz na izolat (`logError("supabase-config", …)`) i nadal zwrócić `null` (zachowanie dla wywołujących bez zmian).

**Contract**: flaga na poziomie modułu; test używa `vi.mock("astro:env/server")` i `vi.resetModules()`.

#### 4. `signOut()` nie ignoruje błędu

**File**: `src/pages/api/auth/signout.ts`, nowy `src/lib/__tests__/signout.test.ts`

**Intent**: Odczytać `{ error }` z `signOut()` i zalogować (`auth-signout`) z `requestId`; przekierowanie na `/auth/signin` zostaje.

**Contract**: `logError("auth-signout", error, { requestId })`; test z `vi.mock("@/lib/supabase")`.

### Success Criteria:

#### Automated Verification:

- Testy klasyfikatora i middleware były czerwone przed zmianą i są zielone po: `npx vitest run src/lib/__tests__/auth-health.test.ts src/lib/__tests__/middleware.test.ts`
- Gość bez sesji nadal dostaje 302 / 401 (test middleware) i smoke przechodzi bez zmian oczekiwań: `npm run build` i `npm run preview` w tle, potem `npm run smoke`
- Break-check middleware: przywrócenie starego zachowania (zignorowanie `error` z `getUser()`) zaczerwienia test 503; po przywróceniu zielone
- Testy klienta i `signOut` zielone: `npx vitest run src/lib/__tests__/supabase.test.ts src/lib/__tests__/signout.test.ts`
- Typy, lint, testy aplikacji: `npx astro check`, `npm run lint`, `npm run test:app`

#### Manual Verification:

- Przy zatrzymanym kontenerze `supabase_auth_10x-astro-starter` żądanie `/today` z ważną sesją zwraca 503 z komunikatem po polsku (nie redirect), a w logu serwera jest wpis JSON `middleware-getUser` z `requestId`; po uruchomieniu kontenera `/today` znowu działa

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Usługi zadań (zero wierszy, 23503, PGRST303)

### Overview

Funkcje zapisu zadań logują zero wierszy i 23503 z ids i kontekstem, przy niezmienionych wynikach (`not_found`), a wygasły JWT daje komunikat sesji. Trasy zadań przekazują `userId` i `requestId`.

### Changes Required:

#### 1. Zdarzenia w usługach zadań

**File**: `src/lib/services/tasks.ts`, `src/lib/services/tasks.test.ts`

**Intent**: Każde miejsce, które dziś zamienia pusty wynik w `not_found`, loguje zdarzenie przez `logWarn`: `parent_not_found` (brak widocznego milestona w `findMilestone`), `zero_rows` (zapis nie dotknął wiersza mimo widocznego rodzica) oraz `fk_violation` (23503, z nazwą ograniczenia). `translateError` loguje 23503 przed zwróceniem `not_found` i mapuje `PGRST301`/`PGRST303` na `SESSION_ERROR` (z logiem). Funkcje zapisu dostają opcjonalny ostatni argument `ctx`. Testy powstają pierwsze.

**Contract**: wyniki usług bez zmian (`not_found`, `validation`, `unavailable`); wpis zawiera `op` (np. `setTaskStatus`), `projectId`, `milestoneId`, `taskId`, `userId`, `requestId`; dotyczy `findMilestone`, `createTask`, `updateTask`, `setTaskStatus`, `setTaskDeferral`, `completeOccurrence`, `moveOccurrenceToTomorrow`, `deleteTask`. Oczekiwane wartości testów z decyzji i audytu (L1, L4), nie z kodu.

#### 2. Trasy zadań

**File**: `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/index.ts`, `[taskId].ts`, `[taskId]/occurrences.ts`, `[taskId]/occurrences/move.ts`

**Intent**: Pobierać `locals` w handlerach i przekazywać `{ userId: locals.user?.id, requestId: locals.requestId }` do wywołań usług (6 wywołań w 4 plikach).

**Contract**: statusy HTTP odpowiedzi bez zmian; pomocnik `logContextFrom(locals)` z fazy 1.

### Success Criteria:

#### Automated Verification:

- Nowe testy usług zadań były czerwone przed zmianą i są zielone po: `npx vitest run src/lib/services/tasks.test.ts`
- Zachowanie 404/422/500 bez zmian: istniejące testy zadań zielone, a smoke przechodzi bez zmian oczekiwań (`npm run build`, `npm run preview` w tle, `npm run smoke`)
- Break-check: usunięcie logu `zero_rows` w `setTaskStatus` albo zmiany mapowania `PGRST303` zaczerwienia odpowiedni test; po przywróceniu zielone
- Typy, lint, testy aplikacji: `npx astro check`, `npm run lint`, `npm run test:app`

#### Manual Verification:

- PATCH na nieistniejące zadanie (losowy uuid) zwraca 404, a w logu serwera z `npm run preview` jest wpis `zero_rows` lub `parent_not_found` z `userId` i `requestId`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Usługi milestone'ów i projektów oraz strony

### Overview

Ten sam wzorzec dla milestone'ów i projektów, plus log „lost race” w `setMilestoneCompleted`; trasy i strony przekazują kontekst. Atrapę klienta wyciągamy do wspólnego pomocnika testowego.

### Changes Required:

#### 1. Wspólna atrapa klienta

**File**: nowy `src/lib/services/testing/stub-client.ts`, `src/lib/services/tasks.test.ts`

**Intent**: Wyciągnąć atrapę Supabase z `tasks.test.ts` (kolejki po kluczu `tabela.operacja`, `ok`, `fail`) i dodać metody `.is` i `.not`, potrzebne dla `setMilestoneCompleted`.

**Contract**: bez zmian zachowania istniejących testów zadań; plik poza wzorcem `*.test.ts`, więc vitest go nie zbiera.

#### 2. Usługi milestone'ów i projektów

**File**: `src/lib/services/milestones.ts`, `src/lib/services/projects.ts`, nowe `src/lib/services/milestones.test.ts`, `src/lib/services/projects.test.ts`

**Intent**: Zdarzenia `zero_rows`, `parent_not_found`, `fk_violation` i mapowanie `PGRST301/303` jak w fazie 3 (milestone'y: `updateMilestone`, `deleteMilestone`, `createMilestone`; projekty: `updateProject`, `deleteProject`); w `setMilestoneCompleted` log gałęzi „lost race” z polami `requested`, stan przed i wynik ponownego odczytu (`deleted` / `matches_request` / `opposite`); bez treści wiersza. Opcjonalny `ctx` w funkcjach zapisu.

**Contract**: wyniki usług bez zmian; 404 dla zera wierszy zostaje.

#### 3. Trasy i strony

**File**: `src/pages/api/projects/index.ts`, `[id].ts`, `[id]/milestones/index.ts`, `[id]/milestones/[milestoneId].ts`, `src/pages/today.astro`, `src/pages/projects/index.astro`, `src/pages/projects/[id].astro`

**Intent**: Przekazać `ctx` z `locals` do usług zapisu (8 wywołań w 4 trasach) oraz do wywołań `logError` na stronach (`userId`, `requestId`, `projectId` tam, gdzie jest).

**Contract**: odpowiedzi i widoki bez zmian; strony nadal pokazują komunikaty inline.

### Success Criteria:

#### Automated Verification:

- Nowe testy milestone'ów i projektów oraz wyciągnięta atrapa zielone, testy zadań nadal zielone: `npx vitest run`
- Break-check „lost race”: usunięcie logu z gałęzi ponownego odczytu w `setMilestoneCompleted` zaczerwieni test; po przywróceniu zielony
- Smoke z oczekiwaniami 404 i auth bez zmian: `npm run build`, `npm run preview` w tle, `npm run smoke`
- Typy, lint i pozostałe zestawy: `npx astro check`, `npm run lint`, `npm run test:app`, `npm run test:unit`

#### Manual Verification:

- Przegląd różnicy kodu: żadna trasa ani strona nie wywołuje usługi zapisu ani `logError` bez kontekstu tam, gdzie `locals` jest dostępne

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Weryfikacja i dokumentacja

### Overview

Pełny zestaw testów bez regresji, notka w cookbooku test-planu i ponowny audyt jako dowód przed/po.

### Changes Required:

#### 1. Cookbook i stan planu testów

**File**: `context/foundation/test-plan.md`

**Intent**: Dopisać w §6.1 wzorzec testu logowania (asercja na pola wpisu JSON, `vi.spyOn(console, "error")`, mock `astro:*` per plik testu, testy tras w `src/lib/__tests__/`), w §6.7 notatkę o wynikach tej zmiany (m.in. korekta założenia o wygasłym JWT) i w §7 wykluczenia (brak testów obserwowalności po stronie klienta).

**Contract**: bez kotwic `file:line`; styl sąsiednich sekcji; `Last updated` odświeżone.

#### 2. Audyt weryfikujący

**File**: nowy raport `context/audits/observability/<data>_verify-*.md` (tworzy `/10x-observability-audit --verify`)

**Intent**: Uruchomić audyt w trybie `--verify` na raporcie z 2026-10-30 i zapisać, które ustalenia są `fixed`, `still open` lub `changed`.

**Contract**: nowy plik, bez edycji poprzedniego raportu.

### Success Criteria:

#### Automated Verification:

- Pełny zestaw zielony: `npm run lint`, `npx astro check`, `npm run test:unit`, `npm run test:app`, `npm run test:db`
- E2E zielone: `npm run test:e2e`
- Smoke zielony na buildzie: `npm run build`, `npm run preview` w tle, `npm run smoke`
- Notka w test-planie jest obecna: `grep -n "observability-error-signals" context/foundation/test-plan.md`

#### Manual Verification:

- Raport audytu `--verify` oznacza P1, P2, P3, P4, A5, L4 i W4 jako `fixed`, a L1 jako zawężone do prawdziwych przyczyn (usunięcie, inny użytkownik, regresja polityki)
- Notka w §6.1/§6.7 zgadza się z wynikiem zmiany

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `log.test.ts` (serializator, ctx, brak PII), `auth-health.test.ts` (klasyfikacja z zweryfikowanych odpowiedzi), `middleware.test.ts` (gość 302/401, awaria 503 + log, nieważna sesja ostrzeżenie, `requestId`), `supabase.test.ts` (log raz na izolat), `signout.test.ts`, rozszerzone `tasks.test.ts` oraz nowe `milestones.test.ts`, `projects.test.ts` (zero wierszy, 23503, PGRST303, lost race). Przypadki brzegowe: nie-`Error` w `logError`, `cause` kilkupoziomowy, brak `locals.user`, wielokrotne wywołanie `createClient` bez konfiguracji.

### Integration Tests:

- pgTAP bez zmian (kontrola braku regresji); smoke i e2e jako kontrola, że oczekiwania 302/401/404 zostały nienaruszone.

### Manual Testing Steps:

1. Zatrzymać kontener `supabase_auth_10x-astro-starter`, otworzyć `/today` z ważną sesją i potwierdzić 503 oraz wpis w logu; uruchomić kontener i potwierdzić powrót.
2. Na lokalnym preview wysłać PATCH na nieistniejące zadanie i potwierdzić 404 oraz wpis `zero_rows`/`parent_not_found` z ids.
3. Przejrzeć jedną linię logu błędu bazy pod kątem stosu, `cause`, `code`, `details`, `hint` i braku danych osobowych.

## Performance Considerations

Dodatkowy koszt na żądanie to wygenerowanie id (`crypto.randomUUID()` albo odczyt nagłówka) i serializacja logu tylko przy błędach lub zdarzeniach; nie dodajemy zapytań do bazy ani drugiego `getUser()`.

## Migration Notes

Brak migracji i brak zmian schematu. Wycofanie: przywrócenie `log.ts`, `postgrest.ts`, `middleware.ts`, `supabase.ts`, `signout.ts`, usług i tras z poprzedniego commitu; `ctx` jest opcjonalny, więc można wycofywać fazy od końca.

## References

- Related research: `context/changes/observability-error-signals/research.md`
- Źródło ustaleń: `context/audits/observability/2026-10-30_auth-today-list-project-writes.md`
- Decyzje o unii statusów usług: `context/archive/2026-10-15-task-crud/plan.md:139`, `2026-10-14-milestone-crud/plan.md:144`; błędy auth w URL jako kod: `CLAUDE.md` (sekcja UI), `context/archive/2026-10-23-ui-auth-views/plan.md:70`
- Zasady M3L5 (dowody przed hipotezą, test najpierw, bez ukrywania błędów): `CLAUDE.md`
- Cookbook testów: `context/foundation/test-plan.md` §6.1, §6.4

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logger i kontekst żądania

#### Automated

- [x] 1.1 Testy loggera były czerwone przed zmianą i są zielone po: `npx vitest run src/lib/log.test.ts` — 36cf813
- [x] 1.2 Break-check serializatora: usunięcie `stack` albo łańcucha `cause` z wyjścia zaczerwienia testy; po przywróceniu zielone — 36cf813
- [x] 1.3 Zestaw aplikacji zielony po przepisaniu asercji: `npm run test:app` — 36cf813
- [x] 1.4 Typy i lint: `npx astro check` oraz `npm run lint` — 36cf813

#### Manual

- [x] 1.5 Przykładowa linia logu zawiera stos, `cause`, `code`, `details`, `hint` i ctx, a nie zawiera hasła ani e-maila — 36cf813

### Phase 2: Middleware, klient Supabase i signOut

#### Automated

- [x] 2.1 Testy klasyfikatora i middleware były czerwone przed zmianą i są zielone po: `npx vitest run src/lib/__tests__/auth-health.test.ts src/lib/__tests__/middleware.test.ts` — a3cdb00
- [x] 2.2 Gość nadal dostaje 302 / 401 (test middleware) i smoke przechodzi bez zmian oczekiwań: build, preview w tle, `npm run smoke` — a3cdb00
- [x] 2.3 Break-check middleware: przywrócenie starego zachowania (zignorowanie `error` z `getUser()`) zaczerwienia test 503; po przywróceniu zielone — a3cdb00
- [x] 2.4 Testy klienta i `signOut` zielone: `npx vitest run src/lib/__tests__/supabase.test.ts src/lib/__tests__/signout.test.ts` — a3cdb00
- [x] 2.5 Typy, lint, testy aplikacji: `npx astro check`, `npm run lint`, `npm run test:app` — a3cdb00

#### Manual

- [x] 2.6 Przy zatrzymanym kontenerze `supabase_auth_10x-astro-starter` `/today` z ważną sesją zwraca 503 po polsku i w logu jest wpis `middleware-getUser` z `requestId`; po uruchomieniu kontenera `/today` znowu działa — a3cdb00

### Phase 3: Usługi zadań (zero wierszy, 23503, PGRST303)

#### Automated

- [x] 3.1 Nowe testy usług zadań były czerwone przed zmianą i są zielone po: `npx vitest run src/lib/services/tasks.test.ts` — ff51b75
- [x] 3.2 Zachowanie 404/422/500 bez zmian: istniejące testy zadań zielone i smoke bez zmian oczekiwań — ff51b75
- [x] 3.3 Break-check: usunięcie logu `zero_rows` w `setTaskStatus` albo zmiany mapowania `PGRST303` zaczerwienia odpowiedni test; po przywróceniu zielone — ff51b75
- [x] 3.4 Typy, lint, testy aplikacji: `npx astro check`, `npm run lint`, `npm run test:app` — ff51b75

#### Manual

- [x] 3.5 PATCH na nieistniejące zadanie zwraca 404, a w logu serwera jest `zero_rows` lub `parent_not_found` z `userId` i `requestId` — ff51b75

### Phase 4: Usługi milestone'ów i projektów oraz strony

#### Automated

- [x] 4.1 Nowe testy milestone'ów i projektów oraz wyciągnięta atrapa zielone, testy zadań nadal zielone: `npx vitest run`
- [x] 4.2 Break-check „lost race”: usunięcie logu z gałęzi ponownego odczytu w `setMilestoneCompleted` zaczerwieni test; po przywróceniu zielone
- [x] 4.3 Smoke z oczekiwaniami 404 i auth bez zmian: build, preview w tle, `npm run smoke`
- [x] 4.4 Typy, lint i pozostałe zestawy: `npx astro check`, `npm run lint`, `npm run test:app`, `npm run test:unit`

#### Manual

- [x] 4.5 Przegląd różnicy kodu: żadna trasa ani strona nie wywołuje usługi zapisu ani `logError` bez kontekstu tam, gdzie `locals` jest dostępne

### Phase 5: Weryfikacja i dokumentacja

#### Automated

- [ ] 5.1 Pełny zestaw zielony: `npm run lint`, `npx astro check`, `npm run test:unit`, `npm run test:app`, `npm run test:db`
- [ ] 5.2 E2E zielone: `npm run test:e2e`
- [ ] 5.3 Smoke zielony na buildzie: build, preview w tle, `npm run smoke`
- [ ] 5.4 Notka w test-planie jest obecna: `grep -n "observability-error-signals" context/foundation/test-plan.md`

#### Manual

- [ ] 5.5 Raport audytu `--verify` oznacza P1, P2, P3, P4, A5, L4 i W4 jako `fixed`, a L1 jako zawężone do prawdziwych przyczyn
- [ ] 5.6 Notka w §6.1/§6.7 zgadza się z wynikiem zmiany
