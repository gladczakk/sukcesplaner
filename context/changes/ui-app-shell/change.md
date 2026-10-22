---
change_id: ui-app-shell
title: Szkielet aplikacji — przegląd UI (layout, topbar, banner)
status: impl_reviewed
created: 2026-10-22
updated: 2026-10-22
archived_at: null
---

## Notes

Zmiana wizualna prowadzona przez `/10x-ui` (1 z 5 w serii: szkielet → /today → projekty → auth → dashboard/index/Welcome).

- **Widok:** szkielet aplikacji — `src/layouts/AppLayout.astro`, `src/components/Topbar.astro`, `src/components/Banner.astro` (oraz `Layout.astro`, jeśli dotyczy tokenów/dark mode).
- **Wariant kontraktu:** istniejący system projektowy — spec `context/foundation/design-system/design-system.md`.
- **Źródło tokenów:** `src/styles/global.css` (`:root` / `.dark`, publikowane przez `@theme inline`); lustro w `context/foundation/design-system/tokens/tokens.json`.
- **Komponenty:** `src/components/ui/` (shadcn, "new-york"); bez drugiego `Button`, bez drugiego `shadcn init`.
- **Skan wstępny (literały):** Topbar 7, Banner 9, AppLayout 0.
