# Widoczne i diagnozowalne błędy produkcyjne — Plan Brief

> Full plan: `context/changes/observability-error-signals/plan.md`
> Research: `context/changes/observability-error-signals/research.md`

## What & Why

Audyt obserwowalności wykazał, że błąd produkcyjny zostawia w logu jedną linię tekstu bez stosu, przyczyny i ids, a część awarii (awaria Supabase Auth, zero wierszy po zapisie, naruszenie klucza obcego) w ogóle nie jest logowana i wygląda jak zwykły ruch lub „nie znaleziono”. Zmiana sprawia, że każdy taki przypadek zostawia wpis JSON z kontekstem, bez zmiany tego, co widzi użytkownik (poza 503 przy awarii Auth).

## Starting Point

`logError` zapisuje `[scope] message`, `readFailure` gubi `cause`, middleware ignoruje `error` z `getUser()`, a usługi mapują zero wierszy i 23503 na `not_found` bez logu i bez `userId`. Testy logowania istnieją tylko w jednym miejscu, a smoke wymaga 404 w 11 scenariuszach zera wierszy.

## Desired End State

Błąd usługi, strony, middleware i `signOut` kończy się wpisem JSON (stos, `cause`, kod, status, `details`, `hint`, `userId`, `requestId`, ids zasobów, bez PII). Awaria Auth daje 503 na trasach chronionych, gość nadal 302/401. Zero wierszy, 23503 i „lost race” są osobnymi zdarzeniami w logu przy tych samych odpowiedziach HTTP. Ponowny audyt `--verify` potwierdza naprawę.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Format logu i PII | Jedna linia JSON, jawna lista pól kontekstu, bez hasła, e-maila i IP | Pola da się filtrować, a lista dozwolonych kluczy blokuje przypadkowy wyciek PII | Plan |
| Id żądania | `cf-ray` albo `crypto.randomUUID()` w middleware, nagłówek `x-request-id` | Id jest zawsze (też lokalnie i w testach), a użytkownik może je zacytować | Plan |
| Awaria Supabase Auth | 503 na trasach chronionych + log; gość 302/401 bez zmian | Zgodne z zasadą M3L5 (awaria nie staje się redirectem) i widoczne dla alertów 5xx | Plan |
| Wygasły JWT | `PGRST301/303` → `SESSION_ERROR` | Zweryfikowane: dziś kończy jako ogólny 500; mała zmiana, właściwy komunikat | Research / Plan |
| Przekazanie kontekstu | Opcjonalny ostatni argument `ctx` w funkcjach zapisu | Istniejące wywołania i testy działają bez zmian, kontekst jest jawny | Plan |
| Zero wierszy i 23503 | Log zdarzenia z ids, wyniki `not_found` bez zmian, bez drugiego zapytania | Smoke wymaga 404, a drugie zapytanie nie odróżni usunięcia od RLS | Research |
| Klasyfikacja błędów Auth | Czysta funkcja `auth-health.ts` | Testowalna bez mocków `astro:*` i zgodna ze zweryfikowanym zachowaniem `getUser()` | Research |
| Testy middleware i tras | `vi.mock("astro:middleware")` / `("@/lib/supabase")` w `src/lib/__tests__/` | Pliki testowe w `src/pages/` byłyby trasami Astro | Research |

## Scope

**In scope:** logger JSON, `readFailure` z `cause`, `locals.requestId`, middleware i `createClient`, `signOut`, logi zera wierszy/23503/„lost race” w usługach zadań, milestone'ów i projektów, kontekst w trasach i stronach, ponowny audyt.

**Out of scope:** klasyfikacja błędów logowania (A3, A4), try/catch w handlerach, lista na dziś (L2, L3), reguły 23514 po komunikatach, raportowanie z klienta, tag wydania, strona 500, haszowanie e-maila i IP.

## Architecture / Approach

Fundament pierwszy: `logError(scope, error, ctx)` z serializatorem i `locals.requestId`. Potem middleware i klient (jedyna zmiana widoczna dla użytkownika: 503), następnie usługi z opcjonalnym `ctx` i trasy przekazujące `{ userId, requestId }` z `locals`. Każda faza zaczyna się od testu czerwonego, kończy break-checkiem i smoke bez zmian oczekiwań.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Logger i kontekst | JSON `logError`/`logWarn`, `readFailure` z `cause`, typ `requestId` | Format w Workers Logs niezweryfikowany; jedna asercja do przepisania |
| 2. Middleware, klient, signOut | 503 przy awarii Auth, log `createClient` i `signOut`, `x-request-id` | Nagłówek na niemutowalnej `Response`; mock `astro:*` w vitest |
| 3. Usługi zadań | Logi zera wierszy/23503, `PGRST303` → sesja, `ctx` w 6 wywołaniach | Zachowanie 404/422 musi pozostać nienaruszone (smoke) |
| 4. Milestone'y, projekty, strony | To samo + „lost race”, wspólna atrapa klienta | Wyciągnięcie atrapy z `tasks.test.ts` |
| 5. Weryfikacja i dokumentacja | Pełny zestaw, notka w test-planie, audyt `--verify` | Brak (kontrola regresji) |

**Prerequisites:** Docker i lokalny Supabase (`npx supabase start`), `.dev.vars`, działające `npm run smoke` i `npm run test:e2e` jako stan bazowy.
**Estimated effort:** ~5 sesji, po jednej na fazę (faza 3 i 4 najdłuższe).

## Open Risks & Assumptions

- `vi.mock` fabryką dla nierozwiązywalnego `astro:middleware` nie był uruchomiony; awaryjnie alias w `vitest.config.ts`.
- Jak Workers Logs wyświetlają linię JSON z `console.error` nie zweryfikowano; zakładamy, że ciąg JSON jest przeszukiwalny.
- Wsparcie `Error.cause` na `compatibility_date 2026-05-08` jest wnioskiem ze standardu JS, nie sprawdzone w docs Cloudflare.
- Obsługa błędu z `setAll` w nasłuchiwaczu `auth-js` nie została prześledzona.

## Success Criteria (Summary)

- Każdy błąd usługi i middleware zostawia wpis JSON ze stosem, `cause`, kodem i kontekstem, bez danych osobowych; testy były czerwone przed poprawką i mają break-check.
- Awaria Supabase Auth zwraca 503 na trasach chronionych, a gość nadal 302/401; smoke i e2e bez zmian oczekiwań.
- Ponowny audyt `--verify` oznacza P1, P2, P3, P4, A5, L4 i W4 jako `fixed`, a L1 jako zawężone do prawdziwych przyczyn.
