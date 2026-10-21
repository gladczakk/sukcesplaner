# Zmiana rytmu i wyłączenie powtarzania — Plan Brief

> Full plan: `context/changes/recurring-task-edit-disable/plan.md`
> Research: `context/changes/recurring-task-edit-disable/research.md`

## What & Why

Zadania powtarzalne da się dziś tylko dodać z rytmem; formularz edycji pokazuje rytm tylko do odczytu, a serwer odrzuca rytm w edycji. S-10 pozwala zmienić rytm istniejącego zadania albo je wyłączyć, tak by lista Dziś od razu odzwierciedlała nowe ustawienie bez śladów po starym rytmie.

## Starting Point

PUT zadania parsuje tylko tytuł i termin, a w formularzu edycji kontrolki rytmu są ukryte. Zapisane odhaczenia i przeniesienia leżą w `task_occurrences` i nie są walidowane po wstawieniu, więc po zmianie rytmu zostałyby sierotami, a wiersz „przeniesione” nadal tworzyłby wpis na liście. Usuwanie zadania powtarzalnego już działa i kasuje kaskadą jego odhaczenia.

## Desired End State

W edycji zadania powtarzalnego jest select rytmu z bieżącym ustawieniem. Zmiana rytmu działa od dziś: lista Dziś pokazuje zadanie wg nowego rytmu, bez „pominiętego wczoraj” i bez przyszłych przeniesień, a zrobione wystąpienia zostają. „Nie powtarzaj” pyta o potwierdzenie i usuwa zadanie. Na niezrobionym zwykłym zadaniu można włączyć rytm; zrobione ma pole zablokowane z wyjaśnieniem.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wyłączenie powtarzania | „Nie powtarzaj” w edycji usuwa zadanie po potwierdzeniu, razem z odhaczeniami | Tak sobie życzy użytkowniczka („usunięte”); używa istniejącego DELETE, bez zmian w bazie | Plan |
| Kryterium PRD o historii | Zmieniamy: wyłączenie nie zachowuje historii ani dzisiejszego wystąpienia | Usunięcie zadania kasuje kaskadą jego wiersze `task_occurrences` | Plan |
| Kotwica „co X dni” | Każda zmiana rytmu ustawia datę startu na dziś | „Od dziś” i samoczynne wygaszenie „pominiętego” (wczoraj jest przed startem) | Plan |
| „Pominięte wczoraj” | Znika przez reset daty startu, bez zmian w `today_list` | Gałąź `skipped` wymaga, by wczoraj było w zakresie od daty startu | Research |
| Przyszłe przeniesienia | Trigger usuwa wiersze `moved` od nowej daty startu wzwyż | Zapobiega „duchom” i zlaniu dwóch wystąpień w jeden wiersz | Plan |
| Wiersze „zrobione” | Zostają przy zmianie rytmu | Użytkowniczka: „zrobionego nie usuwajmy” | Plan |
| Granica sprzątania | Nowa `recurrence_start_date`, nie `current_date` | `current_date` jest w UTC, „dziś” liczy serwer w Warszawie | Research |
| Włączanie rytmu na zwykłym zadaniu | Dozwolone dla niezrobionych: zerujemy termin, przeniesienie i „Częściowo”; zrobione blokujemy | `tasks_recurrence_shape` wymusza `todo`, brak terminu i brak przeniesienia | Plan |
| Zmiana rytmu | Bez potwierdzenia; opis pod polem „działa od dziś i usuwa przyszłe przeniesienia” | Skutki są małe, odhaczenia zostają | Plan |
| Skąd zmienić rytm | Tylko z formularza zadania, nie z listy Dziś | Decyzja użytkowniczki | Plan |
| Wyłączenie przez PUT | Serwer odrzuca z komunikatem „usuń zadanie” | Chroni przed przypadkową zamianą w zwykłe zadanie | Plan |

## Scope

**In scope:** trigger sprzątający przeniesienia po zmianie rytmu, PUT z rytmem (zmiana, zmiana typu, włączenie na zwykłym zadaniu, blokady), formularz edycji z kontrolkami rytmu, „Nie powtarzaj” z potwierdzeniem usunięcia, testy pgTAP i smoke, aktualizacja PRD v2.

**Out of scope:** zadanie „nieaktywne” z zachowaną historią, zmiana rytmu z listy Dziś, potwierdzenie przy zmianie rytmu, usuwanie wierszy „zrobione”, ręczna edycja daty startu, zmiany w `today_list` i wyzwalaczach wystąpień, nowy runner testów TS.

## Architecture / Approach

Stan wystąpień zostaje w `task_occurrences`, a `today_list` się nie zmienia. Serwer przy zapisie wykrywa zmianę rytmu względem zapisanego zadania i jednym UPDATE ustawia rytm, datę startu na dziś, a przy włączaniu rytmu także zerowanie terminu, przeniesienia i statusu. Trigger po UPDATE rytmu usuwa wiersze `moved` od nowej daty startu wzwyż. Formularz edycji używa tych samych kontrolek rytmu co tworzenie, a „Nie powtarzaj” na zadaniu powtarzalnym prowadzi do `ConfirmDialog` i istniejącego DELETE.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza danych | Trigger sprzątający `moved` po zmianie rytmu, testy pgTAP | Granica daty: musi iść po dacie startu z aplikacji, nie po `current_date` |
| 2. API edycji | PUT z rytmem, data startu = dziś, włączenie na zwykłym zadaniu, smoke | Wszystkie zmiany muszą być jednym UPDATE, bo ograniczenia sprawdzają stan końcowy |
| 3. Formularz edycji | Kontrolki rytmu, „Nie powtarzaj” z potwierdzeniem, PRD v2, smoke wysp | Trzy tryby rytmu i potwierdzenie w jednym dialogu; test ręczny bo formularz jest w zamkniętym dialogu |

**Prerequisites:** S-07, S-08 i S-09 zakończone i zarchiwizowane; lokalny Supabase (Docker) do `db reset` i `test db`.
**Estimated effort:** ok. 3 sesje implementacji, po jednej na fazę.

## Open Risks & Assumptions

- Zmiana rytmu usuwa też dzisiejsze przeniesienie, więc dzisiejsze wystąpienie może wrócić na listę, jeśli nowy rytm obejmuje dziś.
- Przy dacie milestona wcześniejszej niż dziś zmiana rytmu jest odrzucana (baza nie pozwala na start po dacie milestona); komunikat już istnieje.
- Reset daty startu to polityka aplikacji; bezpośredni UPDATE rytmu poza aplikacją zachowa starą kotwicę (trigger sprząta tylko przeniesienia).
- Usunięcie zadania kasuje historię odhaczeń bezpowrotnie; potwierdzenie musi to nazwać wprost.
- Formularz edycji jest w zamkniętym dialogu, więc smoke nie sprawdza jego treści; pokrywają ją kroki ręczne.

## Success Criteria (Summary)

- Zmiana rytmu w edycji działa od dziś: nowa etykieta, brak „pominiętego wczoraj” i przyszłych przeniesień, zrobione wystąpienia zostają.
- „Nie powtarzaj” na zadaniu powtarzalnym po potwierdzeniu usuwa zadanie; zrobione zwykłe zadanie nie dostaje rytmu.
- Zadania bez rytmu i istniejące akcje na liście Dziś działają jak dotąd.
