---
type: observability-audit
date: 2026-10-30 14:45
mode: audit
commit: 70c4b76
branch: master
dirty_tree: true
areas: [auth, today-list-and-task-actions, project-milestone-task-writes]
area_source: user
runtime_proof: not-run
error_tracker: none (brak SDK; tylko logi Cloudflare Workers, wrangler.jsonc:12-14, założone jako zbierane)
previous_report: null
findings: { critical: 2, high: 7, medium: 15, low: 5 }
---

# Audyt obserwowalności — logowanie, lista na dziś + akcje, zapisy danych (2026-10-30)

Drzewo robocze było zmodyfikowane (`context/foundation/test-plan.md`, nieśledzony `public/mvp-check.md`); audytowany kod aplikacji w `src/` jest w stanie z commitu `70c4b76`.

## 1. TL;DR

- **Jedyny sygnał to jedna linia tekstu.** `logError` zapisuje do `console.error` wyłącznie `error.message`, a `readFailure` spłaszcza błąd PostgREST do `"<code>: <message>"` bez `cause`. Brak stosu, `details`, `hint`, statusu, nazwy operacji, kroku sekwencji, id użytkownika, projektu, milestona czy zadania oraz id żądania. Po awarii wiadomo tylko „coś w `tasks`”.
- **Wynik błędu jest traktowany jak zwykły wynik.** Middleware ignoruje `error` z `auth.getUser()`, `signOut()` ignoruje błąd, `createClient` zwraca `null` bez logu, pusty wynik UPDATE/DELETE (RLS, wygasła sesja) staje się „Nie znaleziono zadania” (404), a kod 23503 jest mapowany na `not_found` przed `logError`.
- **Awarie wyglądają jak normalny ruch.** Błędy auth to `302 → ?error=<code> → 200`, awaria `today_list` to 200 z komunikatem inline, a 404/422 w API nie zostawiają wpisu. Monitoring oparty na statusach niczego nie zobaczy.
- **Klient jest ślepy.** Wszystkie hooki mają `catch {}`, `readJson` zwraca `null` dla każdego niepoprawnego JSON, brak `onerror`/`unhandledrejection`/granicy błędów, a po sukcesie strona się przeładowuje. Awarię SSR wyspy React połyka Astro (lessons.md #1).
- **Klasyfikacja opiera się na polskich fragmentach komunikatów** pod kodem 23514, a w auth awaria Supabase i pomyłka użytkownika idą tą samą ścieżką (`unknown`/`no-code`).
- **Najważniejsza konsekwencja:** awaria Supabase Auth wygląda dla użytkowników jak masowe wylogowanie (302 na `/auth/signin`, 401 z API), a dla dyżurnego jak zwykły ruch, bez żadnej linii błędu (P1).

## 2. Capture model

Jak awaria przechodzi z kodu do człowieka w tym systemie (Astro 7 SSR na Cloudflare Workers, wyspy React, Supabase):

- **Tracker błędów:** brak. `package.json` nie zawiera Sentry/Datadog/OpenTelemetry/logera. Jedyną warstwą platformową jest `wrangler.jsonc:12-14` `"observability": {"enabled": true}`.
- **Logger aplikacji:** `src/lib/log.ts:5-9` `logError(scope, error)` → `console.error("[scope] " + (error instanceof Error ? error.message : String(error)))`. Jedyne wywołanie `console.*` w `src/` (z `eslint-disable`). Około 13 miejsc wywołania; nazwy zakresów to moduły (`tasks`, `projects`, `milestones`, `today-list`, `projects-list`, `project-view`, `project-milestones`) oraz dynamiczne `auth-signin:<code>` i `auth-signup:<code>`.
- **Spłaszczanie błędów bazy:** `src/lib/services/postgrest.ts:6-8` `readFailure()` → `new Error(\`${code}: ${message}\`)`; usługi zwracają użytkownikowi ogólne komunikaty (`GENERIC_ERROR`, `SESSION_ERROR`).
- **Granice przechwytywania:** brak własnej granicy. `src/middleware.ts:11-43` nie ma try/catch i ignoruje `error` z `getUser()`. Nieprzechwycone wyjątki obsługuje Astro: według odczytu źródeł w `node_modules` (`astro/dist/core/routing/handler.js:101-108`, `core/pages/handler.js:75-82`, `core/middleware/astro-middleware.js:60-68`) loguje stos przez `console.error` i zwraca 500 z pustym ciałem (brak `404.astro`/`500.astro`). Dla nieistniejących ścieżek działa strona 404 zasobów Workers (`wrangler.jsonc` `not_found_handling: "404-page"`).
- **Praca w tle:** brak (`waitUntil`, cron, kolejki, `scheduled`).
- **Klient:** brak globalnych handlerów (`onerror`, `unhandledrejection`), brak granicy błędów React, brak endpointu raportującego. Błędy wysp SSR połyka Astro (lessons.md #1, nie odtworzone w tym audycie).
- **Tożsamość wdrożenia:** brak tagu wydania/środowiska w liniach logu aplikacji, brak `version_metadata` w `wrangler.jsonc`.

**Założenia (poza repozytorium, nie są ustaleniami; wszystkie niepotwierdzone przez użytkownika):**
- Logi Cloudflare Workers faktycznie zbierają wyjście `console.error` i wyniki wywołań na produkcji.
- Retencja, próbkowanie, przekazywanie logów i reguły alertów istnieją lub nie (nieznane).
- Platforma dodaje wersję skryptu i nazwę workera do własnych logów wywołań (decyduje o P6).
- CI lub panel nie oznacza wydań i nie rozdziela workerów preview/prod.
- Sekrety `SUPABASE_URL`/`SUPABASE_KEY` są ustawione na produkcji (P2 dziś nie strzela).
- Zachowanie `@supabase/auth-js` (zwraca, a nie rzuca błędy sieciowe z `getUser()`) i `signUp` dla istniejącego e-maila pochodzi z odczytu źródeł przez audytorów, nie z uruchomienia.

## 3. What reaches the tracker

Wersja wyłącznie statyczna (dowód z uruchomienia nie był wykonany, `runtime_proof: not-run`). „Tracker” = linia w logach Workers, bo trackera brak.

| Kształt awarii | Odpowiedź | Logi platformy / aplikacji | Werdykt |
|---|---|---|---|
| Nieprzechwycony wyjątek w handlerze/stronie | 500, puste ciało | Stos przez logger Astro (wg odczytu źródeł) | dobrze; brak id użytkownika/trasy |
| Błąd `getUser()` (awaria Supabase Auth, zły klucz, wygasły token) | 302 na `/auth/signin` albo 401 JSON | nic | **missed** |
| `createClient` → `null` (brak env) | redirect `?error=unavailable`, 500 w API, „Aplikacja nie jest teraz dostępna” | nic | **missed** |
| Błąd PostgREST w usłudze (nie 23503, nie znana reguła) | 4xx/5xx z ogólnym komunikatem | `[scope] CODE: message` bez stosu, ids, operacji | poor |
| Kod 23503 (naruszenie klucza obcego) | 404 „Nie znaleziono …” | nic | **missed** |
| Pusty wynik UPDATE/DELETE (RLS, sesja) | 404 „Nie znaleziono zadania” | nic | **missed** |
| Błąd logowania (zła hasło vs awaria Supabase) | 302 `?error=<code>` → 200 | `[auth-signin:<code>]` ten sam poziom dla obu | poor |
| Awaria `today_list` | 200 z komunikatem inline | `[today-list] <code>: <message>` bez zapytania/użytkownika/daty | poor |
| Nieznany `kind` wiersza `today_list` | wiersz znika z listy | `[today-list] Unknown … kind` bez id | poor |
| Błąd `signOut()` | 302 na `/auth/signin` | nic | **missed** |
| Błąd fetch w wyspie (sieć, HTML 502, zły JSON) | komunikat inline | nic (tylko konsola przeglądarki) | **missed** |
| Błąd renderu wyspy po stronie klienta | pusta sekcja | nic | **missed** |
| Błąd SSR wyspy | 200, wyspa nieobecna (wg lessons.md #1) | nic potwierdzonego | **missed** (niezweryfikowane) |

## 4. Systemic root causes

1. **Cienki logger jako jedyny sygnał.** `src/lib/log.ts:5-9` redukuje błąd do `message` (stos i `cause` giną, nie-`Error` przechodzi przez `String()` na `[object Object]`), a `src/lib/services/postgrest.ts:6-8` tworzy nowy `Error` bez `cause`, `details`, `hint`. Zakresy nazywają moduł, nie operację (`tasks`, `projects`, `milestones`). Powód lokalnie rozsądny: nie ujawniać przyczyny użytkownikowi (komentarz w `log.ts`). Skutek: logu nie da się powiązać z rekordem, użytkownikiem ani krokiem. Wyjaśnia: P3, P4, A3, L3, L7, W2, W6, W9, P6.
2. **Wynik błędu traktowany jak zwykły wynik.** `{ error }` ignorowane (`src/middleware.ts:15-18`, `src/pages/api/auth/signout.ts:7`), `null` bez logu (`src/lib/supabase.ts:7-9`), pusty wynik UPDATE/DELETE → `not_found` (`src/lib/services/tasks.ts:254-255` i analogicznie w milestones/projects), 23503 → `not_found` przed `logError` (`tasks.ts` `translateError`), „lost race” zwraca `ok` ze stanem przeciwnym do żądanego (`milestones.ts:339-342`), nieznany `kind` pomijany (`src/lib/services/today.ts:83-85`). Wyjaśnia: P1, P2, A5, L1, L2, L4, W4.
3. **Awarie spłaszczone do 302/200/404/422.** Błędy auth jedzie `?error=<code>` (`signin.ts:21-24`), awaria `today_list` to 200 z tekstem (`today.astro:35-40`), 404/422 w API bez wpisu. Monitoring oparty na statusach nie widzi niczego, a jedyny ślad to tekst w konsoli. Wyjaśnia: A3, A8, L3, L8, P7.
4. **Klient bez kanału raportowania.** Sześć `catch {}` w hookach (`use-task-api.ts:33-36,105-108`, `use-project-api.ts:22-25,61-64`, `use-milestone-api.ts:33,85`), `readJson` zwraca `null` (`src/lib/api-client.ts:15`), brak globalnych handlerów i granicy błędów, po sukcesie `window.location.reload()`. Wyjaśnia: L6, P5, P8.
5. **Klasyfikacja po polskich fragmentach komunikatów i brak rozdziału „użytkownik” vs „awaria”.** Reguły 23514 rozpoznawane przez `error.message.includes("…")` (`tasks.ts:51-76`, `milestones.ts:245`); znane naruszenia reguł nigdy nie są liczone, przeformułowanie triggera zmienia zachowanie po cichu. W auth zła hasło, limit żądań, 5xx i błąd sieci mają ten sam poziom logu i często `no-code`/`unknown`. Wyjaśnia: A3, A9, L5, W5.

## 5. Findings by area

Oznaczenia: **potwierdzone** = sprawdzone ręcznie w kodzie podczas syntezy; **audytor** = twierdzenie z raportu audytora, nieweryfikowane osobno. „Też zgłoszone w” wskazuje duplikaty scalone w jedno ustalenie.

### Platform / plumbing

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| P1 | `src/middleware.ts:15-18` (potwierdzone); też zgłoszone w auth i today | missing-throw | **critical** | Błąd `auth.getUser()` (awaria Supabase, zły klucz, nieudane odświeżenie tokenu) jest odrzucany, więc `user` = `null`. Użytkownik jest przekierowany na `/auth/signin` albo dostaje 401 z API mimo ważnego ciasteczka i czyta to jak wygaśnięcie sesji. Dyżurny widzi falę 302/401 bez żadnej linii błędu i bez przyczyny. | Czytać `error`; ignorować `AuthSessionMissingError` i brak sesji, resztę logować (kod, status); przy błędzie serwera/sieci zwracać 503 zamiast przekierowania. |
| P2 | `src/lib/supabase.ts:7-9` (potwierdzone), wywołujący: `middleware.ts:19`, `signin.ts:16-18`, `signup.ts:16-18`, `src/pages/api/projects/index.ts` (500), `today.astro`, `projects/*.astro` | swallowed / flattened-response | high | Brak lub pusty `SUPABASE_URL`/`SUPABASE_KEY` po złym wdrożeniu: aplikacja wygląda na „niedostępną”, middleware wylogowuje wszystkich, API zwraca 500, a nic nie jest logowane. | Logować raz (na izolat albo na żądanie) gdy konfiguracji brakuje; tam gdzie wywołujący nie może iść dalej, rzucać zamiast zwracać `null`. |
| P3 | `src/lib/log.ts:5-9` (potwierdzone) | identity-lost / logged-not-captured | high | W logu jest tylko `message`: bez stosu, `cause`, `name`, statusu, `details`/`hint`, id żądania, użytkownika, trasy. `String(obj)` daje `[object Object]` dla nie-`Error`. Format nieustrukturyzowany, więc nie da się filtrować po polach. | Logować obiekt JSON `{scope, name, message, stack, cause, status, code, details, hint, requestId/cf-ray, path, op}`; nie logować haseł, e-mail haszować. |
| P4 | `src/lib/services/postgrest.ts:6-8` (audytor) | identity-lost | medium | Każdy błąd usługi traci `details`, `hint`, `status` i oryginalny obiekt; naruszenie ograniczenia i brak uprawnień różnią się tylko kodem. | `new Error(msg, { cause: error })` i dołączać `details`/`hint` do logu. |
| P5 | cały klient: `src/layouts/Layout.astro`, wyspy React (audytor) | coverage-gap | medium | Brak `onerror`, `unhandledrejection` i granicy błędów; awaria renderu wyspy `client:load` zostawia pustą sekcję, nic nie trafia do logów. | Globalne handlery i granica błędów, które raportują (np. `navigator.sendBeacon` do prostego endpointu) i pokazują zastępczy widok. |
| P6 | `wrangler.jsonc`, `src/lib/log.ts` (audytor) | missing-context | low | Linie logu bez wydania i środowiska; zakresy `tasks`/`projects`/`milestones` nazywają moduł, nie operację (`today-list` używany przez dwa różne błędy). Jeśli platforma dokłada wersję skryptu, ryzyko maleje. | Dodać `version_metadata` i logować ją; nazywać zakres operacją (`tasks:create`). |
| P7 | brak `src/pages/404.astro` i `500.astro`, `wrangler.jsonc:6-9` (audytor) | coverage-gap | low | Nieprzechwycony błąd to pusta strona bez identyfikatora do zacytowania w zgłoszeniu; nieznane ścieżki obsługuje strona 404 platformy. | Strona 500 z id żądania, ten sam id w linii logu. |
| P8 | lessons.md #1; `src/pages/auth/signin.astro:13`, `signup.astro:13`, wyspy (audytor) | coverage-gap | medium | Awaria SSR wyspy zwraca 200 bez formularza/przycisku i nie zostawia sygnału (niezweryfikowane w źródle Astro; opiera się na lekcji). | Asercje treści wysp w smoke i e2e (repo już je ma); ewentualnie log w komponencie opakowującym. |

### Logowanie i rejestracja (auth)

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| A3 | `src/pages/api/auth/signin.ts:21-24`, `signup.ts:21-24`, `src/lib/auth-errors.ts:34-38` (potwierdzone `signin.ts`) | flattened-response / noise | high | Zła hasło, limit żądań, 5xx i błąd sieci idą tą samą ścieżką: ten sam poziom logu, `error.code ?? "no-code"`, w UI `unknown` („Coś poszło nie tak”). `unavailable` występuje tylko przy braku env. Awaria Supabase tonie w szumie złych haseł. | Klasyfikować po `status >= 500`, `AuthRetryableFetchError`, braku kodu: awarie logować osobnym zakresem/poziomem i kierować na `unavailable`; oczekiwane błędy użytkownika logować nisko lub liczyć. |
| A9 | `signin.ts:22`, `auth-errors.ts:30-31` (audytor) | missing-context / noise | medium | Linie logu auth bez IP (`cf-connecting-ip`), skrótu e-maila i id żądania; nie da się ocenić ataku credential-stuffing ani powiązać fali błędów z kontem. | Dołożyć id żądania, skrót e-maila i IP do ustrukturyzowanego logu (bez haseł). |
| A2 | `signin.ts:8,19`, `signup.ts:8,19` (audytor) | coverage-gap | medium | Brak try/catch wokół `formData()` i wywołania Supabase; wyjątek daje goły 500 ze stosem z logu Astro, ale bez zakresu `auth-*` i bez trasy; użytkownik widzi pustą stronę. | Opakować handler, logować `auth-signin:exception`, przy błędnym body zwracać 400. |
| A4 | `signup.ts:19-26`, `src/pages/auth/confirm-email.astro:7-17` (audytor) | flattened-response | medium | Sukces rejestracji zawsze kończy się „Wysłaliśmy link”, więc nieudana wysyłka maila (`email_provider_disabled`, `over_email_send_rate_limit`) albo obfuskowana odpowiedź dla istniejącego adresu są niewidoczne; treść strony zależy od `import.meta.env.DEV`, nie od stanu Supabase. Zachowanie `signUp` niezweryfikowane uruchomieniem. | Logować ustrukturyzowany wynik rejestracji (id użytkownika, liczba `identities`, obecność sesji) i oznaczać pusty `identities`. |
| A5 | `src/pages/api/auth/signout.ts:7` (potwierdzone) | swallowed | medium | `signOut()` odrzuca zwrócony `{error}`; użytkownik widzi zwykłe wylogowanie, a nieudane unieważnienie tokenu zostawia sesję ważną po stronie serwera. Dla `createClient === null` wylogowanie nic nie robi, ale przekierowuje. | Czytać `error` i logować `auth-signout:*`; przekierowanie zostawić. |
| A8 | `signin.ts:11,17,23`, `signup.ts`, `signin.astro:8`, `auth-errors.ts:46-49` (audytor) | flattened-response | medium | Każda ścieżka błędu to 302 → 200, więc alerty na 5xx nie zobaczą niczego; nieznany `?error=` mapuje się na `unknown` bez logu, więc podrobiony parametr i prawdziwy `unknown` są nie do odróżnienia. | Logować u źródła przekierowania (A3, A2); dla awarii rozważyć 503. |
| A7 | `signin.ts:10-12`, `signup.ts:10-12`, `src/lib/validation/auth.ts:5-8` (audytor) | swallowed | low | Odrzucenie schematem Zod po stronie serwera (np. rozjazd z walidacją klienta) kończy się `invalid_input` bez logu i bez nazwy pola. | Logować nazwy pól z `parsed.error.issues` (bez wartości). |

### Lista na dziś i akcje na zadaniach

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| L1 | `src/lib/services/tasks.ts:254-255` (potwierdzone), `tasks.ts:196-197,275-278,400-408`, `milestones.ts:308,342`, `projects.ts:185,194` (audytor) | missing-throw | **critical** | Pusty wynik UPDATE/DELETE traktowany jako „nie znaleziono”: wygasła sesja, regresja polityki RLS albo filtr statusu dają 404 „Nie znaleziono zadania. Odśwież stronę.”, a akcja nie została zastosowana. Zadanie nadal widnieje na liście. Nic nie jest logowane, więc regresja RLS na całej pętli akcji byłaby niewidoczna. | Przy 0 wierszy logować `not_found` z id i ścieżką (warn) i odróżniać „brak wiersza” od „RLS/sesja” (np. tani `auth.getUser()` albo drugi odczyt); licznik jako podejrzenie RLS. |
| L2 | `src/lib/services/today.ts:83-85` (potwierdzone) | swallowed / logged-not-captured | high | Nieznany `kind` z `today_list` (nowa migracja, literówka) powoduje, że wiersz po cichu znika z listy, co łamie guardrail PRD („żadne zadanie nie może zniknąć bez wiedzy użytkownika”). Log to `[today-list] Unknown today_list kind: X` bez id wiersza, powtarzany przy każdym ładowaniu. | Dołączyć `task_id`/`milestone_id` i `kind` do logu; albo rzucić (strona pokaże stan „niedostępne”), albo wyrenderować widoczny wiersz „nierozpoznana pozycja”. |
| L3 | `src/pages/today.astro:35-40` (potwierdzone), `src/lib/services/today.ts:24-25,94-113` | identity-lost / flattened-response | high | Awaria listy to 200 z „Nie udało się wczytać listy na dziś” (użytkownik wie, że jest błąd, więc to NIE pusta lista). Dyżurny widzi jedną linię `[today-list] 42883: …` bez nazwy zapytania, użytkownika i daty. `Promise.all` ukrywa drugą awarię, a błąd `getTaskTargets` zeruje całą listę mimo udanego `today_list`. Alert na statusie nie zadziała. | Logować nazwę zapytania, id użytkownika i datę; `Promise.allSettled` i degradacja samego przycisku „Dodaj zadanie”; rozważyć 5xx. |
| L4 | `src/lib/services/tasks.ts` `translateError` (potwierdzone kolejność: `23503` zwraca przed `logError`), `milestones.ts:59-61` | flattened-response / swallowed | high | Każde naruszenie klucza obcego to 404 „Nie znaleziono …” bez logu. Błąd w schemacie lub złożonym kluczu `(milestone_id, user_id)` wygląda jak wyścig użytkownika i nie zostawia śladu. | Logować nazwę ograniczenia i ids (warn) przed mapowaniem na `not_found`. |
| L6 | `src/components/hooks/use-task-api.ts:33-36,105-108`, `use-project-api.ts`, `use-milestone-api.ts`, `src/lib/api-client.ts:15`, `src/components/today/TodayTaskActions.tsx:34-60` (audytor) | swallowed / coverage-gap | high | Błąd sieci, odpowiedź HTML z Workers (5xx) lub zły JSON to „Nie udało się połączyć”, ale serwer o tym nie wie. Po sukcesie strona przeładowuje się bez sprawdzenia zmiany stanu; poprawny zapis z uszkodzoną odpowiedzią wygląda jak błąd, więc użytkownik ponawia i tworzy duplikaty. | Raportować nieoczekiwany status/kształt (status, trasa, id żądania) do endpointu logu; dodawać id żądania do odpowiedzi. |
| L5 | `tasks.ts:354-369,307-319,370-383,322-325` (audytor) | flattened-response | medium | Gałęzie 422/komunikatów po 23505/23514 (`MOVE_ERROR`, `OCCURRENCE_ERROR`, …) nie są logowane i opierają się na `message.includes("Wystapienie")`. Regresja reguły wystąpień wygląda jak „odśwież stronę”, a przeformułowany trigger zamienia walidację w zalogowany 500 bez przypisania. | Dopasowywać po SQLSTATE/nazwie ograniczenia/`hint`; logować wyniki 422 nisko z kodem reguły. |
| L7 | `tasks.ts:168-235,299-327,342-352`, `milestones.ts:315-343` (audytor) | missing-context | medium | Sekwencje odczyt → zapis → odczyt bez transakcji i bez nazwy kroku w logu; wynik dla użytkownika bywa wnioskowany z zera wierszy (np. 422 „zrobionego nie można zmienić w powtarzalne” zamiast RLS). Częściową awarię nie da się odtworzyć z jednej linii `[tasks]`. | Dodać nazwę kroku i ids do logu; albo przenieść sekwencję do jednego RPC; rozróżniać „done” vs „0 wierszy z RLS” drugim odczytem. |
| L8 | `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/**` (audytor) | noise / coverage-gap | medium | Handlery nie logują żadnych 404/422; ani wyścig starej karty, ani prawdziwa regresja nie zostawia śladu; brak id żądania łączącego zgłoszenie użytkownika z wpisem. | Cienki wrapper wokół handlerów: trasa, status, id żądania (patrz W2). |

### Zapisy projektów, milestone'ów i zadań

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| W2 | `src/pages/api/projects/**`, `src/lib/services/projects.ts:114-119` (audytor; skutek logowania przez Astro z odczytu źródeł) | coverage-gap | medium | Brak try/catch w handlerach; wyjątek (np. `toProject` przy nieoczekiwanej wartości `life_area`, błąd fetch) daje 500 ze stosem w logu Astro, ale bez trasy/użytkownika/ids. Gdy `toProject` rzuca po udanym zapisie, użytkownik widzi błąd dla zapisu, który się udał, i może ponowić. | `withApi(handler)`: try/catch → `logError` z trasą, metodą, parametrami i id żądania; zwracać 500 JSON. |
| W4 | `milestones.ts:339-342` (audytor) | missing-throw | medium | Gałąź „lost race” przy zamykaniu/otwieraniu milestona zwraca `ok` z bieżącym stanem, także gdy jest przeciwny do żądanego; użytkownik widzi sukces, a przegrany zapis nie zostawia śladu. | Logować gałąź (ids, stan żądany vs bieżący). |
| W5 | `projects.ts:121-140`, `milestones.ts:229-262`, `tasks.ts:47-97` (audytor; kod `tasks.ts` przejrzany) | noise / misclassification | medium | Znane naruszenia reguł 23514 nigdy nie są liczone; nieznane trafiają do ogólnego 500 bez rozróżnienia od „przeformułowany trigger”; szerokie dopasowania (`"Termin zadania"`, `"Wystapienie"`) mogą złapać komunikat innej reguły. | Dopasowanie po SQLSTATE/ograniczeniu/`hint`; logować oczekiwane naruszenia nisko z identyfikatorem reguły, nieznane jako błąd z pełnym komunikatem. |
| W6 | `projects.ts:188-195`, `milestones.ts:345-357`, `tasks.ts:387-409` (audytor) | swallowed / missing-context | medium | Usunięcie projektu kasuje kaskadowo milestone'y, zadania i `task_occurrences`, ale próby nie są logowane, a błąd ma jedną linię bez ids i liczby usuniętych dzieci. `validation`/`not_found` z `translateError` zamieniane w ogólny błąd. | Logować próby usunięć (info) z ids i licznikami oraz id w logach błędów. |
| W7 | `src/lib/api.ts:31,46-50` (audytor) | swallowed | low | `catch {}` przy parsowaniu JSON i 415 bez logu: błąd klienta po wdrożeniu (zepsute body) nie zostawia licznika; nieprawidłowe id ścieżki daje 404 o tym samym kształcie co zamaskowany 404 z RLS. | Opcjonalny niski log (trasa, długość treści). |
| W9 | `src/pages/projects/[id].astro:35-47`, `projects/index.astro:20-25` (audytor) | missing-context | low | Logi stron (`project-view`, `project-milestones`, `projects-list`) bez id projektu i użytkownika; `getProject` zwracające `null` daje stronę 404, tak samo jak odmowa RLS lub wygasła sesja. | Dodać ids do logu. |

## 6. Recommended fix order

Kolejność według usuniętej ślepoty na jednostkę wysiłku. Ograniczenia: nie logować haseł ani surowych e-maili (skrót lub id), nie podwajać zgłoszeń przy ponowieniu żądania, nazwy zakresów o ograniczonej liczbie wartości.

1. **Ustrukturyzowany `logError(scope, error, ctx)`** (JSON: `name`, `message`, `stack`, `cause`, `status`, `code`, `details`, `hint`, plus `op`, `requestId`/`cf-ray`, hash użytkownika, ids) i `readFailure` zachowujące `cause`. Zamyka lub poprawia: P3, P4, P6 (częściowo), A3 (częściowo), L3, L7, W2, W6, W9.
2. **Middleware i konfiguracja:** czytać `error` z `getUser()` (P1), logować `createClient === null` (P2), czytać błąd `signOut()` (A5). Zamyka: P1, P2, A5.
3. **Zero wierszy, 23503 i „lost race”:** logować z ids i odróżniać RLS/sesję (L1, L4, W4). To przywraca sygnał regresji polityk RLS w pętli wartości.
4. **Wrapper `withApi`** dla handlerów API (try/catch, trasa, metoda, status, id żądania): A2, W2, L8, W7.
5. **Klasyfikacja auth:** awaria vs błąd użytkownika, wynik rejestracji, kontekst ataku: A3, A4, A8, A9, A7.
6. **Lista na dziś:** id i widoczny wiersz dla nieznanego `kind`, `Promise.allSettled`, log zapytania/daty: L2, L3.
7. **Raportowanie z klienta:** endpoint/beacon, globalne handlery, granica błędów, id żądania w odpowiedziach: L6, P5, P8.
8. **Klasyfikacja reguł po SQLSTATE/ograniczeniu/hint zamiast polskich fragmentów:** L5, W5.
9. **Tożsamość wdrożenia i strona 500 z id żądania:** P6, P7.

Pierwsze trzy kroki to ok. jeden dzień pracy i usuwają obie ustalenia krytyczne oraz większość wysokich.

## 7. Changes since last audit

Pominięte (pierwsze uruchomienie).

## 8. Method and limits

- **Agenci:** czterech (tylko do odczytu, równolegle): audytor auth, audytor listy na dziś i akcji, audytor zapisów, audytor kodu przekrojowego. Każdy dostał model przechwytywania z kroku 1; żaden nie uruchamiał aplikacji, Dockera ani testów.
- **Sprawdzone ręcznie podczas syntezy (potwierdzone):** `src/middleware.ts:15-18` (odrzucony `error`), `src/lib/log.ts:5-9` (tylko `message`), `src/lib/services/tasks.ts` `translateError` (23503 → `not_found` przed `logError`), `tasks.ts:254-255` (`row ? ok : not_found`), `src/lib/services/today.ts:83-85` (nieznany `kind` logowany bez id), `src/pages/api/auth/signout.ts:7`, `src/lib/supabase.ts:7-9`, `src/pages/today.astro:35-40`.
- **Obniżona ważność względem raportów audytorów:** „brak granicy try/catch w handlerach” (W2) z high na medium, bo audytor kodu przekrojowego odczytał w `node_modules` (astro 7.3.2, `@astrojs/cloudflare`), że Astro loguje stos przez `console.error` i zwraca 500; zostaje brak kontekstu i przypadek „zapis udał się, a błąd widoczny”. Ustalenia dotyczące braku trackera/alertów/ustawień platformy nie są ustaleniami (założenia w sekcji 2).
- **Nieweryfikowalne z repozytorium:** renderowanie logów Workers na produkcji, retencja/alerty, to czy platforma dodaje wersję skryptu, zachowanie `auth-js` przy błędach sieci i `signUp` dla istniejącego e-maila (odczyt źródeł przez audytorów), połykanie błędów SSR wysp (tylko lessons.md #1), brzmienia komunikatów triggerów w migracjach (nie czytane przez audytora listy).
- **Liczby z przeglądu całego repozytorium (bez testów, `.claude`, `components/ui`):** 9 pustych `catch` w kodzie aplikacji (z czego istotnych: `api.ts:31`, `api-client.ts:15` i 6 w hookach; reszta to `localStorage`/`sessionStorage`), 5 `catch` z wiązaniem (wszystkie wołają `logError`), 0 `.catch(() => default)`, jedno surowe `console.error` (`log.ts:8`), ok. 13 wywołań `logError`, błędy tworzone bez `cause` w `readFailure` oraz w `projects.ts:28` i `today.ts:84`.
- **Dowód z uruchomienia:** nie wykonano (`runtime_proof: not-run`). Katalog sond i skrypt `scripts/fake-ingest.mjs` są dostępne w skillu; można go dodać w osobnym przebiegu (np. `--runtime`), co zmieniłoby statyczne werdykty z sekcji 3 w obserwowane.
