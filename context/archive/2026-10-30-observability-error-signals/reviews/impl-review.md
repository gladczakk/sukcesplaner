<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Widoczne i diagnozowalne błędy produkcyjne

- **Plan**: context/changes/observability-error-signals/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success Criteria: vitest 171/171, `npm run lint` 0 błędów, `astro check` 0 błędów (1 hint); pgTAP, e2e i smoke przeszły w fazie 5. Plan Adherence: wszystkie planowane zmiany MATCH, brak EXTRA w `src/`.

## Findings

### F1 — `details`/`hint` z PostgREST trafiają do logu bez filtra

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/log.ts:57-61, 77-78
- **Detail**: `details` i `hint` są kopiowane dosłownie, także w łańcuchu `cause`. Dla kodów obsługiwanych przez ogólny `logError` w usługach (np. 23505, nierozpoznane 23514) `details` ma postać `Key (name)=(Moj projekt) already exists` albo `Failing row contains (...)`, czyli treść wpisana przez użytkownika i `user_id`. Komentarz nagłówkowy w `log.ts` obiecuje "no PII", a test `log.test.ts:64` utrwala kopiowanie.
- **Fix A ⭐ Recommended**: Logować `details` tylko dla listy kodów bez wartości wierszy (np. `42501`, `PGRST*`), a dla pozostałych zostawić `code`, `message`, `hint`
  - Strength: Zachowuje diagnostykę z audytu (P3/P4) tam, gdzie nie ma ryzyka wycieku.
  - Tradeoff: Lista kodów do utrzymania; dla 23505 trzeba polegać na nazwie ograniczenia z `message`.
  - Confidence: MED — treść `details` zależy od kodu, nie sprawdzono wszystkich triggerów.
  - Blind spot: Czy `message` któregoś triggera osadza wartości.
- **Fix B**: Usunąć `details` z wyjścia całkowicie
  - Strength: Najprostsze, eliminuje klasę problemu.
  - Tradeoff: Traci diagnostykę zapowiedzianą w planie i audycie.
  - Confidence: HIGH — jedna linia w `pick`.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (allow-lista kodów 42501 i PGRST* dla `details`; test czerwony → zielony, 178 testów)

### F2 — Brak limitu długości `stack`, `message`, `details`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/log.ts:53-61, 77-78
- **Detail**: Ograniczona jest tylko głębokość `cause` (3). Długi stos lub `details` daje wpis, który Workers może obciąć, a obcięta linia przestaje być poprawnym JSON.
- **Fix**: Dodać `clip(value, 2000)` dla `stack`, `message` i `details` w `pick`/`describeError`, z testem na przewymiarowany stos.
- **Decision**: FIXED (clip 2000 znaków dla stringów w logu; testy czerwone → zielone, 180 testów)

### F3 — Błąd 429 z Auth traktowany jak nieważna sesja

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth-health.ts:18-21
- **Detail**: Wszystko poza 5xx, `AuthRetryableFetchError` i `AuthSessionMissingError` to `invalid_session`. Limit żądań (429) lub `AuthUnknownError` odsyła zalogowanych na `/auth/signin` z samym ostrzeżeniem, czyli objaw, który ta zmiana miała usunąć. Zachowanie jest fail-closed, bez obejścia uwierzytelniania.
- **Fix**: Uznać `status === 429` za `outage` (503 + `logError`) i dodać test klasyfikatora z oczekiwaniem wpisanym z decyzji.
- **Decision**: FIXED (status 429 → outage; test czerwony → zielony, 181 testów)

### F4 — `updateTask` z `onlyOpen` pomija log zera wierszy

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/tasks.ts:213
- **Detail**: Gałąź `onlyOpen` zwraca `not_found` bez logu, bo wywołujący rozstrzyga "zrobione vs usunięte". Plan mówił o logowaniu zera wierszy w każdym takim miejscu; mała luka, świadoma (komentarz w kodzie).
- **Fix**: Zostawić albo dodać `logWarn` z `event: "zero_rows:only_open"` — do decyzji, niski wpływ.
- **Decision**: DISMISSED — ustalenie błędne: pusty wynik `onlyOpen` rozstrzyga tasks.ts:241-250; usunięte zadanie jest logowane w linii 249 (`zero_rows`), zadanie `done` to zwykła walidacja. Log w linii 213 dublowałby wpis. Bez zmian w kodzie.

### F5 — Trzy kopie pomocnika `notFound`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/tasks.ts:48-51 (oraz milestones.ts, projects.ts)
- **Detail**: Pomocniki różnią się tylko nazwą zakresu.
- **Fix**: Przenieść do `postgrest.ts` jako `notFound(scope, event, ctx)`.
- **Decision**: FIXED (wspólny `notFound(scope, event, ctx)` w postgrest.ts, trzy serwisy go importują; 181 testów zielone, lint i astro check czyste)
