<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Widoki /projects i /projects/[id] — przegląd UI

- **Plan**: context/changes/ui-projects-views/plan.md
- **Scope**: Full plan (4 of 4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run during review (all PASS): `npm run check:values` (exit 0), `grep -rn "outline-none" src/components/ui` (0), `aria-disabled:pointer-events-none` tylko w `ui/button.tsx`, `<CircleAlert` w `projects/*` i `confirm-dialog.tsx` (0), `outline-none` w obu stronach projektów (0), `bg-success-soft|<svg` w `[id].astro` (0), `font-serif` w `index.astro` (0), `npm run test:unit` (5/5), `npx astro check` (0 errors), `npm run build`, `npm run lint` (exit 0), `npm run smoke` (all steps passed), `/dev/kitchen-sink` w produkcji (404). Manual rows 1.9–4.6 potwierdzone; zrzuty w `screenshots/` (6 PNG; dwa pliki `*-desktop.png` mają 571–685 px szerokości, zaakceptowane przez użytkownika).

## Findings

### F1 — Test równości list `check:values` nie jest uruchamiany w CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:18-22
- **Detail**: Dryf między `DEFAULT_FILES` a globem `lint-staged` (w tym ucieczka `\[id\]`) wykrywa wyłącznie `scripts/check-hardcoded-values.test.mjs` w `npm run test:unit`. Job `ci` uruchamia tylko `npm run lint`, `npx astro check` i `npm run build`, job `smoke` smoke; `test:unit` nie występuje w pliku workflow ani w hooku pre-commit. Strażnik z `ui-today-view` (F6) i z tej zmiany działa więc tylko, gdy ktoś ręcznie uruchomi testy.
- **Fix**: Dodaj krok `- run: npm run test:unit` w jobie `ci` po `npx astro check`.
- **Decision**: FIXED — krok `npm run test:unit` dodany do jobu `ci` w `.github/workflows/ci.yml` (po `npx astro check`); lokalnie `test:unit` 5/5

### F2 — Ucieczka `[id]` w globie `lint-staged` nie jest sprawdzana asercją na dopasowanie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/check-hardcoded-values.test.mjs:24-25
- **Detail**: Test usuwa `\` z elementów globu i porównuje proste ścieżki z `DEFAULT_FILES`, więc dowodzi równości list, ale nie tego, że picomatch/micromatch faktycznie dopasuje `src/pages/projects/[id].astro` z ucieczką. W fazie 1 zostało to sprawdzone ręcznie (picomatch na sparsowanym kluczu: `[id].astro` pasuje, `i.astro` i `d.astro` nie). Błędna ucieczka po przyszłej zmianie cicho wyłączyłaby hook dla tej strony.
- **Fix**: Opcjonalnie: asercja z `picomatch` (dołączony do `lint-staged`) na `src/pages/projects/[id].astro` w teście.
- **Decision**: SKIPPED — dopasowanie `[id].astro` sprawdzone ręcznie w fazie 1 (picomatch na sparsowanym kluczu); test równości list pilnuje dryfu

### F3 — Gałąź `unavailable` w `[id].astro` nie ma nagłówka, a błąd jest `role="status"`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/projects/[id].astro (gałąź `unavailable`, tuż przed `TextLink`)
- **Detail**: Strona renderuje h1 tylko dla projektu (`:74`) i dla 404 (`:240`); stan `unavailable` ma sam komunikat i link, a `<title>` to „Projekt”. Przy `role="status"` obecnym przy ładowaniu czytniki ekranu mogą go nie zapowiedzieć, więc strona bez nagłówka nie mówi użytkownikowi, co się stało. Stan sprzed zmiany też nie miał h1; zmiana nie jest regresją.
- **Fix**: Dodaj w gałęzi `unavailable` nagłówek `h1` (np. „Projekt”) nad komunikatem.
- **Decision**: FIXED — `<h1 class="type-display text-foreground">Projekt</h1>` nad `InlineError` w gałęzi `unavailable` w `[id].astro`

### F4 — `Select` statusu w `TaskRowActions` blokowany tylko wizualnie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/projects/TaskRowActions.tsx:70
- **Detail**: `Select` w stanie pending ma `aria-disabled` i `aria-busy` oraz tylko `aria-disabled:opacity-50`, podczas gdy `Button` dostał też `pointer-events-none`. Select można więc otworzyć myszą w trakcie zapisu; `changeStatus` ma jednak wczesny `return` (`if (pending || …)`, linia 35), więc nie powstaje zdublowany zapis. Zachowanie świadomie zostawiono przy `aria-disabled` (decyzja z `task-crud`, F1: zachowanie fokusu).
- **Fix**: Brak działania; opcjonalnie dodaj `aria-disabled:pointer-events-none` do klasy selecta.
- **Decision**: FIXED — `aria-disabled:pointer-events-none` dodane do klasy `Select` w `TaskRowActions.tsx:70`
