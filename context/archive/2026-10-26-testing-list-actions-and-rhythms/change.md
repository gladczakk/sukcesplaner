---
change_id: testing-list-actions-and-rhythms
title: Testy akcji na liście i zmiany rytmu (test-plan, Faza 2)
status: archived
created: 2026-10-26
updated: 2026-10-27
archived_at: 2026-10-27T10:43:26Z
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Akcje i rytmy".
Risks covered: #4, #5. Test types planned: integration, hermetyczne stuby częściowych błędów.
Risk response intent:
- #4: prove that after every list action (zrobione, częściowo, na jutro, przeniesienie lub pominięcie wystąpienia) the task state and the next day's list agree with the PRD; challenge "the action returned success, so the state is correct"; verify whether the write sequence is atomic and how a partial failure is handled; avoid over-mocking internals instead of asserting the end state.
- #5: prove that after a rhythm change or disabling recurrence the "done" marks stay and future occurrences follow the new rhythm; challenge "a rhythm change is a one-field edit"; ground the fate of moves and skipped occurrences on rhythm change (open unknown from the roadmap); avoid redundant copies of the same case.
Phase 1 already shipped vitest (npm run test:app) and pgTAP in CI (npm run test:db); see §4 and §6 of the test plan.
After creating the folder, follow the downstream continuation rule.
