# Zarządzanie zadaniami (CRUD) — Plan Brief

> Full plan: `context/changes/task-crud/plan.md`

## What & Why

Dodajemy do widoku projektu zarządzanie zadaniami: dodawanie do milestona (tytuł i opcjonalny własny termin), edycję, zmianę statusu (do zrobienia / częściowo / zrobione) i usuwanie z potwierdzeniem. To trzeci slice roadmapy (S-03, FR-006/FR-007) i podstawa pod listę na dziś (S-04/S-05), która opiera się na niezrobionych zadaniach najbliższego niezamkniętego milestona.

## Starting Point

Baza ma tabelę `tasks` (tytuł, termin, status, kaskady, RLS), a S-02 dostarczył wzorce serwisu, tras JSON, hooka, dialogów i smoke oraz regułę zamykania milestona z niezrobionymi zadaniami (sprawdzalną dotąd tylko przez psql). W widoku projektu wiersz milestona pokazuje tylko liczbę zadań, a przegląd S-02 zostawił lukę: nic nie pilnuje dodania niezrobionego zadania do zamkniętego milestona.

## Desired End State

Pod każdym milestonem w `/projects/[id]` widać listę zadań z kontrolką statusu i akcjami oraz przycisk „Dodaj zadanie". Termin zadania nie przekracza daty milestona, zamknięty milestone nie przyjmuje niezrobionych zadań, a datę milestona nie da się przesunąć przed termin zadania — wszystko egzekwuje baza, z komunikatami po polsku przy akcji. Milestone z zadaniami da się zamknąć z UI po ustawieniu wszystkich na „Zrobione".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Status zadania w S-03 | Prosta zmiana todo/partial/done na liście | Bez niej reguły zamykania z S-02 nie da się przejść z UI; S-05 doda tylko listę na dziś i przenoszenie. | Plan |
| Termin zadania a milestone | Termin ≤ data milestona (trigger + `max` w polu) | Spójne z hierarchią projekt ≥ milestone ≥ zadanie i z listą na dziś. | Plan |
| Zamknięty milestone | Baza odrzuca niezrobione zadanie (insert i cofnięcie statusu); UI wyłącza „Dodaj zadanie" | Domyka lukę F2 z przeglądu S-02 i chroni guardrail PRD. | Plan |
| Data milestona a terminy zadań | Przesunięcie przed termin zadania odrzucone w bazie, komunikat z liczbą zadań | Reguła w obie strony jak projekt ↔ milestone; bez cichych zmian danych. | Plan |
| Miejsce zadań w UI | Lista pod wierszem milestona, zawsze widoczna | Prosto, dobre na telefonie, jedna wyspa na wiersz zadania wzorem S-02. | Plan |
| Usuwanie zadania | Zawsze z potwierdzeniem | Jedna ścieżka jak przy projekcie i milestonie. | Plan |
| Kolejność zadań | Termin rosnąco, bez terminu na końcu, potem kolejność utworzenia | Zgodne z regułą listy na dziś (FR-010). | Plan |
| Trasy | `POST …/milestones/[milestoneId]/tasks`; `PUT`/`PATCH`/`DELETE …/tasks/[taskId]` | Prefiks `/api/projects` jest już chroniony; serwis sprawdza przynależność milestona do projektu. | Plan |
| Lista danych | `listMilestones` osadza zadania jednym zapytaniem | Brak N+1, `task_count` z długości tablicy. | Plan |

## Scope

**In scope:**
- Migracja z triggerami na `tasks` i `milestones` oraz testy pgTAP
- Walidacja, serwis zadań, cztery trasy JSON, tłumaczenie nowego błędu daty w serwisie milestonów, smoke API
- Hook, dialogi (formularz, usuwanie), wyspa wiersza zadania, lista w widoku projektu, smoke stron

**Out of scope:**
- Lista na dziś, przenoszenie na jutro, filtry, ręczne dodawanie z listy na dziś (S-04, S-05)
- Przenoszenie zadania między milestonami, subtaski, opis, ręczne sortowanie, etykiety „po terminie" (FR-015)
- `supabase db push` na zdalny projekt (cztery migracje razem, ręcznie)

## Architecture / Approach

Baza → backend → UI. Trigger `tasks_check_rules` czyta milestone z `FOR SHARE` (szereguje zapis zadania z zamykaniem i zmianą daty milestona), a `milestones_check_task_dates` pilnuje daty milestona względem terminów zadań. Serwis `src/lib/services/tasks.ts` sprawdza milestone w projekcie, tłumaczy błędy po komunikacie (przypiętym testem pgTAP) i zwraca wyniki dla czterech tras pod `/api/projects/[id]/milestones/[milestoneId]/tasks`. W widoku wiersz milestona dostaje sekcję zadań, a `TaskRowActions` (status, edycja, usunięcie) i `TaskFormDialog` używają wzorców z S-02: `trigger asChild`, blokada po sukcesie, przeładowanie strony.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguły zadań w bazie | Migracja z dwoma triggerami + testy pgTAP (z korektą testu zamykania z S-02) | Komunikaty są kontraktem z serwisami; `FOR SHARE` pod RLS (brak widocznego milestona nie może zmienić kodów błędów) i wyścig z zamykaniem |
| 2. Backend | Schemat, serwis, trasy, `listMilestones` z zadaniami, smoke API | Tłumaczenie błędów po tekście; frazy „Data milestona" vs nowy komunikat daty |
| 3. UI | Hook, dialogi, lista zadań w wierszu milestona, smoke stron | Zmiana kształtu `listMilestones` może zepsuć istniejący widok milestonów |

**Prerequisites:** działający Docker i lokalny Supabase (`.env`/`.dev.vars`), S-02 zarchiwizowane (jest).
**Estimated effort:** ~3 sesje po godzinach w 3 fazach (najwięcej w fazie 3).

## Open Risks & Assumptions

- Cztery migracje muszą trafić na zdalny projekt razem (ręczny `db push`).
- Reguły opierają się na tekście komunikatów triggerów (przypięte testem pgTAP); zmiana tekstu po cichu zdegraduje komunikaty w UI.
- Założenie: `select("*, tasks(*)")` z sortowaniem `referencedTable` działa w PostgREST tak, jak `tasks(count)` w S-02 — do potwierdzenia w fazie 2.
- Zmiana statusu zadania wchodzi do S-03 ponad zakres FR-006/007 (FR-011 jest formalnie w S-05); S-05 zajmie się już tylko listą na dziś i przenoszeniem.

## Success Criteria (Summary)

- Użytkownik dodaje, edytuje, zmienia status i usuwa zadania w widoku projektu, a zadania są uporządkowane po terminie.
- Termin zadania nigdy nie przekracza daty milestona, zamknięty milestone nie ma niezrobionych zadań, a milestone z zadaniami zamyka się po ustawieniu ich na „Zrobione".
- `supabase test db`, lint zmienionych plików, `astro check`, build i rozszerzony smoke przechodzą.
