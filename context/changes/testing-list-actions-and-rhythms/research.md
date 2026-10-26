---
date: 2026-10-26
researcher: Claude (Sonnet 5.5)
git_commit: 2ae5bccb91d3d2565382f4da9be81a7e0be90d03
branch: master
repository: xDevs
topic: "Faza 2 test-planu: akcje na liście i zmiana rytmu (ryzyka #4 i #5), wyrocznia, kształt zapisów i luki pokrycia"
tags: [research, codebase, today-list, task-actions, occurrences, rhythm-change, pgtap, vitest]
status: complete
last_updated: 2026-10-26
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Akcje na liście i zmiana rytmu (Faza 2)

**Date**: 2026-10-26 · **Git Commit**: 2ae5bcc · **Branch**: master

## Research Question

Dla ryzyk #4 (akcje na liście zostawiają zadanie w złym stanie) i #5 (zmiana rytmu lub wyłączenie powtarzania gubi odhaczenia, wystąpienia albo przesuwa je na zły dzień) z `context/foundation/test-plan.md` ustalić: (a) skąd pochodzi wyrocznia i co jest nierozstrzygnięte, (b) czy sekwencja zapisów akcji jest atomowa i jak wygląda częściowy błąd, (c) co dzieje się z odhaczeniami, przeniesieniami i „pominiętymi” przy zmianie rytmu oraz przy wyłączeniu powtarzania, (d) co już pokrywają testy i która warstwa jest najtańsza. Praca tylko do odczytu; testów ani migracji nie uruchamiano w tym badaniu.

## Summary

- **Przesłanka „nieatomowej sekwencji zapisów” nie potwierdza się dla sprawdzonej ścieżki.** Każda z sześciu akcji serwisowych w `src/lib/services/tasks.ts` wykonuje dokładnie jeden zapis (`insert`, `update` albo `delete`): `setTaskStatus` (l.249), `setTaskDeferral` (l.271), `completeOccurrence` (l.306), `moveOccurrenceToTomorrow` (l.351), `updateTask` (jeden `update` w `write()`, l.193) i `deleteTask` (l.400). Pozostałe wywołania to odczyty (sprawdzenie milestona, wstępny odczyt zadania, odczyt rozstrzygający po `23505` lub po zerze wierszy). Skutki międzywierszowe robi jedna instrukcja SQL albo wyzwalacz w tej samej transakcji (czyszczenie `deferred_until` przy zmianie statusu; czyszczenie przeniesień przy zmianie rytmu). Częściowy błąd „drugiego zapisu” więc nie istnieje; zostają błędy odczytów rozstrzygających i wyścigi odczyt-potem-zapis.
- **Prawdziwe ryzyko #4 leży gdzie indziej niż zakładał plan**: w kontrakcie tekstowym między wyzwalaczami a serwisem (dopasowanie podciągów komunikatów błędów, wielkość liter ma znaczenie), w zależności stanu końcowego od `today_list` dla kolejnego dnia oraz w trzech decyzjach produktowych bez oparcia w PRD (częściowo + na jutro, przeniesienie zrobionego zadania, kasowanie przeniesienia przy zapisie statusu). Warstwa SQL pokrywa większość reguł wystąpień; **akcje niepowtarzalne (zrobione, częściowo, na jutro, przywróć) nie mają żadnego testu stanu końcowego po akcji ani listy następnego dnia**, a funkcje serwisowe nie mają żadnego testu.
- **Wyrocznia jest w większości jednoznaczna** (PRD v1 US-01 AC, FR-011/012; PRD v2 FR-011/016/017/019/020, US-02), ale z czterema napięciami, które zmieniają wartości oczekiwane (sekcja „Sprzeczności”). Roadmapa S-10 nadal podaje „los przeniesień przy zmianie rytmu” jako niewiadomą, choć jest rozstrzygnięty przez S-10 (nieaktualne).
- **Zmiana rytmu (#5)** jest egzekwowana w bazie: wyzwalacz `tasks_rhythm_change_cleanup` usuwa wiersze `moved`, których źródło lub cel jest `>=` nowej daty startu; wiersze `done` zostają. Pokrycie pgTAP jest wysokie (scenariusze A–G, `core_domain_recurring_rhythm_change.test.sql`), z lukami: dwie zmiany rytmu pod rząd, zmiana rytmu w zamkniętym milestonie, start rytmu przesunięty za datę milestona oraz kasowanie `moved` przy usunięciu zadania.

## Detailed Findings

### 1. Wyrocznia (PRD, roadmapa, decyzje archiwalne)

Cytaty dosłowne i numery linii w raportach źródłowych; tu stan skondensowany (źródła: `context/foundation/prd.md`, `prd-v2.md`, `roadmap.md`, `context/archive/*`).

| # | Wymaganie (skrót) | Źródło |
|---|---|---|
| O1 | Oznaczenie zadania jako zrobione usuwa je z listy na dziś | prd.md:51 |
| O2 | Częściowo zrobione i przeniesienie na jutro przenosi pozostałą część na listę następnego dnia | prd.md:52 |
| O6/O11 | Zadanie nie znika z listy bez wiedzy użytkownika; niezrobione wystąpienie wygasa tylko jako widocznie „pominięte” | prd.md:37; prd-v2.md:47 |
| O10 | Zadania niepowtarzalne: odhaczenie usuwa z listy, przeniesienie na jutro jak FR-012 | prd-v2.md:45 |
| O12/O18 | Wystąpienie można przenieść wyłącznie na „jutro”, jednorazowo, nie na dzień z własnym wystąpieniem | prd-v2.md:48, :74 |
| O19 | Odhaczenie wystąpienia nie kończy zadania; niezrobione jest liczone jako pominięte, widoczne tylko następnego dnia; „częściowo” nie dotyczy rutyn | prd-v2.md:76 |
| O20 | Zmiana rytmu działa od dziś: data startu = dziś, przyszłe przeniesienia i liczone „pominięte” znikają, wiersze „zrobione” zostają; wyłączenie = usunięcie zadania z odhaczeniami po potwierdzeniu | prd-v2.md:78-79 |
| O24/O25 | Powtarzanie kończy się w dniu daty milestona lub zamknięcia; rutyny nie blokują zamknięcia | prd-v2.md:98, :87 |

Decyzje projektowe bez wprost zapisu w PRD (z archiwum): akcja „Na jutro” nie zmienia statusu, a każdy zapis statusu zeruje `deferred_until` (S-05 plan.md:47-49); przeniesienie zrobionego zadania daje 422 (S-05); przeniesione zadanie jest „niedokończone”, więc milestone z samymi przeniesionymi zadaniami nie jest „do zamknięcia” (today-list-view plan.md:27, 56); przy zmianie rytmu usuwane są przeniesienia ze źródłem lub celem `>=` nowej daty startu (S-10 plan.md:65); interwał 1 i komplet siedmiu dni tygodnia to ten sam rytm, więc bez resetu daty startu (S-10 impl-review F6).

### 2. Ścieżki akcji i kształt zapisów (ryzyko #4)

Sprawdzone: `src/lib/services/tasks.ts`, trzy trasy API pod `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/`, `src/components/today/*`, `src/components/hooks/use-task-api.ts`.

| Akcja | Zapis | Odczyty pomocnicze | Częściowy błąd | Strażnik współbieżności |
|---|---|---|---|---|
| Zrobione / częściowo (`setTaskStatus`, l.237) | 1 `update {status, deferred_until:null}` | milestone | brak zapisu; błąd → 500 lub 422 | brak `.neq("status","done")`: zadanie `done` można ponownie otworzyć |
| Na jutro (`setTaskDeferral`, l.259) | 1 `update {deferred_until}` z `.neq("status","done")` | milestone; po 0 wierszy odczyt rozstrzygający | błąd odczytu rozstrzygającego → 500 | `.neq("status","done")` |
| Przywróć (`deferral` = null) | 1 `update` bez `.neq` | milestone | 0 wierszy → 404 | brak |
| Zrobione wystąpienie (`completeOccurrence`, l.292) | 1 `insert task_occurrences` | milestone, zadanie; po `23505` odczyt stanu | `23505` = sukces (idempotentne), chyba że stan `moved` → 422 | klucz główny (task_id, occurrence_date) plus wyzwalacz |
| Przeniesienie wystąpienia (`moveOccurrenceToTomorrow`, l.334) | 1 `insert` ze stanem `moved` i `moved_to` | milestone, zadanie; po `23505` odczyt | `23505`: ten sam dzień → ok, `done` → 422 | klucz główny, indeks częściowy unikalny, wyzwalacz |
| Zmiana rytmu (`updateTask`, l.161) | 1 `update` (gałąź zależna od wstępnie odczytanego wiersza) + wyzwalacz w tej samej transakcji | milestone, zadanie; po 0 wierszy odczyt | przestarzały odczyt łapią tylko ograniczenia (`STALE_TASK_ERROR`) | `FOR UPDATE` w wyzwalaczu |
| Usunięcie (`deleteTask`, l.387) | 1 `delete` | milestone | 0 wierszy → 404 | tylko id + milestone_id |

- Wszystkie funkcje serwisowe przyjmują klienta Supabase jako pierwszy argument (l.115, 161, 237, 259, 292, 334, 387), więc można je testować ze stubem łańcucha `.from().update()...`; `today`/`tomorrow` są wstrzykiwane tylko w obu akcjach wystąpień i w `setTaskDeferral` (`until`), natomiast `createTask` i `updateTask` wołają `todayInWarsaw()` wewnętrznie (l.132, 202, 217), więc wymagają zegara testowego.
- **Kontrakt tekstowy**: `translateError` (l.47-97) mapuje błędy po podciągu komunikatu (np. „Termin zadania”, „Zamkniety milestone”, „Powtarzanie zadania”, „tasks_recurrence_shape”), a akcje wystąpień po `23514` plus `includes("Wystapienie")`/„Przeniesienie wystapienia” (wielkość liter ma znaczenie; komunikaty przeniesienia nie zawierają „Wystapienie”, więc obie gałęzie się nie nakładają i kolejność ich sprawdzania nie ma znaczenia; migracja `20261021120000_recurring_occurrence_actions.sql:19-20` robi to celowo; sprostowanie z implementacji Fazy 1, wcześniejsza wersja tego zdania twierdziła inaczej). Zmiana komunikatu w migracji psuje mapowanie po cichu: niedopasowany `23514` wpada w ogólne 500 z logiem. Dla `20261021130000_milestone_date_covers_moves.sql` komunikaty nie były porównywane z mapowaniem w serwisie milestonów; nie sprawdzono.
- UI: po sukcesie `window.location.reload()` (bez optymistycznej aktualizacji), po błędzie komunikat wprost; zamrożony prop `status` po błędzie sieci może zadziałać odwrotnie (zaakceptowane w S-05 impl-review F3).
- „Dziś” dla akcji liczy serwer w chwili żądania (`todayInWarsaw()` w trasach: `occurrences.ts:28`, `move.ts:28-36`, `[taskId].ts:80`; klient nie wysyła daty). Strona otwarta przez północ może więc działać na innym dniu niż wyświetlony (znane, zaakceptowane: S-07 impl-review F2, S-09 plan.md:37).
- Odpowiedź akcji wystąpień zwraca wiersz zadania odczytany przed `insert`, więc nie odzwierciedla stanu po akcji; UI ją ignoruje (przeładowuje stronę).

### 3. Reguły w bazie (wystąpienia i zmiana rytmu, ryzyko #5)

Sprawdzone: wszystkie migracje od `20261019120000` do `20261022130000` (komentarze nagłówkowe niosą decyzje).

- `task_occurrences`: klucz główny (task_id, occurrence_date), stany `done`/`moved`, `moved_to`; kaskada przy usunięciu zadania; brak `update` (tylko select/insert/delete). „Pominięte” nie jest zapisywane, liczy je `today_list` dla `p_today - 1`.
- Wyzwalacz `check_task_occurrence` (before insert) egzekwuje: zadanie powtarzalne, milestone otwarty, dzień w zakresie start..data milestona, `moved`: źródło jest dniem rytmu, cel nie jest dniem rytmu i nie leży po dacie milestona; `done`: dzień rytmu albo cel przeniesienia (`20261021120000_recurring_occurrence_actions.sql:106-157`).
- Zmiana rytmu: wyzwalacz after update `tasks_rhythm_change_cleanup` uruchamia się tylko, gdy zmienił się interwał lub dni tygodnia (`20261022120000_recurring_rhythm_change.sql:43-51`); z blokadą `FOR UPDATE` na wierszu zadania (`20261022130000_..._lock.sql:22-25`) usuwa wiersze `moved` ze źródłem lub celem `>= recurrence_start_date`; wiersze `done` zostają. Datę startu ustawia aplikacja (`tasks.ts:202`), nie baza; zerowanie rytmu poza aplikacją nie sprząta sierot, ale `today_list` ich nie czyta.
- Wyłączenie powtarzania = usunięcie zadania (aplikacja odrzuca „wyłączenie” w `updateTask`, `tasks.ts:187-189`); kaskada kasuje odhaczenia.
- `skipped` wczoraj po zmianie rytmu: przy dacie startu = dziś wczoraj leży przed startem, więc brak wiersza (komentarz `rhythm_change:9-11`).

### 4. Macierz pokrycia istniejących testów

Źródło: opisy asercji w `supabase/tests/database/*.sql` (czytane statycznie, testów nie uruchamiano w tym badaniu); warstwa TS: grep funkcji serwisowych po `src`, `scripts`, `supabase/tests` nie zwrócił żadnego pliku testowego.

| Zachowanie | Pokrycie |
|---|---|
| Zrobione na dniu rytmu / na dniu docelowym przeniesienia; drugie zrobione tego dnia odrzucone | pokryte (`recurring_tasks`, `weekdays`, `occurrence_actions`) |
| Przeniesienie na dzień rytmu / po dacie milestona / ponowne przeniesienie odrzucone | pokryte (`occurrence_actions`) |
| Pominięte wczoraj (dzień rytmu i dzień docelowy), brak gdy zrobione/zamknięty/przed startem | pokryte (`occurrence_actions`) |
| Lista następnego dnia po zrobionym (wystąpienie wraca w kolejny dzień rytmu) | pokryte (`recurring_tasks`, `weekdays`) |
| Lista po przeniesieniu: wiersz `routine` z `task_moved_from` w dniu docelowym, brak `skipped` w źródle | częściowo (brak asercji o `task_can_move` po przeniesieniu) |
| Zmiana rytmu zachowuje `done`, usuwa przyszłe `moved`, brak `skipped`; granica `>=`; zmiana typu rytmu; zmiana tytułu bez sprzątania; pod rolą `authenticated` | pokryte (`rhythm_change` A–G) |
| Dwie zmiany rytmu pod rząd | nie pokryte |
| Zmiana rytmu w zamkniętym milestonie / start rytmu za datą milestona przy zmianie | nie pokryte / częściowo |
| Usunięcie zadania kasuje odhaczenia | pokryte dla `done` (`recurring_tasks`); wiersze `moved` nie sprawdzone |
| Akcje niepowtarzalne: zrobione/częściowo/na jutro/przywróć, stan końcowy i lista następnego dnia | **nie pokryte** (pgTAP `today_list_days` sprawdza tylko `deferred_until` dla ustawionej wartości, nie akcję) |
| Funkcje serwisowe (`setTaskStatus`, `setTaskDeferral`, `completeOccurrence`, `moveOccurrenceToTomorrow`, `updateTask`, `deleteTask`) i mapowanie błędów | **nie pokryte** |
| Przestarzały zapis po północy (`todayInWarsaw()` na akcji) | nie pokryte, zaakceptowane jako znane ograniczenie |

## Code References

- `src/lib/services/tasks.ts:237-256` — `setTaskStatus`: jeden `update`, zeruje `deferred_until`, brak strażnika `done`
- `src/lib/services/tasks.ts:259-289` — `setTaskDeferral` (strażnik `.neq("status","done")` tylko przy ustawianiu)
- `src/lib/services/tasks.ts:292-328`, `334-385` — akcje wystąpień (`insert` + rozstrzygający odczyt po `23505`)
- `src/lib/services/tasks.ts:161-235` — `updateTask`, zmiana rytmu w jednym `update` (`todayInWarsaw()` l.202, 217)
- `src/lib/services/tasks.ts:47-97` — `translateError` (kontrakt po podciągach komunikatów)
- `supabase/migrations/20261021120000_recurring_occurrence_actions.sql:106-157` — `check_task_occurrence`
- `supabase/migrations/20261022120000_recurring_rhythm_change.sql:20-51` i `20261022130000_recurring_rhythm_change_lock.sql:11-38` — czyszczenie przeniesień przy zmianie rytmu
- `supabase/tests/database/core_domain_recurring_rhythm_change.test.sql` — scenariusze A–G
- `src/components/today/TodayTaskActions.tsx`, `src/components/hooks/use-task-api.ts` — UI akcji (przeładowanie po sukcesie)

## Architecture Insights

- Stan końcowy po akcji wynika z danych, nie z kolejnego zapisu: „wraca jutro” to efekt `deferred_until`/wiersza `moved`, a „pominięte” jest liczone. Test „stan końcowy” to więc test `today_list` dla dnia następnego po akcji, na prawdziwej bazie.
- Dane do akcji niepowtarzalnych można wstawić jak w istniejących testach i wykonać `update` jako użytkownik (ta sama instrukcja SQL, którą wykonuje serwis), ale to nie testuje funkcji serwisowych; serwisy dodają mapowanie błędów i warunkowe zapisy (`.neq`), które testuje się stubem klienta lub bazą.
- Najtańsza warstwa dla błędów translacji: vitest ze stubem klienta zwracającym `{code:"23514", message:"..."}` (komunikaty muszą pochodzić z migracji, nie z kodu serwisu, żeby nie było testu lustrzanego).

## Historical Context (from prior changes)

- `context/archive/2026-10-16-today-list-actions/` — S-05: decyzje o statusie i przeniesieniu; F3 (zamrożony prop) zaakceptowane z komunikatem.
- `context/archive/2026-10-20-recurring-occurrence-actions/` — S-09: move/skip, F2 (data milestona a `moved_to`) naprawione migracją `20261021130000`, F3 przekazane do S-10 (`follow-ups/review-fixes.md`).
- `context/archive/2026-10-20-recurring-task-edit-disable/` — S-10: decyzje produktowe z 2026-10-21 (`change.md`), F2 (wyścig przeniesienia ze zmianą rytmu) naprawione blokadą `FOR UPDATE`; recenzja zaznacza, że prawdziwa współbieżność nie jest testowana w pgTAP (jedna sesja).
- Wszystkie wymienione archiwa przyznają: smoke nie steruje datą, a testy zależne od dnia istniały tylko w pgTAP ze stałym `p_today`; od Fazy 1 pgTAP działa w CI (`ci.yml`, niezweryfikowane na GitHubie, patrz notka w §3 test-planu).

## Related Research

- `context/archive/2026-10-26-testing-today-list-correctness/research.md` — Faza 1: źródło „dziś” (`todayInWarsaw`), wstrzykiwanie daty, kształt `today_list`.

## Open Questions

1. **Częściowo + na jutro (O2 vs S-05)**: PRD mówi „przenosi pozostałą część”, projekt zostawia status bez zmiany i wiersz wraca jutro z oznaczeniem „częściowo”. Czy wyrocznią jest „status bez zmian”? Bez subzadań „pozostała część” nie ma modelu.
2. **Przeniesienie zrobionego zadania** (422 w S-05) i **kasowanie przeniesienia przy zapisie statusu** (S-05 plan.md:47) nie mają wsparcia w PRD; przyjąć jako reguły projektowe do pinowania czy zostawić bez testu?
3. **Wyłączenie powtarzania a PRD**: obecne PRD v2 mówi o usunięciu z odhaczeniami po potwierdzeniu; starsza wersja AC mówiła o zachowaniu historii. Oracle = usunięcie (potwierdzone w S-10), ale testy powinny to opisać jako jedyne „wyłączenie”.
4. **Przeniesienie wykonane wczoraj na dziś** jest kasowane przy zmianie rytmu dziś (granica `>=` start), co może przywrócić dzisiejsze wystąpienie na listę (plan-brief S-10); PRD mówi „przyszłe przeniesienia znikają”. Czy cel = dziś liczy się jako „przyszły”? Zachowanie istnieje i ma test granicy (F); do potwierdzenia jako oczekiwane.
5. **Wyścigi (dwie sesje)**: blokada `FOR UPDATE` jest tylko opisana w recenzji, nie testowana współbieżnie; pgTAP jednosesyjny jej nie wykaże. Czy to poza zakresem?
6. **Przestarzała strona po północy**: znane ograniczenie, zaakceptowane; testy nie powinny go „naprawiać”.
7. **Mapowanie komunikatów dla `20261021130000`** (data milestona a `moved_to`): niesprawdzone, czy komunikat jest obsłużony w `milestones.ts` czy wpada w ogólne 500.
8. **Stan lokalnego pgTAP dla nowych scenariuszy**: nie uruchamiano; ocena pokrycia pochodzi z lektury opisów asercji.
