# Szkielet aplikacji — przegląd UI — Plan Brief

> Full plan: `context/changes/ui-app-shell/plan.md`
> Research: `context/changes/ui-app-shell/research.md`

## What & Why

Szkielet aplikacji (górna belka z nawigacją i komunikat o braku konfiguracji) nie czyta tokenów systemu projektowego: `Banner` ma 9 literałów hex, a nawigacja nie ma widocznego fokusu ani celów dotykowych ≥40 px. Naprawiamy to jako pierwszą z pięciu zmian wizualnych, żeby kolejne widoki dziedziczyły kontrakt zamiast literałów.

## Starting Point

`AppLayout.astro` jest już na tokenach, ale jego linki są ręcznie składane. `Banner.astro` używa pastelowych kolorów hex, które w trybie ciemnym nie reagują na `.dark`. Pre-commit uruchamia tylko `eslint --fix`; zakaz literałów jest wyłącznie w `CLAUDE.md`. Wszystkie potrzebne tokeny istnieją w `src/styles/global.css`.

## Desired End State

Komunikat o braku konfiguracji jest czytelny w obu motywach, z ikoną. Nawigacja ma pigułki z wyraźnym stanem aktywnym, pierścień fokusu z klawiatury i cele ≥40 px, a belka zawija się przewidywalnie na 390 px. Zatwierdzenie pliku szkieletu z literałem jest blokowane w pre-commit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Kształt nawigacji | Górna belka z poprawkami | Sidebar + tab bar zmienia ramy wszystkich stron i grozi MVP-too-big w jednej zmianie. | Plan |
| Warianty Banner | Tylko error | Martwy kod znika; Banner milestona wróci w zmianie #2 (`/today`). | Plan |
| Przełącznik motywu | Poza zakresem | Spec nie wymaga, motyw dalej z OS lub `localStorage.theme`. | Plan |
| `Topbar.astro` | Deferred do zmiany #5 | Jedyny konsument (`Welcome.astro`) leży poza szkieletem. | Research |
| `bg-cosmic` | Deferred do zmian #4 i #5 | Używają go auth, dashboard i Welcome, nie szkielet. | Research |
| Kontrola literałów | Skrypt w repo + `lint-staged` | Nie wymaga nowej zależności i działa tylko na plikach szkieletu. | Plan |
| Bramka wizualna | Kitchen-sink tylko w DEV | W repo nie ma Playwrighta, a strona jest tańsza niż instalacja runnera. | Plan |

## Scope

**In scope:** skrypt kontroli literałów; `Banner` na tokenach z ikoną; komponent `NavLink` i poprawka belki na mobile; kitchen-sink w DEV; zrzuty desktop + 390 px w jasnym i ciemnym motywie; dwie linie w `CLAUDE.md`.

**Out of scope:** sidebar i tab bar, przełącznik motywu, `Topbar`, `bg-cosmic`, warianty `info`/`warning`, kalendarz, nowa zależność lintera.

## Architecture / Approach

Kolejność ze skilla `/10x-ui`: kontrola → tokeny → widok → stany. Kontrola literałów jest pierwsza, więc faza 2 ma czerwono-zielony dowód. Nowe wartości w `global.css` nie są potrzebne; nawigacja powtarza wzorzec fokusu z `button.tsx`, bez drugiego `Button`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Kontrola literałów | `check:values` + wpis w `lint-staged` dla plików szkieletu | Zbyt szeroki wzorzec daje fałszywe trafienia |
| 2. Banner na tokenach | `Banner` bez literałów, tylko error, z ikoną | Selektor linków w slocie bez bloku `<style>` |
| 3. Nawigacja | `NavLink` (fokus, aktywna pigułka, ≥40 px) + belka na 390 px | Zawijanie belki zmierzone dopiero w ręcznym teście |
| 4. Stany i reguła | Kitchen-sink DEV, zrzuty, macierz 7 stanów, reguła w `CLAUDE.md` | Strona DEV przypadkiem dostępna na produkcji |

**Prerequisites:** brak (M-2 zamknięty, tokeny i `lucide-react` już w repo).
**Estimated effort:** ~2 sesje, 4 małe fazy.

## Open Risks & Assumptions

- Wpływ zawijania belki na 390 px nie był mierzony na uruchomionej aplikacji; potwierdzą to zrzuty z fazy 4.
- `Topbar` zostaje z literałami do zmiany #5, więc `/` nadal wygląda inaczej niż reszta aplikacji.
- Zakładamy, że `lint-staged` poprawnie przekazuje staged pliki do skryptu (do sprawdzenia w kroku 1.5).

## Success Criteria (Summary)

- Skan literałów jest zielony dla wszystkich plików szkieletu, a pre-commit blokuje regresję.
- Nawigacja i komunikat o konfiguracji są czytelne i dostępne z klawiatury w obu motywach, także przy 390 px.
- `CLAUDE.md` wskazuje kolejnemu agentowi kontrolę i kitchen-sink.
