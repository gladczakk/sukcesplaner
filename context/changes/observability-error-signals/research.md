---
date: 2026-10-30T15:25:27+01:00
researcher: Claude (Sonnet 5.5) for Karolina Jurowicz
git_commit: e553499
branch: master
repository: xDevs
topic: "Uziemienie zmiany observability-error-signals (audyt P1, P2, P3, P4, A5, L1, L4, W4): logger, middleware, zero wierszy, 23503, lost race"
tags: [research, codebase, observability, logging, middleware, supabase, rls, vitest]
status: complete
last_updated: 2026-10-30
last_updated_by: Claude (Sonnet 5.5)
---

# Research: uziemienie zmiany `observability-error-signals`

**Date**: 2026-10-30T15:25:27+01:00
**Git Commit**: e553499 (drzewo robocze: nieśledzony folder zmiany i `public/mvp-check.md`)
**Branch**: master
**Repository**: xDevs

## Research Question

Dla zmiany z audytu `context/audits/observability/2026-10-30_auth-today-list-project-writes.md` (ustalenia P1, P2, P3, P4, A5, L1, L4, W4): jak dziś działa logowanie błędów i obsługa błędów Supabase w middleware, gdzie dokładnie zero wierszy i kod 23503 stają się „nie znaleziono”, co jest już w zasięgu (id użytkownika, id żądania), jak testować to test-first w vitest, i jakie ograniczenia narzucają smoke, e2e, decyzje z archiwum oraz lint. Weryfikuję, a nie przyjmuję, twierdzenia audytu.

Oznaczenia: **ZWERYFIKOWANE** = sprawdzone uruchomieniem na lokalnym Supabase w tym badaniu; **ODCZYT** = odczytane w kodzie lub `node_modules` (kotwica `plik:linia`); **WNIOSEK** = wnioskowane, niesprawdzone.

## Summary

- **Poprawka P3/P4 jest mała i dobrze zlokalizowana.** `logError` ma 10 miejsc wywołania i tylko jeden test na `console.error` (`tasks.test.ts:213-214`, asercja `stringContaining`). `readFailure` jest używane w 10 miejscach (7 rzuca, 3 owija dla `logError`). Cztery strony (`today.astro`, `projects/index.astro`, `projects/[id].astro` ×2) łapią błąd już po spłaszczeniu przez `readFailure`, więc bez zachowania `cause` nie odzyskają pól PostgREST.
- **Kontekst jest dostępny bez nowej sieci.** `context.locals.user` (typ `User | null`, `src/env.d.ts:3`) ustawia middleware po `getUser()`, a trasy API tego nie czytają. `cf-ray` i `cf-connecting-ip` są w `context.request.headers` i `context.clientAddress`. Id żądania nie istnieje w repo. Usługi przyjmują tylko `(supabase, ids...)`; 14 miejsc wywołania w 8 trasach API.
- **Predykat „gość” vs „awaria Supabase Auth” jest ZWERYFIKOWANY** (poniżej): `AuthSessionMissingError` (status 400) dla gościa, `AuthRetryableFetchError` (status 0, „fetch failed”) przy niedostępnym backendzie, `AuthApiError` 403 `bad_jwt` dla uszkodzonego tokenu. `getUser()` zwraca te błędy, nie rzuca.
- **Korekta audytu (L1):** założenie „wygasły JWT daje zero wierszy” jest fałszywe. ZWERYFIKOWANE: wygasły JWT daje 401 `PGRST303`, rola `anon` daje 401 `42501`, a ciche zero wierszy (200 `[]`) daje wyłącznie ważny JWT z brakującym lub ukrytym przez RLS wierszem (inny użytkownik, regresja polityki, prawdziwe usunięcie). Zakres L1 zawęża się do tych przyczyn; wygasła sesja jest widoczna jako zalogowany błąd 500 (kod `PGRST303` trafia do `GENERIC_ERROR`, nie do `SESSION_ERROR`).
- **Ograniczenie twarde:** smoke wymaga 404 dla zera wierszy w 11 scenariuszach (m.in. ponowne usunięcie, nieznane id). Zmienić można wyłącznie logowanie, nie semantykę `not_found`.
- **Testowalność:** `src/middleware.ts` i `src/lib/supabase.ts` nie importują się dziś w vitest (moduły `astro:*`); wystarczą `vi.mock("astro:middleware")` i `vi.mock("@/lib/supabase")` w pliku testu (do potwierdzenia przy pierwszym uruchomieniu).

## Detailed Findings

### 1. Logger i spłaszczanie błędów (P3, P4)

- `src/lib/log.ts:5-9`: `logError(scope: string, error: unknown)` → `console.error(\`[${scope}] ${detail}\`)`, gdzie `detail` to `error.message` lub `String(error)`. Jedyne `console.*` w `src/` (z `eslint-disable no-console`, ODCZYT). Komentarz nagłówkowy (`log.ts:1-4`): przyczyna ma zostać poza odpowiedziami dla użytkownika, ale w logach Workers.
- `src/lib/services/postgrest.ts:6-8`: `readFailure(error)` → `new Error(\`${code}: ${message}\`)`, bez `cause`, `details`, `hint` (ODCZYT).
- Wywołujący `logError` (ODCZYT): `today.astro:38` (`today-list`), `projects/index.astro:24` (`projects-list`), `projects/[id].astro:39` (`project-view`) i `:46` (`project-milestones`), `services/today.ts:84` (`today-list`, `new Error("Unknown today_list kind: …")`), `services/tasks.ts:92` (`tasks`), `milestones.ts:62` (`milestones`), `projects.ts:47` (`projects`), `api/auth/signin.ts:22` i `signup.ts:22` (`auth-signin:<code>`, `auth-signup:<code>`, przekazują oryginalny `AuthError`). `middleware.ts`, `signout.ts` i handlery `api/projects/**` nie wołają `logError`.
- `readFailure` rzuca w `today.ts:25,101`, `milestones.ts:78`, `projects.ts:60,66,81,82`; owija dla `logError` w `tasks.ts:92`, `milestones.ts:62`, `projects.ts:47`.
- Testy: jedyne dotknięcie logowania to `tasks.test.ts:152,156,213-214` (`vi.spyOn(console, "error")`, `toHaveBeenCalledWith(expect.stringContaining(message))`, dla kodów `XX000` i `42501`). Zmiana formatu na obiekt wymaga przepisania tej asercji; dopisanie kontekstu w ciągu znaków zostawiłoby ją zieloną (ODCZYT).
- Serializacja: standardowo `JSON.stringify(new Error("x"))` daje `"{}"` (WNIOSEK, standard JS), więc potrzebny jest jawny serializator. `AuthError` ma `toJSON()` zwracające `{name, message, status, code}` bez stosu i `cause` (`@supabase/auth-js` `errors.js:31-37`, ODCZYT). Zachowanie Workers Logs dla `console.error(obiekt)` vs ciąg JSON i wsparcie `Error.cause` na `compatibility_date 2026-05-08` nie zostały zweryfikowane (WNIOSEK; docs Cloudflare nie pobrane).

### 2. Kontekst żądania (P3, ids)

- `src/env.d.ts:1-5` deklaruje tylko `App.Locals { user: User | null }` (ODCZYT). Brak pojęcia id żądania w `src/`.
- Adapter Cloudflare 14.3.1: `locals.runtime.cf` rzuca „removed in Astro v6”; dostępne: `context.request.headers` (nagłówki Cloudflare `cf-ray`, `cf-connecting-ip`), `context.clientAddress` (z `cf-connecting-ip`, `handler.js:77-86`), `context.request.cf`, `context.locals.cfContext`, `context.locals.user` (ODCZYT). Obecność `cf-ray` lokalnie nie została sprawdzona.
- Trasy API tworzą własnego klienta (`createClient(request.headers, cookies)`) i nie czytają `locals`; `locals.user` jest już ustawione przez middleware, więc `locals.user.id` jest dostępne bez nowego wywołania sieci (ODCZYT: `middleware.ts:15-18,30-35`).
- Sygnatury usług (ODCZYT): wszystkie zaczynają od `supabase: Client`, np. `setTaskStatus(supabase, projectId, milestoneId, taskId, status)`, `setMilestoneCompleted(supabase, projectId, id, completed)`, `updateProject(supabase, id, input)`. 14 miejsc wywołania w 8 plikach tras (`projects/index.ts` 1, `[id].ts` 2, `milestones/index.ts` 1, `[milestoneId].ts` 3, `tasks/index.ts` 1, `[taskId].ts` 4, `occurrences.ts` 1, `occurrences/move.ts` 1). Opcja o najmniejszym koszcie: opcjonalny końcowy argument `ctx?: { userId?: string; requestId?: string }`, który nie zmienia istniejących testów.
- Prywatne helpery bez id: `translateError(error)` w `tasks.ts:47`, `milestones.ts`, `projects.ts:33` dostają tylko błąd; id mają ich wywołujący.

### 3. Middleware i auth (P1, P2, A5)

- `src/middleware.ts:15-18` odrzuca `error` z `supabase.auth.getUser()`; przy `supabase === null` (`:19-21`) ustawia `locals.user = null` bez logu (ODCZYT). `src/lib/supabase.ts:7-9` zwraca `null` bez logu przy braku `SUPABASE_URL`/`SUPABASE_KEY` (ODCZYT).
- **ZWERYFIKOWANE** (`createClient` z `@supabase/supabase-js`, lokalny Supabase, `getUser()`):
  - gość bez sesji: `{ user: null }`, `AuthSessionMissingError`, status 400, bez sieci;
  - backend niedostępny (zamknięty port): `AuthRetryableFetchError`, status 0, „fetch failed”;
  - uszkodzony token: `AuthApiError`, status 403, kod `bad_jwt`.
  - `getUser()` zwraca te błędy zamiast je rzucać (też ODCZYT `GoTrueClient.js:2673-2730`).
- Predykat (WNIOSEK z powyższego i z `fetch.js:35-89`, w tym 500-504 i 520-530 jako `AuthRetryableFetchError`): awaria = `isAuthRetryableFetchError(e) || (typeof e.status === "number" && e.status >= 500)`; gość = `e == null || isAuthSessionMissingError(e)`; 400/401/403 `AuthApiError` to „sesja nieważna”, nie awaria. Reeksport funkcji z `@supabase/supabase-js` nie został sprawdzony.
- `@supabase/ssr` 0.12.7 nie opakowuje `getUser`; ma `autoRefreshToken: false`, więc odświeżenie następuje wewnątrz `getUser` (ODCZYT `createServerClient.js:10-80`). `setAll` w `supabase.ts:15-19` nie ma try/catch; jak błąd z `setAll` obsługuje nasłuchiwacz auth-js nie zostało prześledzone.
- `signOut()` zwraca `{ error }` i usuwa sesję lokalnie w prawie każdej gałęzi; 401/403/404 i brak sesji dają `error: null` (`GoTrueClient.js:3412-3449`, ODCZYT). `signout.ts:7` ignoruje wynik.
- `toAuthErrorCode` (`src/lib/auth-errors.ts:34-38`) nigdy nie zwraca `unavailable` dla błędu Supabase: `AuthRetryableFetchError` (kod `undefined`) i nieobsłużone kody dają `unknown`. `unavailable` ustawiają tylko ścieżki z `createClient === null` (`signin.ts:17`, `signup.ts:17`, strony) (ODCZYT).
- Ograniczenia z archiwum: komunikat błędu auth nie trafia do URL, w URL jest tylko kod (`CLAUDE.md` sekcja UI; `context/archive/2026-10-23-ui-auth-views/plan.md:70`: przyczyna przez `logError`). Smoke wymaga 302 na `/auth/signin` dla gościa (`scripts/smoke.mjs:163-164`) i 401 JSON `{error:"Wymagane logowanie"}` (`:165-168`): 503 w middleware musi wykluczyć `AuthSessionMissingError`.

### 4. Zero wierszy i 23503 (L1, L4, W4)

Lista miejsc (ODCZYT, wszystkie to 404 z trasy; żadne nie loguje; w żadnym nie ma `userId`):

| Funkcja | Kotwica | Znaczy „puste” |
|---|---|---|
| `findMilestone` | `tasks.ts:105-112` | brak widocznego milestona w projekcie |
| `createTask` | `tasks.ts:136-137` | insert nie zwrócił wiersza |
| `updateTask` (odczyt, zapis, gałąź rytmu) | `tasks.ts:173,196-197,225-233` | brak zadania; 0 wierszy; po ponownym odczycie `not_found` lub walidacja |
| `setTaskStatus` | `tasks.ts:254-255` | 0 wierszy |
| `setTaskDeferral` | `tasks.ts:276-278,287` | 0 wierszy (przy `until === null` bez ponownego odczytu) |
| `completeOccurrence`, `moveOccurrenceToTomorrow` | `tasks.ts:304,325,347,384` | brak zadania; 23503 przy insercie |
| `deleteTask` | `tasks.ts:394,408` | 0 usuniętych |
| `updateMilestone`, `deleteMilestone` | `milestones.ts:112-113,161` | 0 wierszy |
| `setMilestoneCompleted` | `milestones.ts:128,147` | brak wiersza; ponowny odczyt pusty |
| `updateProject`, `deleteProject` | `projects.ts:96-97,106` | 0 wierszy (tylko `projectId`) |

- **23503 → `not_found`** (`tasks.ts:89-90`, `milestones.ts:59-60`) następuje przed `logError` (`tasks.ts:92`, `milestones.ts:62`), więc nie jest logowany. `projects.ts:33-52` nie ma gałęzi 23503. Na ścieżkach delete wynik `translateError` inny niż `unavailable` jest mapowany na ogólny 500 bez logu (`tasks.ts:404-407`, `milestones.ts:157-160`, `projects.ts:102-105`); 23503 przy delete jest mało prawdopodobny, bo klucze obce mają `ON DELETE CASCADE` (ZWERYFIKOWANE w `pg_constraint`: `tasks_user_id_fkey`, `tasks_milestone_owner_fkey`, `task_occurrences_task_owner_fkey` → `confdeltype = c`).
- **23503 przy UPDATE jest praktycznie nieosiągalny:** te klucze mają `ON UPDATE NO ACTION` (ZWERYFIKOWANE), a usługi nie zmieniają `milestone_id` ani `user_id`. Realne źródła to insert zadania, milestona i wystąpień po usunięciu rodzica w międzyczasie (`create_core_domain_schema.sql:52`, `recurring_tasks.sql:55`).
- **Semantyka RLS (ZWERYFIKOWANE na lokalnym PostgREST, `PATCH/DELETE ... Prefer: return=representation`):**
  - `anon`: HTTP 401, `{"code":"42501","message":"permission denied for table projects"}` (zgodne z `revoke all … from anon`, migracja `20261009120100_enable_core_domain_rls.sql:12-16`); usługi mapują 42501 na `SESSION_ERROR` i logują (`tasks.ts:93-95`).
  - wygasły JWT: HTTP 401, `{"code":"PGRST303","message":"JWT expired"}`; w usługach trafia do `GENERIC_ERROR` i `logError` (500), nie do `SESSION_ERROR`.
  - ważny JWT, wiersza nie ma lub jest niewidoczny: HTTP 200 z `[]` (PATCH i DELETE). To jedyny „cichy” przypadek.
  - Trzy nieodróżnialne przyczyny zera wierszy: prawdziwe usunięcie (np. inna karta tego samego użytkownika), wiersz innego użytkownika, regresja polityki (WNIOSEK). `findMilestone` wołane tuż przed zapisem zadania jest tanim sygnałem: jeśli rodzic jest widoczny, a zapis zadania dał 0 wierszy, regresja polityki jest mniej prawdopodobna (WNIOSEK, polityki mają ten sam kształt).
- **Lost race** (`milestones.ts:120-148`, ODCZYT): odczyt bieżącego wiersza (`:126`), brak wiersza → `not_found` (`:128`), stan równy żądanemu → `ok` bez zapisu (`:129`), warunkowy UPDATE z `is("completed_at", null)` albo `not("completed_at","is",null)` (`:132-139`), wiersz zwrócony → `ok` (`:142`), 0 wierszy → ponowny odczyt `latest` (`:144-147`): pusty → `not_found`, obecny → `ok` ze stanem bieżącym. Anomalią jest `latest` o stanie nadal przeciwnym do żądanego (zapis powinien się był udać). Propozycja zawartości logu: zdarzenie, `userId`, `projectId`, `milestoneId`, `requested`, stan przed, wynik ponownego odczytu (`deleted` / `matches_request` / `opposite`); bez treści wiersza.

### 5. Testy i bramki

- Vitest: `vitest.config.ts:1-11` — alias `@`, `environment: "node"`, `include: ["src/**/*.test.ts"]`, bez wtyczki Astro i bez aliasów `astro:*`. Istnieją dwa pliki: `src/lib/today.test.ts` i `src/lib/services/tasks.test.ts` (720 linii). Żaden test nie importuje modułu dotykającego `astro:*` (ODCZYT, grep).
- Atrapa klienta w `tasks.test.ts` (~66-142, ODCZYT): kolejki odpowiedzi po kluczu `` `${tabela}.${operacja}` ``, pomocniki `ok(data)` i `fail(code, message)`; budowniczy obsługuje tylko `select, update, insert, delete, eq, neq, maybeSingle` (bez `.is`, `.not`, `.single`, `.order`). Test `setMilestoneCompleted` wymaga dopisania `.is` i `.not` oraz jawnych kolejek `milestones.select` (domyślna kolejka to `[MILESTONE_FOUND]`). Pokryte gałęzie: zero wierszy dla `setTaskStatus` (`:178`), 23503 (`:180-183`), wygasła sesja (`:194-198`), `deleteTask` bez wiersza (`:623`); nie ma testów `milestones.ts` ani `projects.ts`, ani asercji, że `not_found` lub 23503 loguje.
- Najtańsza testowalność middleware (WNIOSEK, nieuruchomione): `vi.mock("astro:middleware", () => ({ defineMiddleware: (fn) => fn }))` i `vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }))`; fałszywy kontekst z `request`, `cookies`, `url`, `locals`, `redirect`. Moduły tras auth importują `astro` tylko typowo, więc wystarczy mock `@/lib/supabase`. Czy `vi.mock` z fabryką działa dla nierozwiązywalnego id `astro:middleware`, trzeba sprawdzić przy pierwszym uruchomieniu; alternatywa to alias w `vitest.config.ts`.
- Konwencje testu (`test-plan.md` §6.1, §6.3, §6.4, §6.6, ODCZYT): `src/**/*.test.ts` obok modułu, oczekiwania wpisane ręcznie z reguły/decyzji, nigdy z kodu; break-check w working tree z czerwoną asercją ryzyka (nie timeout). Hook Stop uruchamia `vitest run` (`test-plan.md` §5).
- Smoke wymaga 404 w 11 scenariuszach zera wierszy lub nieznanego id (`scripts/smoke.mjs:635-641,644-650,658-660,1111-1116,1261-1266,1355-1361,1364-1370,1378-1380,1399-1401,1413-1415,1418-1420`) oraz 302 `?error=invalid_credentials` / `invalid_input` (`:177,182,187`) i 302 na `/auth/confirm-email` (`:170-172`). Testy e2e nie zależą od tekstu logów ani ścieżek błędów (`tests/e2e/*`, ODCZYT). Nic w smoke, e2e ani pgTAP nie zależy od treści `console.error`.
- Lint (`eslint.config.js`, ODCZYT): `strictTypeChecked` + `stylisticTypeChecked`; `no-console: warn` (nowe `console.*` wymaga `eslint-disable` jak w `log.ts:7`); `restrict-template-expressions` tylko dla liczb (interpolacja `unknown`/`undefined` w logu to błąd); `prefer-nullish-coalescing`; `no-floating-promises`; `.claude/**` pomijane. Zasady `CLAUDE.md` sekcja M3L5: bez pustych `catch`, bez zamiany błędu na redirect/200, bez gubienia `cause`; potrzebny `catch` loguje lub raportuje z przyczyną.

## Code References

- `src/lib/log.ts:5-9` — `logError` (jedyne `console.error`)
- `src/lib/services/postgrest.ts:6-8` — `readFailure` bez `cause`
- `src/middleware.ts:15-21,30-40` — odrzucony `error`, `null` klient, redirect/401
- `src/lib/supabase.ts:7-9,15-19` — `null` bez logu; `setAll` bez try/catch
- `src/pages/api/auth/signout.ts:7` — zignorowany wynik `signOut()`
- `src/lib/auth-errors.ts:34-38` — `toAuthErrorCode` (brak `unavailable` dla błędu Supabase)
- `src/lib/services/tasks.ts:47-97,105-112,136-137,196-197,254-255,276-287` — `translateError`, zera wierszy, 23503
- `src/lib/services/milestones.ts:59-62,120-148,157-161` — 23503, lost race, delete
- `src/lib/services/projects.ts:33-52,96-106` — `translateError`, zera wierszy
- `src/lib/services/today.ts:83-85` — nieznany `kind` (poza zakresem tej zmiany; audyt L2)
- `src/lib/services/tasks.test.ts:62-215` — atrapa klienta, jedyna asercja na `console.error`
- `vitest.config.ts:1-11` — brak aliasów `astro:*`
- `scripts/smoke.mjs:163-168,177-187,635-1420` — oczekiwania 302/401/404

## Architecture Insights

- Usługi zwracają unię statusów (`ok` / `validation` / `not_found` / `unavailable`), a trasy mapują je na 404/422/500; to decyzja z archiwum (`context/archive/2026-10-15-task-crud/plan.md:139`, `2026-10-14-milestone-crud/plan.md:144`: pusty wynik UPDATE/DELETE z `.select()` to `not_found`, 23503 to `not_found`, 42501 to komunikat sesji, reszta do `logError` i ogólny komunikat). Zmiana ma więc dodać sygnał (log z ids), nie zmieniać unii.
- Id użytkownika dostarcza middleware (`locals.user`), a usługi widzą tylko klienta Supabase i id zasobów; najmniejsza ingerencja to opcjonalny `ctx` na końcu.
- Dwa niezależne „puste” znaczenia: `maybeSingle()`/`.at(0)` bez wiersza po zapisie oraz `data.length === 0` po delete; oba kończą się 404.

## Historical Context (from prior changes)

- `context/archive/2026-10-23-ui-auth-views/plan.md:70` — `error.message` nie trafia do URL; przyczyna do `logError` (zgodnie z regułą „nie ukrywaj dowodów”).
- `context/archive/2026-10-15-today-list-view/plan.md:146` — `today.astro` łapie błąd, loguje `logError("today-list", error)` i pokazuje komunikat inline z `role="alert"`.
- `context/foundation/lessons.md` — brak wpisów o logowaniu; lekcja nr 1 (smoke asertuje treść wysp) obowiązuje także tu, jeśli zmiana dotknie stron z wyspami.
- Brak reguły PRD ani lekcji o PII w logach; otwarty punkt do decyzji w planie: nie logować haseł ani surowego e-maila (skrót lub id).

## Related Research

- `context/audits/observability/2026-10-30_auth-today-list-project-writes.md` — źródło ustaleń.
- `context/archive/2026-10-30-testing-e2e-flow-and-gates/research.md` — infrastruktura testowa, hooki i bramki, na których opiera się test-first.

## Open Questions

1. **Zakres kontekstu logu:** `userId` z `locals.user.id` i `cf-ray`/`clientAddress` z nagłówków są dostępne; czy generować własne id żądania w middleware (zmiana typu `Locals`), czy użyć `cf-ray`? Lokalnie `cf-ray` może nie istnieć (niesprawdzone).
2. **Poziom i format logu:** JSON w jednej linii vs obiekt w `console.error`, oraz jak Workers Logs je prezentują (niezweryfikowane); ocena wpływu na `tasks.test.ts` (jedna asercja do przepisania).
3. **Polityka PII:** hasło nigdy; e-mail jako skrót lub nigdy; IP tak/nie. Brak istniejącej reguły — decyzja w planie.
4. **Zachowanie 503 w middleware** dla `AuthRetryableFetchError`/status ≥ 500: odpowiedź dla stron (503 z treścią) vs dla `/api/projects` (503 JSON). Nie psuje smoke dla gościa (`AuthSessionMissingError`), ale wymaga decyzji produktowej o komunikacie.
5. **Mapowanie `PGRST303` (wygasły JWT)** na `SESSION_ERROR` zamiast `GENERIC_ERROR` (korekta względem audytu: widoczne w logu, ale użytkownik widzi ogólny błąd). Czy wchodzi w zakres tej zmiany, czy osobno.
6. **Gdzie logować zero wierszy:** w usługach (mają ids rodzica i zasobu) z `ctx.userId` doklejonym przez trasę; jak odróżnić poziom `warn` (prawdopodobne usunięcie przez inną kartę) od podejrzenia RLS bez drugiego zapytania (np. dzięki `findMilestone` tuż przed zapisem). Nierozstrzygnięte, czy dodawać drugi odczyt.
7. **Niezweryfikowane:** `vi.mock("astro:middleware")` bez aliasu w vitest; reeksport `isAuthRetryableFetchError`/`isAuthSessionMissingError` z `@supabase/supabase-js`; obsługa błędu z `setAll` w nasłuchiwaczu auth-js; prezentacja `console.error(obiekt)` w Workers Logs i wsparcie `Error.cause`; część linii `tasks.test.ts` 224-604 nieczytana.
