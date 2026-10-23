# Widoki /projects i /projects/[id] — przegląd UI — Plan Brief

> Full plan: `context/changes/ui-projects-views/plan.md`
> Research: `context/changes/ui-projects-views/research.md`

## What & Why

Widoki projektów nie mają literałów, ale nadal budują „na płasko” to, co dwie poprzednie zmiany wydzieliły do wspólnych komponentów: komunikat błędu jest skopiowany w 5 komponentach i w `ConfirmDialog`, chip „zamknięty” jest zrobiony ręcznie, a linki mają `outline-none` albo nie mają fokusu w ogóle. Przepinamy widoki na `InlineError`, `TextLink`, `Chip` i `TaskRow`, domykamy odroczone follow-upy (fokus w `ui/*`, stan `aria-disabled`) i obejmujemy pliki kontrolą literałów.

## Starting Point

Skan literałów 10 plików daje 0 trafień; żaden z nich nie importuje wspólnych komponentów z `ui-today-view`. Sześć kopii bloku błędu (dwie bez słowa „Błąd:”), trzy błędy ładowania stron tylko kolorem, siedem `outline-none` w sześciu plikach `ui/`, sześć kopii klasy `aria-disabled:` i ręczny chip w `[id].astro:138`. Smoke ma bogate kroki dla `/projects/[id]` (nazwy zadań, „zamknięty”, „Edytuj zadanie …”), więc służy jako siatka regresji.

## Desired End State

Strony i komponenty projektów używają `InlineError`, `TextLink`, `Chip` (z tonem `done`) i `TaskRow` (z wariantem `compact`); każdy błąd ma ikonę i „Błąd:”; fokus jest widoczny w trybie wysokiego kontrastu także w polach i dialogach; stan `aria-disabled` jest zdefiniowany raz w `Button`, a akcje wierszy mają `aria-busy`; pliki widoków projektów są pod `check:values` w pre-commit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| `outline-hidden` w `ui/*` | Tak, 6 plików (7 miejsc) jako wyjątek od „jeden widok” | Pola formularzy i dialogi tracą fokus w forced-colors; domyka follow-up F3. | Plan |
| `aria-disabled:` w `Button` | Tak, w bazie + usunięcie 6 kopii + `aria-busy` w akcjach wierszy | Jedna definicja stanu „pending”, czytnik ekranu wie, że akcja trwa. | Plan |
| `TaskRow` w widoku projektu | Wariant `compact` + prop `done` | Jedna definicja wiersza zadania w aplikacji; zamyka zapowiedź z `ui-today-view`. | Plan |
| `ui/field.tsx` | Bez zmian | Ma osobną odpowiedzialność (powiązanie błędu z polem przez `id`); mniejsza powierzchnia regresji a11y. | Plan |
| Chip „zamknięty” | Ton `done` w `Chip` z ikoną `Check` | Usuwa ręczną pigułkę i inline SVG; zgodne z `Chip.md`. | Research |
| Błędy ładowania stron | `InlineError role="status"` | Treść statyczna przy ładowaniu; spójne z F1 `ui-today-view`. | Research |
| Kontrola literałów | Strony, 8 komponentów `projects/*` i `confirm-dialog` do `check:values` i `lint-staged` | Ten sam mechanizm co w poprzednich zmianach; nawias w `[id].astro` wymaga ucieczki w globie. | Plan |
| Oś czasu, postęp, `ProjectDot`, „po terminie”, `TaskCheck`, eyebrow listy | Deferred | Wyłączone w planach archiwalnych i PRD, brak koloru w danych, lista bez specyfikacji. | Research |

## Scope

**In scope:** `Chip done`, `TaskRow compact` i `done`, `InlineError` w `ConfirmDialog` i 5 komponentach `projects/*`, `aria-busy`, `TextLink` i `Chip`/`TaskRow` w stronach, `outline-hidden` w 6 plikach `ui/`, style `aria-disabled:` w `Button` (z usunięciem 6 kopii), rozszerzenie `check:values`, kitchen-sink, zrzuty, reguła w `CLAUDE.md`.

**Out of scope:** `MilestoneSection`/postęp/`ProjectDot`/„po terminie”/`TaskCheck`, `ui/field.tsx`, eyebrow listy, wspólny hook maszyny stanów w dialogach, `auth/FormField.tsx`, rozmiar `size="sm"`, zmiany logiki i danych.

## Architecture / Approach

Kolejność z `/10x-ui`: kontrola → komponenty → widok → stany. Faza 1 daje ochronę i dwie zmiany współdzielone, faza 2 rozszerza wspólne komponenty i podmienia błędy, faza 3 składa obie strony, faza 4 daje bramkę wizualną i regułę. Smoke dla stron projektów jest siatką regresji; testy zepsucia (`throw` w `InlineError`, brak slotu `end` w `TaskRow`) dowodzą, że wyspy i wiersze renderują się w HTML.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Kontrola, fokus i stan Button | `check:values` + `lint-staged` dla projektów; `outline-hidden` w 6 plikach `ui/`; `aria-disabled:` w `Button` | Zmiany wspólnych komponentów wpływają na `/today` i auth (tylko forced-colors / stan disabled) |
| 2. Komponenty i błędy w wyspach | `Chip done`, `TaskRow compact`, `InlineError` w 6 plikach, `aria-busy` | Błąd SSR wyspy połykany (status 200); mitygacja: test zepsucia z `throw` |
| 3. Strony projektów | `index.astro` i `[id].astro` ze wspólnych komponentów | Regresja wyglądu wierszy zadań; smoke + ręczne porównanie |
| 4. Stany i reguła | Kitchen-sink, zrzuty, macierz 7 stanów, `CLAUDE.md` | Zrzuty robione ręcznie (brak Playwrighta) |

**Prerequisites:** brak (`ui-app-shell` i `ui-today-view` zarchiwizowane; do testów lokalnych Docker i `npx supabase start`).
**Estimated effort:** ~3 sesje, 4 fazy (faza 3 jest największa).

## Open Risks & Assumptions

- Link „Projekty” w nagłówku `[id].astro` dostaje podkreślenie i `min-h-10` (zamierzona zmiana wyglądu przy użyciu `TextLink standalone`); do potwierdzenia ręcznie w kroku 3.9.
- Wariant `compact` zachowuje układ wiersza zadania, ale kontener `end` jest teraz wspólny z `default` (wyrównanie akcji do prawej od `sm`); do sprawdzenia na zrzutach.
- Zmiana `Button` (`aria-disabled:`) dotyka wszystkich widoków; efekt tylko dla `aria-disabled="true"`.
- `ui/field.tsx` zachowuje własną kopię markupu błędu, więc w aplikacji zostają dwie definicje (Field i InlineError) do czasu osobnej decyzji.

## Success Criteria (Summary)

- Strony projektów nie zawierają `outline-none`, ręcznego chipa, inline SVG ani skopiowanego bloku błędu; smoke dla `/projects` i `/projects/[id]` przechodzi bez zmian oczekiwań.
- Każdy błąd (akcji, potwierdzenia usunięcia, ładowania stron) ma ikonę i słowo „Błąd:”, a fokus jest widoczny także w trybie wysokiego kontrastu, w tym w polach i dialogach.
- Pliki widoków projektów są chronione przez `check:values`; kitchen-sink i `CLAUDE.md` wskazują kolejnemu agentowi komponenty i kontrolę.
