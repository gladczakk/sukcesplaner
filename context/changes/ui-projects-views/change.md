---
change_id: ui-projects-views
title: Widoki /projects i /projects/[id] — przegląd UI
status: impl_reviewed
created: 2026-10-23
updated: 2026-10-23
archived_at: null
---

## Notes

Widoki /projects i /projects/[id] (src/pages/projects/index.astro, src/pages/projects/[id].astro + src/components/projects/*). Źródło tokenów: src/styles/global.css; wariant: istniejący system projektowy (context/foundation/design-system/design-system.md). Do rozważenia: użycie wspólnych komponentów z ui-today-view (TaskRow, Chip, TextLink, InlineError), outline-hidden w pozostałych ui/*, kopia chipa sukcesu w [id].astro, ProjectDot/FR-015 poza zakresem.
