<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testy poprawności listy na dziś (test-plan, Faza 1)

- **Plan**: context/changes/testing-today-list-correctness/plan.md
- **Scope**: Full plan (4 of 4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated criteria re-run during review: `test:app` 27/27, `test:unit` 33/33, `test:db` 11 files / 340 tests, lint and `astro check` 0 errors, both CI steps present. Production code untouched (`git diff ddcbf37..HEAD -- src supabase/migrations` shows only `src/lib/today.test.ts`).

## Findings

### F1 — The two time zone tests are byte-identical and cannot fail on a zone change

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_today_list_days.test.sql:160-207
- **Detail**: `today_list(date)` takes a date literal and (per the structural guard) uses no clock, so `set local timezone` cannot change its result. The two blocks run the same query with the same hand-written table under Pacific/Kiritimati and Etc/GMT+12, so the same expectation is asserted twice. The comment says "wszystkie rodzaje wierszy", but the dataset has no recurring tasks, so only task, milestone and deferred appear. This also contradicts the test-plan §6.3 claim "bez kopii per dzień".
- **Fix**: Keep one time zone block as a regression guard (or loop both zones over a shared query) and correct the comment to name the covered kinds; adjust `plan(n)`.
- **Decision**: FIXED — Fix now (jeden blok strefy, poprawiony komentarz, plan(12))

### F2 — Structural guard for the clock is incomplete

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_today_list_days.test.sql:211-215
- **Detail**: The regex catches `current_date`, `now()` and `current_timestamp` but not `clock_timestamp()`, `statement_timestamp()`, `transaction_timestamp()`, `localtimestamp`, `current_time`, `timeofday()` or `'now'::date`. It also scans `prosrc` including comments, so a comment containing `now()` would cause a false failure.
- **Fix**: Widen the pattern (for example `current_(date|time|timestamp)|localtime(stamp)?|now\s*\(|(clock|statement|transaction)_timestamp|timeofday|'now'|'today'`) and strip `--` comments before matching.
- **Decision**: FIXED — Fix now (poszerzony wzorzec, odcięte komentarze `--`; potwierdzone testem zepsucia z `localtimestamp`)

### F3 — Sweep has no positive control

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_today_list_days.test.sql:74-103
- **Detail**: The sweep counts missing (day, task) pairs over a task set chosen by title. A typo in the `in (...)` list silently shrinks the checked set and `count = 0` still passes. Sweeps 3 and 4 (`kind <> ...` count 0) would also pass if `a-odlozone` were absent from every list; only the 3-row `results_eq` covers presence indirectly.
- **Fix**: Add an assertion that the title list matches exactly 10 tasks (`select is((select count(*) from public.tasks where title in (...)), 10::bigint)`), and one that `a-odlozone` appears at least once in the sweep; update `plan(n)`.
- **Decision**: FIXED — Fix now (kontrola pozytywna: 10 zadań i obecność a-odlozone w sweepie)

### F4 — test-plan §6.7 note names the wrong test and inverts the reasoning

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/foundation/test-plan.md §6.7
- **Detail**: It says "istniejący test kolejności opiera się na `row_number`", but `row_number() over ()` appears only in the new `core_domain_today_list_days.test.sql`, not in the existing sibling test. The consequence is also inverted: if the function stopped returning ordered rows, the new test would fail (flake risk), not stop guarding.
- **Fix**: Reword to: the new ordering test reads row order through `row_number() over ()` without an ORDER BY, so a planner change could make it fail spuriously; the order is currently guaranteed by the function's total ORDER BY.
- **Decision**: FIXED — Fix now (przeredagowana notatka §6.7 i opis strażnika w §6.3)

### F5 — Ordering test depends on `row_number() over ()` without ORDER BY

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/core_domain_today_list_days.test.sql:143-158
- **Detail**: Verdict from review: not a vacuity risk and not a real flake risk today. The function ends in a total ORDER BY and is `strict` and non-inlinable, so order is preserved in practice; the SQL standard does not guarantee it. The failure direction is a spurious red, not a false green. Both days (10-26 and 10-29) yield the same list, so the test adds little over the single-date `results_eq` except the "same on two days" property.
- **Fix**: Add a one-line comment in the SQL naming the dependency (F4 documents it in the test-plan).
- **Decision**: FIXED — Fix now (komentarz w SQL nazywający zależność od row_number)

### F6 — Two Progress rows remain open

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-today-list-correctness/plan.md (rows 3.6 and 4.3)
- **Detail**: 3.6 (green `smoke` job on a PR with `supabase test db`) was never executed: the repository has no remote and the account cannot create one (enterprise-managed user). 4.3 (`prettier --check` on `test-plan.md` and `CLAUDE.md`) cannot pass: both files already failed it at HEAD before this change. Unverified from the repo: the first CI run of the 10 existing pgTAP files may expose latent breakage, and `supabase/setup-cli@v1` uses `version: latest` (pre-existing, not pinned).
- **Fix A ⭐ Recommended**: Accept both as known risks and keep them as warnings for `/10x-archive`; re-run 3.6 when a remote exists.
  - Strength: Honest about what was not verified; no unrelated reformatting.
  - Tradeoff: CI wiring stays unproven until a first push.
  - Confidence: HIGH — the same commands pass locally.
  - Blind spot: Behaviour of `supabase start -x ...` plus `test db` on a CI runner.
- **Fix B**: Reformat both markdown files with Prettier in a separate commit to close 4.3.
  - Strength: Closes the row mechanically.
  - Tradeoff: Touches many unrelated lines in a shared foundation file.
  - Confidence: MEDIUM — depends on whether the formatting churn is acceptable to the team.
  - Blind spot: Whether lint-staged already rewrites these files on commit.
- **Decision**: ACCEPTED — Fix A: znane ryzyko; wiersze 3.6 i 4.3 zostają otwarte jako ostrzeżenia dla /10x-archive
