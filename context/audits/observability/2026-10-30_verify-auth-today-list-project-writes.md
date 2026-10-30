---
type: observability-audit
date: 2026-10-30 18:35
mode: verify
commit: 057c874
branch: master
dirty_tree: true
areas: [auth, today-list-and-task-actions, project-milestone-task-writes]
area_source: previous-report
runtime_proof: partial (ręcznie, lokalny Supabase: PATCH zero_rows/parent_not_found w fazie 3, awaria Auth w fazie 2; bez harnessu sond)
error_tracker: none (bez zmian; logi Cloudflare Workers, założone jako zbierane)
previous_report: context/audits/observability/2026-10-30_auth-today-list-project-writes.md
findings: { fixed: 8, changed: 6, still_open: 15, not_re_checked: 0 }
---

# Weryfikacja audytu obserwowalności (2026-10-30)

Ponowne sprawdzenie wszystkich 29 ustaleń z raportu `2026-10-30_auth-today-list-project-writes.md` po zmianie `observability-error-signals` (commity 36cf813, a3cdb00, ff51b75, 057c874). Drzewo robocze zmodyfikowane tylko plikami dokumentacji zmiany (`plan.md`, `test-plan.md`); kod w `src/` jest w stanie z `057c874`. Metoda: ponowne przeczytanie cytowanego kodu (`middleware.ts`, `auth-health.ts`, `log.ts`, `supabase.ts`, `signout.ts`, `postgrest.ts`, `tasks.ts`, `milestones.ts`, `projects.ts`, strony) oraz grep po liczbach z sekcji 8 oryginału. Dowód z uruchomienia jest cząstkowy i pochodzi z ręcznych kontroli w fazach 2 i 3 zmiany, nie z powtórzonego zestawu sond (oryginał miał `runtime_proof: not-run`, więc nie ma harnessu do ponowienia).

## 1. Wynik w skrócie

- **Oba ustalenia krytyczne zamknięte lub zawężone.** P1 (błąd `getUser()` wyglądał jak wylogowanie) jest `fixed`: awaria Auth na trasach chronionych daje 503 (`Retry-After: 30` dla stron, JSON dla API) i linię `logError` z `requestId`. L1 (zero wierszy = „nie znaleziono”) jest `changed`: zero wierszy jest teraz logowane (`zero_rows`, `parent_not_found`, `target_not_found`) z ids, a wygasły JWT (`PGRST303`/`PGRST301`) mapuje się na `SESSION_ERROR` zamiast 404.
- **Osiem ustaleń `fixed`:** P1, P2, P3, P4, A5, L4, W4, W9.
- **Sześć `changed` (częściowo):** P6, L1, L3, L7, L8, W6.
- **Piętnaście `still open`**, wszystkie poza zakresem zmiany: klient (P5, L6, P8), strona 500 (P7), klasyfikacja i kontekst auth (A2, A3, A4, A7, A8, A9), wrapper API (W2, W7), klasyfikacja reguł po komunikatach (L5, W5), nieznany `kind` listy (L2).

## 2. Zmiany od ostatniego audytu

| # | Poprzednio | Teraz | Dowód | Status |
|---|---|---|---|---|
| P1 | critical: błąd `getUser()` odrzucany, awaria Auth = masowe wylogowanie | `classifyAuthError` rozdziela none/anonymous/outage/invalid_session; outage na `/today`, `/projects`, `/api/projects` → 503 + `logError("middleware-getUser")`; `invalid_session` → `logWarn`; gość bez zmian (302/401) | `src/middleware.ts:36-74`, `src/lib/auth-health.ts:13-21`; ręcznie: zatrzymany kontener Auth → 503 i linia JSON z `AuthRetryableFetchError`, status 503, `requestId` | **fixed** |
| P2 | high: `createClient` → `null` bez logu | Log `supabase-config` raz na izolat, nadal zwraca `null` | `src/lib/supabase.ts:7-17`, test `supabase.test.ts` | **fixed** |
| P3 | high: log tylko `message` | Jedna linia JSON: `level`, `scope`, `name`, `message`, `stack`, `cause[]` (≤3 poziomy z `code/status/details/hint`), `status`, `code`, `details`, `hint`, konteksty z listy dozwolonych (bez PII) | `src/lib/log.ts:97-115`, `log.test.ts` | **fixed** |
| P4 | medium: `readFailure` bez `cause` | `new Error(..., { cause: error })`, `details`/`hint` trafiają do `cause[]` w logu | `src/lib/services/postgrest.ts:7-9` | **fixed** |
| P5 | medium: brak handlerów klienta | Bez zmian | brak `onerror`/`unhandledrejection`/granicy błędów w `src` | still open |
| P6 | low: logi bez operacji/wydania | Zakresy dalej nazywają moduł, ale `ctx.op` (np. `deleteProject`), `step` i `requestId` są w linii; brak `version_metadata` | `projects.ts:119`; grep `wrangler.jsonc` | **changed** |
| P7 | low: brak strony 500 z id | Brak strony 500; każda odpowiedź ma teraz nagłówek `x-request-id` (cf-ray lub uuid), ten sam id jest w logu | `middleware.ts:16-26,91`; brak `404.astro`/`500.astro` | still open |
| P8 | medium: awaria SSR wyspy bez sygnału | Bez zmian (smoke/e2e mają asercje treści wysp, jak wcześniej) | — | still open |
| A2 | medium: brak try/catch w signin/signup | Bez zmian | — | still open |
| A3 | high: awaria Supabase = szum złych haseł | Bez zmian; `signin.ts:22` i `signup.ts:22` dalej logują `auth-*:<code>` bez klasyfikacji i bez `requestId` (poza zakresem zmiany) | `signin.ts:22`, `signup.ts:22` | still open |
| A4 | medium: wynik rejestracji niewidoczny | Bez zmian | — | still open |
| A5 | medium: błąd `signOut()` odrzucany | Czytany i logowany `auth-signout` z `userId`/`requestId`; redirect zachowany | `src/pages/api/auth/signout.ts:7-12`, `signout.test.ts` | **fixed** |
| A7 | low: odrzucenie Zod bez logu | Bez zmian | — | still open |
| A8 | medium: błędy auth jako 302→200 | Bez zmian | — | still open |
| A9 | medium: brak kontekstu w logach auth | Bez zmian (brak `requestId` w signin/signup) | `signin.ts` | still open |
| L1 | critical: zero wierszy = 404 bez śladu | Zawężone: sprawdzone lokalnie, że wygasły JWT daje 401 `PGRST303` (nie zero wierszy), a prawidłowy JWT + brakujący/ukryty wiersz daje 200 `[]`. `PGRST301/303` → `SESSION_ERROR`; zero wierszy loguje `zero_rows`/`target_not_found`/`parent_not_found` (warn) z ids i `op`; wynik usług i kody HTTP bez zmian (smoke wymaga 404). Ukryty przez RLS wiersz pozostaje nie do odróżnienia od nieistniejącego, ale jest teraz widoczny w logu jako sygnał | `tasks.ts:98-149,213,249,273,298-307,434`, `postgrest`-owe translateError w trzech serwisach | **changed** |
| L2 | high: nieznany `kind` znika bez id | Bez zmian | `src/lib/services/today.ts:84` (plik poza zmianą) | still open |
| L3 | high: log listy bez użytkownika, `Promise.all` | Log ma `userId` i `requestId`; `Promise.all` i brak daty zostają | `src/pages/today.astro:37-39` | **changed** |
| L4 | high: 23503 → 404 bez logu | Log `fk_violation[:constraint]` przed mapowaniem na `not_found`, z ids | `tasks.ts:98` i odpowiedniki | **fixed** |
| L5 | medium: reguły po polskich fragmentach | Bez zmian (`message.includes`: tasks 13, milestones 4, projects 3) | grep | still open |
| L6 | high: klient `catch {}` | Bez zmian (7 `catch {` w hookach i `api-client`) | grep | still open |
| L7 | medium: sekwencje bez nazwy kroku | Kontekst `op`/ids wszędzie, `step` tylko w gałęzi `lost_race` w milestones (close/reopen); w tasks brak `step` | grep `step:` | **changed** |
| L8 | medium: handlery bez logów 404/422 | 14 wywołań usług w trasach `/api/projects/**` przekazuje `logContextFrom(locals)`, a 404 z zera wierszy loguje serwis z ids; 422 dalej bez logu | trasy, `tasks/index.ts` | **changed** |
| W2 | medium: brak try/catch/withApi | Bez zmian (brak `try {` w `src/pages/api`) | grep | still open |
| W4 | medium: „lost race” bez śladu | `logWarn("milestones", "lost_race:{deleted,matches_request,opposite}")` z `step` close/reopen i ids | `milestones.ts:164,168` | **fixed** |
| W5 | medium: klasyfikacja po komunikatach | Bez zmian | grep | still open |
| W6 | medium: usunięcia bez logów | Zero wierszy przy usunięciu jest logowane z `op`/ids; brak logu prób i liczby usuniętych dzieci | `projects.ts:118-120` | **changed** |
| W7 | low: `readJsonBody` `catch {}` | Bez zmian | `src/lib/api.ts:31` | still open |
| W9 | low: logi stron bez ids | `project-view`/`project-milestones` mają `userId`, `requestId`, `projectId`; `projects-list` ma `userId`/`requestId` | `projects/[id].astro:39,46`, `projects/index.astro:24` | **fixed** |

## 3. Przed/po dla kształtów awarii z sekcji 3 oryginału

| Kształt awarii | Przed | Po |
|---|---|---|
| Błąd `getUser()` (awaria Auth) | **missed**: 302/401 bez linii | 503 + linia JSON (`middleware-getUser`, status, `requestId`); wygasły/nieprawidłowy token → warn `invalid_session[:code]` |
| `createClient` → `null` | **missed** | `supabase-config` raz na izolat |
| Błąd PostgREST w usłudze | poor: `[scope] CODE: message` | JSON ze stosem, `cause`, `code`, `details`, `hint`, ids, `op` |
| Kod 23503 | **missed** | warn `fk_violation[:constraint]` z ids |
| Pusty wynik UPDATE/DELETE | **missed** | warn `zero_rows`/`target_not_found`/`parent_not_found` z ids |
| Błąd `signOut()` | **missed** | `logError("auth-signout")` z `requestId` |
| „Lost race” milestona | **missed** | warn `lost_race:*` |
| Błąd logowania (hasło vs awaria) | poor | bez zmian |
| Błąd fetch / render / SSR wyspy po stronie klienta | **missed** | bez zmian |

## 4. Założenia i granice

- Założenia z oryginału (logi Workers zbierane, retencja i alerty nieznane) bez zmian; nowe: linie logu są jednym wierszem JSON, co zakłada, że Workers Logs indeksują pola JSON (nie sprawdzone na produkcji).
- `cf-ray` jako `requestId` działa tylko na produkcji za Cloudflare; lokalnie i w testach to `crypto.randomUUID()`.
- Brak trackera błędów i alertów w repozytorium to nadal założenie, nie ustalenie; zmiana nie dodaje alertów na liniach `level: "error"`.
- Weryfikacja dotyczy kodu aplikacji; nie powtórzono sond środowiskowych (oryginał ich nie miał). Testy: 171 testów vitest (9 plików), pgTAP 495, e2e 3, smoke zielony, w tym kontrole z celowym uszkodzeniem kodu dla każdej zmienionej reguły.

## 5. Następny krok

Najtańsze, najbardziej widoczne ustalenia, które zostały: **A3/A9** (dodać `requestId` i rozdzielić awarię Auth od błędu użytkownika w `signin.ts`/`signup.ts`, kilka linii, ten sam helper `classifyAuthError`), potem **W2/A2** (wrapper `withApi`) i **L2** (id przy nieznanym `kind`). Klient (P5, L6, P8) wymaga osobnej decyzji o endpointcie raportującym.
