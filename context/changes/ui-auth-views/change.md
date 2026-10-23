---
change_id: ui-auth-views
title: Widoki auth (signin, signup, confirm-email) — przegląd UI
status: impl_reviewed
created: 2026-10-23
updated: 2026-10-23
archived_at: null
---

## Notes

Widoki auth: /auth/signin, /auth/signup, /auth/confirm-email (src/pages/auth/*.astro + src/components/auth/*). Źródło tokenów: src/styles/global.css; wariant: istniejący system projektowy (context/foundation/design-system/design-system.md). Do rozważenia: FormField vs ui/Field+Input, ServerError vs InlineError, SubmitButton vs ui/Button, bg-cosmic (zostaje w global.css do zmiany #5, używają go dashboard i Welcome), outline-none w FormField, kontrast i tryb jasny/ciemny, kroki smoke dla auth (action=/api/auth/signin).
