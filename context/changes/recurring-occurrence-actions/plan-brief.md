# Akcje na wystąpieniu zadania powtarzalnego — Plan Brief

> Full plan: `context/changes/recurring-occurrence-actions/plan.md`
> Research: `context/changes/recurring-occurrence-actions/research.md`

## What & Why

Zadanie powtarzalne dziś potrafi tylko wracać na listę i dać się odhaczyć; niezrobione wystąpienie znika bez śladu, a przenieść go nie można. S-09 dodaje dwie akcje z PRD v2: widoczne „pominięte wczoraj” i jednorazowe przeniesienie dzisiejszego wystąpienia „na jutro”, tylko gdy jutro to zadanie nie ma własnego wystąpienia.

## Starting Point

Wystąpienia są wyliczane w SQL (`today_list`), a w `task_occurrences` zapisane są tylko odhaczenia (`state` = `done`). „Na jutro” z S-05 (`deferred_until`) jest dla rutyn zablokowane w bazie i ukryte w UI, więc przeniesienie wystąpienia nie ma dziś miejsca zapisu.

## Desired End State

Pod dzisiejszymi rutynami na `/today` widać wiersze „Pominięte wczoraj” bez przycisków. Rutyna z wolnym jutrem ma przycisk „Na jutro”: znika dziś i wraca jutro na górze z etykietą „przeniesione ze środy”, gdzie można ją zrobić albo pojutrze widzieć jako pominiętą. Zadanie codzienne nie ma przycisku „Na jutro”, a przeniesionego wystąpienia nie da się przenieść drugi raz.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Co to „pominięte” | Samoczynnie, tylko wczorajsze wystąpienie; bez przycisku „Pomiń” | Dokładnie FR-011, nic się nie kumuluje, da się wyliczyć w SQL bez zapisu | Plan |
| Pominięte wystąpienie | Tylko informacja, bez odhaczenia z opóźnieniem | Zgodne z „wygasa” i z S-07, gdzie odhaczenie dotyczy tylko dzisiejszego dnia | Plan |
| Cel przeniesienia | Tylko „na jutro” (przycisk jak w S-05) | Spójne z S-05, przykład z PRD działa (środa → czwartek), bez nowej kontrolki daty | Plan |
| Po przeniesieniu | Jednorazowo; potem jak zwykłe wystąpienie, bez drugiego przeniesienia | „To samo wystąpienie zmienia dzień” z PRD, bez nieskończonego odkładania | Plan |
| Gdzie pominięte | Na górze listy, pod rutynami, z odznaką | PRD wymaga widocznego oznaczenia, bez klikania | Plan |
| Etykieta przeniesionego | „przeniesione ze środy”, bez „Na jutro” | Widać, dlaczego wiersz jest w dzień spoza rytmu | Plan |
| Zapis stanu | Jedna tabela `task_occurrences`: stan `moved` + `moved_to`; „pominięte” wyliczane | Jedno źródło prawdy, istniejący klucz blokuje `done` i `moved` tego samego dnia | Plan |
| Reguła przeniesienia | Wymuszona w wyzwalaczu bazy, nie tylko w UI | PRD to guardrail; UI może się mylić po północy | Research |
| Dostępność „Na jutro” | Liczy SQL (nowa kolumna), wspólna funkcja „dzień rytmu” | UI nie duplikuje logiki rytmu; jedna definicja dla S-09 i S-10 | Plan |

## Scope

**In scope:** stan `moved` i walidacja w bazie, nowy `today_list` (wiersze `skipped`, przeniesione, dostępność przycisku), trasa i usługa przeniesienia, wiersze „Pominięte wczoraj”, etykieta przeniesienia, przycisk „Na jutro” w wyspie rutyny, testy pgTAP i smoke, doprecyzowanie PRD v2.

**Out of scope:** przycisk „Pomiń”, odhaczanie pominiętych, okno pominięć dłuższe niż jeden dzień, wybór daty przeniesienia, ponowne przeniesienie i cofanie, zmiana rytmu i wyłączenie (S-10), zmiany w akcjach zadań niepowtarzalnych.

## Architecture / Approach

Trzy fazy od dołu. Faza 1 to migracja: stan `moved` z dniem docelowym, funkcja pomocnicza „czy dzień jest dniem rytmu” (używana przez wyzwalacz, `today_list` i nowy warunek dostępności przycisku), przepisany wyzwalacz odhaczenia i przeniesienia oraz nowy `today_list` z wierszami `skipped` i dwiema nowymi kolumnami. Faza 2 dodaje usługę i trasę POST przeniesienia (serwer liczy dzień i jutro). Faza 3 podłącza widok, wyspę i etykiety oraz aktualizuje smoke i PRD.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza danych | Migracja `moved`, wyzwalacz, `today_list` z `skipped`, testy pgTAP, typy | Wspólna definicja rytmu zmienia kod z S-07 i S-08 (chroni go 263 testów) |
| 2. API przeniesienia | Usługa, trasa `occurrences/move`, wrapper, smoke API | Komunikaty bazy to kontrakt z TS, nowa fraza musi się różnić od „Wystapienie” |
| 3. Lista na dziś | Wiersze „Pominięte wczoraj”, etykieta, „Na jutro” w wyspie, smoke i PRD | Regresja trzech akcji zadań niepowtarzalnych i asercji smoke z S-07 |

**Prerequisites:** S-07 i S-08 zakończone i zarchiwizowane; lokalny Supabase (Docker) do `db reset`, `test db` i generowania typów.
**Estimated effort:** ok. 3 sesje implementacji, po jednej na fazę.

## Open Risks & Assumptions

- Smoke nie steruje datą, więc „pominięte” i przeniesienie na jutro sprawdza tylko pgTAP ze stałym `p_today` (CI go nie uruchamia).
- S-10 zmieni rytm od dziś; wyliczane „pominięte” z wczoraj będzie wtedy liczone wg nowego rytmu, co S-10 musi rozstrzygnąć.
- Przesunięcie daty milestona przed dzień przeniesionego wystąpienia ukryje je (wymóg `p_today ≤ data milestona`); kontrola `check_milestone_date_covers_tasks` nie zna `moved_to`.
- Znane z S-07: strona otwarta przez północ i kliknięta po niej przenosi kolejny dzień (zaakceptowane).
- Zdalna baza wymaga ręcznego wypchnięcia migracji.

## Success Criteria (Summary)

- Niezrobione wczorajsze wystąpienie jest dziś widoczne jako „Pominięte wczoraj”, a jutro znika.
- Wystąpienie z wolnym jutrem da się przenieść „na jutro”; zadanie codzienne i już przeniesione wystąpienie nie mają tego przycisku, a baza odrzuca niedozwolone przeniesienia.
- Zadania niepowtarzalne i ich trzy akcje działają jak dotąd.
