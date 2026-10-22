<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Widok /today — przegląd UI

- **Plan**: context/changes/ui-today-view/plan.md
- **Scope**: Full plan (4 of 4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run during review (all PASS): `npm run check:values` (exit 0), `grep -c "sm:items-start sm:justify-between" src/pages/today.astro` (0), `outline-none` in `today.astro` and `components/today/*` (0 everywhere), `npx astro check` (0 errors), `npm run build` (exit 0), `npm run lint` (exit 0), `npm run smoke` (all steps passed), `/dev/kitchen-sink` in production preview (404). Manual rows 1.6–4.6 are confirmed and backed by `screenshots/` (4 PNG).

## Findings

### F1 — InlineError z `role="alert"` renderowany statycznie jako błąd ładowania strony

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/inline-error.tsx:14, src/pages/today.astro:73
- **Detail**: `InlineError` ma na stałe `role="alert"`. W wyspach pojawia się dopiero po akcji użytkownika, więc `alert` jest tam poprawny. Na stronie komunikat `unavailable` jest treścią statyczną obecną przy ładowaniu; czytniki ekranu często nie zapowiadają takich regionów, a wcześniejszy przegląd `ui-app-shell` (F4) zmienił statyczny `Banner` na `role="status"`. Zachowanie jest takie samo jak przed zmianą (`today.astro` miał `role="alert"`), więc to nie regresja.
- **Fix**: Dodaj prop `role?: "alert" | "status"` (domyślnie `alert`) i przekaż `role="status"` dla `unavailable` w `today.astro`.
- **Decision**: FIXED — prop `role?: "alert" | "status"` w `InlineError` (domyślnie `alert`); `today.astro` przekazuje `role="status"` dla błędu ładowania

### F2 — Skaner literałów po cichu pomija brakujące pliki z listy domyślnej

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/check-hardcoded-values.mjs:32
- **Detail**: `DEFAULT_FILES.filter(existsSync)` odrzuca nieistniejące pliki bez błędu. Filtr powstał, bo lista zawierała pliki planowane na później (`TextLink`, `Chip`, `TaskRow`, `inline-error`). Dziś wszystkie 13 plików istnieje; po zmianie nazwy lub przeniesieniu pliku skan przestanie go pokrywać i nadal zwróci kod 0, a `lint-staged` odpala się tylko dla staged plików, więc nic tego nie zasygnalizuje.
- **Fix**: Usuń `.filter(existsSync)` z domyślnej listy, żeby brakujący plik kończył skan błędem tak samo jak plik podany jawnie.
- **Decision**: FIXED — usunięty `.filter(existsSync)` z `DEFAULT_FILES`; brakujący plik z listy kończy skan błędem (test: tymczasowo usunięty `TextLink.astro` → kod 1, po przywróceniu kod 0)

### F3 — Luka w planie: `AddTaskFromTodayDialog.tsx` nie był w „Changes Required” dla `outline-hidden`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/today/AddTaskFromTodayDialog.tsx:220
- **Detail**: Kryterium 3.3 wymaga zera `outline-none` w `components/today/*`, ale plan nie wymieniał tego pliku w zmianach fazy 3. Link w dialogu poprawiono w fazie 3 (jedna klasa) i to jest zgodne z intencją planu oraz z „What We're NOT Doing”.
- **Fix**: Brak działania; luka jest tylko odnotowana.
- **Decision**: ACCEPTED-AS-RULE: Kryterium „zero X w katalogu” wymaga wypisania wszystkich plików z trafieniem w Changes Required (`context/foundation/lessons.md`); FIXED — notka o luce dopisana w bloku Fazy 3 w `plan.md`

### F4 — Chip: sr-only „Termin: ” przy tonach `none` i `date` brzmi redundantnie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/Chip.astro:34
- **Detail**: Prefiks dla wszystkich tonów poza `skipped` daje „Termin: bez terminu”. Zachowanie przejęte 1:1 z `DueChip`, więc to nie regresja.
- **Fix**: Pomiń prefiks także dla `tone === "none"`.
- **Decision**: FIXED — prefiks sr-only „Termin: ” pomijany także dla tonu `none`

### F5 — TaskRow: slot `meta` jest owinięty w `<p>`, więc dopuszcza tylko treść liniową

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/TaskRow.astro:20
- **Detail**: Wszystkie trzy użycia (dwa `<ul>` w `today.astro` i kitchen-sink) przekazują tylko `<span>`, `<a>` i svg, więc HTML jest poprawny. Przyszły wywołujący, który wstawi `<div>`/`<p>`, wygeneruje niepoprawny HTML.
- **Fix**: Dodaj komentarz „inline content only” przy slocie `meta` w `TaskRow.astro`.
- **Decision**: FIXED — komentarz „inline content only” przy slocie `meta` w `TaskRow.astro`

### F6 — Dwie ręcznie utrzymywane listy plików (glob w `package.json` i `DEFAULT_FILES`)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: package.json:59-70, scripts/check-hardcoded-values.mjs:6-20
- **Detail**: Obie listy mają dziś te same 13 ścieżek i brak dryfu. Każda zmiana wymaga edycji w dwóch miejscach. Brak automatycznego sprawdzenia równości.
- **Fix**: Brak działania teraz; rozważ jedno źródło prawdy lub test równości przy następnej zmianie widoku (#3).
- **Decision**: FIXED — nowy test `scripts/check-hardcoded-values.test.mjs` (równość globu `lint-staged` i `DEFAULT_FILES`, istnienie plików), podpięty do `npm run test:unit`

### F7 — InlineError: ikona wyrównana do środka przy wielowierszowym komunikacie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/inline-error.tsx:14
- **Detail**: `items-center` ustawia ikonę na środku, gdy komunikat zawija się na wąskim ekranie. `Field` (`ui/field.tsx`) robi to samo, więc jest spójnie, ale długie komunikaty z API mogą wyglądać nierówno.
- **Fix**: Brak działania; jeśli zostanie zmienione, zmienić jednocześnie w `Field`.
- **Decision**: SKIPPED — spójne z `Field`; jeśli zmieniać, to jednocześnie w obu
