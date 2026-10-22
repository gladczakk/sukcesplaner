# Widok /today — przegląd UI Implementation Plan

## Overview

Wydzielamy powielony markup widoku `/today` (wiersz listy, link z fokusem, chip, komunikat błędu) do komponentów, które spec systemu projektowego nazywa wprost, naprawiamy fokus i stan błędu oraz rozszerzamy kontrolę `check:values` na pliki widoku. To druga z pięciu zmian wizualnych (szkielet → /today → projekty → auth → dashboard/index/Welcome); komponenty trafiają do wspólnego katalogu, żeby zmiana #3 (projekty) mogła ich użyć.

## Current State Analysis

- Widok ma 0 literałów, ale `today.astro` składa listę z czterech niemal identycznych bloków `<li>` (l. 86, 118, 154, 228) i piątego wariantu dla milestona (l. 185); styl linku z fokusem jest wklejony 7× (l. 92, 124, 160, 191, 211, 223, 234), wszędzie z `outline-none` (`research.md` C1, C2).
- Chip „Pominięte wczoraj” jest zbudowany ręcznie (`today.astro:134-148`) obok `DueChip.astro`, który ma trzy inline SVG (C3).
- Komunikat błędu jest skopiowany w `TodayTaskActions.tsx:136-141`, `CloseMilestoneButton.tsx:62-67`, `RestoreDeferredButton.tsx:63-68` i `AddTaskFromTodayDialog.tsx:345-351`, bez słowa „Błąd:”; błąd ładowania strony (`today.astro:67-70`) to sam kolor, bez ikony (C4).
- `ui/button.tsx:8` ma `outline-none` (follow-up z `ui-app-shell`); link „Projekty” w stanie pustym (`today.astro:76-78`) nie ma klas fokusu.
- Wariant kontraktu: istniejący system projektowy; tokeny w `src/styles/global.css`; spec w `context/foundation/design-system/design-system.md`.

## Desired End State

`/today` składa się ze wspólnych komponentów (`TaskRow`, `TextLink`, `Chip`, `InlineError`), a `today.astro` nie ma już powielonych bloków `<li>` ani wklejonych klas fokusu. Fokus jest widoczny także w trybie wysokiego kontrastu Windows. Błąd ładowania listy i błędy akcji mają ikonę i słowo „Błąd:”. Rytm powtarzalnego zadania jest oznaczony ikoną przy tekście (FR-018). Pliki widoku są chronione przez `check:values` w pre-commit, a `/dev/kitchen-sink` pokazuje komponenty w obu motywach.

### Key Discoveries:

- Smoke ma już cztery kroki dla `/today` z asercjami na treść: zadanie milestona (`smoke.mjs:383`), przeniesione z akcją przywrócenia (`:435`), częściowe z akcjami (`:453`), milestone do zamknięcia (`:510`) — to siatka regresji dla refaktoru markupu.
- `lucide-react` jest zależnością i renderuje się statycznie w `.astro` bez `client:*` (wzorzec `Banner.astro`); nic nowego do instalowania.
- Wzorzec fokusu do powtórzenia: `NavLink.astro` (`outline-hidden`, `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`), po ustaleniu F3 z przeglądu `ui-app-shell`.
- Lekcja z `lessons.md`: wyspy React renderują się w HTML, a błąd SSR jest połykany (status 200); komponent importowany przez wyspę musi mieć test zepsucia, który zaczerwieni krok smoke (tu: `throw` w module `InlineError`).

## What We're NOT Doing

- `TaskCheck` (checkbox ze spec) — zostaje obecny układ przycisków „Zrobione / Częściowo / Na jutro”; decyzja UX, nie poprawka stylu.
- Rail „Najbliższe milestony”, Banner o zbliżającym się milestonie, filtr obszarów (FR-013), `ProjectDot` (FR-014; brak koloru projektu w `src/types.ts` i `supabase/migrations/`) — odroczone (`research.md` C5), bez otwierania nowego tematu w tej zmianie.
- Zmiany w widokach projektów (kopie chipa sukcesu w `projects/[id].astro:138`, komunikatów błędu w `components/projects/*`, linków z fokusem w `projects/*`) — zmiana #3.
- `outline-hidden` w pozostałych plikach `src/components/ui/*` poza `button.tsx` oraz w `auth/FormField.tsx` — zmiany #3 i #4.
- Nowa zależność, `shadcn add`, nowy system projektowy, zmiany `global.css` (wszystkie potrzebne tokeny już są).
- Zmiana logiki akcji (`useTaskApi`, przeładowanie strony po akcji) i modelu danych.

## Implementation Approach

Kolejność ze skilla `/10x-ui`: kontrola → komponenty → widok → stany. Pierwsza faza rozszerza `check:values` o pliki widoku, żeby kolejne fazy miały dowód zielono-czerwony i żeby nowe komponenty były chronione od razu. Faza 2 tworzy komponenty i podmienia powielony błąd w czterech wyspach (mały, niezależny zakres), faza 3 składa widok z gotowych elementów, faza 4 dokłada bramkę wizualną i regułę. Nowe komponenty współdzielone leżą w `src/components/` (`TextLink`, `Chip`, `TaskRow`) i `src/components/ui/` (`inline-error`).

## Faza 1: Kontrola literałów i fokus bazowy

### Overview

Pliki widoku `/today` i nowe komponenty trafiają pod `check:values` oraz `lint-staged`; wspólny `Button` dostaje fokus odporny na tryb wysokiego kontrastu.

### Changes Required:

#### 1. Rozszerzenie skanu i pre-commit

**File**: `scripts/check-hardcoded-values.mjs`, `package.json`

**Intent**: Włączyć pliki widoku i planowane komponenty do ochrony przed literałami, tak jak pliki szkieletu w `ui-app-shell`.

**Contract**: `DEFAULT_FILES` zyskuje: `src/pages/today.astro`, `src/components/TextLink.astro`, `src/components/Chip.astro`, `src/components/TaskRow.astro`, `src/components/ui/inline-error.tsx`, `src/components/today/TodayTaskActions.tsx`, `src/components/today/CloseMilestoneButton.tsx`, `src/components/today/RestoreDeferredButton.tsx`, `src/components/today/AddTaskFromTodayDialog.tsx` (pliki jeszcze nieistniejące są pomijane z listy domyślnej, jak dotąd). Glob w `lint-staged` rozszerzony o te same ścieżki; nie dodawać plików `ui/*` poza `inline-error.tsx` ani widoków projektów.

#### 2. Fokus we wspólnym Button

**File**: `src/components/ui/button.tsx`

**Intent**: Zamienić `outline-none` na `outline-hidden`, żeby pierścień fokusu przetrwał tryb forced-colors Windows (follow-up F3 z `ui-app-shell`; decyzja użytkownika: wyjątek od zasady „jeden widok”, jedna klasa w jednym pliku).

**Contract**: W stałej `buttonVariants` (`button.tsx:8`) jedyna zmiana to `outline-none` → `outline-hidden`; reszta klas, warianty i rozmiary bez zmian.

### Success Criteria:

#### Automated Verification:

- Skan zielony dla istniejących plików z listy: `npm run check:values`
- Test zepsucia: `bg-purple-300` dopisane tymczasowo do `today.astro` zaczerwienia `npm run check:values` z numerem linii; po wycofaniu zielone
- Typy i build przechodzą: `npx astro check` oraz `npm run build`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi: `npm run smoke`

#### Manual Verification:

- W trybie wysokiego kontrastu Windows fokus z klawiatury na przycisku „Zrobione” w wierszu `/today` jest widoczny
- Wygląd przycisków w trybie zwykłym bez zmian na `/today`, `/projects` i w dialogach

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: Komponenty współdzielone

### Overview

Trzy komponenty zastępują powielony markup: link z fokusem, chip terminu (z wariantem „pominięte”) i komunikat błędu; błąd zostaje podmieniony w czterech wyspach widoku.

### Changes Required:

#### 1. TextLink

**File**: `src/components/TextLink.astro` (nowy)

**Intent**: Jedna definicja linku tekstowego z fokusem na tokenie, zamiast siedmiu wklejonych klas.

**Contract**: Propsy: `href`, `standalone?: boolean`. Wygląd: `rounded-sm underline outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`; wariant `standalone` (linki jako osobna akcja) dodaje `type-button inline-flex min-h-10 items-center` (cel ≥40 px). Slot na treść; atrybuty `aria-label` przekazywane dalej.

#### 2. Chip

**File**: `src/components/Chip.astro` (nowy; zastępuje `src/components/today/DueChip.astro`, który znika w fazie 3)

**Intent**: Jeden chip „ikona + słowo” dla wszystkich tonów, z ikonami Lucide zamiast inline SVG.

**Contract**: Propsy: `tone: "overdue" | "today" | "tomorrow" | "soon" | "date" | "none" | "skipped"`, `label: string`. Klasy kolorów jak w `DueChip` (`bg-destructive-soft text-destructive-ink`, `bg-warning-soft text-warning-ink`, `bg-info-soft text-info-ink`, `bg-muted text-muted-foreground`); `skipped` używa tonu `warning` i ikony `Clock`. Ikony `lucide-react` renderowane statycznie, `aria-hidden`: `TriangleAlert` (overdue), `Sun` (today), `ArrowRight` (tomorrow), `Clock` (skipped); pozostałe tony bez ikony, jak dziś. Prefiks `sr-only` „Termin: ” zostaje dla tonów terminu, nie dla `skipped`. Typy tonu `DueTone` z `src/lib/today.ts` pozostają źródłem wartości dla tonów terminu.

#### 3. InlineError i użycie w wyspach

**File**: `src/components/ui/inline-error.tsx` (nowy); `src/components/today/TodayTaskActions.tsx`, `CloseMilestoneButton.tsx`, `RestoreDeferredButton.tsx`, `AddTaskFromTodayDialog.tsx`

**Intent**: Jeden komunikat błędu z ikoną i słowem „Błąd:” (zgodny z `ui/field.tsx`), zamiast czterech kopii.

**Contract**: `InlineError({ children, className? })` renderuje `<p role="alert" className="type-meta text-destructive-ink flex items-center gap-1">` z `CircleAlert` (`size-4 shrink-0`, `aria-hidden`) i `<span><span className="font-semibold">Błąd:</span> {children}</span>`; scalanie klas przez `cn()` z `@/lib/utils`. W czterech wyspach blok błędu zastąpiony `<InlineError>…</InlineError>` (w `AddTaskFromTodayDialog` tylko blok `generalError`; błędy pól zostają w `Field`). Komunikaty tekstowe (np. „Nie znaleziono zadania. Odśwież stronę.”) bez zmian.

### Success Criteria:

#### Automated Verification:

- Skan zielony dla `TextLink.astro`, `Chip.astro`, `inline-error.tsx` i czterech komponentów `today/*`: `npm run check:values`
- Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi (wyspy `/today` nadal renderują przyciski akcji w HTML): `npm run smoke`
- Test zepsucia: tymczasowy `throw` na poziomie modułu w `inline-error.tsx` zaczerwienia kroki smoke dla `/today` z akcjami (`today page shows the task actions of a partial task`); po wycofaniu zielone

#### Manual Verification:

- Wywołany błąd akcji (np. zatrzymanie Supabase i klik „Zrobione”) pokazuje komunikat z ikoną i słowem „Błąd:” w wierszu, w obu motywach
- Link do projektu (jeszcze stara klasa w `today.astro`) i `TextLink` nie mają jeszcze wspólnego użycia — wygląd `/today` bez zmian poza błędami akcji

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Faza 3: TaskRow i today.astro

### Overview

`today.astro` składa wiersze z jednego komponentu; ikona rytmu (FR-018), `type-section` dla milestona i spójne stany błędu oraz pusty.

### Changes Required:

#### 1. TaskRow

**File**: `src/components/TaskRow.astro` (nowy)

**Intent**: Jedna definicja wiersza listy, zamiast czterech skopiowanych `<li>` i wariantu milestona.

**Contract**: Propsy: `variant?: "default" | "milestone"`. Korzeń `<li>` z klasami `flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4`; wariant `milestone` dodaje `bg-accent`. Sloty: `title` (dla `default` w `type-task break-words text-foreground`, dla `milestone` w `type-section break-words text-foreground`), `meta` (`type-meta break-words text-muted-foreground`), `end` (kontener `flex min-w-0 shrink-0 flex-col items-start gap-2 sm:items-end`; dla `milestone` `flex shrink-0 flex-wrap items-start gap-2 self-start`). Lewa kolumna `min-w-0`.

#### 2. Przepisanie widoku

**File**: `src/pages/today.astro`

**Intent**: Użyć `TaskRow`, `TextLink`, `Chip` i `InlineError`; oznaczyć rytm ikoną; ujednolicić błąd ładowania.

**Contract**: Wiersze: rutyna, pominięte, zadanie, przeniesione na później (w `<details>`) i milestone przez `TaskRow` (po jednym wywołaniu na wariant). Linki do projektu i „Otwórz projekt” oraz „Projekty” w stanie pustym przez `TextLink` (ostatnie dwa z `standalone`, `aria-label` „Otwórz projekt {nazwa}” zostaje). Chip terminu przez `Chip` (`tone` i `label` z `dueChip`), chip „Pominięte wczoraj” przez `Chip tone="skipped"`. W linii meta wiersza rutyny przed tekstem rytmu ikona `Repeat` z `lucide-react` (`size-3.5`, `aria-hidden`); tekst rytmu (`formatRecurrence`) zostaje (ikona + słowo). Błąd ładowania (`unavailable`) jako `<InlineError>` zamiast `type-quote` bez ikony (zachowuje `role="alert"` i komunikat). `<summary>` zostaje elementem natywnym z klasami fokusu, w których `outline-none` zamienione na `outline-hidden`. `DueChip.astro` usunięty wraz z importem.

### Success Criteria:

#### Automated Verification:

- Skan zielony dla `today.astro`, `TaskRow.astro` i pozostałych plików z listy: `npm run check:values`
- Brak skopiowanych bloków wiersza w widoku: `grep -c "sm:items-start sm:justify-between" src/pages/today.astro` zwraca 0
- Brak `outline-none` w widoku `today.astro` i `components/today/*`: `grep -c "outline-none" src/pages/today.astro src/components/today/*` zwraca same 0
- Typy i build przechodzą: `npx astro check` oraz `npm run build`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi bez zmian oczekiwań na `/today` (zadanie, przeniesione, częściowe, milestone): `npm run smoke`
- Test zepsucia: tymczasowe pominięcie `<slot name="end" />` w `TaskRow.astro` zaczerwieni kroki smoke z akcjami (`today page shows the task actions of a partial task`); po wycofaniu zielone

#### Manual Verification:

- `/today` z danymi wygląda tak jak dotąd poza zamierzonymi zmianami (ikona rytmu przy rutynie, „Pominięte wczoraj” z ikoną zegara, nagłówek milestona w `type-section`)
- Tab przechodzi po linkach do projektu, „Otwórz projekt” i „Projekty” w stanie pustym, każdy ma widoczny pierścień fokusu w obu motywach
- Przy 390 px brak poziomego scrolla; „Otwórz projekt” i „Projekty” mają cel dotykowy ≥40 px
- Błąd ładowania listy (Supabase zatrzymany) pokazuje komunikat z ikoną i słowem „Błąd:”

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Faza 4: Stany, bramka wizualna i reguła

### Overview

Pokazać komponenty `/today` we wszystkich stanach obok siebie w obu motywach, zrobić zrzuty i zaktualizować regułę dla kolejnego agenta.

### Changes Required:

#### 1. Rozszerzenie kitchen-sink

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Dołożyć sekcje komponentów widoku, żeby zrobić zrzuty bez przygotowywania danych.

**Contract**: Nowe sekcje (każda w obu kolumnach jasny/ciemny, jak istniejące): `TaskRow` (wariant domyślny z chipem terminu, rutyna z ikoną `Repeat`, „pominięte” z `Chip tone="skipped"`, wariant `milestone`; zawartość slotu `end` jako statyczne `Button` bez wysp), `Chip` (wszystkie tony), `TextLink` (w linii meta oraz `standalone`), `InlineError` (jeden komunikat, statycznie). Symulacje hover/fokus klasami jak w istniejących sekcjach. Strona nadal zwraca 404 poza `import.meta.env.DEV`.

#### 2. Reguła

**File**: `CLAUDE.md`

**Intent**: Wskazać kolejnemu agentowi, że pliki widoku `/today` i jego komponenty są pod kontrolą literałów.

**Contract**: W istniejącym punkcie „Hard-coded value check” (sekcja „UI and design system”, poza blokiem `<!-- BEGIN @przeprogramowani/10x-cli -->`) uzupełnić listę chronionych plików o `today.astro`, `TaskRow`, `TextLink`, `Chip`, `InlineError` i komponenty `components/today/*`; bez nowych punktów.

### Macierz 7 stanów (kryteria sukcesu fazy)

| Stan | TaskRow | Chip | TextLink | InlineError |
| --- | --- | --- | --- | --- |
| default | pokazany (4 warianty) | pokazany (wszystkie tony) | pokazany | pokazany |
| hover | N/A (wiersz nie reaguje na hover; akcje to `Button`) | N/A | pokazany (symulacja) | N/A |
| focus-visible | N/A (wiersz nie jest kontrolką) | N/A | pokazany (symulacja; w tym `standalone`) | N/A |
| disabled | N/A | N/A | N/A | N/A |
| error | N/A | N/A | N/A | pokazany (to jest stan błędu) |
| empty | N/A (stan pusty to osobna sekcja strony, nie komponentu) | N/A | N/A | N/A |
| loading | N/A (strona SSR; przeładowanie po akcji) | N/A | N/A | N/A |

### Success Criteria:

#### Automated Verification:

- Skan zielony dla wszystkich plików z listy: `npm run check:values`
- Build przechodzi, a `/dev/kitchen-sink` nie jest dostępny w buildzie produkcyjnym (404 w `npm run preview`): `npm run build`
- Lint i smoke przechodzą: `npm run lint` oraz `npm run smoke`

#### Manual Verification:

- Zrzuty kitchen-sink desktop (1280 px) i mobile (390 px), jasny i ciemny, zapisane w `context/changes/ui-today-view/screenshots/` i porównane z `context/foundation/design-system/reference/screenshots/day-view-*.png`
- Każda komórka macierzy 7 stanów jest pokazana albo oznaczona N/A z powodem
- `CLAUDE.md` ma zaktualizowany punkt „Hard-coded value check” poza blokiem CLI

**Implementation Note**: Po zakończeniu fazy zatrzymaj się na ręczne potwierdzenie; kolejny krok to `/10x-impl-review ui-today-view`.

---

## Testing Strategy

### Unit Tests:

- Nie dotyczy (brak logiki); `check:values` weryfikowane testem zepsucia w fazie 1.

### Integration Tests:

- Smoke (`scripts/smoke.mjs`) ma cztery kroki `/today` z asercjami na treść HTML (zadanie, przeniesione z akcją przywrócenia, częściowe z akcjami, milestone do zamknięcia); po refaktorze przechodzą bez zmian oczekiwań. Testy zepsucia w fazach 2 i 3 dowodzą, że wyspy i `TaskRow` faktycznie renderują się w HTML (lekcja o połkniętym błędzie SSR).

### Manual Testing Steps:

1. Uruchom aplikację, zaloguj się i obejrzyj `/today` z danymi: rutyna, pominięte, zadanie, przeniesione, milestone do zamknięcia.
2. Przejdź Tabem po linkach i przyciskach wiersza w jasnym i ciemnym motywie; przy 390 px sprawdź brak poziomego scrolla.
3. Zatrzymaj Supabase i odśwież `/today`, potem wywołaj błąd akcji: komunikaty mają ikonę i „Błąd:”.

## Performance Considerations

Brak (zmiana statyczna, bez nowych wysp i zależności; ikony Lucide renderowane po stronie serwera).

## Migration Notes

Usunięcie `src/components/today/DueChip.astro` (jedyny importer to `today.astro`) i zastąpienie przez `src/components/Chip.astro`. Brak danych do migracji.

## References

- Related research: `context/changes/ui-today-view/research.md`
- Wzorzec fokusu i komponentu współdzielonego: `src/components/NavLink.astro`, `src/components/Banner.astro`
- Spec: `context/foundation/design-system/design-system.md` (TaskRow, Chip, Interaction rules), `reference/components/{TaskRow,Chip}.md`
- Poprzednia zmiana: `context/archive/2026-10-22-ui-app-shell/` (plan, review, follow-up F3)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kontrola literałów i fokus bazowy

#### Automated

- [x] 1.1 Skan zielony dla istniejących plików z listy: `npm run check:values`
- [x] 1.2 Test zepsucia: `bg-purple-300` dopisane tymczasowo do `today.astro` zaczerwienia `npm run check:values` z numerem linii; po wycofaniu zielone
- [x] 1.3 Typy i build przechodzą: `npx astro check` oraz `npm run build`
- [x] 1.4 Lint przechodzi: `npm run lint`
- [x] 1.5 Smoke przechodzi: `npm run smoke`

#### Manual

- [x] 1.6 W trybie wysokiego kontrastu Windows fokus z klawiatury na przycisku „Zrobione” w wierszu `/today` jest widoczny
- [x] 1.7 Wygląd przycisków w trybie zwykłym bez zmian na `/today`, `/projects` i w dialogach

### Phase 2: Komponenty współdzielone

#### Automated

- [ ] 2.1 Skan zielony dla `TextLink.astro`, `Chip.astro`, `inline-error.tsx` i czterech komponentów `today/*`: `npm run check:values`
- [ ] 2.2 Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- [ ] 2.3 Lint przechodzi: `npm run lint`
- [ ] 2.4 Smoke przechodzi (wyspy `/today` nadal renderują przyciski akcji w HTML): `npm run smoke`
- [ ] 2.5 Test zepsucia: tymczasowy `throw` na poziomie modułu w `inline-error.tsx` zaczerwienia kroki smoke dla `/today` z akcjami; po wycofaniu zielone

#### Manual

- [ ] 2.6 Wywołany błąd akcji pokazuje komunikat z ikoną i słowem „Błąd:” w wierszu, w obu motywach
- [ ] 2.7 Wygląd `/today` bez zmian poza błędami akcji

### Phase 3: TaskRow i today.astro

#### Automated

- [ ] 3.1 Skan zielony dla `today.astro`, `TaskRow.astro` i pozostałych plików z listy: `npm run check:values`
- [ ] 3.2 Brak skopiowanych bloków wiersza w widoku: `grep -c "sm:items-start sm:justify-between" src/pages/today.astro` zwraca 0
- [ ] 3.3 Brak `outline-none` w `today.astro` i `components/today/*`: `grep -c "outline-none"` zwraca same 0
- [ ] 3.4 Typy i build przechodzą: `npx astro check` oraz `npm run build`
- [ ] 3.5 Lint przechodzi: `npm run lint`
- [ ] 3.6 Smoke przechodzi bez zmian oczekiwań na `/today`: `npm run smoke`
- [ ] 3.7 Test zepsucia: tymczasowe pominięcie `<slot name="end" />` w `TaskRow.astro` zaczerwieni kroki smoke z akcjami; po wycofaniu zielone

#### Manual

- [ ] 3.8 `/today` z danymi wygląda tak jak dotąd poza zamierzonymi zmianami (ikona rytmu przy rutynie, „Pominięte wczoraj” z ikoną zegara, nagłówek milestona w `type-section`)
- [ ] 3.9 Tab przechodzi po linkach do projektu, „Otwórz projekt” i „Projekty” w stanie pustym, każdy ma widoczny pierścień fokusu w obu motywach
- [ ] 3.10 Przy 390 px brak poziomego scrolla; „Otwórz projekt” i „Projekty” mają cel dotykowy ≥40 px
- [ ] 3.11 Błąd ładowania listy (Supabase zatrzymany) pokazuje komunikat z ikoną i słowem „Błąd:”

### Phase 4: Stany, bramka wizualna i reguła

#### Automated

- [ ] 4.1 Skan zielony dla wszystkich plików z listy: `npm run check:values`
- [ ] 4.2 Build przechodzi, a `/dev/kitchen-sink` nie jest dostępny w buildzie produkcyjnym (404 w `npm run preview`): `npm run build`
- [ ] 4.3 Lint i smoke przechodzą: `npm run lint` oraz `npm run smoke`

#### Manual

- [ ] 4.4 Zrzuty kitchen-sink desktop (1280 px) i mobile (390 px), jasny i ciemny, zapisane w `context/changes/ui-today-view/screenshots/` i porównane z `reference/screenshots/day-view-*.png`
- [ ] 4.5 Każda komórka macierzy 7 stanów jest pokazana albo oznaczona N/A z powodem
- [ ] 4.6 `CLAUDE.md` ma zaktualizowany punkt „Hard-coded value check” poza blokiem CLI
