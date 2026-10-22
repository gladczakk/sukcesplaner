<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Szkielet aplikacji — przegląd UI

- **Plan**: context/changes/ui-app-shell/plan.md
- **Scope**: Full plan (4 of 4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Kryteria „npm run lint” odhaczone, a polecenie pada w całym repo

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 1.4, 2.3, 3.3, 4.3
- **Detail**: Cztery wiersze mówią „`npm run lint`” i są `[x]`, ale `npm run lint` kończy się kodem 1 (80 błędów, wszystkie w `.claude/skills/*` i `context/foundation/design-system/reference/legacy`, poza tą zmianą). Odhaczono je na podstawie lintu zmienionych plików (czystego). Treść wierszy nie mówi o tym zawężeniu.
- **Fix**: Zaakceptuj jako ryzyko: baza lintu jest zepsuta niezależnie od tej zmiany; zapisz to w follow-up (`ignores` dla `.claude/**` i `reference/legacy/**` w ESLint jako osobna drobna zmiana).
- **Decision**: FIXED — `ignores` dla `.claude/**` i `context/foundation/design-system/reference/legacy/**` w eslint.config.js; pełne `npm run lint` kończy się kodem 0

### F2 — NavLink: konflikt klas koloru tekstu dla aktywnej pozycji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/NavLink.astro:25-26
- **Detail**: `class:list` emituje jednocześnie `text-foreground` i `text-accent-foreground` dla aktywnego linku. Astro nie scala klas Tailwind (brak `cn`/tailwind-merge), więc o wyniku decyduje kolejność w CSS, nie w markupie; `text-accent-foreground` może być martwa. Kontrast jest dobry w obu przypadkach, ale intencja nie jest tym, co mówi markup.
- **Fix**: Wyrażenie warunkowe: `current ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent"`.
- **Decision**: FIXED — ternary w `class:list` (NavLink.astro)

### F3 — `outline-none` + ring z box-shadow: niewidoczny fokus w trybie wysokiego kontrastu Windows

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/NavLink.astro:25, src/components/Banner.astro:6, src/layouts/AppLayout.astro:18-21
- **Detail**: Fokus opiera się na `outline-none` i pierścieniu z `box-shadow`. W Windows forced-colors box-shadow jest usuwany, a `outline-style: none` usuwa obrys, więc fokus znika. Ten sam wzorzec ma `src/components/ui/button.tsx:8`, więc to wybór całego repo, nie nowy błąd.
- **Fix A ⭐ Recommended**: Zamień `outline-none` na `outline-hidden` (Tailwind 4) w trzech plikach szkieletu; `button.tsx` zostaw na osobną zmianę
  - Strength: Mały zakres, zgodny z granicą tej zmiany; fokus przetrwa forced-colors w szkielecie.
  - Tradeoff: Szkielet i `Button` na chwilę różnią się wzorcem.
  - Confidence: MED — `outline-hidden` jest dokumentowanym zamiennikiem w Tailwind 4, nie sprawdzone w tej wersji repo.
  - Blind spot: Nie sprawdzono w trybie wysokiego kontrastu na żywo.
- **Fix B**: To samo plus `src/components/ui/button.tsx` (i inne pliki `ui/`)
  - Strength: Jeden spójny wzorzec w całej aplikacji.
  - Tradeoff: Dotyka wspólnych komponentów używanych przez wszystkie widoki; poza granicą „jeden widok”.
  - Confidence: MED — nie przejrzano wszystkich użyć `outline-none` w `ui/`.
  - Blind spot: Inne komponenty `ui/` mogą mieć własne dostosowania.
- **Decision**: FIXED via Fix A — `outline-hidden` w NavLink.astro, Banner.astro, AppLayout.astro (logo); `ui/button.tsx` do follow-upu (follow-ups/review-fixes.md)

### F4 — Banner z `role="alert"` renderowany statycznie na każdej stronie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/Banner.astro:7
- **Detail**: `role="alert"` to asertywny live region, a komunikat o braku konfiguracji jest treścią statyczną widoczną przy każdym ładowaniu strony. Czytniki ekranu mogą go odczytywać przy każdej nawigacji. Spec komponentu (`design-system/reference/components/Banner.md`) mówi `role="status"`; plan (Faza 2) przejął `alert` ze starego wariantu error.
- **Fix**: Zmień na `role="status"` zgodnie ze spec; `alert` zostaw dla banerów wstrzykiwanych po załadowaniu.
- **Decision**: FIXED — `role="status"` w Banner.astro

### F5 — Skaner literałów pomija część typowych literałów Tailwind

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/check-hardcoded-values.mjs:16-20
- **Detail**: Wzorzec nie łapie `ring-offset-white`, `border-t-red-500`, `border-x-*`, `decoration-*`, `accent-*`, `caret-*`, a gałąź wartości arbitralnych tylko `-[<n>px|rem]` (omija `w-[50%]`, `h-[calc(...)]`, `top-[3vh]`). Plan kazał użyć „tego samego wzorca co skan ze skilla /10x-ui”, więc skaner jest zgodny z planem, ale słabszy niż reguła w `CLAUDE.md`.
- **Fix**: Dopuść opcjonalny segment kierunku/offsetu (`(-(t|b|l|r|x|y|s|e))?`, `-offset`) i poszerz gałąź arbitralną do `-\[[^\]]*\d(px|rem|em|%|vh|vw)[^\]]*\]`; dodaj dwa przypadki do testu zepsucia.
- **Decision**: FIXED — poszerzony wzorzec skanera (segment strony/offsetu, `decoration|accent|caret|placeholder`, wartości arbitralne z `%|em|vh|vw`), zapisany jako `String.raw`; sprawdzone na przypadkach testowych

### F6 — lint-staged: `eslint --fix` i skan literałów mogą pracować na tym samym pliku równolegle

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: package.json:59-70
- **Detail**: Cztery pliki szkieletu pasują do `*.{ts,tsx,astro}` i do osobnego globa, więc obie komendy mogą działać współbieżnie; skan może przeczytać plik w trakcie przepisywania przez `eslint --fix`. Ryzyko praktycznie nieszkodliwe (skan szuka literałów, nie formatowania).
- **Fix**: Brak działania; przy fałszywym wyniku uruchom `npm run check:values` ponownie.
- **Decision**: FIXED — `npx lint-staged --concurrent false` w `.husky/pre-commit` (zadania z różnych globów idą sekwencyjnie)

### F7 — Skaner literałów: możliwe fałszywe trafienia

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/check-hardcoded-values.mjs:16
- **Detail**: Gałąź hex może trafić w kotwice (`href="#add"`) i encje (`&#123;`), `hsl(var(--x))` jest flagowane, a komentarze są skanowane. Obecne pliki są czyste, więc to szum, nie błąd.
- **Fix**: Brak działania teraz; zawęź wzorzec, gdy pierwszy fałszywy alarm się pojawi.
- **Decision**: FIXED — hex nie łapie kotwic `href="#..."` ani encji `&#...`, `hsl(var(--x))` dozwolone
