<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zadanie z rytmem „codziennie / co X dni" wraca na listę na dziś

- **Plan**: context/changes/recurring-tasks-by-interval/plan.md
- **Scope**: Full plan (Phase 4 of 4)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-19
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Verification run on HEAD (ebbec15)

- `npx supabase db reset`: OK. `npx supabase test db`: 6 plików, 207 testów, PASS.
- `npx astro check`: 0 errors, 0 warnings. `npm run build`: OK (po zatrzymaniu podglądu przed buildem).
- `npm run smoke`: All smoke steps passed.
- `npx eslint` na plikach zmienionych w src/ i scripts/ (z `endOfLine: auto`): 0 błędów.
- `npm run lint` (całe repo): FAIL, 2611 błędów `prettier/prettier` „Delete ␍" — wyłącznie końce linii CRLF w kopii roboczej (patrz F5), zaakceptowane przez użytkownika w Fazie 1.
- Kroki Manual w Progress: wszystkie odznaczone po potwierdzeniu użytkownika; zmiany w diffie mają odpowiadające dowody (pgTAP, smoke).
- Testy zepsucia wykonane w fazach 1, 3 i 4 (psucie open_tasks, kolejności renderowania i wyspy) — czerwone na zepsutym kodzie.

## Findings

### F1 — Przesunięcie daty milestona przed start rutyny po cichu usuwa rutynę z listy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261015120000_task_rules.sql:60-90 (trigger `milestones_check_task_dates`); supabase/migrations/20261019120000_recurring_tasks.sql:334 (predykat wystąpienia)
- **Detail**: `check_milestone_date_covers_tasks` odrzuca zmianę daty milestona na wcześniejszą tylko wtedy, gdy istnieje zadanie z `t.due_date > new.due_date`. Rutyna ma `due_date` NULL, więc trigger jej nie widzi. `check_task_rules` pilnuje `recurrence_start_date <= data milestona` tylko przy zapisie zadania, a nie przy późniejszej zmianie daty milestona. Po przesunięciu daty milestona przed `recurrence_start_date` warunek `p_today between start and m.due_date` jest fałszywy na stałe: rutyna znika z `/today` bez komunikatu, a istniejące odhaczenia osieracają. Potwierdzone przeze mnie w kodzie obu migracji.
- **Fix**: Rozszerzyć licznik w `check_milestone_date_covers_tasks` o `or t.recurrence_start_date > new.due_date` (nowa migracja `create or replace function`), z istniejącym komunikatem `Nie mozna przesunac daty milestona: ... (N)`, który `milestones.ts` już mapuje na błąd pola `due_date`; dopisać przypadek pgTAP.
  - Strength: Zamyka lukę tym samym mechanizmem co dla zadań z terminem, bez zmian po stronie TS (mapowanie po `Nie mozna przesunac daty milestona` już istnieje, `milestones.ts:50`).
  - Tradeoff: Komunikat z `milestones.ts` mówi „późniejszy termin ma N zadań", co dla rutyn jest nieprecyzyjne (chodzi o start powtarzania); osobny komunikat wymagałby dodatkowego mapowania.
  - Confidence: HIGH — wzorzec triggera, mapowanie błędów i test istnieją dla zadań z terminem.
  - Blind spot: Nie sprawdzono, czy to samo dotyczy przesunięcia daty projektu (kaskadowo przez `check_project_due_date_covers_milestones`).
- **Decision**: FIXED — Fix now: migracja 20261019130000_milestone_date_covers_routines.sql + 2 przypadki pgTAP (pgTAP 209/209; test zepsucia: test 28 czerwony bez poprawki)

### F2 — Nieaktualna strona Dziś może odhaczyć wystąpienie z nowego dnia

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId]/occurrences.ts:30
- **Detail**: Trasa liczy datę przez `todayInWarsaw()` przy każdym żądaniu, bez daty od klienta. Strona wyrenderowana przed północą i kliknięta po północy odhaczy dla rutyny codziennej (interwał 1) wystąpienie nowego dnia, którego użytkownik nie widział. Dla innych interwałów dzień nie pasuje i zwraca 422 „To wystąpienie nie jest dziś aktualne", co jest obsłużone. Strona ma `Cache-Control: no-store`, a okno błędu to chwila po północy.
- **Fix A ⭐ Recommended**: Zaakceptować ryzyko i opisać w planie jako znane ograniczenie
  - Strength: Aplikacja jednoosobowa, okno błędu to minuty po północy, brak zmian kontraktu trasy (plan: POST bez ciała).
  - Tradeoff: Rutyna codzienna może zostać odhaczona „na zapas" na nowy dzień.
  - Confidence: MEDIUM — skutek jest mały, ale cichy.
  - Blind spot: Nie sprawdzono, jak często strona zostaje otwarta przez noc.
- **Fix B**: Wyspa wysyła wyrenderowaną datę, trasa zwraca 422 przy niezgodności
  - Strength: Eliminuje odhaczenie nieobejrzanego dnia.
  - Tradeoff: Zmienia kontrakt trasy z planu, dodaje prop do wyspy i zakres do `occurrences.ts`.
  - Confidence: HIGH — prosta zmiana, ale poza planem.
  - Blind spot: Wymaga dodania kroku smoke dla niezgodności daty.
- **Decision**: ACCEPTED — Fix A: znane ograniczenie dopisane do plan.md (What We're NOT Doing) i plan-brief.md (Open Risks)

### F3 — Mylący komunikat błędu przy PUT z terminem na zadaniu powtarzalnym

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/tasks.ts:60-62
- **Detail**: Ograniczenie `tasks_recurrence_shape` obejmuje trzy przypadki (termin, status, przeniesienie), ale komunikat mówi tylko „nie można oznaczyć jako zrobione ani przenieść". Bezpośredni PUT z `due_date` na zadaniu powtarzalnym (UI go nie wysyła) zwraca tę treść. Dotyczy tylko wywołań API.
- **Fix**: Zmienić treść `RECURRING_STATE_ERROR` na ogólniejszą (np. „Zadanie powtarzalne nie ma własnego terminu i nie można go oznaczyć jako zrobione ani przenieść.").
- **Decision**: FIXED — Fix now: RECURRING_STATE_ERROR w tasks.ts i oczekiwana tresc w smoke.mjs zmienione na komunikat o braku wlasnego terminu (weryfikacja smoke po wszystkich poprawkach)

### F4 — Smoke nie pokrywa na poziomie API błędu „start powtarzania po dacie milestona"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs (kroki rutyn), supabase/tests/database/core_domain_recurring_tasks.test.sql
- **Detail**: Dane smoke używają milestonów z 2099 roku, więc ścieżka `Powtarzanie zadania …` → błąd pola `recurrence_interval_days` jest pokryta tylko w pgTAP i nie przez trasę. Plan wskazywał to jako ręczny krok 2.6 (potwierdzony). pgTAP nie ma też przypadku dla F1.
- **Fix**: Dodać krok smoke z milestonem o dacie przeszłej (POST z rytmem → 422 z błędem pola `recurrence_interval_days`) oraz przypadek pgTAP dla zmiany daty milestona z F1.
- **Decision**: FIXED — Fix now: 3 kroki smoke (milestone z data przeszla, POST z rytmem -> 422 z bledem pola recurrence_interval_days, usuniecie milestona); smoke i pgTAP (209) zielone

### F5 — `npm run lint` jest czerwony przez CRLF w kopii roboczej

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: kopia robocza (ok. 43 plików poza zakresem zmiany, np. eslint.config.js, scripts/smoke.mjs); `git ls-files --eol` pokazuje `i/lf w/crlf`
- **Detail**: Kryteria 1.4, 2.1, 3.1 i 4.1 planu mówią „npm run lint przechodzi". Na HEAD lint repo zgłasza 2611 błędów `Delete ␍` (prettier), wyłącznie przez końce linii CRLF z `core.autocrlf=true`; w plikach zmienionych w tej zmianie eslint z `endOfLine: auto` ma 0 błędów. CI na Linuksie nie widzi tego problemu. Użytkownik zaakceptował stan w Fazie 1; nadal utrudnia lokalną bramkę lint.
- **Fix**: Ustalić politykę końców linii (np. `.gitattributes` z `* text=auto eol=lf` i jednorazowe `git add --renormalize .`) albo ustawić `endOfLine: "auto"` w konfiguracji Prettier; poza zakresem tej zmiany.
- **Decision**: FIXED — Fix now: .prettierrc.json dostal endOfLine: auto (bez zmian w plikach zrodlowych); npm run lint: 2611 -> 76 bledow, wszystkie poza S-07 (73 w design-system/reference/legacy/tailwind.preset.v3.js, 5 w skryptach skilli); pliki S-07 czyste. Do osobnego commitu poza S-07
