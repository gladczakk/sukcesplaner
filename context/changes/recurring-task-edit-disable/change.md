---
change_id: recurring-task-edit-disable
title: Recurring task edit disable
status: implemented
created: 2026-10-20
updated: 2026-10-21
archived_at: null
---

## Notes

### Decyzje produktowe (Karolina, 2026-10-21) — odpowiedzi na pytania z research.md

1. Czym jest zadanie po wyłączeniu powtarzania? — **usunięte**.
2. Dzisiejsze wystąpienie po wyłączeniu? — **nie zostaje; przy wyłączeniu usuwamy**.
3. Zmiana „co X dni” zeruje kotwicę na dziś? — **tak**.
4. „Pominięte wczoraj” po zmianie rytmu? — **zmiana rytmu usuwa pominięte**.
5. Przyszłe przeniesienia przy zmianie rytmu? — **usuwać**.
6. Zmiana rytmu, gdy dzisiejsze wystąpienie jest zrobione lub przeniesione? — **dozwolona, ale zrobionego nie usuwamy**.
7. Skąd można zmienić rytm? — **tylko z formularza zadania** (nie z listy na dziś).
8. Zmiana typu rytmu i ponowne włączenie? — **dozwolone**.

Do rozstrzygnięcia w /10x-plan: punkt 1 („usunięte”) koliduje z PRD v2 (AC: „Wyłączenie powtarzania zachowuje historię i dzisiejsze wystąpienie”) i z punktem 6 („zrobionego nie usuwamy”), bo usunięcie zadania kasuje kaskadą wszystkie jego odhaczenia w task_occurrences.
