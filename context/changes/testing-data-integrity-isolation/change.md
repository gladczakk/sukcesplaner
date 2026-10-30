---
change_id: testing-data-integrity-isolation
title: Testy spójności danych i izolacji kont (Faza 3 rolloutu)
status: implemented
created: 2026-10-27
updated: 2026-10-30
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Spójność danych i izolacja".
Risks covered: #6, #7. Test types planned: integration (rozszerzenie testów bazy i RLS).
Risk response intent:
- #6: po usunięciu lub edycji lista pokazuje właściwy, najbliższy niezamknięty milestone i zgodne zadania (reguły zamykania i kaskady po stronie bazy; bez mocka bazy, który kłamie o kaskadach).
- #7: użytkownik B nie czyta ani nie zmienia danych użytkownika A, także przez bezpośrednie wywołanie API (rozszerzenie istniejącego testu RLS; nie testować tylko na jednym koncie).
After creating the folder, follow the downstream continuation rule.
