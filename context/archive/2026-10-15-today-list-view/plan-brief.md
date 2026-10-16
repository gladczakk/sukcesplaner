# Lista zadań na dziś — Plan Brief

> Full plan: `context/changes/today-list-view/plan.md`
> Research: `context/changes/today-list-view/research.md`

## What & Why

Dodajemy stronę `/today`: jedną listę niedokończonych zadań ze wszystkich projektów, wybranych regułą z PRD (najbliższy niezamknięty milestone każdego projektu) i posortowanych po terminie, z wierszem „milestone do zamknięcia" na końcu. To czwarty slice roadmapy (S-04, US-01, FR-009/FR-010) i „gwiazda przewodnia": dowodzi, że jedno miejsce może automatycznie połączyć różne obszary życia w codzienną listę.

## Starting Point

Baza ma wszystkie potrzebne kolumny (status i termin zadania, `deferred_until`, `completed_at` i `seq` milestona), a S-02 i S-03 dały zamykanie milestonów i zadania z niezmiennikami. Nie ma jednak trasy `/today` (`/dashboard` to placeholder starteru), odczytu zbiorczego ani funkcji SQL, a PRD jest niespójne: Business Logic i AC1 w US-01 opisują inne zbiory.

## Desired End State

Po zalogowaniu użytkownik trafia na `/today` i widzi „Dziś" z datą, podsumowaniem i płaską listą zadań z chipami terminu (kolor, słowo, ikona). Po zadaniach są wiersze milestonów do zamknięcia z przyciskiem zamknięcia. Zadania przeniesione na jutro są ukryte i policzone pod listą; pusty wynik daje „Na dziś nic do zrobienia".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Reguła kwalifikacji | Business Logic: niedokończone zadania najbliższego niezamkniętego milestona; AC1 to tylko przykład | Zgodne z roadmapą S-04 i FR-009; AC1 w PRD opisuje inny zbiór. | Plan |
| „Najbliższy" milestone | Najmniejsza `due_date` (także po terminie), remis wg `seq` | Zgodne z FR-004/FR-015, indeksem i liczbą pojedynczą w PRD. | Plan |
| Sortowanie | FR-010 dosłownie: własny termin rosnąco, bez terminu na końcu | Bez dziedziczenia terminu; remis: data milestona, `created_at`. | Plan |
| Milestone do zamknięcia | Wiersz na końcu listy z przyciskiem zamknięcia (istniejące `PATCH` z S-02) | Domyka „ostatni krok do zamknięcia" z Business Logic. | Plan |
| `deferred_until` | Ukryte do dnia, liczone w linijce pod listą | S-05 tylko zapisze kolumnę i nie zmieni zapytania. | Plan |
| „Dziś" | `Europe/Warsaw`, liczone raz na żądanie | Jedna osoba w jednym kraju; spójne z `formatTimestamp`. | Plan |
| Widok | `/today` w `AppLayout`, płaska lista, link „Dziś", redirect po logowaniu | Najmniejszy zakres; sidebar/rail/filtry odłożone, polish przez `/10x-ui`. | Plan |
| Miejsce reguły | Funkcja SQL `today_list(p_today)` + pgTAP | Reguła w pełni testowalna z datą jako parametrem; brak zależności od limitu na osadzonej tabeli. | Plan |
| Akcje z listy | Tylko zamknięcie milestona; reszta w S-05 | Zmiana statusu i „Na jutro" to zakres S-05. | Plan |

## Scope

**In scope:**
- Migracja z funkcją `today_list` i testy pgTAP, regeneracja typów
- Serwis, pomocnicy „dziś"/chip, strona `/today`, ochrona trasy, nawigacja, redirect po logowaniu
- Wyspa „Zamknij milestone", smoke (w tym `bodyExcludes`) i test zepsucia wyspy

**Out of scope:**
- Akcje na zadaniach (status, „Na jutro", edycja, usuwanie), zapis `deferred_until` (S-05), dodawanie zadań z listy (S-06)
- Filtr po obszarze życia, kolor projektu, FR-015, sidebar/rail, podgląd kolejnych dni, sygnał „zbliżającego się deadline'u"
- `supabase db push` na zdalny projekt (pięć migracji razem, ręcznie)

## Architecture / Approach

Baza → odczyt i strona → akcja. Funkcja `public.today_list(p_today date)` (`security invoker`) wybiera najbliższy niezamknięty milestone każdego projektu i zwraca wiersze `task`, `milestone` i `deferred` w kolejności listy. Serwis `src/lib/services/today.ts` wywołuje ją przez `rpc` i buduje model widoku; strona `src/pages/today.astro` renderuje listę, chipy (`src/lib/today.ts`) i stany. „Dziś" jest liczone raz po stronie serwera i przekazywane do SQL i do chipów. Wyspa `CloseMilestoneButton` używa istniejącego `PATCH` z S-02.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Funkcja `today_list` w bazie | Migracja z funkcją, pgTAP z wszystkimi przypadkami reguły, typy | Pierwsze RPC w repo; `distinct on` i kolejność wyniku pod RLS |
| 2. Odczyt i strona `/today` | Serwis, pomocnicy, strona z listą i chipami, routing, nawigacja, smoke z `bodyExcludes` | Rozjazd „dziś" między SQL a chipami; zmiana przekierowania po logowaniu |
| 3. Zamknięcie milestona z listy | Wyspa przycisku, smoke z asercją na treść wyspy | Błąd wyspy znika po cichu — wymaga asercji na treść i testu zepsucia |

**Prerequisites:** działający Docker i lokalny Supabase (`.env`/`.dev.vars`), S-01…S-03 zarchiwizowane (są).
**Estimated effort:** ~3 sesje po godzinach w 3 fazach (najwięcej w fazie 2).

## Open Risks & Assumptions

- Pięć migracji musi trafić na zdalny projekt razem (ręczny `db push`).
- „Dziś" jest na sztywno w `Europe/Warsaw`; zmiana strefy użytkownika wymaga późniejszej poprawki.
- Publiczny landing (`Topbar.astro`) nadal linkuje zalogowanego do placeholdera `/dashboard`; porządek `/dashboard` i landingu wchodzi do `/10x-ui` po S-04.
- Guardrail „zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem" (`prd.md:38`) nie ma dziś żadnego slice'a; S-04 go nie realizuje.
- Smoke nie kontroluje daty „dziś" ani nie ustawi `deferred_until`; te przypadki pokrywa tylko pgTAP i ręczna weryfikacja.
- Regeneracja `database.types.ts` (w Git Bash, nie PowerShell) może zmienić więcej niż sekcję `Functions` — wtedy dopisujemy funkcję ręcznie.

## Success Criteria (Summary)

- Użytkownik po zalogowaniu widzi listę zadań z najbliższych niezamkniętych milestonów wszystkich projektów w kolejności termin rosnąco, z milestonem do zamknięcia na końcu, i może go zamknąć z listy.
- Reguła (remis dat, `partial`, milestone po terminie, `deferred_until`, pusty milestone) jest pilnowana testami pgTAP; smoke pilnuje treści i kolejności strony oraz renderu wyspy.
- `supabase test db`, lint zmienionych plików, `astro check`, build i rozszerzony smoke przechodzą.
