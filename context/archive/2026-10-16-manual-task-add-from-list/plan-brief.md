# Ręczne dodanie zadania z listy na dziś — Plan Brief

> Full plan: `context/changes/manual-task-add-from-list/plan.md`

## What & Why

Dodajemy do `/today` przycisk **Dodaj zadanie**, który otwiera dialog z wyborem projektu i milestona, tytułem i opcjonalnym terminem. To szósty slice roadmapy (S-06, FR-008): lista Dziś przestaje wymagać wejścia w widok projektu, żeby dopisać zadanie. Formularz ostrzega, gdy wybrany milestone nie jest najbliższy w projekcie, bo takie zadanie pojawi się na liście dopiero później.

## Starting Point

Trasa `POST` zadania, walidacja, triggery i `TaskFormDialog` istnieją z S-03, a lista `/today` z S-04/S-05 jest gotowa. Brakuje odczytu „projekty z otwartymi milestonami" dla selectów i samego UI dodawania na liście.

## Desired End State

Na `/today` w prawym rogu nagłówka jest przycisk „Dodaj zadanie". Dialog pozwala wybrać projekt (domyślnie pierwszy) i otwarty milestone (domyślnie najbliższy), wpisać tytuł i termin. Po zapisie strona się przeładowuje, a zadanie z najbliższego milestona jest na liście. Dla dalszego milestona formularz pokazuje podpowiedź o widoczności. Gdy nie ma celów, przycisk jest wyłączony z podpowiedzią i linkiem do projektów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Milestone spoza najbliższego | Wszystkie otwarte do wyboru + podpowiedź w formularzu | FR-008 mówi o wyborze milestona, a guardrail PRD wymaga, żeby zadanie nie znikało bez wiedzy użytkownika. | Plan |
| Komponent | Nowa wyspa `AddTaskFromTodayDialog` | Nie ruszamy działającego `TaskFormDialog` z S-03; powielenie kilku linii jest tańsze niż dwutrybowy komponent. | Plan |
| Stan pusty | Przycisk obecny, `aria-disabled` + podpowiedź i link do `/projects` | Użytkownik widzi, czego brakuje; wzorzec jak zamknięty milestone w S-03. | Plan |
| Fazy | Jedna faza | Backend to sam odczyt bez widocznego efektu, więc osobna faza nie miałaby czego sprawdzić ręcznie. | Plan |
| API i baza | Bez zmian | Istniejąca trasa `POST` i triggery pokrywają tworzenie zadania; potrzebny tylko odczyt celów. | Plan |
| Odczyt celów | Jedno zapytanie po milestonach `completed_at is null`, kolejność `due_date, seq` | Ta sama kolejność co w `today_list`, więc „najbliższy" w formularzu zgadza się z listą. | Plan |
| Po zapisie | Przeładowanie strony | Wzorzec S-02…S-05, serwer przelicza listę i wiersz „milestone do zamknięcia". | Plan |

## Scope

**In scope:**
- Typy `TaskTarget*`, `getTaskTargets` w `src/lib/services/today.ts`
- Wyspa `AddTaskFromTodayDialog` (projekt, milestone, tytuł, termin, podpowiedź, stan pusty)
- Przycisk w nagłówku `today.astro`, smoke z asercją na tekst wyspy i test zepsucia

**Out of scope:**
- Zmiany w bazie, API, `TaskFormDialog` i widoku projektu
- Dodawanie do zamkniętego milestona, tworzenie projektu/milestona z listy
- Wiersz „Dodaj zadanie do projektu…" na końcu listy, filtry, zapamiętywanie ostatniego wyboru

## Architecture / Approach

`today.astro` czyta cele (`getTaskTargets`) razem z listą i przekazuje je wyspie. Wyspa trzyma stan formularza, buduje opcje milestonów z wybranego projektu (pierwszy = najbliższy), pokazuje podpowiedź dla pozostałych i zapisuje przez `useTaskApi().createTask`. Po sukcesie przeładowanie strony.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dodawanie zadania z listy Dziś | Odczyt celów, wyspa z dialogiem, przycisk w nagłówku, smoke z testem zepsucia | Rozjazd „najbliższego" z regułą `today_list`; błąd wyspy znika po cichu — asercja na tekst wyspy i test zepsucia |

**Prerequisites:** działający Docker i lokalny Supabase (`.env`/`.dev.vars`); S-04 i S-05 zarchiwizowane (są).
**Estimated effort:** ~1 sesja po godzinach w 1 fazie.

## Open Risks & Assumptions

- Pięć migracji (F-01, S-02, S-03, S-04) nadal musi trafić na zdalny projekt razem (ręczny `db push`); S-06 nie dodaje migracji.
- Błąd odczytu celów chowa całą stronę za komunikatem „Nie udało się wczytać listy na dziś" — świadomie prosto, bo oba odczyty idą do tej samej bazy.
- Ostrzeżenie o widoczności to tekst przed zapisem; po zapisie spoza listy użytkownik zobaczy zadanie dopiero w widoku projektu.
- Duplikacja szkieletu obsługi wyniku w wyspach (F1 z przeglądu S-05) rośnie o jedną wyspę; hook wspólny dopiero przy następnej.

## Success Criteria (Summary)

- Użytkownik dodaje zadanie z listy Dziś, wybierając projekt i milestone, a zadanie z najbliższego milestona widzi od razu po przeładowaniu.
- Przy milestonie spoza najbliższego formularz mówi, że zadanie pojawi się później; bez celów przycisk wyjaśnia, czego brakuje.
- Lint zmienionych plików, `astro check`, build i rozszerzony smoke przechodzą (w tym asercje na tekst wyspy i test zepsucia).
