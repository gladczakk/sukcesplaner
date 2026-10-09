<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Domenowy schemat danych (projects / milestones / tasks)

- **Plan**: context/changes/core-domain-schema/plan.md
- **Mode**: Deep (weryfikacja inline, bez sub-agenta)
- **Date**: 2026-10-09
- **Verdict**: REVISE → SOUND po poprawkach z triage
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
8/8 istniejących ścieżek ✓; createClient importowany przez middleware + 3 trasy auth ✓; Progress↔Phase 14/14 ✓; brief↔plan ✓; contract-surfaces.md i lessons.md nie istnieją (pominięte).

## Findings

### F1 — Remis dat milestonów nie ma deterministycznej kolejności

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — milestones, created_at
- **Detail**: FR-004: przy remisie dat decyduje kolejność utworzenia. `now()` zwraca czas startu transakcji, więc milestony z jednej transakcji mają równe `created_at`, a drugi klucz (uuid) jest losowy.
- **Fix A ⭐ Recommended**: kolumna `seq bigint generated always as identity`, indeks `(project_id, due_date, seq)`
- **Fix B**: default `created_at = clock_timestamp()`
- **Decision**: FIXED (Fix A)

### F2 — Brak jawnych GRANT dla roli authenticated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — migracja RLS
- **Detail**: Plan polega na domyślnych uprawnieniach Supabase dla `authenticated`; bez GRANT polityki są nieosiągalne. Niezweryfikowane (Docker nie działał).
- **Fix**: jawny `grant select, insert, update, delete … to authenticated`
- **Decision**: FIXED

### F3 — Ręczny krok 2 z Testing Strategy jest niewykonalny w Studio

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Testing Strategy — Manual Testing Steps, krok 2
- **Detail**: Studio SQL editor działa jako `postgres` bez JWT: `auth.uid()` = NULL, RLS omijane.
- **Fix**: jawny `user_id` istniejącego konta; RLS testuje wyłącznie pgTAP
- **Decision**: FIXED

### F4 — Brak .env / .dev.vars utrudnia kryteria 3.4 i 3.5

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Success Criteria
- **Detail**: build i smoke wymagają kluczy lokalnego Supabase i działającego `npm run preview`; plan o tym milczał.
- **Fix**: warunek wstępny w Overview Fazy 3
- **Decision**: FIXED

### F5 — Trigger updated_at i indeks (user_id, status) są spekulatywne

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 — triggery i indeksy
- **Detail**: PRD nie wymaga `updated_at`; kształt zapytania S-04 nieznany.
- **Fix**: usunąć indeks `(user_id, status)` (trigger `updated_at` zostaje)
- **Decision**: FIXED
