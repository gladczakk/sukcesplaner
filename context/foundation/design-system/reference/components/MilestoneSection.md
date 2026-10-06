# MilestoneSection

A milestone on the project timeline, with its tasks inside (project view).

**Provide:** name, date, state, tasks with their own deadlines, counts.

- Wrap sections in `sp-timeline` (vertical hairline, diamonds on it). `sp-mss` states: `--done` (muted name, *zamknięty 30 wrz* chip, tasks collapsed behind *Pokaż N zadań*), `--current` (the nearest open milestone, filled diamond, tasks expanded), default = planned (outlined diamond, collapsed), `--late` (brick diamond, add a *po terminie* chip, FR-015).
- Info line: progress bar + *2/6 zadań* + overdue count in `brick-ink`.
- In the project view task rows drop the project/milestone meta line; show *własny termin* only when the task has its own deadline.
- A milestone without tasks is valid (FR-004): show the dashed `sp-empty` note.
- End expanded lists with *Dodaj zadanie do milestona…*.
