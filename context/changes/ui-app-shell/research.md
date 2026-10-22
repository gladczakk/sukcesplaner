---
date: 2026-10-22T12:23:57+02:00
researcher: Karolina Jurowicz
git_commit: 7928acc6080519aaeafc790e5c42942708b93023
branch: master
repository: xDevs
topic: "Audyt UI szkieletu aplikacji (AppLayout, Topbar, Banner) względem kontraktu systemu projektowego"
tags: [research, codebase, ui, design-system, AppLayout, Topbar, Banner, Layout]
status: complete
last_updated: 2026-10-22
last_updated_by: Karolina Jurowicz
---

# Research: Audyt UI szkieletu aplikacji

**Date**: 2026-10-22T12:23:57+02:00
**Researcher**: Karolina Jurowicz
**Git Commit**: 7928acc6080519aaeafc790e5c42942708b93023
**Branch**: master
**Repository**: xDevs

## Research Question

Które elementy szkieletu aplikacji (`AppLayout.astro`, `Topbar.astro`, `Banner.astro`, a w zakresie tokenów/dark mode także `Layout.astro`) łamią kontrakt systemu projektowego (`context/foundation/design-system/design-system.md`) i jakie 3–5 zarzutów (z plikiem, linią i wpływem na użytkownika) powinien zaadresować plan zmiany `ui-app-shell`?

## Summary

Zakres sprawdzony: 4 pliki widoku, `src/styles/global.css`, `src/components/ui/button.tsx`, spec DS wraz z `reference/components/{Navigation,Banner}.md`, `CLAUDE.md`, `eslint.config.js` i `lint-staged` w `package.json`. Przeszukanie `src/` pod kątem importów `Topbar`, `Banner`, `bg-cosmic`, `localStorage`/`theme` zostało wykonane (wyniki niżej).

- **`AppLayout.astro` jest czysty pod względem literałów** (skan: 0 trafień) i używa tokenów (`bg-card`, `border-border`, `type-button`, `type-meta`) oraz komponentu `Button` z `src/components/ui/`. Jego wady są strukturalne (zarzuty C3, C4), nie kolorystyczne.
- **Literały są w dwóch plikach:** `Banner.astro` (9 trafień, l. 28–30, 33–35, 38–40) i `Topbar.astro` (7 trafień, l. 5, 8, 10, 14, 22, 24, 27). Razem 16, co zgadza się ze skanem wstępnym.
- **`Topbar.astro` nie należy do szkieletu aplikacji:** jedynym importerem w `src/` jest `Welcome.astro:2` (strona `/`), a strony po zalogowaniu (`today`, `projects/*`) używają `AppLayout`. To pozostałość startera (zarzut C2).
- **`Banner.astro` jest używany tylko w `Layout.astro:40`** do komunikatu o braku konfiguracji Supabase, dla wszystkich stron. Jego kolory to literały hex, więc nie reagują na `.dark` (zarzut C1).
- **Reguły agenta nie zachęcają do wartości jednorazowych:** `CLAUDE.md` (sekcja „UI and design system”) zabrania literałów i wartości arbitralnych. Zarzutu „reguła jest przyczyną” nie ma. Brakuje natomiast mechanicznej kontroli: `lint-staged` uruchamia dla `*.{ts,tsx,astro}` tylko `eslint --fix`, a w `eslint.config.js` grep po „literal|palette|arbitrary|hex” nie dał trafień (zarzut C5, kategoria „utrwal to”).

## Charges

Format: plik:linia — co jest nie tak — wpływ na użytkownika — kategoria — propozycja dla planu.

### C1. Banner: kolory jako literały hex, bez reakcji na dark mode (brakujące tokeny)

- **Dowód (widok → źródło):** `src/components/Banner.astro:28-30` (`info`: `#dbeafe`, `#1e3a8a`, `#3b82f6`), `:33-35` (`warning`: `#fef3c7`, `#78350f`, `#f59e0b`), `:38-40` (`error`: `#fee2e2`, `#7f1d1d`, `#dc2626`). Tokeny, które je pokrywają, już istnieją w `src/styles/global.css`: `info-soft`/`info-ink`/`info` (l. 47–49, 108–110), `warning-soft`/`warning-ink`/`warning` (l. 44–46, 105–107), `destructive-soft`/`destructive-ink`/`destructive` (l. 33–36, 94–97).
- **Dowód (źródło → widoki):** wariant `info` i `warning` nie ma w `src/` żadnego użycia (jedyny `<Banner>` to `Layout.astro:40` z `variant="error"`), więc dwie trzecie reguł CSS to martwy kod.
- **Wpływ na użytkownika:** w trybie ciemnym (`.dark`, ustawianym w `Layout.astro:26-36` według OS) komunikat o braku konfiguracji jest jasnoróżowym pasem na ciemnej stronie, bo hex omija warstwę tokenów. Pas używa też niebieskiej i czerwonej palety obcej palecie aplikacji.
- **Dodatkowo:** blok `<style>` ze stałymi `padding: 0.75rem 1rem`, `font-size: 0.875rem` (l. 17–19) zamiast klas tokenów (`type-meta`, skala odstępów); brak ikony (spec: pilność = kolor + słowo + ikona, `design-system.md`, „Rules”). Słowo „Uwaga:” jest dodawane w `Layout.astro:41`, ikony brak.
- **Propozycja:** przepisać Banner na klasy tokenów (`bg-destructive-soft text-destructive-ink border-destructive` itd.) przez `class:list`, usunąć blok `<style>`, dodać ikonę Lucide (`triangle-alert` dla błędu, `clock` dla ostrzeżenia wg spec), rozstrzygnąć, czy martwe warianty `info`/`warning` zostają (spec przewiduje je dla guardrail milestona, `reference/components/Banner.md`).

### C2. Topbar: porzucony komponent startera z paletą purple/blue/white i angielską treścią (przypadkowa architektura + brakujące tokeny)

- **Dowód:** `src/components/Topbar.astro:5` (`border-white/10 bg-white/5 text-white/80`), `:8`, `:22` (`text-blue-100/70`), `:10`, `:14`, `:24`, `:27` (`text-purple-300 hover:text-purple-100`). Treść po angielsku: „Sign out” (l. 15), „Not signed in” (l. 22), „Sign in”/„Sign up” (l. 25, 28), link do `/dashboard` (l. 10–11).
- **Dowód (importerzy):** `grep` po `src/` (`*.astro`, `*.tsx`, `*.ts`, `*.css`) daje jedno użycie: `src/components/Welcome.astro:2` (import) i `:18` (`<Topbar />`). `Welcome` jest używany tylko w `src/pages/index.astro:2,7`. Strony `today.astro` i `projects/*` nie używają `Topbar`.
- **Wpływ na użytkownika:** wejście na `/` pokazuje inną nawigację niż reszta aplikacji (fioletowe linki na ciemnym tle w kosmicznym gradiencie, „Sign out” zamiast „Wyloguj”), niezgodną z polskim UI (`<html lang="pl">`) i z paletą szałwiową. Zalogowany użytkownik trafia stąd do `/dashboard` (starterowa strona), a nie na `/today`.
- **Czego nie wiem:** czy `/` i `/dashboard` mają zostać w produkcie (patrz Open Questions). Zależy od tego, czy Topbar należy naprawić, czy usunąć.
- **Propozycja dla planu:** oznaczyć jako **deferred → zmiana #5** (`dashboard`/`index`/`Welcome`), bo jedyny konsument leży w tej zmianie; usunięcie Topbara tutaj zepsułoby `Welcome` bez decyzji o jego losie. Nie ruszać go w `ui-app-shell`.

### C3. Nawigacja główna: ręcznie zbudowane linki bez widocznego fokusu i bez celu dotykowego ≥40 px (brakujący współdzielony komponent)

- **Dowód:** `src/layouts/AppLayout.astro:18-34` — trzy `<a>` (logo, „Dziś”, „Projekty”) ze stylem `type-button text-foreground hover:underline`; aktywny stan to samo `underline` (l. 24, 31) plus `aria-current`. Brak klasy `focus-visible:*` na linkach; jedyny fokus pochodzi z reguły bazowej `* { @apply border-border outline-ring/50 }` (`src/styles/global.css:273-275`), czyli z konturu o 50% krycia. Dla porównania `Button` ma `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (`src/components/ui/button.tsx:8`).
- **Spec:** elementy nawigacji to pigułki (`rounded-pill`), aktywna na `accent`/`accent-foreground`, każda kontrolka ma pierścień fokusu 2 px z odstępem 2 px, cele dotykowe ≥40 px (`design-system.md`, „Components” → Navigation; „Interaction rules”).
- **Wpływ na użytkownika:** użytkownik klawiatury widzi na linkach nawigacji tylko półprzezroczysty kontur (słabszy niż na przyciskach tej samej belki, np. „Wyloguj”), a aktywna strona różni się od pozostałych wyłącznie podkreśleniem. Na telefonie linki mają wysokość linii tekstu (20 px, `type-button`), poniżej celu 40 px.
- **Propozycja:** wydzielić komponent pozycji nawigacji (Astro, w `src/components/`; nie drugi `Button`) z tokenami: aktywny `bg-accent text-accent-foreground`, fokus `focus-visible:ring-2 focus-visible:ring-ring ring-offset-2`, `min-h` na skali Tailwind zamiast wartości arbitralnych (np. `min-h-10`); wykorzystać go dla trzech linków.

### C4. Kształt szkieletu odbiega od specyfikacji nawigacji; na wąskim ekranie belka zawija się w dwa rzędy (przypadkowa architektura)

- **Dowód:** `src/layouts/AppLayout.astro:15-16` — pozioma belka `header` z `flex-wrap`, w której logo, linki, e-mail i „Wyloguj” dzielą jeden kontener (`max-w-5xl`). Spec przewiduje: sidebar 240 px od 1100 px, dolny tab bar poniżej 768 px, prawy rail od 1100 px (`design-system.md`, „Layout and breakpoints”; `reference/components/Navigation.md`), z trzema celami Dziś / Kalendarz / Projekty.
- **Fakt o stanie repo:** w repo istnieją tylko trasy `today` i `projects` (`src/pages/`); widoku Kalendarz nie ma, a roadmapa M-2 go nie obejmuje (`context/foundation/roadmap.md`, sekcje Scope anchors i Parked — nie ma tam wpisu o kalendarzu; sprawdzony tylko ten plik).
- **Wpływ na użytkownika:** na szerokości telefonu (390 px) belka łamie się w kilka rzędów z długim e-mailem (`truncate` na l. 37 ucina go, ale kontener `flex-wrap` i tak zwiększa wysokość nagłówka); wygląda inaczej niż zaprojektowany layout. Nie zostało to zmierzone na uruchomionej aplikacji (brak zrzutu ekranu w tym badaniu).
- **Propozycja:** to zarzut o największym koszcie. Decyzja do podjęcia w planie (patrz Open Questions): (a) zostać przy górnej belce i naprawić tylko zwijanie na mobile oraz C3, (b) wdrożyć sidebar + tab bar wg spec. Wariant (b) wchodzi w zakres „MVP-too-big” dla jednej zmiany szkieletu; rekomenduję (a) i zapisanie (b) jako **deferred**.

### C5. Brak mechanicznej kontroli literałów w widokach i martwy `bg-cosmic` w warstwie tokenów (przypadkowa architektura / „utrwal to”)

- **Dowód:** `package.json` `lint-staged` (l. 59–65): `*.{ts,tsx,astro}` → tylko `eslint --fix`; `eslint.config.js` nie zawiera reguły na hex/klasy palety/wartości arbitralne (grep „literal|palette|arbitrary|hex” bez trafień). Reguła tekstowa istnieje wyłącznie w `CLAUDE.md` („No literals in views”).
- **Dowód (warstwa tokenów):** `src/styles/global.css:268-270` — `@utility bg-cosmic` z surowymi `#0a0e1a`, `#0f1529`, `#0a0e1a`, poza blokami `:root`/`.dark`; używany przez 5 plików: `Welcome.astro:5`, `auth/signin.astro:9`, `auth/signup.astro:9`, `auth/confirm-email.astro:22`, `dashboard.astro:8`. Żaden z nich nie należy do szkieletu.
- **Wpływ na użytkownika:** bez kontroli kolejne widoki (w tym te z następnych zmian) mogą znów dostać literały bez sygnału błędu; `bg-cosmic` zostaje ciemnym granatowym tłem niezależnie od motywu na stronach auth.
- **Propozycja:** w tej zmianie dodać kontrolę skanu literałów ograniczoną do plików szkieletu (`AppLayout.astro`, `Banner.astro`, `Layout.astro`) — wg reguły „Utrwal to”, jako element repo, nie nowa zależność (np. skrypt w `scripts/` wywoływany z `lint-staged`/CI; decyzja uczestnika). `bg-cosmic` oznaczyć **deferred → zmiany #4 i #5** (jego konsumenci to auth i dashboard/Welcome).

### Poza zarzutami (sprawdzone, bez ustalenia)

- `AppLayout.astro`: 0 literałów; używa `Button` z `ui/` (l. 3, 39) i klas `type-*` — zgodne z kontraktem.
- `Layout.astro`: skrypt dark mode (l. 26–36) zgodny ze spec („Dark mode”). Domyślny tytuł `"10x Astro Starter"` (l. 10) pojawia się tylko tam, gdzie nie podano `title`: `index.astro:6`. To sprawa strony głównej (zmiana #5), nie szkieletu.
- Przełącznika motywu w UI nie ma (w `src/` poza `Layout.astro` brak odwołań do `localStorage`/`theme`). Spec go nie wymaga (dark z OS lub `localStorage.theme`), więc nie jest zarzutem; zapisane w Open Questions.

## Code References

- `src/components/Banner.astro:15-41` — blok `<style>` z literałami hex, trzy warianty
- `src/components/Topbar.astro:5-32` — komponent startera, jedyny importer `Welcome.astro:2`
- `src/layouts/AppLayout.astro:15-45` — belka nawigacji, linki bez `focus-visible` i bez stanu aktywnego poza podkreśleniem
- `src/layouts/Layout.astro:26-36` — skrypt `.dark`; `:39-52` — jedyne użycie `Banner`
- `src/styles/global.css:14-130` — wartości `:root`/`.dark`; `:132-198` — `@theme inline`; `:268-270` — `bg-cosmic` z literałami
- `src/components/ui/button.tsx:8` — wzorzec fokusu do powtórzenia w nawigacji
- `context/foundation/design-system/design-system.md` — „Components” (Navigation, Banner), „Layout and breakpoints”, „Interaction rules”
- `package.json:59-65`, `eslint.config.js` — brak kontroli literałów w pre-commit

## Architecture Insights

- Kontrakt tokenów działa na poziomie `global.css` (osobno `:root` i `.dark`, publikowane przez `@theme inline`); pliki szkieletu, które z niego nie korzystają (`Banner`, `Topbar`), to jedyne źródło literałów w tym zakresie.
- Szkielet po zalogowaniu (`AppLayout`) i szkielet publiczny (`Layout` + `Welcome` + `Topbar`) to dwa niezależne światy wizualne: pierwszy na tokenach DS, drugi na paletach startera. `Layout` jest ich wspólnym rodzicem, więc Banner z `Layout.astro:40` pojawia się w obu.

## Historical Context (from prior changes)

- Nie badano poprzednich zmian pod kątem decyzji o szkielecie UI (poza zakresem tego audytu).
- `context/foundation/lessons.md` — dwie lekcje (smoke dla wysp React; `shadcn add` i nadpisywanie `button.tsx`). Druga dotyczy tej zmiany: jeśli plan doda komponent przez `npx shadcn@latest add`, najpierw `view` i sprawdzenie `registryDependencies`, bez nadpisywania `button.tsx`.

## Related Research

- Brak powiązanych `research.md` o UI w `context/changes/**` i `context/archive/**` (nie przeszukiwano ich w tej sesji; status: nieznany).

## Open Questions

1. **Czy `/` (Welcome) i `/dashboard` zostają w produkcie?** Od tego zależy los `Topbar` (C2) i `bg-cosmic` (C5). Do rozstrzygnięcia przed zmianą #5, nie blokuje `ui-app-shell`.
2. **C4: górna belka (a) czy sidebar + tab bar (b)?** Rekomendacja: (a) w tej zmianie, (b) jako deferred. Wymaga decyzji użytkownika w `/10x-plan`.
3. **Czy martwe warianty `Banner` (`info`, `warning`) zostają** dla guardrail milestona ze spec, czy wycinamy je do czasu użycia? Spec opisuje Banner milestona jako komponent w widoku `/today` (zmiana #2), więc możliwe, że Banner z `Layout` i Banner milestona to dwa różne komponenty i trzeba je rozdzielić.
4. **Brak zrzutu ekranu:** wpływ C3/C4 na szerokości 390 px nie został zmierzony na uruchomionej aplikacji; bramka wizualna w planie ma to pokryć.
5. **Przełącznik motywu:** brak w UI; czy ma należeć do szkieletu (belka), czy zostać poza zakresem?
