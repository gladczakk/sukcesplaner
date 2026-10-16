<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Lista zadań na dziś

- **Plan**: context/changes/today-list-view/plan.md
- **Mode**: Deep
- **Date**: 2026-10-15
- **Verdict**: REVISE → SOUND po poprawkach z triage
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Istniejące ścieżki ✓ (`AppLayout`, `middleware.ts`, `signin.ts`, `smoke.mjs`, `database.types.ts`, `format.ts`, `projects/index.astro`, migracje, `MilestoneRowActions`); nowe ścieżki nie kolidują ✓ (`src/pages/today.astro`, `src/lib/today.ts`, `src/lib/services/today.ts`, `src/components/today/`, migracja `20261016120000`, test `core_domain_today_list.test.sql`); Progress↔Phase 18/18 ✓ (4+8+6 kryteriów), bloki faz bez checkboxów ✓; brief↔plan ✓; tokeny z planu istnieją w `global.css` (`type-*`, `warning/info/destructive-soft/ink`, `rounded-pill`, `shadow-card`). Zweryfikowane na żywo: prototyp funkcji `today_list` z planu (psql, transakcja z rollbackiem) działa w roli `authenticated` — poprawna kolejność (`task` po terminie rosnąco i `NULL` na końcu, potem `milestone`, na końcu `deferred`), drugi milestone z remisem dat ukryty, `deferred_until` > dziś w wierszach `deferred`, `anon` dostaje `permission denied`; `Intl` (`pl-PL` UTC i `sv-SE` `Europe/Warsaw`) daje oczekiwane „czwartek, 15 października" i `2026-10-16` dla 22:30 UTC. Promień rażenia: `AppLayout` ma tylko dwóch importerów, przekierowanie `/projects` tylko w `signin.ts:19` i `smoke.mjs:88`, żaden test pgTAP nie zakłada listy funkcji. Niezweryfikowane: dokładny diff `gen types` (CLI 2.117).

## Findings

### F1 — Asercje smoke dla „milestone do zamknięcia" są słabsze, niż wyglądają

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — pkt 5 (smoke), Phase 3 — pkt 3
- **Detail**: Fragment „milestone do zamknięcia" w `bodyIncludes` jest spełniony już przez samo podsumowanie („1 milestone do zamknięcia"), więc nie dowodzi wiersza milestona; `bodyOrder: ["Zadanie smoke"]` ma jeden element i jest trywialne; opis runnera nie mówi, gdzie dopisać `bodyExcludes` — `describeExpected` zwraca tylko pierwszy zdefiniowany człon łańcucha `??`, więc nowy człon trzeba dopisać osobno, nie jako kolejne ogniwo.
- **Fix**: W krokach „ready to close" i „moves on to the next milestone" użyć fragmentu z wiersza („Wszystkie zadania zrobione"), usunąć trywialne `bodyOrder`, a w opisie runnera dopisać: `bodyExcludes` w `matches()` i jako dodatek w `describeExpected()`.
- **Decision**: FIXED (Fix in plan) — asercje z fragmentem wiersza „Wszystkie zadania zrobione”, usunięte trywialne bodyOrder, opis bodyExcludes w matches() i jako dodatek do describeExpected()

### F2 — Regeneracja typów pod Windowsem i niepewny zakres diffu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — pkt 3 (typy bazy)
- **Detail**: Plan zakłada `npx supabase gen types typescript --local > src/db/database.types.ts`; w Windows PowerShell 5.1 przekierowanie `>` zapisuje UTF-16 z BOM i zepsuje plik, a plik ma dziś końce LF i nie ma bloku `__InternalSupabase`, który nowsze generatory dodają. Polecenie nie jest opisane w README/CLAUDE.md (jedyne źródło to archiwalny plan F-01).
- **Fix**: Zapisać w kontrakcie wykonanie w Git Bash (lub zapis przez node), sprawdzenie, że plik pozostaje UTF-8 z LF, a diff dotyczy tylko `Functions.today_list`; w razie szerszego diffu — ręczne dopisanie funkcji (fallback już jest w planie).
- **Decision**: FIXED (Fix in plan) — regeneracja typów w Git Bash, weryfikacja UTF-8/LF i diffu, fallback: przywrócenie z gita i ręczne dopisanie

### F3 — „Dziś" przez format daty locale `sv-SE`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — pkt 1 (`todayInWarsaw`)
- **Detail**: Plan opisuje tylko „`Intl.DateTimeFormat` ze strefą `Europe/Warsaw`, format `YYYY-MM-DD`"; popularny trik z locale `sv-SE` daje ten format, ale zależy od danych ICU/CLDR środowiska. Na lokalnym Node działa (sprawdzone), a Cloudflare Workers ma pełne ICU, więc ryzyko jest małe.
- **Fix**: W kontrakcie wskazać `formatToParts` (składanie `year-month-day` z części) zamiast zależności od separatora locale.
- **Decision**: FIXED (Fix in plan) — todayInWarsaw składane z formatToParts

### F4 — Drobne niejasności w planie

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — pkt 2 (ostatnie zdanie), Phase 2 — pkt 3 (stan pusty)
- **Detail**: Ostatnie zdanie kontraktu testów („Zadania w zamkniętych milestonach wstawiane przy wyłączonym triggerze tylko jeśli potrzeba (nie powinno być)…") jest wymijające — zamknięty milestone ma w stanie spójnym tylko zadania `done`, które trigger dopuszcza, więc wyłączanie triggerów nie jest potrzebne. Plan opisuje stan pusty z przerywaną ramką, a wzorzec z `/projects` ma ramkę ciągłą (`rounded-md border border-border bg-card p-6 shadow-card`).
- **Fix**: Usunąć wymijające zdanie (zamknięte milestony wstawiać z `completed_at`, zadania `done` zwykłym insertem) i wybrać jedną ramkę stanu pustego (ciągła jak na `/projects`).
- **Decision**: FIXED (Fix in plan) — usunięte wymijające zdanie o wyłączaniu triggerów, ciągła ramka stanu pustego jak na /projects

### F5 — Landing wciąż prowadzi zalogowanego do placeholdera `/dashboard`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: What We're NOT Doing (zmiany `/dashboard` i `Topbar.astro`)
- **Detail**: Po zmianie logowania zalogowany użytkownik trafia na `/today`, ale publiczny landing (`/`, `Welcome.astro` z `Topbar.astro`) nadal pokazuje mu link „Dashboard" do angielskiego placeholdera starteru — martwy koniec obok nowego ekranu startowego (`src/components/Topbar.astro:10`). Plan świadomie nie rusza `Topbar`/`/dashboard`.
- **Fix A ⭐ Recommended**: Zostawić zgodnie z planem i dopisać do „Open Risks", że porządek `/dashboard` i landingu wchodzi do `/10x-ui` po S-04
  - Strength: Zero dodatkowego zakresu; polish auth/landingu jest już zaplanowany po S-04.
  - Tradeoff: Do czasu `/10x-ui` zalogowany na landingu widzi link do placeholdera.
  - Confidence: HIGH — landing i `/dashboard` to starter, nie część rdzenia produktu.
  - Blind spot: Użytkownik może uznać martwy link za regres po zmianie logowania.
- **Fix B**: Zmienić w `Topbar.astro` link zalogowanego z `/dashboard` na `/today` (jedna linijka, etykieta „Dziś")
  - Strength: Landing i logowanie prowadzą w to samo miejsce, brak martwego linku.
  - Tradeoff: Dotyka pliku spoza listy planu i smoke nie sprawdza treści landingu; placeholder zostaje osierocony.
  - Confidence: HIGH — jedna linia w pliku używanym tylko przez `Welcome`.
  - Blind spot: Styl „cosmic" Topbara pozostaje niezgodny z design systemem.
- **Decision**: FIXED via Fix A — znane ryzyko dopisane do What We're NOT Doing (plan) i Open Risks (brief); porządek /dashboard i landingu w /10x-ui po S-04
