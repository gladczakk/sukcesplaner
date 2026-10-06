# Chip

Deadline chips say how urgent a task is; filter chips switch the life-area filter (FR-013).

**Deadline chip** `sp-chip` + one state, always with icon *and* a word so color is never the only signal:

| state | class | label | when |
|---|---|---|---|
| overdue | `sp-chip--overdue` | *wczoraj*, *2 dni po terminie* | deadline passed |
| today | `sp-chip--today` | *dziś* | deadline is today |
| tomorrow | `sp-chip--tomorrow` | *jutro* | deadline tomorrow |
| date | (none) | *czw, 8 paź* / *za 2 dni* | later |
| none | `sp-chip--none` | *bez terminu* | task has no own deadline (sorted last, FR-010) |
| done | `sp-chip--done` | *zrobione* | confirmations, project view |

**Filter chip** `sp-chip sp-chip--filter` as a `<button aria-pressed>`; the group is *Wszystko · Dom · Sport · Praca*. One pressed at a time.
