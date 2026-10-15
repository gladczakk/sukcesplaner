<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zarządzanie milestonami (CRUD)

- **Plan**: context/changes/milestone-crud/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria

Automated (uruchomione ponownie): `supabase test db` 104/104 PASS; w fazie 3 lint (zakres zmian), `astro check` 0 błędów, `npm run build`, `npm run smoke` PASS (w tym test zepsucia nowych kroków strony). Manual 1.3, 2.5, 2.6, 3.5–3.9 potwierdzone przez użytkownika.

## Findings

### F1 — Close/reopen: odczyt i zapis nie są atomowe (TOCTOU)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/milestones.ts:112-125
- **Detail**: `setMilestoneCompleted` czyta stan, a potem robi bezwarunkowy update. Dwa równoległe `PATCH {completed:true}` (dwie karty, podwójne kliknięcie) oba zobaczą „otwarty"; drugi update nie uruchomi triggera (`old.completed_at` już nie jest NULL) i nadpisze `completed_at`, czyli dokładnie to, co poprawka F1 z przeglądu planu miała wykluczyć. Close i reopen mogą się też przeplatać.
- **Fix**: Zrobić update warunkowy: zamknięcie z `.is("completed_at", null)`, otwarcie z `.not("completed_at", "is", null)`; przy 0 zwróconych wierszach ponowny odczyt i zwrot aktualnego stanu (`ok`) albo `not_found`.
  - Strength: Kilka linii w jednym pliku; zamyka lukę opisaną w nagłówku migracji bez zmiany bazy.
  - Tradeoff: Dodatkowa gałąź w serwisie; pasuje do istniejącego kroku smoke 7b.
  - Confidence: HIGH — wynika wprost z warunku WHEN triggera.
  - Blind spot: Zachowania dwóch równoległych żądań nadal nie testujemy automatycznie.
- **Decision**: FIXED (Fix now) — warunkowy update w setMilestoneCompleted (.is/.not completed_at) + ponowny odczyt przy 0 wierszy

### F2 — Niezmiennik „milestone zamknięty ⇒ brak niezrobionych zadań" pilnowany tylko przy zamykaniu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261014120000_milestone_close_rule.sql:16-19, 31-35
- **Detail**: Trigger liczy `count(*)` bez blokad, więc równoległy insert zadania `todo` lub zmiana `done` → `todo` może się zacommitować po liczeniu. Poza wyścigiem nic nie pilnuje drugiej strony: zadanie można dodać, cofnąć na `todo` albo przenieść do już zamkniętego milestona. Na razie nie ma CRUD zadań (S-03), więc nie da się tego wywołać z aplikacji, ale nagłówek migracji obiecuje ochronę „niezależnie od tego, kto zapisuje".
- **Fix A ⭐ Recommended**: Teraz tylko doprecyzować komentarz w migracji i zapisać wymaganie jako zadanie dla S-03 (trigger na `tasks` blokujący niezrobione zadanie w zamkniętym milestonie, ze `SELECT … FOR SHARE` na milestonie oraz `FOR UPDATE` w triggerze zamykania).
  - Strength: Zero ryzyka dla gotowej, przetestowanej migracji; decyzja przy S-03, gdzie powstaną ścieżki zapisu zadań.
  - Tradeoff: Do S-03 niezmiennik jest tylko częściowo egzekwowany w bazie.
  - Confidence: HIGH — jedyni zapisujący to dziś psql i S-02, a UI zadań jeszcze nie istnieje.
  - Blind spot: Zadanie dla S-03 może zostać pominięte, jeśli nie trafi do roadmapy/planu.
- **Fix B**: Dodać teraz drugi trigger na `tasks` i blokadę wiersza milestona.
  - Strength: Niezmiennik dwustronny od razu.
  - Tradeoff: Nowa migracja i testy bez żadnego konsumenta; ryzyko błędnych założeń o ścieżkach S-03.
  - Confidence: MED — kształt zapisu zadań (np. przenoszenie między milestonami) nie jest jeszcze zdecydowany.
  - Blind spot: Wpływ na S-05 (zamykanie z listy na dziś).
- **Decision**: FIXED via Fix A — znane ograniczenie i wymaganie dla S-03 (trigger na tasks + blokady) zapisane w komentarzu migracji

### F3 — Przyciski w wierszach mają identyczne nazwy dostępne

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/projects/MilestoneRowActions.tsx:62-71, MilestoneFormDialog.tsx:139-142, DeleteMilestoneDialog.tsx:82-84
- **Detail**: Każdy wiersz ma przyciski „Edytuj", „Zamknij milestone"/„Otwórz ponownie", „Usuń" bez wskazania milestona; czytnik ekranu nie odróżni wierszy.
- **Fix**: Dodać `aria-label` z nazwą milestona (np. `Edytuj milestone ${name}`, `Zamknij milestone ${name}`, `Usuń milestone ${name}`).
- **Decision**: FIXED (Fix now) — aria-label z nazwą milestona na przyciskach Edytuj / Zamknij-Otwórz / Usuń

### F4 — Luki w pokryciu testowym: słabe P3 i brak testu komunikatu z licznikiem

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:215-219; src/lib/services/milestones.ts:35-47
- **Detail**: Krok P3 sprawdza tylko „Zamknij milestone", które jest na stronie zawsze (Beta pozostaje otwarta), więc nie dowodzi ponownego otwarcia Alfy (to słabość kontraktu planu). Mapowanie błędu zamknięcia (`parseOpenTaskCount`, dopasowanie po tekście) nie ma testu end-to-end: zmiana tekstu w migracji po cichu zdegraduje komunikat do wersji bez liczby; pgTAP przypina tekst, ale nie parser.
- **Fix**: P3: dodać negatywną asercję na „zamknięty" (lub zamknąć Betę przed P3). Opcjonalnie komentarz sprzęgający w migracji i serwisie („tekst używany przez milestones.ts").
- **Decision**: FIXED (Fix now) — P3 sprawdza kolejność Gamma → "Zamknij milestone Gamma smoke" → Beta (test zepsucia: czerwony); komentarz sprzęgający w migracji

### F5 — `Check` z lucide-react w pliku .astro i zduplikowany `GENERIC_ERROR`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/projects/[id].astro:7,137; src/lib/services/postgrest.ts:3; src/lib/api-client.ts:6
- **Detail**: To jedyne użycie komponentu React (lucide) w .astro bez `client:`, wbrew konwencji „Astro dla statyki"; błąd SSR takiej ikony byłby połknięty jak w lekcji o wyspach. Ten sam tekst `GENERIC_ERROR` istnieje w warstwie serwera i klienta (rozjazd możliwy, ale warstwy są rozdzielone celowo).
- **Fix**: Zamienić ikonę na inline `<svg aria-hidden>` w .astro; `GENERIC_ERROR` zostawić (świadoma duplikacja warstw).
- **Decision**: FIXED (Fix now) — inline <svg aria-hidden> zamiast Check z lucide w [id].astro; GENERIC_ERROR bez zmian

### F6 — Drobne dodatki spoza planu (zakres)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/projects/MilestoneFormDialog.tsx:117,153-155,181-188; DeleteMilestoneDialog.tsx:50-56
- **Detail**: `DialogDescription` z terminem projektu, prefiks „Błąd:" i ikony, komunikat `notFound`, opóźnione przeładowanie (1500 ms) po 404. Nieszkodliwe, spójne z kontraktem, ale niezapisane w planie. Pominięto też: brak `aria-busy` i etykiety „Zamykanie…" przy zamykaniu oraz drobny skos zegara `completed_at` (app) vs `created_at` (baza) — oba świadomie bez działania.
- **Fix**: Zaakceptować bez zmian (zapis w review wystarcza).
- **Decision**: FIXED (Fix differently) — usunięto DialogDescription (aria-describedby={undefined}) i ikonę Plus; reszta dodatków zaakceptowana
