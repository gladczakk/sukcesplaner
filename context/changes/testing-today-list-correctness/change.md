---
change_id: testing-today-list-correctness
title: Testy poprawności listy na dziś (test-plan, Faza 1)
status: implemented
created: 2026-10-26
updated: 2026-10-26
archived_at: null
---

## Notes

Rollout Phase 1 of context/foundation/test-plan.md: "Poprawność listy na dziś".
Risks covered: #1, #2, #3. Test types planned: integration, parametryczne granice dat; also initialize an app-level test runner and wire pgTAP tests into CI (gates "required after §3 Phase 1").
Risk response intent:
- #1: prove every unfinished task that meets the PRD qualification rule is on the today list and none disappears after an action or a day change.
- #2: prove ordering by nearest deadline (own or milestone's), tasks without a deadline last but visible; verify whether the early-warning guardrail is implemented at all.
- #3: prove the list depends on a single, consistent "today" source and that boundaries (midnight, timezone, last day of milestone or rhythm) give exactly the expected day; research must establish where "today" comes from and how to inject a date.
