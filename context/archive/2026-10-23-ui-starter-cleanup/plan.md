# Usunięcie pozostałości startera (dashboard, strona główna, Topbar, bg-cosmic) Implementation Plan

## Overview

Usuwamy ostatnie fragmenty startera 10x-astro: stronę `/dashboard`, stronę główną `/` (`Welcome` + `Topbar`) i utility `bg-cosmic`. `/` zostaje trasą, która tylko przekierowuje (zalogowany → `/today`, niezalogowany → `/auth/signin`). Zmiana dopasowuje do tego middleware, wylogowanie, kroki smoke, `CLAUDE.md` i README. To zmiana usuwająca, nie restyle: nie ma nowego wyglądu do pokazania, więc nie ma fazy stanów ani kitchen-sink.

## Current State Analysis

- `index.astro` renderuje `Welcome` także dla zalogowanego (`src/pages/index.astro:5-8`); `Welcome` importuje `Topbar` (`Welcome.astro:2,18`), a `Topbar` linkuje do `/dashboard` (`Topbar.astro:10`).
- `/dashboard` to angielski placeholder poza `AppLayout` (`dashboard.astro:7-26`); wylogowanie i e-mail są już w powłoce (`AppLayout.astro:32-37`), a logowanie prowadzi na `/today` (`signin.ts:26`).
- Zbiór konsumentów `bg-cosmic`: `dashboard.astro:8`, `Welcome.astro:5`; definicja w `global.css:268-270` to jedyny surowy hex poza blokami tokenów. Skan literałów: 33 linie w czterech plikach (dashboard 6, Welcome 20, Topbar 7, index 0).
- Odwołania poza widokami: `middleware.ts:4` (`PROTECTED_ROUTES`), `signout.ts:9` (redirect na `/`), `smoke.mjs:141,161,194,1422,1423`, `CLAUDE.md:31`, `README.md:148` (`research.md`, Summary i C4).
- `CLAUDE.md` i `README.md` nie zawierają żadnej wzmianki o `bg-cosmic` (`grep -in cosmic` bez trafień), więc notatka „wpisy bg-cosmic w CLAUDE.md” z `change.md` nie wymaga edycji poza linią 31.
- `Astro.locals.user` ustawia middleware przed renderem strony (`middleware.ts:12-21`, typ `User | null` w `env.d.ts`); w stronach nie ma precedensu `Astro.redirect`.
- Pętla oczekiwania CI robi `curl -sf` na `/` (`.github/workflows/ci.yml:53`); `-f` odrzuca tylko 4xx/5xx, więc 302 spełnia warunek.

## Desired End State

`/` zwraca 302 na `/auth/signin` (anonim) albo `/today` (zalogowany). `/dashboard` zwraca 404 dla każdego. W repozytorium nie ma `dashboard.astro`, `Welcome.astro`, `Topbar.astro` ani `bg-cosmic`. Wylogowanie kończy na `/auth/signin` jednym skokiem. `npm run lint`, `npx astro check`, `npm run test:unit`, `npm run check:values`, `npm run build` i `npm run smoke` przechodzą.

### Key Discoveries:

- Link z e-maila potwierdzającego może lądować na korzeniu hosta (`supabase/config.toml:154`, wartość lokalna), więc `/` nie może zwracać 404 — przekierowanie to zachowuje.
- `Astro.redirect` domyślnie zwraca 302; smoke ma porównywać dokładne lokacje (`smoke.mjs:1404`: lokacja bez końcowego `=` jest dopasowaniem dokładnym).
- Lekcja z `lessons.md`: kryterium „zero X” wymienia każdy plik z trafieniem (tu: `global.css`, `dashboard.astro`, `Welcome.astro`); kroki smoke dla stron sprawdzają konkretny wynik, nie sam status.
- Wszystkie strony przekazują własny tytuł do `Layout`/`AppLayout` (`research.md`, C3); domyślny tytuł `Layout.astro:10` jest martwy, ale zostaje (decyzja użytkownika).

## What We're NOT Doing

- Zmiany domyślnego tytułu w `src/layouts/Layout.astro:10` (`"10x Astro Starter"`).
- Przekierowania `/dashboard` → `/today` (decyzja: zwykły 404).
- Zmiany nazwy `10x-astro-starter` w `package.json` i `wrangler.jsonc`, przebudowy README poza wierszami tras, ani zmian `public/template.png`.
- Nowej strony powitalnej ani nowej treści dla `/`.
- Zmian w middleware poza usunięciem `/dashboard` z `PROTECTED_ROUTES` (przekierowanie `/` jest w `index.astro`).
- Fazy stanów, kitchen-sink, zrzutów ani nowej kontroli `check:values` (usuwane pliki nie były na liście skanu).
- Zmian w `AppLayout`, stronach auth, `/today` i `/projects`.

## Implementation Approach

Najpierw przekierowanie i wylogowanie (strona `/dashboard` jeszcze istnieje, więc faza jest odwracalna), potem usunięcie. Dzięki temu po fazie 1 `/` już nigdy nie renderuje startera, a faza 2 to czyste kasowanie plus podmiana odwołań. Przekierowanie siedzi w `index.astro` (odczyt `Astro.locals.user`): middleware zostaje odpowiedzialny tylko za ochronę tras, a `signout.ts` i middleware już rozstrzygają o użytkowniku w ten sam sposób.

**Adaptacja z implementacji (2026-10-23, za zgodą użytkownika):** top-level `return Astro.redirect(...)` w frontmatter `index.astro` wywalał ESLint (`@typescript-eslint/no-misused-promises`, „Non-null Assertion Failed”), co blokowało `npm run lint` w CI i hook pre-commit. Przekierowanie z `/` jest więc w `src/middleware.ts` (gałąź `pathname === "/"`: zalogowany → `/today`, anonim → `/auth/signin`, 302), a `src/pages/index.astro` został usunięty już w Fazie 1 (zamiast przerabiania go na przekierowanie). Opisy `index.astro` w Phase 1 poniżej oraz w `plan-brief.md` i `research.md` należy czytać z tą poprawką; zachowanie i kryteria sukcesu są bez zmian.

## Phase 1: Przekierowanie `/` i wylogowanie

### Overview

`/` przestaje renderować `Welcome`; wylogowanie omija dwuskokowe przekierowanie; smoke pilnuje nowego zachowania.

### Changes Required:

#### 1. Przekierowanie ze strony głównej

**File**: `src/pages/index.astro`

**Intent**: Strona nie renderuje już `Welcome` ani `Layout`; w zależności od `Astro.locals.user` przekierowuje zalogowanego na `/today`, a niezalogowanego na `/auth/signin`.

**Contract**: Frontmatter odczytuje `Astro.locals.user` i zwraca `Astro.redirect("/today")` albo `Astro.redirect("/auth/signin")` (status domyślny 302, bez drugiego argumentu); brak markupu strony. Importy `Welcome` i `Layout` znikają.

#### 2. Wylogowanie jednym skokiem

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Po wylogowaniu przekierować od razu na `/auth/signin` zamiast na `/`.

**Contract**: `context.redirect("/auth/signin")` w miejscu `context.redirect("/")` (`signout.ts:9`); reszta handlera bez zmian.

#### 3. Kroki smoke dla `/` i wylogowania

**File**: `scripts/smoke.mjs`

**Intent**: Zastąpić krok „home renders” krokami przekierowania i dopasować lokację wylogowania; dashboard jeszcze nie jest ruszany.

**Contract**: (a) `["home redirects anonymous user", request("/"), { status: 302, location: "/auth/signin" }]` w miejscu kroku „home renders” (`smoke.mjs:141`); (b) nowy krok `["home redirects signed-in user", request("/"), { status: 302, location: "/today" }]` bezpośrednio po kroku „signin accepts correct password”; (c) w kroku „signout clears session” `location: "/auth/signin"` zamiast `"/"` (`smoke.mjs:1422`).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typecheck przechodzi: `npx astro check`
- Testy jednostkowe przechodzą: `npm run test:unit`
- Build przechodzi: `npm run build`
- Smoke przechodzi (Docker + lokalny Supabase na `127.0.0.1:54321`): `npm run smoke`
- Test zepsucia: po zmianie celu przekierowania zalogowanego w `index.astro` na inny adres (np. `/projects`) krok „home redirects signed-in user” robi się czerwony; po przywróceniu zielony
- `signout.ts` nie przekierowuje już na korzeń: `grep -n 'redirect("/")' src/pages/api/auth/signout.ts` bez trafień

#### Manual Verification:

- W przeglądarce niezalogowany wchodzący na `/` ląduje na `/auth/signin`.
- Zalogowany wchodzący na `/` ląduje na `/today`.
- Wylogowanie z powłoki kończy na `/auth/signin` bez pośredniego ekranu.

**Implementation Note**: Po tej fazie i zielonych bramkach zatrzymaj się na ręczne potwierdzenie przed Fazą 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Usunięcie startera i dokumentacja

### Overview

Kasujemy trzy pliki widoków i `bg-cosmic`, zdejmujemy `/dashboard` z ochrony i zastępujemy odwołania.

### Changes Required:

#### 1. Usunięcie plików i utility

**File**: `src/pages/dashboard.astro`, `src/components/Welcome.astro`, `src/components/Topbar.astro` (usuwane); `src/styles/global.css`

**Intent**: Pozbyć się angielskiej treści i palety startera oraz jedynego surowego hexa poza tokenami.

**Contract**: Trzy pliki znikają z dysku. W `global.css` usuwany jest blok `@utility bg-cosmic { … }` (`global.css:268-270`) wraz z otaczającą pustą linią; reszta pliku (tokeny, `type-*`) bez zmian. Po usunięciu `grep -rn "bg-cosmic" src` zwraca 0 — pliki z trafieniem przed zmianą: `global.css`, `dashboard.astro`, `Welcome.astro`.

#### 2. Middleware

**File**: `src/middleware.ts`

**Intent**: `/dashboard` przestaje być trasą chronioną (trasa nie istnieje; nieistniejący adres ma zwrócić 404, nie przekierowanie na logowanie).

**Contract**: `PROTECTED_ROUTES = ["/projects", "/today"]` (`middleware.ts:4`).

#### 3. Kroki smoke po usunięciu

**File**: `scripts/smoke.mjs`

**Intent**: Usunąć kroki wymagające dashboardu i zastąpić je krokami, które nadal dowodzą usunięcia trasy oraz czyszczenia sesji po wylogowaniu.

**Contract**: (a) krok „dashboard redirects anonymous user” (`smoke.mjs:161`) → `["removed dashboard page returns 404", request("/dashboard"), { status: 404 }]`; (b) krok „dashboard renders for signed-in user” (`smoke.mjs:194`) usunięty; (c) krok „dashboard redirects after signout” (`smoke.mjs:1423`) → `["today redirects after signout", request("/today"), { status: 302, location: "/auth/signin" }]`, aby zachować dowód, że sesja została wyczyszczona.

#### 4. Dokumentacja i reguła

**File**: `CLAUDE.md`, `README.md`

**Intent**: Nie wskazywać agentowi ani czytelnikowi nieistniejącej strony.

**Contract**: `CLAUDE.md:31` → „Protected page example: `src/pages/today.astro`”. W tabeli „Auth routes” w `README.md` (`README.md:148`) wiersz `/dashboard` jest usunięty, a w to miejsce dodany wiersz `/` z opisem „Przekierowanie: zalogowany → `/today`, niezalogowany → `/auth/signin`” w formacie i języku sąsiednich wierszy (tabela jest po angielsku — zachować język tabeli); reszta README bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typecheck przechodzi: `npx astro check`
- Testy jednostkowe przechodzą: `npm run test:unit`
- Skan wartości przechodzi: `npm run check:values`
- Build przechodzi: `npm run build`
- Smoke przechodzi: `npm run smoke`
- Pliki usunięte: `test ! -e src/pages/dashboard.astro && test ! -e src/components/Welcome.astro && test ! -e src/components/Topbar.astro`
- Brak `bg-cosmic` w kodzie: `grep -rn "bg-cosmic" src` bez trafień
- Brak odwołań do usuniętych elementów: `grep -rnE "Welcome\.astro|Topbar|dashboard\.astro|/dashboard" src scripts CLAUDE.md README.md` zwraca wyłącznie linie z kroku smoke „removed dashboard page returns 404” w `scripts/smoke.mjs`

#### Manual Verification:

- `/dashboard` zwraca 404 zarówno zalogowanemu, jak i niezalogowanemu.
- `/today`, `/projects` i strony `/auth/*` działają bez regresji w jasnym i ciemnym motywie (szybki przegląd).
- Tabela „Auth routes” w `README.md` jest czytelna i zgodna z nowym zachowaniem `/`.

**Implementation Note**: Po tej fazie rytuał epilogu i `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

- Bez nowych testów jednostkowych: zmiana nie dodaje logiki poza jedną gałęzią w `index.astro`, pokrytą smoke.

### Integration Tests:

- `npm run smoke`: `/` → 302 `/auth/signin` (anonim) i 302 `/today` (zalogowany), wylogowanie → 302 `/auth/signin`, `/dashboard` → 404, `/today` → 302 `/auth/signin` po wylogowaniu.

### Manual Testing Steps:

1. Niezalogowany: `/` → logowanie; `/dashboard` → 404.
2. Zaloguj się: `/` → `/today`; `/dashboard` → 404.
3. Wyloguj z powłoki: bezpośrednio `/auth/signin`.

## Performance Considerations

Brak: usuwamy kod i jedną trasę; przekierowanie jest po stronie serwera, bez dodatkowych zapytań (użytkownik pochodzi z middleware).

## Migration Notes

Stare zakładki do `/dashboard` zwrócą 404 (zamierzone). Link z e-maila potwierdzającego wskazujący na korzeń hosta nadal działa dzięki przekierowaniu z `/`. Produkcyjnego `site_url` Supabase nie ma w repozytorium — weryfikacja poza zakresem planu.

## References

- Related research: `context/changes/ui-starter-cleanup/research.md`
- Wzorzec przekierowania użytkownika: `src/middleware.ts:12-21` (źródło `Astro.locals.user`), `src/pages/api/auth/signout.ts:9`
- Historia decyzji: `context/archive/2026-10-15-today-list-view/reviews/plan-review.md` (F5)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Przekierowanie `/` i wylogowanie

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — 32a8191
- [x] 1.2 Typecheck przechodzi: `npx astro check` — 32a8191
- [x] 1.3 Testy jednostkowe przechodzą: `npm run test:unit` — 32a8191
- [x] 1.4 Build przechodzi: `npm run build` — 32a8191
- [x] 1.5 Smoke przechodzi: `npm run smoke` — 32a8191
- [x] 1.6 Test zepsucia przekierowania zalogowanego czerwieni krok smoke, po cofnięciu zielony — 32a8191
- [x] 1.7 `signout.ts` nie przekierowuje już na korzeń (grep bez trafień) — 32a8191

#### Manual

- [x] 1.8 Niezalogowany wchodzący na `/` ląduje na `/auth/signin` — 32a8191
- [x] 1.9 Zalogowany wchodzący na `/` ląduje na `/today` — 32a8191
- [x] 1.10 Wylogowanie kończy na `/auth/signin` bez pośredniego ekranu — 32a8191

### Phase 2: Usunięcie startera i dokumentacja

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — bddf227
- [x] 2.2 Typecheck przechodzi: `npx astro check` — bddf227
- [x] 2.3 Testy jednostkowe przechodzą: `npm run test:unit` — bddf227
- [x] 2.4 Skan wartości przechodzi: `npm run check:values` — bddf227
- [x] 2.5 Build przechodzi: `npm run build` — bddf227
- [x] 2.6 Smoke przechodzi: `npm run smoke` — bddf227
- [x] 2.7 Pliki `dashboard.astro`, `Welcome.astro`, `Topbar.astro` usunięte — bddf227
- [x] 2.8 Brak `bg-cosmic` w `src` — bddf227
- [x] 2.9 Odwołania do usuniętych elementów tylko w kroku smoke o 404 — bddf227

#### Manual

- [x] 2.10 `/dashboard` zwraca 404 zalogowanemu i niezalogowanemu — bddf227
- [x] 2.11 `/today`, `/projects` i `/auth/*` bez regresji w jasnym i ciemnym motywie — bddf227
- [x] 2.12 Tabela „Auth routes” w README czytelna i zgodna z nowym zachowaniem `/` — bddf227
