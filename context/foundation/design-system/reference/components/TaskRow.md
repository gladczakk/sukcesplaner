# TaskRow

One task in the today list: check, title, project · milestone line, deadline chip, actions.

**Provide:** title, project name + color, milestone name, deadline state, completion state. Wrap rows in `sp-list`.

- Row classes: `sp-task`, plus `--partial` (adds *· częściowo* after the title), `--done` (strike-through, shown only briefly before the row leaves the list), `--milestone` (a milestone whose tasks are all done; serif title, ochre-tinted ground, *Zamknij milestone* action).
- Actions (*Częściowo*, *Na jutro*) appear on hover or focus on desktop and are always visible on touch and under 560px.
- Sort order is the PRD's: nearest deadline first, overdue at the top, *bez terminu* last. Never hide an item silently (guardrail).
- End the list with the `sp-add` row *Dodaj zadanie do projektu…* (FR-008); it opens the add form that asks for project and milestone.
