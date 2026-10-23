# Widoki /projects i /projects/[id] — przegląd UI Implementation Plan

## Overview

Przepinamy widoki projektów (`/projects`, `/projects/[id]` i komponenty `src/components/projects/*`) na wspólne komponenty z poprzednich zmian (`InlineError`, `TextLink`, `Chip`, `TaskRow`), domykamy odroczone follow-upy (fokus w `ui/*`, stan `aria-disabled` w `Button`) i obejmujemy pliki widoków kontrolą `check:values`. To trzecia z pięciu zmian wizualnych (szkielet → /today → **projekty** → auth → dashboard/index/Welcome).

## Current State Analysis

- Skan literałów daje 0 trafień w 10 plikach widoków; żaden z nich nie używa jeszcze `InlineError`, `Chip`, `TextLink` ani `TaskRow` (`research.md`, Summary).
- Blok błędu (`role="alert"` + `CircleAlert`) jest skopiowany w `MilestoneFormDialog.tsx:172-177`, `ProjectFormDialog.tsx:195-200`, `TaskFormDialog.tsx:374-379`, `ui/confirm-dialog.tsx:53-58`, a w `MilestoneRowActions.tsx:82-85` i `TaskRowActions.tsx:84-87` bez słowa „Błąd:”; błędy ładowania stron (`index.astro:39-41`, `[id].astro:55-57`, `:103-105`) to sam kolor bez ikony (C1).
- Linki: `index.astro:53` i `[id].astro:66` z `outline-none`, `[id].astro:58` i `:261` bez klas fokusu; `outline-none` w siedmiu miejscach sześciu plików `ui/` (`alert-dialog:40`, `dialog:51` i `:60`, `input:11`, `select:21`, `textarea:10`, `weekday-picker:58`) (C2).
- Ręczny chip „zamknięty” (`[id].astro:138-152`, z inline SVG), a `Chip` nie ma tonu `done` (C3). Własny wiersz zadania (`[id].astro:176-211`) i nazwa projektu w `font-serif text-xl font-medium` (`index.astro:55`) (C4).
- Idiom `aria-disabled:pointer-events-none aria-disabled:opacity-50` jest skopiowany w sześciu plikach (`MilestoneRowActions.tsx:65`, `TaskFormDialog.tsx:268`, `AddTaskFromTodayDialog.tsx:212`, `CloseMilestoneButton.tsx:52`, `RestoreDeferredButton.tsx:53`, `TodayTaskActions.tsx:63`), a `Button` stylizuje tylko `disabled:` (`button.tsx:8`); akcje wierszy projektów nie mają `aria-busy` (C5).
- Wariant kontraktu: istniejący system projektowy (`global.css`, `design-system.md`); wspólne komponenty już są w `src/components/` i `src/components/ui/`.

## Desired End State

Strony i komponenty projektów używają `InlineError`, `TextLink`, `Chip` (z tonem `done`) i `TaskRow` (z wariantem `compact`); każdy błąd ma ikonę i słowo „Błąd:”; fokus jest widoczny w trybie wysokiego kontrastu na linkach, polach, selectach, dialogach i przycisku zamknięcia; stan `aria-disabled` jest zdefiniowany raz w `Button`, a akcje wierszy mają `aria-busy`; pliki widoków projektów są pod `check:values` w pre-commit; `/dev/kitchen-sink` pokazuje nowe warianty.

### Key Discoveries:

- Smoke ma bogaty zestaw kroków dla `/projects/[id]` z asercjami na treść: nazwy zadań i rytm (`smoke.mjs:377, 831, 997`), „zamknięty” / „Otwórz ponownie” (`:321`), „Edytuj zadanie …” (`:546, 831`), „Dodaj milestone” / „Zamknij milestone” (`:272`), „Usuń projekt…” (`:1365`), „Nie znaleziono projektu” (`:1389`); to siatka regresji dla przepisania markupu.
- Zagnieżdżenie: `TaskRow` renderuje slot `meta` wewnątrz `<p>`, więc treść w tym slocie musi być liniowa (komentarz w `TaskRow.astro`, F5 przeglądu `ui-today-view`); chip „zamknięty” (`<span>`) jest bezpieczny.
- `Chip` renderuje ikony Lucide statycznie w `.astro` (wzorzec `Banner`/`Chip`), więc `Check` dla tonu `done` nie wymaga wyspy.
- Lekcja z `lessons.md`: kryterium „zero X w katalogu” wymaga wypisania każdego pliku z trafieniem w „Changes Required” — poniżej każdy plik z `outline-none` i z kopią klasy `aria-disabled:` jest wymieniony z nazwy.
- Lekcja z `lessons.md`: błąd SSR wyspy jest połykany (status 200); komponent importowany przez wyspy (`InlineError`) wymaga testu zepsucia z `throw` na poziomie modułu.

## What We're NOT Doing

- Oś czasu `MilestoneSection` (stany done/current/late, zwijanie zadań), pasek postępu, „1/5 milestonów zamkniętych”, rail z licznikami i kolorem, `ProjectDot` (brak koloru w `src/types.ts` i migracjach), chip „po terminie” (FR-015), `TaskCheck`, wiersz „Dodaj zadanie do milestona…” — odroczone (`research.md` C6; `project-crud/plan.md:36-37`, `milestone-crud/plan.md:40`, `task-crud/plan.md:40-41, 55-56`; PRD v1 non-goal postępu, `prd.md:124`).
- `ui/field.tsx` zostaje bez zmian (ma własny markup błędu z `id` i `aria-describedby`; ujednolicenie z `InlineError` odroczone, F7 przeglądu `ui-today-view`).
- Eyebrow „Projekty” nad `h1` „Projekty” na liście (`index.astro:32-33`) — lista nie ma specyfikacji, bez zmian.
- Wspólna maszyna stanów pending/error/reload w czterech `Delete*`/`TaskFormDialog` (`manual-task-add-from-list` F1: wydzielenie hooka w osobnej zmianie).
- `outline-hidden` w `auth/FormField.tsx` (zmiana #4) oraz przyciski `size="sm"` (32 px) — wybór całego repo, bez zmian rozmiaru.
- Nowa zależność, `shadcn add`, zmiany `global.css`, zmiany logiki akcji i modelu danych.

## Implementation Approach

Kolejność z `/10x-ui`: kontrola → komponenty → widok → stany. Faza 1 rozszerza `check:values` o pliki projektów i robi dwie zmiany współdzielone (`outline-hidden` w `ui/*`, style `aria-disabled:` w `Button`), żeby kolejne fazy miały dowód zielono-czerwony. Faza 2 dodaje do wspólnych komponentów to, czego brakuje (`Chip done`, `TaskRow compact`) i podmienia błąd w wyspach i `ConfirmDialog`. Faza 3 składa obie strony z gotowych elementów. Faza 4 daje bramkę wizualną i regułę. Istniejące kroki smoke dla projektów służą jako siatka regresji.

## Critical Implementation Details

- **Nawias w nazwie pliku**: `src/pages/projects/[id].astro` w globie `lint-staged` to klasa znaków (dopasowałaby `i.astro` / `d.astro`). W `package.json` zapisz go z ucieczką (`\\[id\\]` w JSON), a w teście `scripts/check-hardcoded-values.test.mjs` usuń znaki `\` z elementów globu przed porównaniem z `DEFAULT_FILES`, gdzie ścieżka jest dosłowna (`[id].astro`).

## Faza 1: Kontrola, fokus i stan Button

### Overview

Pliki widoków projektów i `ConfirmDialog` trafiają pod `check:values` oraz `lint-staged`; sześć plików `ui/` dostaje fokus odporny na tryb wysokiego kontrastu; stan `aria-disabled` jest zdefiniowany raz w `Button`.

### Changes Required:

#### 1. Rozszerzenie skanu i pre-commit

**File**: `scripts/check-hardcoded-values.mjs`, `package.json`, `scripts/check-hardcoded-values.test.mjs`

**Intent**: Włączyć widoki projektów i `ConfirmDialog` do ochrony przed literałami, tak jak pliki szkieletu i `/today`.

**Contract**: `DEFAULT_FILES` zyskuje: `src/pages/projects/index.astro`, `src/pages/projects/[id].astro`, `src/components/projects/DeleteMilestoneDialog.tsx`, `DeleteProjectDialog.tsx`, `DeleteTaskDialog.tsx`, `MilestoneFormDialog.tsx`, `MilestoneRowActions.tsx`, `ProjectFormDialog.tsx`, `TaskFormDialog.tsx`, `TaskRowActions.tsx` (wszystkie w `src/components/projects/`) oraz `src/components/ui/confirm-dialog.tsx`. Glob w `lint-staged` rozszerzony o te same ścieżki (z ucieczką nawiasu, zobacz „Critical Implementation Details”). Test równości list zostaje zielony po dostosowaniu do ucieczki. Pozostałe pliki `ui/*` nie są skanowane.

#### 2. Fokus w komponentach ui/

**File**: `src/components/ui/alert-dialog.tsx`, `dialog.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `weekday-picker.tsx`

**Intent**: Zamienić `outline-none` na `outline-hidden`, żeby pierścień fokusu przetrwał tryb forced-colors Windows (follow-up F3 z `ui-app-shell`; decyzja użytkownika: wyjątek od zasady „jeden widok”).

**Contract**: Każde wystąpienie `outline-none` w tych plikach (siedem miejsc: `alert-dialog.tsx:40`, `dialog.tsx:51` i `:60`, `input.tsx:11`, `select.tsx:21`, `textarea.tsx:10`, `weekday-picker.tsx:58`) staje się `outline-hidden`; reszta klas bez zmian. Plików `ui/` spoza listy nie ruszać.

#### 3. Stan aria-disabled w Button

**File**: `src/components/ui/button.tsx`, `src/components/projects/MilestoneRowActions.tsx`, `src/components/projects/TaskFormDialog.tsx`, `src/components/today/AddTaskFromTodayDialog.tsx`, `src/components/today/CloseMilestoneButton.tsx`, `src/components/today/RestoreDeferredButton.tsx`, `src/components/today/TodayTaskActions.tsx`

**Intent**: Zdefiniować wygląd stanu `aria-disabled` raz, w bazie `Button`, i usunąć sześć ręcznych kopii.

**Contract**: Baza `buttonVariants` zyskuje `aria-disabled:pointer-events-none aria-disabled:opacity-50` (obok istniejących `disabled:*`). W sześciu wymienionych plikach usunąć override `className="aria-disabled:pointer-events-none aria-disabled:opacity-50"` (w `TodayTaskActions.tsx` stałą `buttonClassName` i jej użycia); `aria-disabled`, `aria-busy` i pozostałe atrybuty zostają. `Select` w `TaskRowActions.tsx:70` (`className="w-auto aria-disabled:opacity-50"`) zostaje.

### Success Criteria:

#### Automated Verification:

- Skan zielony dla plików z listy: `npm run check:values`
- Test zepsucia: `bg-purple-300` dopisane tymczasowo do `src/pages/projects/index.astro` zaczerwienia `npm run check:values` z numerem linii; po wycofaniu zielone
- Brak `outline-none` w komponentach `ui/`: `grep -rn "outline-none" src/components/ui` zwraca 0 trafień
- Klasy stanu tylko w `Button`: `grep -rn "aria-disabled:pointer-events-none" src` zwraca wyłącznie `src/components/ui/button.tsx`
- Test równości list przechodzi: `npm run test:unit`
- Typy i build przechodzą: `npx astro check` oraz `npm run build`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi: `npm run smoke`

#### Manual Verification:

- W trybie wysokiego kontrastu Windows fokus z klawiatury jest widoczny na polu tekstowym, selekcie, dniach tygodnia i przycisku zamknięcia w dialogach „Dodaj zadanie” i „Edytuj projekt”
- W trybie zwykłym wygląd pól, dialogów i przycisków bez zmian; nieaktywny przycisk „Dodaj zadanie” przy zamkniętym milestonie jest wyszarzony

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: Komponenty i błędy w wyspach

### Overview

Wspólne komponenty dostają to, czego brakuje widokom projektów (`Chip done`, `TaskRow compact`), a blok błędu w wyspach i `ConfirmDialog` zostaje zastąpiony `InlineError`.

### Changes Required:

#### 1. Ton done w Chip

**File**: `src/components/Chip.astro`

**Intent**: Obsłużyć chip „zamknięty” zamiast ręcznej pigułki w `[id].astro`.

**Contract**: Typ tonu: `DueTone | "skipped" | "done"`. Ton `done`: klasy `bg-success-soft text-success-ink`, ikona Lucide `Check` (statycznie, `size-3 shrink-0`, `aria-hidden`), bez prefiksu `sr-only` „Termin: ” (jak `skipped` i `none`).

#### 2. Wariant compact i prop done w TaskRow

**File**: `src/components/TaskRow.astro`

**Intent**: Pozwolić na użycie wspólnego wiersza w karcie milestona w widoku projektu.

**Contract**: `variant?: "default" | "milestone" | "compact"` oraz `done?: boolean`. `compact`: korzeń `<li>` `flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between` bez `px-4 py-3`; tytuł w `type-body break-words` (nie `type-task`); kontener `end` jak w `default`. `done` zmienia kolor tytułu na `text-muted-foreground line-through` (zamiast `text-foreground`). Pozostałe warianty i sloty (`title`, `meta`, `end`) bez zmian.

#### 3. InlineError w ConfirmDialog i wyspach projektów

**File**: `src/components/ui/confirm-dialog.tsx`, `src/components/projects/MilestoneFormDialog.tsx`, `ProjectFormDialog.tsx`, `TaskFormDialog.tsx`, `MilestoneRowActions.tsx`, `TaskRowActions.tsx`

**Intent**: Jedna definicja komunikatu błędu z ikoną i słowem „Błąd:”, zamiast sześciu kopii (dwie bez słowa „Błąd:”).

**Contract**: Blok błędu (`<p role="alert" …>` z `CircleAlert`) zastąpiony `<InlineError>{error}</InlineError>` z `@/components/ui/inline-error` w sześciu plikach (w formularzach tylko blok `generalError`; błędy pól zostają w `Field`); nieużywane importy `CircleAlert` usunąć (w `ProjectFormDialog.tsx` zostaje `Plus`). Komunikaty tekstowe bez zmian.

#### 4. aria-busy w akcjach wierszy

**File**: `src/components/projects/MilestoneRowActions.tsx`, `src/components/projects/TaskRowActions.tsx`

**Intent**: Poinformować czytnik ekranu, że zapis trwa (tak jak w `TodayTaskActions`).

**Contract**: Przycisk przełączający milestone w `MilestoneRowActions` ma `aria-busy={pending}`; `Select` statusu w `TaskRowActions` ma `aria-busy={pending}`. `aria-disabled={pending}` zostaje.

### Success Criteria:

#### Automated Verification:

- Skan zielony dla `ui/confirm-dialog.tsx`, `ui/inline-error.tsx`, sześciu komponentów `projects/*`, `Chip.astro` i `TaskRow.astro`: `npm run check:values`
- Brak skopiowanego bloku błędu: `grep -rn "<CircleAlert" src/components/projects src/components/ui/confirm-dialog.tsx` zwraca 0 trafień
- Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi (wyspy projektów i `/today` nadal renderują się w HTML): `npm run smoke`
- Test zepsucia: tymczasowy `throw` na poziomie modułu w `ui/inline-error.tsx` zaczerwienia kroki smoke dla stron projektów i `/today`; po wycofaniu zielone

#### Manual Verification:

- Błąd akcji wiersza (DevTools → Network → Offline, klik „Zamknij milestone” lub zmiana statusu zadania) pokazuje komunikat z ikoną i słowem „Błąd:”, w obu motywach
- Błąd potwierdzenia usunięcia (Offline w dialogu „Usuń projekt”) pokazuje „Błąd:” wewnątrz dialogu
- Poza komunikatami błędów `/projects/[id]` wygląda tak jak wcześniej

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Faza 3: Strony projektów

### Overview

`index.astro` i `[id].astro` składają się ze wspólnych komponentów; błędy ładowania mają ikonę i słowo; fokus jest spójny.

### Changes Required:

#### 1. Lista projektów

**File**: `src/pages/projects/index.astro`

**Intent**: Błąd ładowania z `InlineError`, spójny fokus i typografia tokenem.

**Contract**: `unavailable` jako `<InlineError role="status" className="mt-8">` (statyczna treść przy ładowaniu, zgodnie z F1 `ui-today-view`). Link-wiersz zostaje własnym elementem, z `outline-hidden` zamiast `outline-none`. Nazwa projektu w `type-section break-words text-foreground` zamiast `font-serif text-xl font-medium`. Eyebrow bez zmian.

#### 2. Widok projektu

**File**: `src/pages/projects/[id].astro`

**Intent**: Użyć `TextLink`, `InlineError`, `Chip` i `TaskRow`, usuwając skopiowany markup.

**Contract**: Błędy `unavailable` (`:55-57`) i `milestonesError` (`:103-105`) jako `<InlineError role="status">` (zachować marginesy `mt-3` dla drugiego). Linki „Projekty” (`:58`), „Projekty” w nagłówku (`:66`) i „Wróć do projektów” (`:261`) jako `<TextLink href="/projects" standalone>`; link w nagłówku traci `h-8` i `-ml-1` na rzecz `min-h-10` (zamierzona zmiana: pojawia się podkreślenie). Chip „zamknięty” jako `<Chip tone="done" label={`zamknięty ${formatTimestamp(milestone.completed_at)}`} />` (usunięty inline SVG i klasy `bg-success-soft`). Wiersz zadania jako `<TaskRow variant="compact" done={task.status === "done"}>`: slot `title` z tytułem, slot `meta` z datą, rytmem lub „bez terminu” (treść liniowa, `tabular-nums` w `<span>`), slot `end` z `TaskRowActions` (props bez zmian). Lista `<ul aria-label=…>` zostaje.

### Success Criteria:

#### Automated Verification:

- Skan zielony dla obu stron i pozostałych plików z listy: `npm run check:values`
- Brak `outline-none` w stronach projektów: `grep -c "outline-none" src/pages/projects/index.astro "src/pages/projects/[id].astro"` zwraca 0 dla obu plików
- Brak ręcznego chipa i inline SVG w widoku projektu: `grep -c "bg-success-soft\|<svg" "src/pages/projects/[id].astro"` zwraca 0
- Brak surowej typografii nazwy projektu: `grep -c "font-serif" src/pages/projects/index.astro` zwraca 0
- Typy i build przechodzą: `npx astro check` oraz `npm run build`
- Lint przechodzi: `npm run lint`
- Smoke przechodzi bez zmian oczekiwań dla stron projektów: `npm run smoke`
- Test zepsucia: tymczasowe pominięcie `<slot name="end" />` w `TaskRow.astro` zaczerwieni kroki smoke z „Edytuj zadanie …” na stronie projektu; po wycofaniu zielone

#### Manual Verification:

- `/projects/[id]` z danymi wygląda tak jak dotąd poza zamierzonymi zmianami (zadanie zrobione przekreślone i wyszarzone, chip „zamknięty” z ikoną ptaszka, podkreślony link „Projekty” w nagłówku, nazwy projektów na liście w `type-section`)
- Tab przechodzi po linkach (w tym „Projekty”) i akcjach w wierszach, każdy ma widoczny pierścień fokusu w obu motywach
- Przy 390 px brak poziomego scrolla; link „Projekty” w nagłówku ma cel dotykowy ≥40 px
- Błąd ładowania (Supabase zatrzymany) na `/projects` i `/projects/[id]` pokazuje komunikat z ikoną i słowem „Błąd:”

**Implementation Note**: Po zakończeniu fazy i automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Faza 4: Stany, bramka wizualna i reguła

### Overview

Pokazać nowe warianty obok siebie w obu motywach, zrobić zrzuty i zaktualizować regułę.

### Changes Required:

#### 1. Rozszerzenie kitchen-sink

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Dołożyć nowe warianty i stan `aria-disabled`, żeby zrobić zrzuty bez danych.

**Contract**: W istniejących sekcjach: `Chip` dostaje ton `done` („zamknięty 22 paź”); `TaskRow` dostaje dwa wiersze `compact` (zwykły i `done` z przekreślonym tytułem; `end` jako statyczne `Button`); `InlineError` dostaje drugi przykład z `role="status"`. Nowa sekcja „Button” z jednym statycznym `<Button aria-disabled="true">` (nieaktywny, wyszarzony) i jednym zwykłym. Dwie kolumny jasny/ciemny jak dotąd; strona nadal zwraca 404 poza `import.meta.env.DEV`.

#### 2. Reguła

**File**: `CLAUDE.md`

**Intent**: Wskazać kolejnemu agentowi, że widoki projektów są pod kontrolą literałów.

**Contract**: W istniejącym punkcie „Hard-coded value check” (sekcja „UI and design system”, poza blokiem `<!-- BEGIN @przeprogramowani/10x-cli -->`) dopisać `/projects` i `/projects/[id]` (strony), `components/projects/*` i `ui/confirm-dialog`; bez nowych punktów. Punkt „Kitchen sink” uzupełnić o nowe komponenty, jeśli to potrzebne dla zgodności.

### Macierz 7 stanów (kryteria sukcesu fazy)

| Stan | Chip (done) | TaskRow (compact) | InlineError | Button |
| --- | --- | --- | --- | --- |
| default | pokazany | pokazany (zwykły i `done`) | pokazany (`alert` i `status`) | pokazany |
| hover | N/A (chip nie jest kontrolką) | N/A (wiersz nie reaguje; akcje to `Button`) | N/A | N/A (stan bazowy `Button`, bez zmian w tej zmianie) |
| focus-visible | N/A | N/A | N/A | N/A (zmiana `outline-hidden` sprawdzana ręcznie w fazie 1) |
| disabled | N/A | N/A | N/A | pokazany (`aria-disabled="true"`) |
| error | N/A | N/A | pokazany (to jest stan błędu) | N/A |
| empty | N/A (stany puste to osobne sekcje stron) | N/A | N/A | N/A |
| loading | N/A (strona SSR; przeładowanie po akcji) | N/A | N/A | N/A (stan `pending` to `aria-disabled` + `aria-busy`, pokazany jako disabled) |

### Success Criteria:

#### Automated Verification:

- Skan zielony dla wszystkich plików z listy: `npm run check:values`
- Build przechodzi, a `/dev/kitchen-sink` nie jest dostępny w buildzie produkcyjnym (404 w `npm run preview`): `npm run build`
- Lint, test jednostkowy i smoke przechodzą: `npm run lint`, `npm run test:unit` oraz `npm run smoke`

#### Manual Verification:

- Zrzuty kitchen-sink desktop (1280 px) i mobile (390 px), jasny i ciemny, zapisane w `context/changes/ui-projects-views/screenshots/` i porównane z `reference/screenshots/project-view-*.png`
- Każda komórka macierzy 7 stanów jest pokazana albo oznaczona N/A z powodem
- `CLAUDE.md` ma zaktualizowany punkt „Hard-coded value check” poza blokiem CLI

**Implementation Note**: Po zakończeniu fazy zatrzymaj się na ręczne potwierdzenie; kolejny krok to `/10x-impl-review ui-projects-views`.

---

## Testing Strategy

### Unit Tests:

- `scripts/check-hardcoded-values.test.mjs` pilnuje równości globu `lint-staged` i `DEFAULT_FILES` (z ucieczką nawiasu w `[id].astro`) oraz istnienia plików z listy; reszta bez logiki do testowania.

### Integration Tests:

- Smoke (`scripts/smoke.mjs`) ma kroki dla `/projects` i `/projects/[id]` z asercjami na treść (nazwy zadań i rytm, „zamknięty”, „Otwórz ponownie”, „Edytuj zadanie …”, „Zamknij milestone”, „Usuń projekt…”, „Nie znaleziono projektu”); po refaktorze przechodzą bez zmian oczekiwań. Testy zepsucia w fazach 2 i 3 dowodzą, że wyspy i `TaskRow` renderują się w HTML (lekcja o połkniętym błędzie SSR).

### Manual Testing Steps:

1. Uruchom aplikację, zaloguj się i obejrzyj `/projects` oraz `/projects/[id]` z milestonami (otwartym i zamkniętym), zadaniami (zrobione, powtarzalne, bez terminu).
2. Przejdź Tabem po linkach i akcjach w jasnym i ciemnym motywie, także w trybie wysokiego kontrastu Windows; przy 390 px sprawdź brak poziomego scrolla.
3. Przełącz DevTools na Offline i wywołaj błąd akcji, błąd potwierdzenia usunięcia oraz (po zatrzymaniu Supabase) błąd ładowania stron.

## Performance Considerations

Brak (zmiana statyczna, bez nowych wysp i zależności; ikony Lucide renderowane po stronie serwera).

## Migration Notes

Brak danych do migracji. Zmiany we wspólnych plikach: `Chip` i `TaskRow` zyskują warianty bez zmiany istniejących; `Button` zyskuje style `aria-disabled:` (zachowanie dla `aria-disabled="true"`, w tym `/today`); sześć plików `ui/` zmienia `outline-none` na `outline-hidden` (różnica tylko w trybie forced-colors).

## References

- Related research: `context/changes/ui-projects-views/research.md`
- Wzorce wspólnych komponentów: `src/components/ui/inline-error.tsx`, `src/components/TextLink.astro`, `src/components/Chip.astro`, `src/components/TaskRow.astro`
- Spec: `context/foundation/design-system/design-system.md` (Project view, Chip, TaskRow, ConfirmDialog, Interaction rules)
- Poprzednie zmiany: `context/archive/2026-10-22-ui-app-shell/`, `context/archive/2026-10-22-ui-today-view/` (plany, przeglądy, follow-upy)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kontrola, fokus i stan Button

#### Automated

- [x] 1.1 Skan zielony dla plików z listy: `npm run check:values` — 6fdfbeb
- [x] 1.2 Test zepsucia: `bg-purple-300` dopisane tymczasowo do `src/pages/projects/index.astro` zaczerwienia `npm run check:values` z numerem linii; po wycofaniu zielone — 6fdfbeb
- [x] 1.3 Brak `outline-none` w komponentach `ui/`: `grep -rn "outline-none" src/components/ui` zwraca 0 trafień — 6fdfbeb
- [x] 1.4 Klasy stanu tylko w `Button`: `grep -rn "aria-disabled:pointer-events-none" src` zwraca wyłącznie `src/components/ui/button.tsx` — 6fdfbeb
- [x] 1.5 Test równości list przechodzi: `npm run test:unit` — 6fdfbeb
- [x] 1.6 Typy i build przechodzą: `npx astro check` oraz `npm run build` — 6fdfbeb
- [x] 1.7 Lint przechodzi: `npm run lint` — 6fdfbeb
- [x] 1.8 Smoke przechodzi: `npm run smoke` — 6fdfbeb

#### Manual

- [x] 1.9 W trybie wysokiego kontrastu Windows fokus z klawiatury jest widoczny na polu tekstowym, selekcie, dniach tygodnia i przycisku zamknięcia w dialogach „Dodaj zadanie” i „Edytuj projekt” — 6fdfbeb
- [x] 1.10 W trybie zwykłym wygląd pól, dialogów i przycisków bez zmian; nieaktywny przycisk „Dodaj zadanie” przy zamkniętym milestonie jest wyszarzony — 6fdfbeb

### Phase 2: Komponenty i błędy w wyspach

#### Automated

- [x] 2.1 Skan zielony dla `ui/confirm-dialog.tsx`, `ui/inline-error.tsx`, sześciu komponentów `projects/*`, `Chip.astro` i `TaskRow.astro`: `npm run check:values` — 585e251
- [x] 2.2 Brak skopiowanego bloku błędu: `grep -rn "<CircleAlert" src/components/projects src/components/ui/confirm-dialog.tsx` zwraca 0 trafień — 585e251
- [x] 2.3 Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build` — 585e251
- [x] 2.4 Lint przechodzi: `npm run lint` — 585e251
- [x] 2.5 Smoke przechodzi (wyspy projektów i `/today` nadal renderują się w HTML): `npm run smoke` — 585e251
- [x] 2.6 Test zepsucia: tymczasowy `throw` na poziomie modułu w `ui/inline-error.tsx` zaczerwienia kroki smoke dla stron projektów i `/today`; po wycofaniu zielone — 585e251

#### Manual

- [x] 2.7 Błąd akcji wiersza (Offline, klik „Zamknij milestone” lub zmiana statusu zadania) pokazuje komunikat z ikoną i słowem „Błąd:”, w obu motywach — 585e251
- [x] 2.8 Błąd potwierdzenia usunięcia (Offline w dialogu „Usuń projekt”) pokazuje „Błąd:” wewnątrz dialogu — 585e251
- [x] 2.9 Poza komunikatami błędów `/projects/[id]` wygląda tak jak wcześniej — 585e251

### Phase 3: Strony projektów

#### Automated

- [x] 3.1 Skan zielony dla obu stron i pozostałych plików z listy: `npm run check:values` — 07f38a6
- [x] 3.2 Brak `outline-none` w stronach projektów: `grep -c "outline-none" src/pages/projects/index.astro "src/pages/projects/[id].astro"` zwraca 0 dla obu plików — 07f38a6
- [x] 3.3 Brak ręcznego chipa i inline SVG w widoku projektu: `grep -c "bg-success-soft\|<svg" "src/pages/projects/[id].astro"` zwraca 0 — 07f38a6
- [x] 3.4 Brak surowej typografii nazwy projektu: `grep -c "font-serif" src/pages/projects/index.astro` zwraca 0 — 07f38a6
- [x] 3.5 Typy i build przechodzą: `npx astro check` oraz `npm run build` — 07f38a6
- [x] 3.6 Lint przechodzi: `npm run lint` — 07f38a6
- [x] 3.7 Smoke przechodzi bez zmian oczekiwań dla stron projektów: `npm run smoke` — 07f38a6
- [x] 3.8 Test zepsucia: tymczasowe pominięcie `<slot name="end" />` w `TaskRow.astro` zaczerwieni kroki smoke z „Edytuj zadanie …”; po wycofaniu zielone — 07f38a6

#### Manual

- [x] 3.9 `/projects/[id]` z danymi wygląda tak jak dotąd poza zamierzonymi zmianami (zadanie zrobione przekreślone i wyszarzone, chip „zamknięty” z ikoną ptaszka, podkreślony link „Projekty” w nagłówku, nazwy projektów na liście w `type-section`) — 07f38a6
- [x] 3.10 Tab przechodzi po linkach (w tym „Projekty”) i akcjach w wierszach, każdy ma widoczny pierścień fokusu w obu motywach — 07f38a6
- [x] 3.11 Przy 390 px brak poziomego scrolla; link „Projekty” w nagłówku ma cel dotykowy ≥40 px — 07f38a6
- [x] 3.12 Błąd ładowania (Supabase zatrzymany) na `/projects` i `/projects/[id]` pokazuje komunikat z ikoną i słowem „Błąd:” — 07f38a6

### Phase 4: Stany, bramka wizualna i reguła

#### Automated

- [x] 4.1 Skan zielony dla wszystkich plików z listy: `npm run check:values`
- [x] 4.2 Build przechodzi, a `/dev/kitchen-sink` nie jest dostępny w buildzie produkcyjnym (404 w `npm run preview`): `npm run build`
- [x] 4.3 Lint, test jednostkowy i smoke przechodzą: `npm run lint`, `npm run test:unit` oraz `npm run smoke`

#### Manual

- [x] 4.4 Zrzuty kitchen-sink desktop (1280 px) i mobile (390 px), jasny i ciemny, zapisane w `context/changes/ui-projects-views/screenshots/` i porównane z `reference/screenshots/project-view-*.png`
- [x] 4.5 Każda komórka macierzy 7 stanów jest pokazana albo oznaczona N/A z powodem
- [x] 4.6 `CLAUDE.md` ma zaktualizowany punkt „Hard-coded value check” poza blokiem CLI
