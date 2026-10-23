---
date: 2026-10-23T20:16:48+02:00
researcher: Karolina Jurowicz
git_commit: bd773461238ce0ecbf5482caf5f304f1768ded4a
branch: master
repository: xDevs
topic: "Co odwołuje się do /dashboard, strony głównej (/ → Welcome), Topbar i bg-cosmic, i co trzeba zmienić, by usunąć je bez zepsucia reszty aplikacji"
tags: [research, codebase, ui, dashboard, Welcome, Topbar, bg-cosmic, middleware, smoke]
status: complete
last_updated: 2026-10-23
last_updated_by: Karolina Jurowicz
---

# Research: Usunięcie pozostałości startera (dashboard, strona główna, Topbar, bg-cosmic)

**Date**: 2026-10-23T20:16:48+02:00
**Researcher**: Karolina Jurowicz
**Git Commit**: bd773461238ce0ecbf5482caf5f304f1768ded4a
**Branch**: master
**Repository**: xDevs

## Research Question

Decyzja jest już podjęta (`change.md`, Notes): usunąć `/dashboard`, `/` (`index.astro` + `Welcome.astro`), `Topbar.astro` i utility `bg-cosmic`, a `/` ma przekierowywać (zalogowany → `/today`, niezalogowany → `/auth/signin`). Pytanie badawcze: kto jeszcze odwołuje się do tych elementów, jakie kontrakty (middleware, smoke, wylogowanie, dokumentacja, reguły agenta) trzeba zmienić razem z usunięciem i co pozostaje nierozstrzygnięte?

## Summary

Zakres sprawdzony: przeszukanie repozytorium (poza `node_modules`, `dist`, `.git`, `.astro`, `.wrangler` i `context/`) po `dashboard|Topbar|Welcome|bg-cosmic|index.astro`; osobno `href="/"`, `redirect("/")`, `location: "/"` w `src` i `scripts`; `middleware.ts`, `signout.ts`, `Layout.astro`, `AppLayout.astro`, `scripts/smoke.mjs`, `.github/workflows/ci.yml`, `README.md`, `supabase/config.toml`, `wrangler.jsonc`, `context/foundation/` i archiwum `context/archive/`. Nie uruchamiano aplikacji.

- **Konsumenci usuwanych elementów w kodzie aplikacji to dokładnie ten zbiór (przeszukanie wyżej):** `Welcome.astro` importuje `Topbar` (`Welcome.astro:2,18`); `index.astro` importuje `Welcome` (`index.astro:2,7`); `Topbar.astro` linkuje do `/dashboard` (`Topbar.astro:10`); `middleware.ts` ma `/dashboard` w `PROTECTED_ROUTES` (`middleware.ts:4`); `bg-cosmic` jest używany w `dashboard.astro:8` i `Welcome.astro:5`, a zdefiniowany w `global.css:268-270`. Żaden inny plik w `src` nie importuje ani nie linkuje do tych elementów.
- **Skan literałów na czterech plikach daje 33 linie z trafieniem:** `dashboard.astro` 6, `Welcome.astro` 20, `Topbar.astro` 7, `index.astro` 0. `bg-cosmic` to jedyny surowy hex poza blokami tokenów (`#0a0e1a`, `#0f1529`, `global.css:268-270`; pozostałe hexy w pliku to wartości w blokach tokenów, np. `global.css:18-27`).
- **Zmiany poza kodem widoków, które wymusza usunięcie:** trzy kroki smoke odwołujące się do `/dashboard` (`smoke.mjs:161, 194, 1423`), krok „home renders” oczekujący 200 na `/` (`smoke.mjs:141`), krok wylogowania oczekujący lokacji `/` (`smoke.mjs:1422`), `CLAUDE.md:31` („Protected page example: `src/pages/dashboard.astro`”) i wiersz `/dashboard` w tabeli tras `README.md:148`.
- **Wylogowanie kończy na `/`** (`signout.ts:9`). Po zmianie `/` przekieruje niezalogowanego na `/auth/signin`, więc bez zmiany `signout.ts` użytkownik przejdzie dwa przekierowania (`/api/auth/signout` → `/` → `/auth/signin`).
- **`/` musi pozostać trasą, która nie zwraca 404.** Domyślny `site_url` lokalnego Supabase wskazuje korzeń hosta (`supabase/config.toml:154`, wartość lokalna `http://127.0.0.1:3000`); wartości produkcyjnej w repozytorium nie ma, więc link z e-maila potwierdzającego może lądować na `/`. Przekierowanie zamiast usunięcia trasy to zachowuje.
- **Poza `src`, `scripts`, `README.md` i `CLAUDE.md` żaden plik w repozytorium nie odwołuje się do usuwanych elementów** (pozostałe trafienia przeszukania to ogólne słowa „dashboard” w `.claude/skills/*` i w `README.md:123-168` o panelach Supabase/Cloudflare — nie dotyczą tras aplikacji). Playwright/e2e nie istnieje (brak `playwright.config.*`, `tests/`, `e2e/`).

## Charges

Format: plik:linia — co jest nie tak — wpływ na użytkownika — kategoria — propozycja dla planu.

### C1. Cztery pliki startera na literałach „cosmic” i jedyny surowy hex poza tokenami (brakujące tokeny)

- **Dowód (widok → źródło):** `dashboard.astro:9-20` (szkło `border-white/10 bg-white/10`, gradient `from-blue-200 to-purple-200 … text-transparent`, `text-blue-100/80`); `Welcome.astro:7-9` (orby `bg-purple-500/20 blur-[120px]`, `h-[350px]`), `:14` (inline `rgba(255,255,255,…)`), `:22,31,37,46,57…108` (gradient, `bg-purple-600`, `text-blue-100/60`, `text-purple-300`); `Topbar.astro:5,8,10,14,22,24,27` (`text-white/80`, `text-purple-300`). Skan: 6 + 20 + 7 = 33 linie, `index.astro` 0.
- **Źródło → widoki:** `bg-cosmic` (`global.css:268-270`, `#0a0e1a`, `#0f1529`) czytają wyłącznie `dashboard.astro:8` i `Welcome.astro:5` (przeszukanie `src`).
- **Wpływ na użytkownika:** gdyby te strony zostały, część aplikacji pozostałaby w ciemnym granatowo-fioletowym stylu niezależnym od motywu, a surowy hex w `global.css` łamie regułę „bez surowych kolorów poza blokami tokenów” (`CLAUDE.md`, sekcja UI).
- **Propozycja dla planu:** usunąć cztery pliki i utility `bg-cosmic` (ostatni konsument znika w tej samej zmianie); po usunięciu `grep -rn "bg-cosmic" src` ma zwracać 0.

### C2. Placeholder `/dashboard`, starterowa strona `/` i Topbar duplikują to, co daje powłoka aplikacji (przypadkowa architektura)

- **Dowód:** `/dashboard` pokazuje „Welcome, {email}”, „This page is only for authenticated users.” i przycisk „Sign out” poza `AppLayout` (`dashboard.astro:7-26`); wylogowanie i e-mail są już w `AppLayout` (`AppLayout.astro:32-37`), a logowanie prowadzi na `/today` (`signin.ts:26`). `index.astro:5-8` renderuje `Welcome` bez sprawdzenia `Astro.locals.user`, więc zalogowany widzi stronę marketingową startera z przyciskami „Sign In / Sign Up”; `Topbar` linkuje zalogowanego do `/dashboard` (`Topbar.astro:10`). PRD nie wspomina o dashboardzie ani o stronie głównej (`context/foundation/prd.md`; wyszukiwanie `dashboard|landing` nie zwróciło trafień).
- **Wpływ na użytkownika:** wpisanie samego adresu aplikacji pokazuje angielską stronę o „10x Astro Starter” zamiast wejścia do aplikacji; link „Dashboard” prowadzi do pustej strony bez funkcji.
- **Propozycja dla planu:** `/` przekierowuje (zalogowany → `/today`, niezalogowany → `/auth/signin`); `/dashboard` znika razem z wpisem w `PROTECTED_ROUTES` (po usunięciu trasy `/dashboard` zwróci 404 także zalogowanemu — do potwierdzenia w planie, czy akceptujemy 404, czy dodajemy przekierowanie `/dashboard` → `/today`).

### C3. Angielska treść i nazwa marki startera (przypadkowa architektura / treść)

- **Dowód:** `Welcome.astro:22` („10x Astro Starter”), `:25-27` i `:62-108` (opisy startera po angielsku), `:31,37` („Sign In”, „Sign Up”); `Topbar.astro:8,14,22,24,27` („Not signed in”, „Sign out”); `dashboard.astro:10-21`. `Layout.astro:10` ma domyślny tytuł `"10x Astro Starter"`, ale każdy pozostały konsument `Layout`/`AppLayout` przekazuje tytuł (`signin.astro:11`, `signup.astro:11`, `confirm-email.astro:21`, `today.astro:62`, `projects/index.astro:30`, `projects/[id].astro:56`, `dev/kitchen-sink.astro:35`), więc domyślny tytuł po zmianie nie jest używany przez żadną stronę.
- **Wpływ na użytkownika:** po usunięciu stron angielska treść znika z interfejsu; zostaje tylko martwy domyślny tytuł w `Layout.astro:10`.
- **Propozycja dla planu:** usunąć treść razem z plikami; domyślny tytuł `Layout` zostawić albo zmienić — decyzja do planu (patrz Open Questions).

### C4. Zabezpieczenia i dokumentacja odwołujące się do usuwanych tras (brakujące/nieaktualne guardy)

- **Dowód:** `smoke.mjs:141` („home renders”, oczekuje 200 na `/`), `:161` („dashboard redirects anonymous user”), `:194` („dashboard renders for signed-in user”), `:1422` („signout clears session”, oczekuje `location: "/"`), `:1423` („dashboard redirects after signout”); `CLAUDE.md:31`; `README.md:148`. Pętla oczekiwania CI robi `curl -sf` na `http://localhost:4321/` (`ci.yml:53`); `-f` odrzuca tylko odpowiedzi 4xx/5xx, więc przekierowanie 302 spełnia tę pętlę (zachowanie `curl` bez `-L`, nie sprawdzone w CI).
- **Wpływ na użytkownika (dla zespołu/CI):** bez aktualizacji smoke job `smoke` w CI zaczerwieni się na krokach o dashboardzie i `/`, a `CLAUDE.md` poda agentowi nieistniejącą stronę jako wzorzec chronionej strony.
- **Propozycja dla planu:** kroki smoke: „home” → dwa kroki przekierowania (anonim: `302 /auth/signin`; zalogowany: `302 /today`), kroki dashboardu usunąć albo zamienić na sprawdzenie, że `/dashboard` nie jest już dostępny (do decyzji), krok wylogowania dostosować do nowej lokacji; `CLAUDE.md:31` → `src/pages/today.astro`; wiersz `/dashboard` w `README.md:148` usunąć.

### Odroczone (deferred) — poza zakresem „usunąć resztki UI”

- **Nazwa `10x-astro-starter`** w `package.json:2` i `wrangler.jsonc:3` oraz tekst startera w `README.md` (nagłówek `:1`, klonowanie `:26-27`): zmiana `name` w `wrangler.jsonc` zmienia nazwę Workera (konsekwencje wdrożenia, brak dowodów w repo), a README opisuje starter jako całość; osobna zmiana, jeśli w ogóle.
- **`public/template.png`** — używany tylko przez `README.md:3` (przeszukanie `src`, `README.md`, `astro.config.mjs`); zostaje razem z README.
- **`config-status.ts:16`** (`docsUrl` do repozytorium startera) — nie dotyczy tras.

## Code References

- `src/pages/dashboard.astro:7-26` — placeholder dashboardu (Layout, `bg-cosmic`, angielski)
- `src/pages/index.astro:5-8` — renderuje `Welcome` bez sprawdzenia użytkownika
- `src/components/Welcome.astro:2,5,18` — import `Topbar`, `bg-cosmic`, użycie `Topbar`
- `src/components/Topbar.astro:10` — link zalogowanego do `/dashboard`
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/projects", "/today"]`
- `src/pages/api/auth/signout.ts:9` — przekierowanie po wylogowaniu na `/`
- `src/pages/api/auth/signin.ts:26` — logowanie kończy na `/today`
- `src/styles/global.css:268-270` — `@utility bg-cosmic` (surowy hex)
- `src/layouts/AppLayout.astro:32-37` — wylogowanie i e-mail w powłoce
- `src/layouts/Layout.astro:10` — domyślny tytuł `"10x Astro Starter"`
- `scripts/smoke.mjs:141,161,194,1422,1423` — kroki zależne od `/` i `/dashboard`
- `.github/workflows/ci.yml:53` — pętla oczekiwania na `/`
- `CLAUDE.md:31` — „Protected page example”
- `README.md:148` — wiersz tabeli tras z `/dashboard`
- `supabase/config.toml:154,156` — lokalne `site_url` i `additional_redirect_urls`

## Architecture Insights

- Starter zostawił po sobie spójny zestaw: strona publiczna (`/` → `Welcome` → `Topbar`) + chroniony placeholder (`/dashboard`). Rdzeń produktu (`/today`, `/projects`, `/auth/*`) już od niego nie zależy; po zmianach #1–#4 usuwane elementy mają tylko wzajemne zależności i trzy odwołania zewnętrzne (middleware, smoke, dokumentacja).
- W kodzie stron nie ma precedensu `Astro.redirect` (przeszukanie `src`: przekierowania to `context.redirect` w trasach API i `middleware.ts`); `Astro.locals.user` ustawia middleware przed renderem strony (`middleware.ts:12-21`). Przekierowanie z `/` można więc umieścić w `index.astro` (odczyt `locals.user`) albo w middleware — wybór do planu.

## Historical Context (from prior changes)

- `context/archive/2026-10-15-today-list-view/reviews/plan-review.md` (F5, decyzja „Fix A”) — porządek `/dashboard` i landingu odroczony do łańcucha `/10x-ui` (poparte: ta zmiana to ten porządek).
- `context/archive/2026-10-15-today-list-view/plan.md:46` — `/dashboard` i `Topbar.astro` świadomie zostawione; logowanie przekierowuje na `/today` (poparte, zgodne z `signin.ts:26`).
- `context/archive/2026-10-09-project-crud/plan.md:40` — restyling auth, `Topbar`, `Welcome`, `dashboard.astro` poza zakresem, do `/10x-ui` (poparte).
- `context/archive/2026-10-22-ui-app-shell/plan-brief.md:25-26` — `Topbar.astro` i `bg-cosmic` odroczone do zmian #4/#5; `bg-cosmic` w momencie archiwum #4 używają już tylko `dashboard` i `Welcome` (poparte: `grep -rn "bg-cosmic" src`).

## Related Research

- `context/archive/2026-10-23-ui-auth-views/research.md` — C1 i „Deferred” tam wskazują ten sam `bg-cosmic` jako zadanie zmiany #5.
- `context/archive/2026-10-15-today-list-view/research.md:39` — pierwsze stwierdzenie, że `index.astro` renderuje landing także dla zalogowanego.

## Open Questions

1. **Gdzie umieścić przekierowanie z `/`:** `Astro.redirect` w `index.astro` (odczyt `Astro.locals.user`) czy gałąź w `middleware.ts`? Brak precedensu w stronach; middleware już rozstrzyga o użytkowniku.
2. **Co z `/dashboard` po usunięciu:** zwykły 404 (także dla zalogowanego), czy przekierowanie `/dashboard` → `/today` dla starych zakładek? Kroki smoke zależą od tej decyzji.
3. **Cel przekierowania po wylogowaniu:** zmienić `signout.ts:9` na `/auth/signin` (jeden skok, krok smoke `:1422` zmienia lokację) czy zostawić `/` (dwa skoki, bez zmiany smoke)?
4. **Domyślny tytuł `Layout`** (`Layout.astro:10`, `"10x Astro Starter"`): usunąć domyślną wartość, zmienić na polską nazwę aplikacji (nazwa produktu nie jest ustalona w sprawdzonych plikach) czy zostawić?
5. **README:** tylko usunąć wiersz `/dashboard` (`README.md:148`), czy w tej zmianie poprawić też opis tras (`/` → przekierowanie)? Pełna przebudowa README jest odroczona.
6. **Produkcyjny `site_url` Supabase:** nieznany (repozytorium zawiera tylko wartość lokalną, `supabase/config.toml:154`); przekierowanie z `/` pokrywa przypadek lądowania na korzeniu, ale weryfikacja ustawień produkcyjnych jest poza repozytorium.
