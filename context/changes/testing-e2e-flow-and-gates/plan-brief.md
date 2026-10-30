# Jeden przepływ e2e i bramki jakości — Plan Brief

> Full plan: `context/changes/testing-e2e-flow-and-gates/plan.md`
> Research: `context/changes/testing-e2e-flow-and-gates/research.md`

## What & Why

Dowodzimy w przeglądarce jednego krytycznego przepływu (logowanie → projekt → milestone → zadania z listy → akcje „Częściowo", „Na jutro", „Zrobione") i utrwalamy bramki: krok e2e w CI oraz hook po edycji. Reguły listy i akcji są już dowiedzione w bazie, ale nic nie sprawdza, czy działa to w przeglądarce: sesja cookie, hydracja wysp React i przeładowanie po akcji. Bez tego regresja w warstwie UI przeszłaby niezauważona.

## Starting Point

pgTAP i vitest pokrywają reguły #1 i #4 (Fazy 1–3). Playwright nie jest zainstalowany, nie ma konfiguracji ani hooka po edycji. Środowisko pod e2e (lokalny Supabase, build, preview na 4321) istnieje tylko w jobie CI `smoke`, który sprawdza wyłącznie HTTP.

## Desired End State

`npm run test:e2e` przechodzi lokalnie i w CI, a jedyny test dowodzi przepływu z oczekiwaniami z PRD, z break-checkiem każdej kluczowej asercji. Hook po edycji i na koniec tury działa i jest udowodniony na zepsutym pliku. `test-plan.md` mówi, jak dodać kolejny test e2e, i zgadza się ze stanem faktycznym.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Warstwa e2e | Jeden test Playwright, bez drugiego i bez dwóch kont | Najtańsza warstwa dla reguł to pgTAP, a e2e dowodzi tylko wiringu przeglądarkowego | Research |
| Kształt testu | Jeden test, dwa zadania: A „Częściowo" → B „Na jutro" → A „Zrobione" | Jeden przebieg dowodzi #1 (nic nie znika bez śladu) i #4 (stan po przeładowaniu) | Plan |
| Tworzenie zadań | Dialog na `/today` (projekt i milestone przez `/projects`) | Dialog sam dowodzi hydracji wyspy i od razu pokazuje zadanie na liście | Plan |
| Dane testowe | Zadania bez terminu, jeden milestone, unikalny użytkownik na przebieg | „Dziś" liczy serwer (Warsaw), a zadanie bez terminu nie zależy od daty | Research |
| Lista następnego dnia | Poza e2e, zostaje w pgTAP | PRD nie ma widoku następnego dnia i serwerowego „dziś" nie przesunąć | Research |
| CI | Kroki w istniejącym jobie `smoke`, bez nowego joba | Supabase, build i preview już tam działają | Research |
| Hook agenta | Instalacja przez `/10x-configure-hook` w osobnej fazie | Cel fazy to „utrwalić bramki w CI i hooku", rekomendacja bez właściciela go nie domyka | Plan |
| Korekty test-planu | Backport §2 #4 i §5 w fazie dokumentacji | Plan testów ma mówić prawdę przed kolejną rundą testów | Plan |

## Scope

**In scope:** instalacja i konfiguracja Playwright, test seed, jeden test przepływu z break-checkami, krok e2e w CI, hook po edycji i na koniec tury, cookbook §6.6 i synchronizacja §4, §5, §2 #4, §7, §3.

**Out of scope:** drugi test e2e, e2e z dwoma kontami, lista następnego dnia w przeglądarce, asercje na daty i komunikaty spoza PRD, zmiany w `src/` i schemacie, testy wizualne, hooki pre-commit/pre-push.

## Architecture / Approach

Test działa przeciwko zbudowanemu preview z lokalnym Supabase: setup rejestruje unikalnego użytkownika i zapisuje sesję, a test przechodzi przepływ lokatorami `getByRole` (przyciski akcji mają `aria-label` typu `Zrobione: <tytuł>`). Po każdej akcji strona się przeładowuje, więc asercje czekają na stan, nie na odpowiedź sieciową. Oczekiwania są wpisane z PRD, nie z kodu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Infrastruktura i seed | Playwright, konfiguracja, setup z sesją, zielony seed, `test-stack.md` | `astro preview` z workerd nieprzetestowany lokalnie na Windows (CI dowodzi tylko Linuksa) |
| 2. Test przepływu | Jeden test z break-checkami (wyspa, „Zrobione", „Na jutro") | Hydracja wysp i przeładowanie po akcji mogą dawać kruchość |
| 3. Bramki | Krok e2e w CI i hook po edycji i końcu tury | CI nie do uruchomienia lokalnie (brak zdalnego repozytorium) |
| 4. Cookbook i synchronizacja | §6.6, §4, §5, korekty §2 #4, §7, §3 | `prettier --check` na `test-plan.md` nie przechodził już przed zmianą |

**Prerequisites:** Docker i lokalny Supabase (`npx supabase start`), `.dev.vars` z lokalnymi zmiennymi, świeży `npm run build`.
**Estimated effort:** ~4 sesje, po jednej na fazę (najwięcej czasu: stabilizacja testu i break-checki).

## Open Risks & Assumptions

- Czy `astro preview` z workerd działa lokalnie na Windows, nie sprawdzono; jeśli nie, faza 1 wymaga obejścia lub uruchamiania w CI.
- Czy po rejestracji sesja jest od razu aktywna, wynika tylko z `enable_confirmations=false`; setup loguje się jawnie.
- Krok e2e w CI można sprawdzić dopiero po pierwszym pushu na zdalne repozytorium (wiersz 3.5 świadomie odroczony).
- Wyrocznia PRD nie definiuje komunikatów po akcji, więc test asertuje tylko stan listy, `aria-pressed` i sekcję „Przeniesione na później".

## Success Criteria (Summary)

- `npm run test:e2e` zielone lokalnie, a każda kluczowa asercja ma zaliczony break-check (czerwone po zepsuciu, zielone po przywróceniu).
- Hook po edycji i na koniec tury działa i jest udowodniony na celowo zepsutym pliku.
- `test-plan.md` zawiera wypełnione §6.6 i zgodne ze stanem faktycznym §4, §5, §2 #4.
