---
change_id: observability-error-signals
title: Widoczne i diagnozowalne błędy produkcyjne (audyt obserwowalności)
status: implementing
created: 2026-10-30
updated: 2026-10-30
archived_at: null
---

## Notes

Make production errors visible and diagnosable, from audit context/audits/observability/2026-10-30_auth-today-list-project-writes.md (findings P1, P2, P3, P4, A5, L1, L4, W4): structured logError with cause/status/ids, middleware getUser error and createClient null logged, zero-row UPDATE/DELETE and 23503 and lost-race logged with ids and distinguished from a real not-found. Test-first (M3L5): failing regression test before each fix; never hide errors with empty catch or error-to-redirect.
