<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Zarządzanie projektem (CRUD)

- **Plan**: context/changes/project-crud/plan.md
- **Mode**: Deep (weryfikacja inline)
- **Date**: 2026-10-09
- **Verdict**: REVISE → SOUND po poprawkach z triage
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
11/11 istniejących ścieżek ✓; 9/9 nowych ścieżek nie koliduje ✓; symbole (LIFE_AREAS, createClient, buttonVariants) ✓; zod 4.6.2 z.iso.date ✓ (odrzuca 2026-02-30); Progress↔Phase 22/22 ✓; brief↔plan ✓; `shadcn view alert-dialog` → registryDependencies ["button"], pakiet `radix-ui`, wygenerowany kod z "use client" i wartościami arbitralnymi.

## Findings

### F1 — shadcn add alert-dialog nadpisze przebudowany Button

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, pkt 1 i 2 (kolejność: Button, potem shadcn add)
- **Detail**: Rejestr shadcn deklaruje dla alert-dialog `registryDependencies: ["button"]`. Plan najpierw przebudowuje `button.tsx`, potem uruchamia `shadcn add … alert-dialog`, który zaproponuje nadpisanie istniejącego pliku stockową wersją.
- **Fix**: odwrócić kolejność w planie: najpierw `shadcn add` (z odmową nadpisania `button.tsx`), potem adaptacja Buttona; dopisać, że CLI nie może nadpisać `button.tsx`.
- **Decision**: FIXED (Fix in plan) — Faza 2: najpierw komponenty shadcn (z odmową nadpisania `button.tsx`), potem adaptacja Buttona

### F2 — Wygenerowany kod shadcn łamie konwencje, a plan nazywa złe pakiety

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, pkt 2 (komponenty shadcn)
- **Detail**: Wygenerowany `alert-dialog` zawiera `"use client"`, `bg-black/50`, `shadow-lg`, `top-[50%]`, `max-w-[calc(100%-2rem)]`. CLAUDE.md zabrania `"use client"` i literałów. Plan nazywa pakiety `@radix-ui/react-dialog`/`react-alert-dialog`, a CLI instaluje `radix-ui`.
- **Fix**: dopisać usunięcie `"use client"`, zastąpienie literału i wartości arbitralnych tokenami (`shadow-pop` itd.) oraz nazwać pakiet „wskazany przez CLI (obecnie `radix-ui`)".
- **Decision**: FIXED (Fix in plan) — Faza 2, pkt 1: usunięcie `"use client"`, tokeny zamiast `bg-black/50`/`shadow-lg`/wartości arbitralnych, pakiet wskazany przez CLI (`radix-ui`)

### F3 — Smoke nie renderuje stron auth, więc regresja Buttona jest niewidoczna

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — kryterium „Smoke (regresja auth po zmianie Buttona)"
- **Detail**: Smoke wykonuje `POST /api/auth/*` oraz `GET /`, `/dashboard` (`scripts/smoke.mjs:38-59`), nie pobiera `/auth/signin` ani `/auth/signup` (strony z wyspami używającymi Buttona).
- **Fix**: w Fazie 2 dodać kroki smoke `GET /auth/signin` → 200 i `GET /auth/signup` → 200.
- **Decision**: FIXED (Fix in plan) — Faza 2, nowy pkt 8: kroki smoke `GET /auth/signin` i `/auth/signup` → 200

### F4 — Niedookreślenia kontraktu: DELETE, kolejność smoke, placeholder lintu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 pkt 5–6 i 8; kryteria „Lint zmienionych plików"
- **Detail**: (a) plan nie mówi, czy `DELETE` (bez ciała) wymaga `Content-Type: application/json`; (b) Faza 3 wstawia `GET /projects/{id}` do przepływu, który Faza 1 kończy usunięciem; (c) kryteria lintu mają placeholder `<zmienione pliki>`.
- **Fix**: (a) `DELETE` nie czyta ciała i polega na kontroli `Origin` Astro; (b) w Fazie 1 zapisać kolejność kroków tak, by Faza 3 wstawiała GET między create a DELETE; (c) zamienić placeholder na polecenie oparte o `git diff --name-only`.
- **Decision**: FIXED (Fix in plan) — Faza 1: `DELETE` bez ciała (ochrona `Origin`), jawna kolejność kroków smoke, komenda lintu oparta o `git ls-files -m -o` zamiast placeholdera (we wszystkich fazach)
