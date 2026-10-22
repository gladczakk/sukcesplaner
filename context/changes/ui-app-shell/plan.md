# Szkielet aplikacji — przegląd UI Implementation Plan

## Overview

Przepisujemy szkielet aplikacji (`Banner`, nawigacja w `AppLayout`) tak, by czytał tokeny i komponenty repo zamiast literałów i ręcznie składanych linków, oraz dodajemy mechaniczną kontrolę literałów dla plików szkieletu. To pierwsza z pięciu zmian wizualnych (szkielet → /today → projekty → auth → dashboard/index/Welcome); kolejne widoki odziedziczą kontrakt.

## Current State Analysis

- `AppLayout.astro` jest czysty (0 literałów), ale jego linki nawigacji nie mają fokusu na tokenie `ring`, celu dotykowego ≥40 px ani wyraźnego stanu aktywnego (`research.md` C3).
- `Banner.astro` ma 9 literałów hex w bloku `<style>` i nie reaguje na `.dark`; używany jest tylko jako `variant="error"` w `Layout.astro` (C1).
- Pre-commit uruchamia tylko `eslint --fix`; reguła o literałach istnieje wyłącznie w `CLAUDE.md` (C5).
- Wariant kontraktu: istniejący system projektowy (`context/foundation/design-system/design-system.md`); tokeny już istnieją w `src/styles/global.css`.

## Desired End State

Pliki szkieletu (`AppLayout.astro`, `Layout.astro`, `Banner.astro`, nowy komponent pozycji nawigacji) mają 0 literałów w skanie; komunikat o braku konfiguracji jest czytelny w trybie jasnym i ciemnym; nawigacja ma widoczny fokus z klawiatury, wyraźną aktywną pozycję i cele dotykowe ≥40 px, a belka nie łamie się brzydko na 390 px; każde następne zatwierdzenie pliku szkieletu z literałem jest blokowane w pre-commit; `CLAUDE.md` wskazuje kitchen sink i kontrolę.

### Key Discoveries:

- Wszystkie potrzebne tokeny już są: `destructive-soft` / `destructive-ink` / `destructive`, `accent` / `accent-foreground`, `ring` (`src/styles/global.css:33-39`, `94-100`).
- Wzorzec fokusu do powtórzenia: `src/components/ui/button.tsx:8` (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`).
- `lucide-react` jest już zależnością (`package.json:30`), a `import.meta.env.DEV` jest użyte w `src/pages/auth/confirm-email.astro:4` — nic nowego do instalowania.
- Lekcja z `context/foundation/lessons.md`: smoke dla wysp React musi sprawdzać treść, nie sam status; tu nie dodajemy wysp, więc dotyczy to tylko, jeśli nawigacja zostanie wyspą (nie zostanie).

## What We're NOT Doing

- Sidebar (≥1100 px) i dolny tab bar (<768 px) ze spec — deferred (decyzja: górna belka z poprawkami).
- Przełącznik motywu jasny/ciemny — poza zakresem (motyw dalej z OS lub `localStorage.theme`).
- Warianty `info` i `warning` w `Banner` — usuwamy do czasu, aż zmiana #2 (`/today`) doda Banner milestona.
- `Topbar.astro` (deferred → zmiana #5) i `bg-cosmic` w `global.css:268-270` (deferred → zmiany #4 i #5).
- Nowa zależność lintera ani nowy system projektowy; kontrola to skrypt w repo.
- Kalendarz jako cel nawigacji — widoku nie ma w roadmapie.

## Implementation Approach

Kolejność ze skilla `/10x-ui`: środowisko/kontrola → tokeny → widok → stany. Tokeny nie wymagają nowych wartości, więc faza „tokeny” redukuje się do użycia istniejących w Banner. Kontrolę literałów dodajemy pierwszą, żeby faza 2 miała czerwono-zielony dowód. Nawigację składamy z istniejących tokenów i wzorca fokusu `Button`, bez drugiego `Button`.

## Faza 1: Kontrola literałów w plikach szkieletu

### Overview

Skrypt skanujący pliki widoku pod kątem literałów (hex, rgb/hsl/oklch, klasy palety Tailwind, wartości arbitralne w px/rem), podpięty do `lint-staged` dla plików szkieletu.

### Changes Required:

#### 1. Skrypt skanu

**File**: `scripts/check-hardcoded-values.mjs`

**Intent**: Przeskanować wskazane pliki i zakończyć kodem 1 z listą `plik:linia` przy każdym trafieniu; bez argumentów skanuje stałą listę plików szkieletu.

**Contract**: Wejście: ścieżki plików jako argumenty (lint-staged przekazuje staged). Wzorzec ten sam co w skanie ze skilla `/10x-ui` (hex `#rgb..#rrggbbaa`, `rgb(`/`hsl(`/`oklch(`, `-[<liczba>px|rem]`, klasy `bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide-<kolor palety|white|black>`). Wyjście: `plik:linia: treść` na stderr, kod 1 przy ≥1 trafieniu, kod 0 przy czystych plikach. Stała lista domyślna: `src/layouts/AppLayout.astro`, `src/layouts/Layout.astro`, `src/components/Banner.astro`, komponent pozycji nawigacji z fazy 3. Skrypt nie skanuje `global.css` ani plików poza listą.

#### 2. Podpięcie

**File**: `package.json`

**Intent**: Uruchamiać skan w pre-commit dla plików szkieletu oraz ręcznie.

**Contract**: skrypt npm `check:values` (`node scripts/check-hardcoded-values.mjs`); w `lint-staged` osobny wpis z globem plików szkieletu → `node scripts/check-hardcoded-values.mjs` (obok istniejącego `eslint --fix`). Pliki szkieletu spoza listy nie są skanowane.

### Success Criteria:

#### Automated Verification:

- Skan wskazuje wyłącznie `Banner.astro` (liczba trafień równa 9 przed fazą 2) i kończy się kodem 1: `npm run check:values`
- Skan czystego pliku (`src/layouts/AppLayout.astro`) kończy się kodem 0: `node scripts/check-hardcoded-values.mjs src/layouts/AppLayout.astro`
- Test zepsucia: tymczasowe dodanie `bg-purple-300` do `AppLayout.astro` zaczerwienia skan z numerem linii; po wycofaniu skan jest zielony dla tego pliku
- Lint przechodzi dla zmienionych plików: `npm run lint`

#### Manual Verification:

- Zatwierdzenie commita ze zmienionym `Banner.astro` (przed fazą 2) jest blokowane przez pre-commit z czytelnym komunikatem (sprawdzić na kopii zmiany, nie na właściwym commicie fazy)

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: Banner na tokenach

### Overview

`Banner` używa wyłącznie tokenów i jednego wariantu (error), z ikoną i poprawnym wyglądem w obu motywach.

### Changes Required:

#### 1. Przepisanie Banner

**File**: `src/components/Banner.astro`

**Intent**: Zastąpić blok `<style>` z literałami klasami tokenów, usunąć martwe warianty `info`/`warning` i dodać ikonę, bo pilność nie może być przekazywana samym kolorem.

**Contract**: Brak propa `variant` (jedyny wariant to error; jedyny konsument `Layout.astro:40` przestaje go przekazywać). Kontener: `role="alert"`, `bg-destructive-soft text-destructive-ink border-b border-destructive`, `type-meta`, wyśrodkowany, padding ze skali Tailwind. Ikona Lucide `TriangleAlert` (`lucide-react`, renderowana statycznie po stronie serwera, bez `client:*`), `aria-hidden`. Linki w slocie dziedziczą kolor, podkreślone, `focus-visible` z pierścieniem `ring` — styl w klasach (np. `[&_a]:underline`), nie w bloku `<style>`; jeśli selektor potomka wymaga wartości arbitralnej w rozumieniu skanu, użyć wariantu Tailwind `[&_a]:...` (nie liczy się jako px/rem).

#### 2. Wywołanie w Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Dostosować jedyne użycie `Banner` do nowego kontraktu.

**Contract**: `<Banner>` bez propa `variant`; treść bez zmian (słowo „Uwaga:” zostaje).

### Success Criteria:

#### Automated Verification:

- Skan literałów jest zielony dla `Banner.astro` i `Layout.astro`: `npm run check:values`
- Typy i build przechodzą: `npx astro check` oraz `npm run build`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi: `npm run smoke`
- Test zepsucia: wycofanie jednej klasy tokenu w `Banner.astro` na literał (np. `bg-red-100`) zaczerwienia `npm run check:values`; po wycofaniu zielone

#### Manual Verification:

- Przy braku konfiguracji Supabase (uruchom z pustymi `SUPABASE_URL`/`SUPABASE_KEY`) komunikat jest czytelny w trybie jasnym i ciemnym (`.dark` na `<html>`), z ikoną i słowem „Uwaga:”
- Link „Zobacz instrukcję konfiguracji” w bannerze ma widoczny fokus z klawiatury

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Faza 3: Nawigacja główna

### Overview

Pozycje nawigacji jako wspólny komponent z fokusem, stanem aktywnym i celem dotykowym ≥40 px; belka nie rozjeżdża się na wąskim ekranie.

### Changes Required:

#### 1. Komponent pozycji nawigacji

**File**: `src/components/NavLink.astro` (nowy)

**Intent**: Jedno miejsce definicji linku nawigacji, zamiast trzech ręcznych `<a>` w layoucie.

**Contract**: Propsy: `href`, `current?: boolean`; slot na treść. Wygląd: `type-button rounded-pill px-3` z minimalną wysokością ze skali Tailwind (`min-h-10`, inline-flex, wyśrodkowanie), stan aktywny `bg-accent text-accent-foreground` + `aria-current="page"`, hover z tokenu (`hover:bg-accent`), fokus `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none` (jak `button.tsx:8`). Dodać plik do domyślnej listy skanu z fazy 1.

#### 2. Użycie w layoucie i poprawa belki

**File**: `src/layouts/AppLayout.astro`

**Intent**: Użyć `NavLink` dla „Dziś” i „Projekty” (logo też z fokusem na tokenie) oraz zadbać, by belka na 390 px nie zawijała się w niekontrolowany sposób.

**Contract**: Na wąskim ekranie: pierwszy rząd to logo + „Wyloguj”, drugi rząd to linki nawigacji (jedno przewidywalne zawinięcie, nie przypadkowe); e-mail użytkownika ukryty poniżej `md` lub skrócony (`truncate` z `min-w-0`), bez poziomego scrolla. Od `md`: układ jak dziś w jednym rzędzie. Brak wartości arbitralnych i literałów.

### Success Criteria:

#### Automated Verification:

- Skan literałów zielony dla `AppLayout.astro` i `NavLink.astro`: `npm run check:values`
- Typy i build przechodzą: `npx astro check` oraz `npm run build`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi, w tym strony `/today` i `/projects` zwracają nawigację z `aria-current="page"` na właściwej pozycji (asercja na treść HTML): `npm run smoke`
- Test zepsucia: tymczasowe usunięcie `aria-current` z `NavLink` zaczerwienia asercję smoke; po wycofaniu zielone

#### Manual Verification:

- Klawiatura: Tab przechodzi logo → Dziś → Projekty → Wyloguj, każdy element ma widoczny pierścień fokusu w obu motywach
- Aktywna pozycja jest czytelnie wyróżniona (pigułka) na `/today` i `/projects`
- Przy 390 px brak poziomego scrolla, cele dotykowe nawigacji ≥40 px, e-mail nie rozpycha belki

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Faza 4: Stany, bramka wizualna i reguła

### Overview

Pokazać wszystkie stany szkieletu obok siebie, zrobić zrzuty (desktop + 390 px, jasny i ciemny) i zostawić regułę dla kolejnego agenta.

### Changes Required:

#### 1. Strona kitchen-sink (tylko DEV)

**File**: `src/pages/dev/kitchen-sink.astro` (nowy)

**Intent**: Jedno miejsce renderujące szkielet w stanach: nawigacja (default, aktywna, fokus wymuszony klasą testową na kopii, disabled N/A) i Banner (error), by zrobić zrzuty bez ręcznego wywoływania stanów.

**Contract**: Strona zwraca 404 poza `import.meta.env.DEV` (wzorzec jak `src/pages/auth/confirm-email.astro:4`); nie dodawać do `PROTECTED_ROUTES`. Używa tych samych komponentów (`NavLink`, `Banner`), bez kopii stylów. Macierz 7 stanów w sekcji poniżej.

#### 2. Reguła i kontrola dla kolejnego agenta

**File**: `CLAUDE.md`

**Intent**: Dopisać krótko, że pliki szkieletu są chronione kontrolą literałów i gdzie jest kitchen sink, bez powielania istniejących reguł UI.

**Contract**: Dwie linie w sekcji „UI and design system” (poza blokiem `<!-- BEGIN @przeprogramowani/10x-cli -->`): `npm run check:values` skanuje pliki szkieletu i działa w pre-commit; kitchen sink w `/dev/kitchen-sink` (tylko DEV). Brak reguł zachęcających do wartości jednorazowych do usunięcia (research: nie ma takich).

### Macierz 7 stanów (kryteria sukcesu fazy)

| Stan | NavLink | Banner |
| --- | --- | --- |
| default | pokazany | pokazany |
| hover | pokazany | N/A (brak interakcji poza linkiem w slocie) |
| focus-visible | pokazany (pierścień `ring`) | pokazany dla linku w slocie |
| disabled | N/A (nawigacja nie ma stanu wyłączonego) | N/A |
| error | N/A | pokazany (to jedyny wariant) |
| empty | N/A | N/A |
| loading | N/A | N/A |

### Success Criteria:

#### Automated Verification:

- Skan literałów zielony dla wszystkich plików szkieletu: `npm run check:values`
- Build przechodzi, a `/dev/kitchen-sink` nie jest dostępny w buildzie produkcyjnym (404 w `npm run preview`): `npm run build`
- Lint i smoke przechodzą: `npm run lint` oraz `npm run smoke`

#### Manual Verification:

- Zrzuty kitchen-sink desktop (1280 px) i mobile (390 px), jasny i ciemny, zapisane w folderze zmiany (`context/changes/ui-app-shell/screenshots/`) i porównane z `reference/screenshots/*.png` pod kątem palety i typografii
- Każda komórka macierzy 7 stanów jest pokazana albo oznaczona N/A z powodem (jak w tabeli wyżej)
- `CLAUDE.md` zawiera dwie nowe linie poza blokiem CLI

**Implementation Note**: Po zakończeniu fazy zatrzymaj się na ręczne potwierdzenie; kolejny krok to `/10x-impl-review ui-app-shell`.

---

## Testing Strategy

### Unit Tests:

- Nie dotyczy (brak logiki); kontrola literałów weryfikowana testem zepsucia w fazie 1.

### Integration Tests:

- Smoke (`scripts/smoke.mjs`) z asercją na `aria-current` w nawigacji (faza 3). Wyspy React nie powstają, więc reguła z `lessons.md` o wyspach nie wymaga dodatkowego kroku.

### Manual Testing Steps:

1. Uruchom aplikację, zaloguj się, przejdź Tabem po belce w jasnym i ciemnym motywie.
2. Zwęź okno do 390 px na `/today` i `/projects`: brak poziomego scrolla, belka zawija się przewidywalnie.
3. Uruchom bez Supabase i obejrzyj banner w obu motywach.

## Performance Considerations

Brak (zmiana statyczna, bez nowych wysp i zależności).

## Migration Notes

Brak danych do migracji. Jedyna zmiana kontraktu to usunięcie propa `variant` z `Banner` (jedyny konsument: `Layout.astro`).

## References

- Related research: `context/changes/ui-app-shell/research.md`
- Wzorzec fokusu: `src/components/ui/button.tsx:8`
- Spec: `context/foundation/design-system/design-system.md` (Navigation, Banner, Interaction rules)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kontrola literałów w plikach szkieletu

#### Automated

- [x] 1.1 Skan wskazuje wyłącznie `Banner.astro` (liczba trafień równa 9 przed fazą 2) i kończy się kodem 1: `npm run check:values` — 50bbaf3
- [x] 1.2 Skan czystego pliku (`src/layouts/AppLayout.astro`) kończy się kodem 0: `node scripts/check-hardcoded-values.mjs src/layouts/AppLayout.astro` — 50bbaf3
- [x] 1.3 Test zepsucia: tymczasowe dodanie `bg-purple-300` do `AppLayout.astro` zaczerwienia skan z numerem linii; po wycofaniu skan jest zielony dla tego pliku — 50bbaf3
- [x] 1.4 Lint przechodzi dla zmienionych plików: `npm run lint` — 50bbaf3

#### Manual

- [x] 1.5 Zatwierdzenie commita ze zmienionym `Banner.astro` (przed fazą 2) jest blokowane przez pre-commit z czytelnym komunikatem (sprawdzić na kopii zmiany, nie na właściwym commicie fazy) — 50bbaf3

### Phase 2: Banner na tokenach

#### Automated

- [x] 2.1 Skan literałów jest zielony dla `Banner.astro` i `Layout.astro`: `npm run check:values` — d52960f
- [x] 2.2 Typy i build przechodzą: `npx astro check` oraz `npm run build` — d52960f
- [x] 2.3 Lint przechodzi: `npm run lint` — d52960f
- [x] 2.4 Smoke przechodzi: `npm run smoke` — d52960f
- [x] 2.5 Test zepsucia: wycofanie jednej klasy tokenu w `Banner.astro` na literał (np. `bg-red-100`) zaczerwienia `npm run check:values`; po wycofaniu zielone — d52960f

#### Manual

- [x] 2.6 Przy braku konfiguracji Supabase komunikat jest czytelny w trybie jasnym i ciemnym, z ikoną i słowem „Uwaga:” — d52960f
- [x] 2.7 Link „Zobacz instrukcję konfiguracji” w bannerze ma widoczny fokus z klawiatury — d52960f

### Phase 3: Nawigacja główna

#### Automated

- [x] 3.1 Skan literałów zielony dla `AppLayout.astro` i `NavLink.astro`: `npm run check:values`
- [x] 3.2 Typy i build przechodzą: `npx astro check` oraz `npm run build`
- [x] 3.3 Lint przechodzi: `npm run lint`
- [x] 3.4 Smoke przechodzi, w tym `/today` i `/projects` zwracają nawigację z `aria-current="page"` na właściwej pozycji: `npm run smoke`
- [x] 3.5 Test zepsucia: tymczasowe usunięcie `aria-current` z `NavLink` zaczerwienia asercję smoke; po wycofaniu zielone

#### Manual

- [x] 3.6 Klawiatura: Tab przechodzi logo → Dziś → Projekty → Wyloguj, każdy element ma widoczny pierścień fokusu w obu motywach
- [x] 3.7 Aktywna pozycja jest czytelnie wyróżniona (pigułka) na `/today` i `/projects`
- [x] 3.8 Przy 390 px brak poziomego scrolla, cele dotykowe nawigacji ≥40 px, e-mail nie rozpycha belki

### Phase 4: Stany, bramka wizualna i reguła

#### Automated

- [ ] 4.1 Skan literałów zielony dla wszystkich plików szkieletu: `npm run check:values`
- [ ] 4.2 Build przechodzi, a `/dev/kitchen-sink` nie jest dostępny w buildzie produkcyjnym (404 w `npm run preview`): `npm run build`
- [ ] 4.3 Lint i smoke przechodzą: `npm run lint` oraz `npm run smoke`

#### Manual

- [ ] 4.4 Zrzuty kitchen-sink desktop (1280 px) i mobile (390 px), jasny i ciemny, zapisane w `context/changes/ui-app-shell/screenshots/` i porównane z `reference/screenshots/*.png`
- [ ] 4.5 Każda komórka macierzy 7 stanów jest pokazana albo oznaczona N/A z powodem
- [ ] 4.6 `CLAUDE.md` zawiera dwie nowe linie poza blokiem CLI
