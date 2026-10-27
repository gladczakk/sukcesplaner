<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testy akcji na liście i zmiany rytmu

- **Plan**: context/changes/testing-list-actions-and-rhythms/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run in this review: `npm run test:app` 76 passed, `npm run test:db` PASS (13 files, 389 tests), `npm run lint` clean, `npx astro check` no errors, `describe(` count in tasks.test.ts = 6, no production code changed (only `src/lib/services/tasks.test.ts` under `src`, nothing under `supabase/migrations`).

## Findings

### F1 — Stub ignores the arguments of `.eq()`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/tasks.test.ts:112
- **Detail**: `eq: () => builder` drops its arguments; only `neq` is recorded. Removing `.eq("milestone_id", …)` from the writes in `tasks.ts` or `.eq("project_id", …)` from `findMilestone` keeps every test green, while the real UPDATE/DELETE would touch a task from another milestone.
- **Fix**: Record `eq` calls like `neq` and assert them for one write per function (`lastWrite` has `eq: [["id","t1"],["milestone_id","m1"]]`; `findMilestone` got `project_id`).
  - Strength: Closes the only silent-green path in the stub for ownership filters.
  - Tradeoff: Every existing write assertion gains an `eq` expectation; some churn in the test file.
  - Confidence: HIGH — confirmed in the stub source.
  - Blind spot: RLS in the real DB already limits cross-account writes, so the exposure is cross-milestone within one account.
- **Decision**: FIXED via Fix now: stub records eq filters, new describe 'ownership filters' (6 cases); break-checks (drop milestone_id in deleteTask, drop project_id in findMilestone) went red, production restored

### F2 — Rhythm-field mapping of the start-date error is untested

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/tasks.test.ts (updateTask block ~442-458); production tasks.ts:195
- **Detail**: `write()` passes `rhythmField` to `translateError`: `recurrence_weekdays` for weekday input, otherwise `recurrence_interval_days`. No test reaches the "Powtarzanie zadania nie moze zaczac sie ..." branch in the service (`grep` finds none), so hard-coding the field stays green and the form would show the error under the wrong input.
- **Fix**: Add one `it.each` with 23514 and that message, asserting `fieldErrors` on `recurrence_weekdays` for weekday input and on `recurrence_interval_days` for interval input.
- **Decision**: FIXED via Fix now: it.each (weekdays / interval) for the start-date error field in updateTask; break-check (hardcoded rhythmField) went red, production restored

### F3 — Assertion 16 (`is_empty`) has no positive control

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_recurring_rhythm_change_edges.test.sql:190
- **Detail**: `today_list` returns nothing for a closed milestone regardless of rhythm, so the assertion passes even if the rhythm change did nothing. The other `is_empty` checks have a preceding positive control.
- **Fix**: Add a control for the same change on an open milestone (or an assertion before closing that a `routine` exists on 10-26), bumping `plan(n)`.
- **Decision**: FIXED via Fix now: open-milestone twin task 06 + positive control (16a), plan(25); break-check (today_list without completed_at filter) turns (16) red while the control stays green, original restored

### F4 — test-plan §6.4 overstates two claims

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md §6.4 (lines for "Granica zmiany rytmu" and "Oracle")
- **Detail**: (a) "test F i `edges` pinują `>=` z obu stron" is wrong: both pin the boundary only on the target day (`moved_to`); the source-side `>=` is redundant because the target is always later than the source. (b) §6.4 says S-05 rules are labelled "reguła projektowa, nie PRD" in file headers, but `tasks.test.ts` has no oracle header and no S-05 mention; the SQL header cites "decyzje S-05" without "not PRD". This is also the plan's stated requirement for Phase 1/2.
- **Fix**: Reword (a) to "pinują granicę `>=` na dniu docelowym"; add a short oracle header to `tasks.test.ts` and "(reguła projektowa, nie PRD)" to the SQL header.
- **Decision**: FIXED via Fix now: §6.4 reworded (>= pinned on the target day), oracle header in tasks.test.ts, S-05 'not PRD' label in the SQL header

### F5 — Some service error branches have no test

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/tasks.test.ts (moveOccurrenceToTomorrow, updateTask); tasks.ts:374-376
- **Detail**: `task_occurrences_moved_to_check` and `task_occurrences_moved_shape` branches, a failing first `tasks.select` read in `updateTask`/`completeOccurrence`/`moveOccurrenceToTomorrow`, and `23503` → `not_found` are not covered.
- **Fix**: One `it.each` row per branch, or skip as low impact.
- **Decision**: FIXED via Fix now: it.each rows for moved_to_check, moved_shape, 23503 -> not_found and a failing first read (3 functions); break-checks for moved_shape, 23503 and the read error went red, production restored

### F6 — `console.error` from `logError` is muted, never asserted

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/tasks.test.ts:136-139
- **Detail**: Dropping `logError` in `translateError` would go unnoticed, against the project's "never hide evidence" rule.
- **Fix**: In one generic-failure and one session-expired case assert that `console.error` was called.
- **Decision**: FIXED via Fix now: consoleError spy asserted for a generic failure and an expired session; break-check (logError removed) went red, production restored

### F7 — Oracle for assertion 11 not cited in its comment

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/database/core_domain_recurring_rhythm_change_edges.test.sql:152-157
- **Detail**: The pre-start moved row is kept but hidden on the list; PRD "from today" does not say it must be hidden. §7 and §6.7 already record this, the test comment does not mark it as pinned current behaviour (as the r2 block does).
- **Fix**: Add one comment line: "pins current behaviour; PRD silent".
- **Decision**: FIXED via Fix now: one comment line marking assertion 11 as pinned current behaviour, PRD silent
