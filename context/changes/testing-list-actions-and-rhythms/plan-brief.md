# Testy akcji na liście i zmiany rytmu — Plan Brief

> Full plan: `context/changes/testing-list-actions-and-rhythms/plan.md`
> Research: `context/changes/testing-list-actions-and-rhythms/research.md`

## What & Why

Dowodzimy testami, że akcje na liście (zrobione, częściowo, na jutro, przywróć, zrobione i przeniesione wystąpienie) zostawiają zadanie we właściwym stanie i że lista następnego dnia to potwierdza (ryzyko #4), oraz że zmiana rytmu zachowuje odhaczenia i czyści przeniesienia zgodnie z regułą (ryzyko #5). To Faza 2 test-planu; kod produkcyjny się nie zmienia.

## Starting Point

Każda akcja w `src/lib/services/tasks.ts` ma jeden zapis, więc „połowicznego zapisu” z planu testów nie ma; ryzyko leży w mapowaniu błędów po podciągach komunikatów i w stanie listy następnego dnia. Funkcje serwisowe i akcje niepowtarzalne nie mają testów, a reguły wystąpień i rytmu mają dobre pokrycie pgTAP z czterema lukami. Po Fazie 1 są vitest i pgTAP w CI.

## Desired End State

`npm run test:app` pokrywa serwisy akcji stubem klienta, a `npm run test:db` dowodzi na prawdziwej bazie stanu końcowego listy dziś i jutro oraz zachowania zmiany rytmu. `test-plan.md` §6.4 mówi, jak dodać kolejny taki test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Częściowo + na jutro | Status bez zmian, jutro wraca jako `task` ze statusem `partial` | Zgodne z decyzją S-05; PRD nie ma modelu „pozostałej części” | Plan |
| Reguły S-05 (422 dla zrobionego, zapis statusu zeruje przeniesienie) | Pinowane jako kontrakt z komentarzem „reguła projektowa, nie PRD” | To najbardziej narażone akcje wg PRD v2 | Plan |
| Warstwy | pgTAP stan końcowy + vitest stub serwisu | Każde ryzyko dostaje najtańszą warstwę z realnym sygnałem | Plan |
| Granica zmiany rytmu | Pinowane `>=` nowej daty startu (cel równy dziś też kasowany) | Udokumentowana decyzja S-10, test F już ją utrwala | Plan |
| Luki #5 | Cztery scenariusze SQL w jednym nowym pliku | Domyka macierz pokrycia #5 | Plan |
| Współbieżność dwóch sesji | Poza zakresem | pgTAP jest jednosesyjny; opisane w §7 | Plan |
| Przesłanka nieatomowych zapisów | Odrzucona (każda akcja ma jeden zapis) | Potwierdzone w kodzie | Research |
| Oracle komunikatów błędów | Skopiowane z migracji, nie ze stałych serwisu | Unika testu lustrzanego | Research |

## Scope

**In scope:** vitest `src/lib/services/tasks.test.ts` (stub klienta); dwa nowe pliki pgTAP; §6.4, §7, §8 w `test-plan.md`.

**Out of scope:** zmiany kodu produkcyjnego, współbieżność, UI/e2e, przestarzała strona po północy, ryzyka #6 i #7.

## Architecture / Approach

Logikę, której baza nie widzi (mapowanie błędów, warunkowe zapisy, odczyt rozstrzygający), sprawdzamy w vitest ze stubem klienta; stan końcowy listy i zachowanie rytmu sprawdzamy w pgTAP wykonując te same `update`/`insert` co serwis. Oczekiwane wartości są wpisane ręcznie z PRD i decyzji; każdy test przechodzi kontrolę zepsucia.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Serwisy akcji | `tasks.test.ts`: sześć funkcji, gałęzie `23505`/`23514`, rozłączne gałęzie komunikatów | Stub może odbiegać od kształtu łańcucha supabase-js |
| 2. pgTAP akcje | Stan końcowy i lista D / D+1 dla akcji niepowtarzalnych i przeniesienia wystąpienia | Kilka kontraktów bez oparcia w PRD pinowanych jako decyzje projektowe |
| 3. pgTAP rytm | Dwie zmiany pod rząd, zamknięty milestone, start za datą milestona, kaskada `moved` | Zamknięty milestone: PRD milczy, test pinuje obecne zachowanie |
| 4. Cookbook | §6.4, §7, §8 test-planu | Opis luk nie może obiecywać nieistniejących testów |

**Prerequisites:** Docker lokalnie (Supabase) dla Faz 2–3, vitest i alias `@/` z Fazy 1.
**Estimated effort:** ok. 3–4 sesje w 4 fazach.

## Open Risks & Assumptions

- Stub klienta musi odwzorowywać łańcuchy supabase-js; refaktor serwisu może go zepsuć (to sygnał, nie bug testu).
- Zachowanie zmiany rytmu w zamkniętym milestonie nie jest opisane w PRD; test je pinuje i oznacza w §7.
- Pierwszy przebieg pgTAP w CI na GitHubie nadal niesprawdzony (wiersz 3.6 Fazy 1).

## Success Criteria (Summary)

- `npm run test:app`, `npm run test:db`, lint i `astro check` zielone.
- Test zepsucia w każdej warstwie robi odpowiedni test czerwonym.
- §6.4 pozwala dodać kolejny test akcji lub rytmu bez zgadywania.
