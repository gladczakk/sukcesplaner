<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lista zadań na dziś

- **Plan**: context/changes/today-list-view/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Success criteria

Automated (uruchomione ponownie po commitach): `supabase test db` 143/143 PASS (19 nowych asercji reguły), `npx astro check` 0 błędów, `npm run smoke` PASS (w tym kroki `/today`, `bodyExcludes` i asercje na treść wyspy); w fazach: lint zmienionych plików, build oraz testy zepsucia (funkcja SQL w fazie 1, serwis w fazie 2, wyspa w fazie 3). Manual 1.4, 2.5–2.8, 3.5–3.6 potwierdzone przez użytkownika. Brak elementów planu MISSING; nic z „What We're NOT Doing" nie trafiło do kodu; jedyny drobny dryf: dodatkowy klucz `milestone_seq` w sortowaniu SQL (nie opisany w planie, nieprzetestowany).

## Findings

### F1 — Etykieta „Przeniesione na jutro" nie zgadza się z danymi

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/today.astro:187-189
- **Detail**: Wiersze `deferred` to każde niedokończone zadanie z `deferred_until` > dziś (w teście pgTAP także późniejsze dni), więc napis „Przeniesione na jutro: N" bywa nieprawdziwy. Dziś bywa to widoczne tylko przy ręcznym zapisie przez psql, ale S-05 lub inne źródło może ustawić dalszą datę.
- **Fix**: Zmienić etykietę na „Przeniesione na później: N" (lub „Odłożone: N") w stronie i w opisie planu/briefu.
- **Decision**: FIXED (Fix now) — etykieta „Przeniesione na później: N”

### F2 — `today_list(NULL)` po cichu zwraca wszystkie odłożone zadania jako zwykłe

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261016120000_today_list.sql:28-47,64
- **Detail**: Przy `p_today = NULL` wyrażenie `deferred_until > NULL` daje NULL, więc zadania z `deferred_until` trafiają do wierszy `task` zamiast `deferred`, bez błędu. Aplikacja zawsze podaje datę, więc to ryzyko tylko przy bezpośrednim wywołaniu RPC.
- **Fix**: Dodać `strict` do funkcji (wynik dla NULL to zero wierszy) i jedną asercję pgTAP; migracja nie jest jeszcze na zdalnym projekcie, więc można ją edytować.
- **Decision**: FIXED (Fix now) — funkcja today_list jest strict (NULL → 0 wierszy), asercja pgTAP

### F3 — Powtórzony link „Otwórz projekt" bez kontekstu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/today.astro:153-184
- **Detail**: W każdym wierszu milestona jest link „Otwórz projekt" bez nazwy, a tuż obok już istnieje link z nazwą projektu do tego samego adresu; czytnik ekranu po liście linków nie odróżni kolejnych wierszy.
- **Fix**: Dodać `aria-label` z nazwą projektu („Otwórz projekt {nazwa}") do linku „Otwórz projekt".
- **Decision**: FIXED (Fix now) — aria-label „Otwórz projekt {nazwa}” w wierszu milestona

### F4 — Luki w pgTAP: kolejność globalna i klucz `milestone_seq`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/database/core_domain_today_list.test.sql
- **Detail**: Wszystkie asercje filtrują po `project_id`, więc nie ma testu pełnej kolejności `task` → `milestone` → `deferred` w jednym wyniku, klucza `milestone_seq` (dwa projekty z tym samym terminem zadania i datą milestona), zadania `done` z `deferred_until` > dziś (nie powinno trafić ani do `task`, ani do `deferred`) ani asercji pełnego wiersza `milestone` (`project_name`, `life_area`, `NULL` w kolumnach zadania).
- **Fix**: Dodać 4 asercje (zaktualizować `plan(n)`) dla wymienionych przypadków i opisać klucz `milestone_seq` w nagłówku migracji.
- **Decision**: FIXED (Fix now) — 5 nowych asercji pgTAP (plan 24): remis seq milestona w różnych projektach, zadanie done z deferred_until, pełny wiersz milestone, kolejność task→milestone→deferred, strict NULL; klucz milestone_seq opisany w nagłówku migracji; test zepsucia czerwony

### F5 — Smoke: trywialna asercja i brak pokrycia chipów, `partial`, podsumowania

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs (kroki `today`, ok. linie 99-103, 273-316)
- **Detail**: Krok stanu pustego ma `bodyIncludes: "Dziś"`, które jest zawsze spełnione (nawigacja, tytuł, eyebrow); dane smoke z 2099 dają tylko chip „data", więc chipy „po terminie", „dziś", „jutro", `partial` („· częściowo"), podsumowanie i nagłówek z datą nie mają żadnej asercji (nie da się też ustawić `deferred_until`, brak API do jego zapisu).
- **Fix A ⭐ Recommended**: Wzmocnić tylko to, co tanie — w kroku pustym zostawić samo „Na dziś nic do zrobienia." i dodać `bodyExcludes` ze słowem podsumowania („pozycji"), a w kroku z zadaniem asercję `bodyOrder` („Smoke project", „Gamma smoke") i podsumowania („1 pozycja")
  - Strength: Kilka linii w istniejących krokach, bez zmiany stanu testowego i kolejności kroków.
  - Tradeoff: Chipy „po terminie"/„dziś"/„jutro" i `partial` nadal bez asercji w smoke (zostają ręczne).
  - Confidence: HIGH — wynika z kodu strony i danych smoke.
  - Blind spot: Zmiana tekstu podsumowania wymaga poprawy asercji.
- **Fix B**: Dodać krok tworzący zadania z terminami względnymi do dziś w Warszawie (wczoraj jako `partial`, dziś) i asercje na „wczoraj", „dziś", „po terminie", „częściowo"
  - Strength: Pokrywa chipy i `partial` end-to-end w smoke.
  - Tradeoff: Dodatkowe otwarte zadania zmieniają liczbę w komunikacie „niezrobione zadania (1)" w kolejnych krokach, więc trzeba je skasować przed tymi krokami; smoke zależy od zegara.
  - Confidence: MED — wymaga ostrożnego wstawienia i sprzątania zadań.
  - Blind spot: Granica północy (strefa Warszawy) może rozjechać datę zadania i „dziś" na stronie.
- **Decision**: FIXED via Fix A — stan pusty bez zdania podsumowania (bodyExcludes „pozycj”), bodyOrder projekt/milestone, asercje podsumowania „1 pozycja” i „1 pozycja · 1 milestone do zamknięcia”

### F6 — Milestone po terminie bez chipa „po terminie"; chip bez słowa „Termin" dla czytnika

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/today.astro:30-33,90-168
- **Detail**: Wiersz milestona pokazuje tylko zwykłą datę, bez oznaczenia „po terminie", a „po terminie" w podsumowaniu liczy wyłącznie zadania, choć najbliższy milestone po terminie to wprost reguła z migracji; chip zadania ma samo „wczoraj"/„dziś" bez kontekstu „Termin" dla czytnika ekranu.
- **Fix A ⭐ Recommended**: Dodać `<span class="sr-only">Termin: </span>` przed chipem i zostawić milestone bez chipa (FR-015 „po terminie" jest zaparkowane, poza zakresem S-04)
  - Strength: Mała poprawka a11y, bez rozszerzania zakresu o FR-015.
  - Tradeoff: Milestone po terminie nadal wygląda jak zwykły (zgodnie z planem).
  - Confidence: HIGH — jedno `span` w istniejącym markupie.
  - Blind spot: Użytkownik może oczekiwać oznaczenia po terminie także dla milestona.
- **Fix B**: Dodatkowo użyć `dueChip` dla daty milestona i liczyć go w „po terminie"
  - Strength: Spójne oznaczenie przeterminowania na liście.
  - Tradeoff: Wchodzi w zakres FR-015 (nice-to-have, zaparkowane) i zmienia definicję licznika.
  - Confidence: MED — nie wiadomo, czy to oczekiwany efekt.
  - Blind spot: Podsumowanie mogłoby podwójnie liczyć milestone i jego zadania.
- **Decision**: FIXED via Fix B — nowy DueChip.astro (wspólny dla zadań i milestonów, z sr-only „Termin:”), milestone po terminie ma chip i jest liczony w „po terminie” (poza zakresem FR-015 świadomie, na życzenie użytkownika)

### F7 — Drobne: typ RPC non-null, `aria-busy` przycisku, cache widoku zależnego od daty

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/today.ts; src/components/today/CloseMilestoneButton.tsx:49-58; src/pages/today.astro:15
- **Detail**: Wygenerowane typy RPC oznaczają kolumny zadania jako non-null także dla wierszy `milestone`, a serwis rzutuje `status as TaskStatus` i po cichu ignoruje nieznany `kind`; przycisk zamknięcia w trakcie żądania nie sygnalizuje stanu poza `opacity-50`; strona zależna od daty nie ma `Cache-Control: no-store`, więc przywrócenie z bfcache po północy pokaże wczorajszą listę. Zgłoszona propozycja wyciągnięcia chipa do `DueChip.astro` z `lucide-react` jest sprzeczna z konwencją z S-03 (ikony w `.astro` jako inline `<svg>`), więc ją pomijamy.
- **Fix**: Dodać komentarz/guard (`row.task_id !== null`) i `logError` w gałęzi nieznanego `kind`, `aria-busy={pending}` na przycisku oraz nagłówek `Cache-Control: no-store` w odpowiedzi strony.
- **Decision**: FIXED (Fix now) — komentarz o typach RPC i logError dla nieznanego kind w serwisie, aria-busy na przycisku zamknięcia, Cache-Control: no-store na stronie /today
