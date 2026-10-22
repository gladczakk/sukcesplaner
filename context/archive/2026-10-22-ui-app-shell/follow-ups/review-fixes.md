# Follow-ups z przeglądu ui-app-shell

- **F3 (część B, odroczona)**: `src/components/ui/button.tsx:8` i inne komponenty `ui/` używają `outline-none` + pierścień z box-shadow; w trybie wysokiego kontrastu Windows (forced-colors) fokus znika. Szkielet (NavLink, Banner, logo w AppLayout) przeszedł już na `outline-hidden`. Ujednolicić `ui/` przy najbliższej zmianie dotykającej wspólnych komponentów (np. `/10x-ui` dla widoku używającego dialogów) i zweryfikować na żywo w trybie wysokiego kontrastu.
