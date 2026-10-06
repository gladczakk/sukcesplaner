# ProjectView

Widok projektu at desktop width: header, milestone timeline, details rail.

Header: back link *Projekty*, project dot + eyebrow *Projekt · {obszar}*, name in `display`, description in `quote`, project deadline and *1/5 milestonów zamkniętych*; actions *Edytuj* and primary *Dodaj milestone*. Timeline of `MilestoneSection`s by date. Rail: `sp-panel` *Szczegóły* (obszar życia, termin, kolor swatches, counts, progress) and a ghost *Usuń projekt…* in `brick-ink` that opens `ConfirmDialog`. If the project deadline has passed with open milestones, add a *po terminie* chip next to the eyebrow (FR-015).
