# Rytm w wybrane dni tygodnia — Plan Brief

> Full plan: `context/changes/recurring-tasks-by-weekdays/plan.md`
> Research: `context/changes/recurring-tasks-by-weekdays/research.md`

## What & Why

Po S-07 zadanie może powtarzać się „codziennie" albo „co X dni", ale treningi i bieganie dzieją się w konkretne dni (np. środa i piątek). S-08 dodaje drugi rytm: wybór dni tygodnia przy tworzeniu zadania, tak by zadanie wracało na listę na dziś w te dni, na tych samych zasadach co rytm interwałowy.

## Starting Point

Model rytmu stoi na jednej kolumnie `recurrence_interval_days`, a „zadanie powtarzalne" to w SQL `interval IS NOT NULL` w sześciu miejscach i w kilku miejscach TypeScript. Dwa ograniczenia (`pair_check`, `shape`) wprost kolidują z zadaniem bez interwału, wyzwalacz odhaczenia przy interwale NULL nie odrzuciłby żadnego dnia, a w UI nie ma kontrolki do wyboru kilku z siedmiu dni.

## Desired End State

W obu formularzach użytkownik wybiera „W wybrane dni tygodnia" i zaznacza dni przyciskami pn–nd (min. 1). Rytm jest opisany skrótami („pn, śr, pt", komplet jako „codziennie") na stronie projektu i na liście; w wybrane dni zadanie jest na górze `/today` i można je odhaczyć, także w dniu dodania, jeśli jest wybrany. Zamknięcie milestona nie jest blokowane, a zadania z interwałem działają bez zmian.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Liczba dni | Od 1 do 7; jeden dzień = tygodniowo | Pokrywa „co tydzień" (np. sprzątanie) bez osobnej opcji; Non-Goal dotyczy osobnej opcji | Plan |
| Pierwsze wystąpienie | Tego samego dnia, jeśli dzień dodania jest wybrany | Spójne z interwałem („pierwsze wystąpienie jest tego dnia") | Plan |
| Przechowywanie dni | Tablica ISO 1–7 w osobnej kolumnie, wykluczająca się z interwałem | Czytelne dane i zapytania, jeden rytm na zadanie wymuszony ograniczeniem | Plan |
| „Zadanie powtarzalne" | Kolumna wyliczana `is_recurring` w zapytaniach i TS, jawny warunek w wyzwalaczach | Jedno źródło prawdy; kolumna wyliczana nie jest widoczna w `BEFORE ROW` | Plan |
| Kontrolka | Siedem przycisków przełączanych (`aria-pressed`) wg „Chip (filter)", bez shadcn | Zgodne z design systemem, dobre na telefonie, bez nowej zależności | Plan |
| Etykieta | Skróty od poniedziałku („pn, śr, pt"), komplet = „codziennie" | Krótkie, mieści się w wierszu, spójne ze stylem dat | Plan |
| Model wystąpień | Wyliczane w SQL, stan tylko w `task_occurrences` | Bez zmian względem S-07 (tabela i wyzwalacz odhaczenia są rytmo-niezależne) | Research |
| Zamknięcie milestona | Rutyny dni nie blokują zamknięcia | Spójne z PRD v2 i S-07 | Research |

## Scope

**In scope:** drugi rytm (dni tygodnia) przy tworzeniu w obu formularzach; kolumna dni z ograniczeniami i `is_recurring`; dostosowanie wyzwalacza odhaczenia, reguł zamykania i `today_list`; etykieta z dniami; nowy komponent wyboru dni; testy pgTAP i smoke z prawdziwym dniem tygodnia; doprecyzowanie Non-Goal w PRD v2.

**Out of scope:** „pominięte" i przenoszenie (S-09), edycja i wyłączenie rytmu (S-10), osobna opcja „co tydzień/co miesiąc", odznaki i kolory, refaktoryzacja szkieletu wysp.

## Architecture / Approach

Zadanie dostaje kolumnę `recurrence_weekdays` (ISO 1–7), wykluczającą się z interwałem; ograniczenia `pair_check` i `shape` są odtworzone pod tymi samymi nazwami dla obu rytmów. `today_list` dostaje drugi warunek dnia wystąpienia (`isodow` w tablicy) i nową kolumnę wyniku z dniami, a wyzwalacz odhaczenia ma osobną gałąź dla dni. Warstwa TS przenosi dni przez schemat tworzenia, serwis, etykietę i widoki, a nowy komponent `WeekdayPicker` trafia do obu formularzy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza danych | Migracja (dni, `is_recurring`, 4 funkcje), testy pgTAP środa + piątek, typy | Ograniczenia i wyzwalacze nie mogą zepsuć rutyn interwałowych z S-07 |
| 2. Tworzenie z dniami (API) | Walidacja, serwis, etykieta, `is_recurring` na stronie projektu, smoke API | Zmiana sygnatury `formatRecurrence` w trzech miejscach |
| 3. Kontrolka wyboru dni | Komponent `WeekdayPicker` i podpięcie w dwóch formularzach, podgląd w edycji | Nowy komponent UI (dostępność, tokeny, grupa poza `Field`) |
| 4. Lista na dziś | Typ i etykieta w wierszu rutyny, smoke z prawdziwym dniem, korekta PRD v2 | Smoke zależny od dzisiejszego dnia tygodnia |

**Prerequisites:** S-07 zakończone i zarchiwizowane; lokalny Supabase (Docker) do `db reset`, `test db` i generowania typów.
**Estimated effort:** ok. 4 sesje implementacji, po jednej na fazę.

## Open Risks & Assumptions

- CI nie uruchamia pgTAP, więc logikę zależną od dnia pilnują tylko lokalne `npx supabase test db` i smoke z dniem wyliczanym z dzisiejszej daty.
- Zdalna baza wymaga ręcznego wypchnięcia migracji; dodanie kolumny wyliczanej przepisuje tabelę `tasks` (mała skala).
- S-09 i S-10 dotykają tych samych funkcji SQL i widoków; przy równoległej pracy konflikty migracji trzeba rozwiązać kolejnością.
- Znane z S-07: odhaczenie liczone po stronie serwera dla dnia „dziś" (strona otwarta przez północ może odhaczyć kolejny dzień).
- Zadanie dodane z dniami, które nie wypadają przed datą milestona, nigdy się nie pojawi; istniejąca kontrola daty startu względem milestona tego nie obejmuje (znana luka, bez kontroli „co najmniej jedno wystąpienie").

## Success Criteria (Summary)

- Zadanie z dniami tygodnia tworzy się w obu formularzach i pojawia się na górze `/today` tylko w wybrane dni (także w dniu dodania, jeśli wybrany).
- Odhaczenie znika z listy, zamknięcie lub data milestona kończą powtarzanie, a rutyny interwałowe działają jak przed zmianą.
- Rytm jest czytelnie opisany („pn, śr, pt") na liście i na stronie projektu.
