# Zadanie z rytmem „codziennie / co X dni" wraca na listę na dziś — Plan Brief

> Full plan: `context/changes/recurring-tasks-by-interval/plan.md`
> Research: `context/changes/recurring-tasks-by-interval/research.md`

## What & Why

Dziś rutynowe zadania (pranie, retinol co drugi dzień) trzeba dodawać ręcznie za każdym razem. S-07 pozwala nadać zadaniu rytm „codziennie" albo „co X dni" (X od 2 do 30), tak by samo wracało na listę na dziś, na samej górze, aż do daty milestona. To pierwszy wycinek M-2 i jednocześnie dowód, że rutyna wraca bez ręcznego odtwarzania.

## Starting Point

Lista na dziś to jedna funkcja SQL, która bierze tylko zadania najbliższego milestona projektu i zna wyłącznie zadania jednorazowe. Zadanie ma tylko tytuł, termin i status, milestone da się zamknąć tylko przy wszystkich zadaniach zrobionych, a istniejące „Zrobione" ustawia status `done`, co zakończyłoby rutynę na zawsze.

## Desired End State

Użytkownik tworzy zadanie z rytmem w obu formularzach; na `/today` rutyna jest na górze z etykietą rytmu i przyciskiem „Zrobione", po odhaczeniu znika do następnego wystąpienia. Po dacie milestona albo po jego zamknięciu nie wraca (ponowne otwarcie milestona przywraca ją), a milestone z samymi rutynami da się zamknąć. Zadania bez rytmu działają jak dotąd.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Model wystąpień | Wyliczane w SQL z rytmu i daty startu; w bazie tylko odhaczenia dnia | Bez zadań w tle, testowalne w pgTAP ze stałą datą, zamknięcie milestona wynika z jego stanu | Plan |
| Zakres S-07 | Zawiera „Zrobione" na wystąpieniu (S-09 zostaje przy „pominięte" i przenoszeniu) | Bez odhaczenia lista się nie opróżnia, a istniejące „Zrobione" kończyłoby zadanie | Plan |
| Ostatni dzień | Data milestona włącznie | Data milestona to dzień, w którym praca ma być gotowa | Plan |
| Pozycja na liście | Rutyny nad wszystkim, także nad przeterminowanymi | Dosłownie „na górę listy" z FR-017 | Plan |
| Ponowne otwarcie milestona | Rutyna wraca automatycznie | Wystąpienia wynikają ze stanu milestona, bez dodatkowego pola | Plan |
| Wyspa akcji | Wariant `TodayTaskActions` tylko z „Zrobione" | Najmniej kodu; refaktoryzacja szkieletu wysp zostaje na później | Plan |
| Zamknięcie milestona | Rutyny nie blokują zamknięcia; zamknięcie kończy powtarzanie | Spójne z PRD v2 i regułą „cykl nie wpływa na zamknięcie" | Research |
| Kształt rutyny | Bez własnego terminu, status zawsze `todo`, bez przeniesienia (ograniczenie w bazie) | Akcje z S-05 nie mogą jej zakończyć | Plan |

## Scope

**In scope:** rytm „codziennie / co X dni" przy tworzeniu zadania w obu formularzach; wyliczanie wystąpień w `today_list` (nowy rodzaj `routine`); odhaczenie dzisiejszego wystąpienia; zmiana reguł zamykania milestona i zadań w zamkniętym milestonie; krótka etykieta rytmu; testy pgTAP i smoke.

**Out of scope:** dni tygodnia (S-08), „pominięte" i przenoszenie wystąpienia (S-09), edycja i wyłączenie rytmu (S-10), odznaki i kolory (FR-018), refaktoryzacja szkieletu wysp, „częściowo zrobione" dla wystąpień.

## Architecture / Approach

Rutyna to zwykłe zadanie z dwiema nowymi kolumnami (rytm, data startu); odhaczenia dnia to wiersze w nowej tabeli `task_occurrences` z RLS i walidacją, czy dzień jest prawidłowym wystąpieniem. Ograniczenia w bazie pilnują kształtu rutyny, a `today_list` dostaje gałąź `routine`, która omija regułę najbliższego milestona. Strona `/today` renderuje rutyny pierwsze, a trasa `POST …/occurrences` liczy dzisiejszą datę po stronie serwera.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza danych | Migracja (kolumny, tabela odhaczeń, 3 funkcje), testy pgTAP, typy | Zmiana reguł zamykania nie może zepsuć zadań niepowtarzalnych |
| 2. Tworzenie z rytmem | Walidacja, serwis, kontrolka w obu formularzach, strona projektu | Duplikacja formularzy i spójność komunikatów błędów SQL↔TS |
| 3. Rutyny na liście | Wiersze `routine` na szczycie `/today` z etykietą, bez akcji | Stan pośredni: rutyna widoczna bez akcji, nie wdrażać bez fazy 4 |
| 4. Odhaczenie | Trasa, serwis, hook, wariant wyspy, kroki smoke i test zepsucia | Regresja akcji z S-05 w tej samej wyspie |

**Prerequisites:** M-1 ukończony (zadania w milestonie, lista na dziś, ręczne dodawanie z listy); lokalny Supabase (Docker) do `db reset`, `test db` i generowania typów.
**Estimated effort:** ok. 4 sesje implementacji, po jednej na fazę.

## Open Risks & Assumptions

- CI nie uruchamia pgTAP, więc poprawność logiki zależnej od daty trzyma tylko lokalne `npx supabase test db`; smoke nie sprawdza powrotu rutyny następnego dnia.
- Zdalna baza wymaga ręcznego wypchnięcia migracji.
- Przez zamknięty po dacie milestone rutyna nie wraca; użytkownik może nie zauważyć, że rutyna „skończyła się" po terminie milestona (zgodnie z decyzjami z PRD v2).
- Dług wysp (powielony szkielet pending/reload) rośnie o jeden wariant; świadomie odłożony.
- Znane ograniczenie (przegląd F2): „Zrobione" na rutynie codziennej ze strony wyrenderowanej przed północą odhaczy wystąpienie nowego dnia, bo datę liczy serwer; ryzyko zaakceptowane.

## Success Criteria (Summary)

- Zadanie „Codziennie" i „Co 2 dni" tworzy się w obu formularzach i pojawia się na górze `/today` w pasujące dni.
- Odhaczenie znika z listy, a rutyna wraca zgodnie z rytmem; po zamknięciu lub po dacie milestona nie wraca.
- Zadania bez rytmu i istniejące akcje „Zrobione / Częściowo / Na jutro" działają dokładnie jak przed zmianą.
