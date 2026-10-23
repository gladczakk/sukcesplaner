---
change_id: ui-starter-cleanup
title: Usunięcie pozostałości startera (dashboard, strona główna, Topbar, bg-cosmic)
status: archived
created: 2026-10-23
updated: 2026-10-23
archived_at: 2026-10-23T19:27:30Z
---

## Notes

Usunięcie pozostałości startera: /dashboard (src/pages/dashboard.astro), strona główna / (src/pages/index.astro + src/components/Welcome.astro), src/components/Topbar.astro i utility bg-cosmic z src/styles/global.css (ostatni konsument). Decyzja: usunąć, nie przepisywać. / przekierowuje: zalogowany -> /today, niezalogowany -> /auth/signin. Do zmiany: PROTECTED_ROUTES w src/middleware.ts, kroki smoke (scripts/smoke.mjs: dashboard redirects anonymous user, dashboard renders for signed-in user, dashboard redirects after signout), CLAUDE.md "Protected page example" (-> src/pages/today.astro), redirect w src/pages/api/auth/signout.ts (/ -> /auth/signin), wpisy bg-cosmic w CLAUDE.md. Źródło tokenów: src/styles/global.css; wariant: istniejący system projektowy (context/foundation/design-system/design-system.md).
