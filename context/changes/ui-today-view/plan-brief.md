# Widok /today — przegląd UI — Plan Brief

> Full plan: `context/changes/ui-today-view/plan.md`
> Research: `context/changes/ui-today-view/research.md`

## What & Why

Widok `/today` nie ma literałów, ale jest zbudowany „na płasko”: ten sam wiersz listy jest skopiowany cztery razy, styl linku z fokusem siedem razy, a komunikat błędu cztery razy w komponentach React. Wydzielamy te elementy do wspólnych komponentów ze spec, naprawiamy fokus i stan błędu oraz chronimy pliki widoku kontrolą literałów, żeby kolejne widoki (projekty, auth) odziedziczyły kontrakt.

## Starting Point

`today.astro` (275 linii) składa listę z 4 niemal identycznych `<li>` (l. 86, 118, 154, 228) plus wariantu milestona (l. 185). Linki z fokusem mają `outline-none` (7× w widoku). Chip „Pominięte wczoraj” jest zbudowany ręcznie obok `DueChip.astro`, a błąd ładowania strony to sam kolor bez ikony. `ui/button.tsx` ma `outline-none` (follow-up z `ui-app-shell`). Skan literałów widoku daje 0 trafień, a smoke ma 4 kroki `/today` z asercjami na treść.

## Desired End State

`/today` składa się z komponentów `TaskRow`, `TextLink`, `Chip` i `InlineError`; `today.astro` nie ma powielonych bloków wiersza ani wklejonych klas fokusu. Fokus jest widoczny także w trybie wysokiego kontrastu Windows, błędy mają ikonę i słowo „Błąd:”, a rytm powtarzalnego zadania ma ikonę (FR-018). Pliki widoku są pod `check:values` w pre-commit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wiersz listy | Komponent `TaskRow.astro` w `src/components/` | Spec ma osobny `TaskRow`, a widok projektów (zmiana #3) może go użyć. | Research |
| Chip | `Chip.astro` zastępuje `DueChip`, ikony Lucide | Jedna definicja pigułki zamiast trzech inline SVG i ręcznego chipa. | Research |
| Komunikat błędu | `InlineError` w `ui/`, ikona + „Błąd:” | Spójność z `Field` i koniec czterech kopii w widoku. | Research |
| `outline-hidden` w `button.tsx` | Tak, jedna klasa jako wyjątek od „jeden widok” | Bez tego fokus na przyciskach wiersza zniknie w trybie wysokiego kontrastu. | Plan |
| FR-018 | Ikona `Repeat` przy tekście rytmu w `TaskRow` | Powtarzalne zadanie jest rozpoznawalne, ikona + słowo zgodnie z DS. | Plan |
| `TaskCheck` | Odroczony; zostaje obecny układ przycisków | Zmiana interakcji to decyzja UX, nie poprawka stylu. | Plan |
| Rail, Banner guardrail, filtr, `ProjectDot` | Deferred bez nowego tematu teraz | Brak FR i brak koloru projektu w danych. | Research |
| Kontrola literałów | Rozszerzenie `check:values` i `lint-staged` o pliki widoku | Ten sam mechanizm co w `ui-app-shell`, bez nowej zależności. | Plan |

## Scope

**In scope:** `TextLink`, `Chip`, `TaskRow`, `InlineError`; przepisanie `today.astro`; 4 komponenty React w `today/*`; `outline-hidden` w `button.tsx`; rozszerzenie `check:values`; kitchen-sink, zrzuty, reguła w `CLAUDE.md`.

**Out of scope:** `TaskCheck`, rail milestonów, Banner guardrail, filtr obszarów, `ProjectDot`, widoki projektów i auth, pozostałe `ui/*`, zmiany logiki akcji i modelu danych.

## Architecture / Approach

Kolejność z `/10x-ui`: kontrola → komponenty → widok → stany. Kontrola literałów idzie pierwsza, więc każda następna faza ma dowód zielono-czerwony. Wspólne komponenty leżą w `src/components/` i `src/components/ui/`, a istniejące smoke kroki `/today` służą jako siatka regresji dla refaktoru markupu; testy zepsucia dowodzą, że wyspy i `TaskRow` faktycznie renderują się w HTML.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Kontrola i fokus bazowy | `check:values` + `lint-staged` dla plików widoku; `outline-hidden` w `button.tsx` | Zmiana wspólnego `Button` wpływa na wszystkie widoki (tylko w forced-colors) |
| 2. Komponenty współdzielone | `TextLink`, `Chip`, `InlineError` + podmiana błędu w 4 wyspach | Błąd SSR wyspy połykany (status 200); mitygacja: test zepsucia z `throw` |
| 3. TaskRow i `today.astro` | Widok ze wspólnych komponentów, ikona rytmu, błąd ładowania z ikoną | Regresja wyglądu wierszy; smoke i ręczne porównanie |
| 4. Stany i reguła | Kitchen-sink, zrzuty, macierz 7 stanów, `CLAUDE.md` | Zrzuty robione ręcznie (brak Playwrighta) |

**Prerequisites:** brak (`ui-app-shell` zarchiwizowany, tokeny i `lucide-react` już w repo; do testów lokalnych Docker i `npx supabase start`).
**Estimated effort:** ~2–3 sesje, 4 małe fazy.

## Open Risks & Assumptions

- Przeniesienie fokusu na `outline-hidden` w `Button` zmienia zachowanie tylko w trybie forced-colors; wygląd zwykły nie powinien się zmienić (do potwierdzenia ręcznie w kroku 1.7).
- Nagłówek milestona zmienia grubość z 500 na 600 (`type-section` zamiast `font-medium`); to zamierzona zmiana, widoczna na zrzutach.
- Kopie chipa i błędu w widokach projektów zostają do zmiany #3, więc przez jakiś czas istnieją dwie definicje.

## Success Criteria (Summary)

- `today.astro` nie zawiera skopiowanych bloków wiersza ani `outline-none`, a smoke dla `/today` przechodzi bez zmian oczekiwań.
- Błędy (akcji i ładowania listy) mają ikonę i słowo „Błąd:”, a fokus jest widoczny także w trybie wysokiego kontrastu.
- Pliki widoku są chronione przez `check:values`; kitchen-sink i `CLAUDE.md` wskazują kolejnemu agentowi komponenty i kontrolę.
