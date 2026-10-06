# CalendarMonth

The month grid of the Kalendarz screen: deadlines across all projects, never a daily plan (PRD non-goal: no task lists for other days).

**Provide:** month, today, selected day, milestones per day (name, project color, done/late), project end dates, number of task deadlines per day.

- Week starts on Monday; weekday labels *pon … niedz* (phone: one letter).
- Cell `sp-cal__day` (`--out` other month, `--weekend`, `--today` on `river` with a filled number, `--selected` `kensington-soft` + 2px `kensington` ring).
- Milestone `sp-cal__ms` = diamond in project color + name, truncated with ellipsis, full name in `title`; `--done` struck through, `--late` brick ring, `--project` dark pill for a project's end date. Max 2 per cell, then *+N więcej*.
- Task deadlines only as a count: *1 termin zadania*, *2 terminy zadań*, *5 terminów zadań* (Polish plurals).
- Phone `sp-cal--compact`: 52px cells, diamonds and a dot for task deadlines only; the selected day's details go below the grid.
- Clicking a day selects it and fills the side panel.
