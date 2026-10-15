<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zarządzanie zadaniami (CRUD)

- **Plan**: context/changes/task-crud/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

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

Automated (uruchomione ponownie): `supabase test db` 124/124 PASS (20 nowych asercji reguł zadań); `npm run smoke` PASS (w tym kroki zadań T1–T15 i kroki stron T4/T8); w fazach: lint zmienionych plików, `astro check` 0 błędów, `npm run build`, testy zepsucia (trigger w fazie 1, serwis w fazie 2, `throw` w wyspie w fazie 3). Manual 1.3, 2.5, 2.6, 3.5–3.9 potwierdzone przez użytkownika. Brak elementów planu MISSING; nic z „What We're NOT Doing" nie trafiło do kodu.

## Findings

### F1 — Utrata fokusu po zmianie statusu (zablokowany `Select`)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/projects/TaskRowActions.tsx:64-73 (ten sam wzorzec: MilestoneRowActions.tsx:62-72)
- **Detail**: `Select` dostaje `disabled={pending}`; zablokowanie elementu z fokusem zabiera fokus (trafia na `body`), a po błędzie (422 zamkniętego milestona, błąd sieci) kontrolka go nie odzyskuje. Użytkownik klawiatury i czytnika ekranu traci miejsce na liście, choć komunikat `role="alert"` jest ogłaszany. Komponent `Select` nie przekazuje `ref`.
- **Fix**: Zamiast `disabled` użyć `aria-disabled` i ignorować zmiany w trakcie żądania (fokus zostaje na kontrolce); to samo w wierszu milestona.
- **Decision**: FIXED (Fix now) — aria-disabled zamiast disabled w Select statusu zadania i przycisku zamknięcia milestona (fokus zostaje; zmiany w trakcie żądania ignorowane)

### F2 — Smoke: słabe asercje i luki w pokryciu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs (blok zadań, ok. linie 224-350)
- **Detail**: `bodyField` sprawdza tylko `!== undefined`. Słabe: T1, T2 i T11 (tylko istnienie `fieldErrors.*`; odmiana „ma N zadań" nie ma pokrycia), T3 (brak sprawdzenia `status: todo` i terminu), T12 (nie widać, że `due_date` stało się `null`). Brak przypadków: `PUT` zadania z terminem po dacie milestona, zadanie z innego milestona w tym samym projekcie (IDOR po `milestone_id`, Key Discovery planu), tytuł z samych spacji. Kolejność sortowania zadań jest sprawdzana tylko ręcznie (jedno zadanie w smoke).
- **Fix**: Wzmocnić T2/T3/T11/T12 przez `bodyEquals` (dokładne komunikaty, `task.status`, `task.due_date: null`) i dodać 2–3 kroki: `PUT` z terminem po milestonie → 422, `PATCH` zadania pod cudzym milestonem → 404, tytuł ze spacji → 422.
- **Decision**: FIXED (Fix now) — T1/T2/T3/T11/T12 przez bodyEquals; nowe kroki: PUT zadania z terminem po milestonie, tytuł ze spacji, zadanie pod innym milestonem tego samego projektu (404); test zepsucia kroku IDOR czerwony

### F3 — Możliwy deadlock przy równoległym zapisie zadania i usunięciu jego milestona

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261015120000_task_rules.sql:25-29
- **Detail**: UPDATE zadania blokuje wiersz zadania, a potem trigger bierze `FOR SHARE` na milestonie; DELETE milestona (kaskada) blokuje milestone, potem zadania — odwrócona kolejność blokad, więc przy równoległych żądaniach możliwy `40P01`. Postgres przerwie jedną transakcję, a serwis zwróci ogólny błąd (500) bez wycieku. Aplikacja jednokontowa, zdarzenie praktycznie niespotykane. Pozostałe wyścigi (zamykanie, zmiana daty milestona, zapis warunkowy) są poprawne.
- **Fix**: Zaakceptować; dopisać komentarz o tym ograniczeniu w nagłówku migracji (migracja nie jest jeszcze na zdalnym projekcie).
- **Decision**: FIXED (Fix now) — znane ograniczenie (deadlock 40P01) opisane w nagłówku migracji

### F4 — Dostępność: wyłączone „Dodaj zadanie" bez powiązanego wyjaśnienia i listy zadań bez nazwy

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/projects/TaskFormDialog.tsx:126-132; src/pages/projects/[id].astro:174,200-210
- **Detail**: Wyłączony `Button` nie jest fokusowalny, a podpowiedź „Otwórz milestone, aby dodać zadanie." to osobny `<p>` bez `aria-describedby` — czytnik ekranu może ją ominąć. Zagnieżdżone `<ul>` zadań nie ma nazwy, więc przy wielu milestonach brakuje kontekstu listy.
- **Fix**: Nadać podpowiedzi `id` i dodać `aria-describedby` (lub użyć `aria-disabled`), a na `<ul>` zadań dodać `aria-label="Zadania milestona {nazwa}"`.
- **Decision**: FIXED (Fix now) — wyłączone Dodaj zadanie jako aria-disabled z aria-describedby na podpowiedź; aria-label na liście zadań

### F5 — Długie tytuły w dialogu usuwania i hydratacja wszystkich wysp od razu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/projects/DeleteTaskDialog.tsx:62; src/pages/projects/[id].astro:190-207
- **Detail**: Tytuł zadania (do 200 znaków bez spacji) trafia do `AlertDialogTitle` — bez `break-words` może wyjść poza dialog (dotyczy też `DeleteMilestoneDialog`). Każde zadanie hydratuje osobną wyspę `TaskRowActions` (Select i dwa dialogi Radix) z `client:load`; przy kilkudziesięciu zadaniach to dużo pracy na starcie (skala MVP mała, nie blokuje).
- **Fix**: Sprawdzić/dodać `break-words` w tytule dialogu; opcjonalnie `client:visible` dla wierszy zadań.
- **Decision**: FIXED (Fix now) — break-words w tytule ConfirmDialog (zadanie i milestone); client:visible nie zmieniamy

### F6 — Drobne nieścisłości dokumentacyjne

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/milestones.ts:25,47; src/lib/validation/task.ts:16-22; plan.md (Phase 1 Overview)
- **Detail**: Komentarz nad `parseOpenTaskCount` mówi tylko o regule zamykania, a funkcja obsługuje już też komunikat o dacie; szyk komunikatu o dacie milestona („późniejszy termin ma N zadań") różni się od planu (plan miał błąd gramatyczny, zmiana świadoma); `PUT` bez `due_date` zeruje termin (pełna zamiana jak w milestonach — UI zawsze wysyła pole); nagłówek Fazy 1 obiecuje test „wyścigu z zamykaniem", a pgTAP nie obsługuje współbieżności (kontrakt tego nie wymieniał).
- **Fix**: Zaktualizować komentarz `parseOpenTaskCount`; pozostałe zaakceptować bez zmian (zapis w raporcie wystarcza).
- **Decision**: FIXED (Fix now) — zaktualizowany komentarz parseOpenTaskCount; reszta zaakceptowana w raporcie
