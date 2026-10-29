---
date: 2026-10-28T11:33:00+01:00
researcher: Karolina Jurowicz
git_commit: 7d38019e87c8b051cde314a3526abbdec9095800
branch: master
repository: xDevs
topic: "Faza 3 rolloutu: spójność danych (#6) i izolacja kont (#7)"
tags: [research, codebase, today_list, milestones, rls, cascade, pgtap]
status: complete
last_updated: 2026-10-28
last_updated_by: Karolina Jurowicz
---

# Research: Faza 3 rolloutu: spójność danych (#6) i izolacja kont (#7)

**Date**: 2026-10-28T11:33:00+01:00
**Researcher**: Karolina Jurowicz
**Git Commit**: 7d38019 (working tree: zmodyfikowany tylko `context/foundation/test-plan.md`; nie dotyczy tej analizy)
**Branch**: master
**Repository**: xDevs

Zakres: odczyt kodu i testów, bez uruchamiania `test:db`/`test:app`. Badanie wykonane lokalnie przez głównego agenta (zakres to jeden podsystem: migracje + 3 serwisy + testy pgTAP), bez podagentów.

## Research Question

Dla ryzyk #6 i #7 z `context/foundation/test-plan.md` §2: gdzie naprawdę leży ścieżka awarii, co już jest przetestowane, czy wskazówki odpowiedzi („kaskada jest bezpieczna", „zalogowany = uprawniony") się trzymają, jaka jest najtańsza warstwa testu i które dowody w planie są mylące.

## Summary

**#6 (reguła „najbliższy niezamknięty milestone" po edycji/usunięciu).** Reguła żyje w całości w SQL, nie w serwisach: `distinct on (m.project_id) … order by m.project_id, m.due_date, m.seq` w funkcji `today_list` (`supabase/migrations/20261021120000_recurring_occurrence_actions.sql:207-220`, bloki `nearest` i `open_tasks`; to ostatnia definicja funkcji wśród 4 migracji, które ją tworzą). Kaskady to klucze obce `on delete cascade` (`20261009120000_create_core_domain_schema.sql:34-35`, `:51-52`; `20261019120000_recurring_tasks.sql:54-55`). Istniejące testy sprawdzają regułę **statycznie** (dane wstawione raz, lista czytana raz) i kaskady **jako `postgres`**, ale żaden test z 13 plików nie robi sekwencji „zmień/usuń milestone → przeczytaj `today_list` jako `authenticated`". To jest właściwa luka #6.

**#7 (izolacja kont).** Granicę własności wymusza wyłącznie RLS (`user_id = (select auth.uid())`, polityki na 4 tabelach: `20261009120100_enable_core_domain_rls.sql:21-79` dla projects/milestones/tasks i `20261019120000_recurring_tasks.sql:67-77` dla `task_occurrences`) plus złożone klucze obce `(id, user_id)`. Wszystkie funkcje pisane przez projekt są `security invoker`, a w `src` i `scripts` nie ma `service_role` (grep, 0 trafień), więc endpointy API nie mają ścieżki obejścia RLS: serwisy tylko dokładają filtry `eq(...)` i mapują „0 wierszy" na `not_found`. Istniejący `core_domain_rls.test.sql` (61 asercji) jest mocny dla **jednego kierunku (A atakuje B)** i trzech tabel. Luki: brak kierunku B→A, brak `task_occurrences` w tym pliku (są w `core_domain_recurring_tasks.test.sql:366-411`, ale bez stanu `moved`), brak testu bezpośredniego wywołania API przez dwa konta.

## Detailed Findings

### #6 — Skąd bierze się „najbliższy niezamknięty milestone"

- Wybór: `select distinct on (m.project_id) m.* from public.milestones m where m.completed_at is null order by m.project_id, m.due_date, m.seq` (`20261021120000_recurring_occurrence_actions.sql:207-213`). `seq` to `bigint generated always as identity` (`create_core_domain_schema.sql:30`), więc remis dat jest rozstrzygany deterministycznie.
- Zadania listy: tylko niepowtarzalne, `status <> 'done'`, z najbliższego milestona; milestone bez otwartych zadań daje wiersz `milestone` („do zamknięcia") (`…occurrence_actions.sql`, bloki `open_tasks`, `rows_all`).
- Funkcja jest `security invoker` + `stable` + `strict`; widoczność ogranicza RLS, w SQL nie ma filtra `user_id` (komentarz w nagłówku `20261016120000_today_list.sql:27-28`).
- Konsekwencja dla „po edycji": zmiana `due_date` milestona zmienia, który jest najbliższy; zmiana `completed_at` (zamknięcie/ponowne otwarcie) także. Strażniki edycji w bazie:
  - data milestona ≤ termin projektu (`check_milestone_within_project_due_date`, `create_core_domain_schema.sql:90-117`) i odwrotnie dla terminu projektu (`:119-142`);
  - przesunięcie daty milestona **wstecz** nie może wyprzedzić termin zadania, `recurrence_start_date` ani `moved_to` (`20261021130000_milestone_date_covers_moves.sql:7-45`, wyzwalacz tylko przy `new.due_date < old.due_date`, `20261015120000_task_rules.sql:85-89`);
  - zamknięcie tylko bez niezrobionych zadań niepowtarzalnych (`20261020120000_recurring_weekdays.sql:136-160`), wyzwalacz tylko na przejściu `NULL → wartość` (`20261014120000_milestone_close_rule.sql:257-261`); ponowne otwarcie nie ma żadnej walidacji (świadomie, patrz `core_domain_milestone_close.test.sql:94-100`).
- Konsekwencja dla „po usunięciu": `deleteMilestone` i `deleteProject` to zwykły `delete … .select("id")` bez własnych reguł (`src/lib/services/milestones.ts:152-161`, `projects.ts:95-107`); wszystko robi kaskada FK. Usunięcie najbliższego milestona z otwartymi zadaniami usuwa te zadania razem z milestonem i lista przeskakuje na następny niezamknięty — to zgodne z regułą, ale nie jest przetestowane jako sekwencja.
- Kaskada dziedziczy się dalej: `tasks → task_occurrences` (`recurring_tasks.sql:54-55`). Test kaskady od zadania do odhaczeń istnieje (`core_domain_recurring_tasks.test.sql:402-411`, usunięcie zadania); od **milestona/projektu** do odhaczeń — nie.

### #6 — Co już pokrywają testy (sprawdzone pliki: `supabase/tests/database/*.sql`, 13 plików)

| Co | Gdzie | Charakter |
|---|---|---|
| Kaskada milestone→zadania i projekt→milestony→zadania | `core_domain_schema.test.sql:122-148` | jako `postgres`, bez `today_list` |
| Reguły zamykania (todo/partial blokują, done/brak zadań przechodzi, ponowne otwarcie, authenticated) | `core_domain_milestone_close.test.sql:20-133` | stan, bez listy |
| Reguły zadań i daty milestona | `core_domain_task_rules.test.sql` | stan, bez listy |
| Najbliższy milestone: remis dat (P07), po terminie (P08), zamknięty pomijany (P09), same zamknięte (P10), brak (P11) | `core_domain_today_list.test.sql:201-232` | dane statyczne |
| Zamknięcie/ponowne otwarcie z rutyną a lista | `core_domain_recurring_tasks.test.sql:248-305`, `…weekdays.test.sql:290-297` | tylko zadania powtarzalne |

Negatywne ustalenie (zakres: `grep` po `delete from public.(milestones|projects)` w `supabase/tests/database/*.sql`): usunięcie milestona/projektu występuje tylko w `core_domain_schema.test.sql` (`:127`, `:136`) i `core_domain_rls.test.sql` (`:101-104`, `:206-212`, `:255-258`); żaden z tych plików nie woła `today_list`. Zmiana `milestones.due_date` w testach występuje tylko w testach strażników (`…recurring_milestone_moves`, `…recurring_tasks:232-239`, `…weekdays:274-281`), nigdy z odczytem, który milestone jest teraz „najbliższy".

### #6 — Wskazówka „kaskada jest bezpieczna": korekta

Wskazówka z planu jest po części prawdziwa (integralność referencyjna działa, `core_domain_schema` to dowodzi), ale „bezpieczna" ma tu dwa sensy:

1. *Brak sierot* — dowiedzione dla milestone→zadania i projekt→…→zadania, nie dla milestone→zadania→odhaczenia.
2. *Brak zaskoczenia dla użytkownika* — kaskada kasuje także niezrobione zadania bez żadnej reguły domenowej; dla listy to znaczy, że zadania znikają „zgodnie z regułą", a nie przez błąd. Test ma więc pinować *spójność listy po usunięciu*, nie „że nic nie ginie".

Dwie znane granice kaskady, które test nie wymusi (nie traktować jako luki do domknięcia):
- Komentarz w `20261015120000_task_rules.sql:10-16` opisuje możliwy deadlock `40P01` przy równoległym zapisie zadania i usunięciu milestona; to współbieżność, którą pgTAP (jedna sesja) nie sprawdzi, a §7 planu już wyłącza współbieżność.
- `deleteMilestone`/`deleteProject` zamieniają każdy błąd (poza `unavailable`) na `GENERIC_ERROR` (`milestones.ts:156-158`, `projects.ts:99-101`), więc ewentualny błąd kaskady w bazie nie dotrze do użytkownika w czytelnej formie; to zachowanie warstwy serwisowej, niepowiązane z regułą listy.

### #6 — Wprowadzające w błąd dowody w planie

- Hot-spot `src/lib/services` (27 commitów/30 dni) wskazuje na serwisy, ale reguła #6 nie jest w serwisach. Serwisy milestonów tylko mapują komunikaty triggerów po podciągach (`milestones.ts:33-56`) i robią filtrowane `delete`/`update`. Dowód z liczby commitów podnosi prawdopodobieństwo błędów *kontraktu komunikatów*, nie błędów *reguły najbliższego milestona*.
- Hot-spot `supabase/migrations` (17 commitów) jest trafny: `today_list` ma 4 definicje (`today_list.sql:31`, `recurring_tasks.sql:242`, `recurring_weekdays.sql:240`, `occurrence_actions.sql:182`), a każda `create function` bez `or replace` w kolejnych migracjach zastępuje poprzednią. Test musi więc wołać funkcję przez nazwę na żywej bazie, nie czytać źródła migracji (wyjątek: strażnik strukturalny z Fazy 1).

### #7 — Warstwa wymuszająca własność

- Polityki RLS: `select/insert/update/delete` per tabela dla roli `authenticated`, warunek `user_id = (select auth.uid())`; `update` ma `using` i `with check` (`enable_core_domain_rls.sql:164-221`). `task_occurrences`: tylko `select/insert/delete`, brak `update` (`recurring_tasks.sql:65-77`).
- `anon` i `public` mają odebrane wszystko (`enable_core_domain_rls.sql:156`, `recurring_tasks.sql:62`; `revoke … from public, anon` także na `today_list`).
- Złożone FK `(project_id, user_id)`, `(milestone_id, user_id)`, `(task_id, user_id)` uniemożliwiają podpięcie własnego wiersza pod rodzica innego konta (`create_core_domain_schema.sql:34-35`, `:51-52`, `recurring_tasks.sql:54-55`). Wiersz potomka z `user_id` A pod rodzicem B daje `23503`.
- Klient aplikacji używa klucza z `SUPABASE_KEY` (secret `astro:env/server`) razem z ciasteczkami sesji użytkownika (`src/lib/supabase.ts:6-20`). Zakres: `grep -i service_role` po `src scripts astro.config.mjs .env.example .github` — 0 trafień. Z kodu nie da się wprost stwierdzić, czy `SUPABASE_KEY` w produkcji to klucz anon; CI przekazuje `ANON_KEY` (`.github/workflows/ci.yml:44`), `.env.example` ma tylko `###`. Hipoteza (do potwierdzenia przy deployu): to klucz anon.
- Warstwa API: `middleware.ts:5-6,28-35` zwraca 401 dla `/api/projects*` bez zalogowania, ale **nie** sprawdza własności — autoryzacja per rekord to wyłącznie RLS. Endpointy (`[id].ts`, `milestones/…`, `tasks/…`, `occurrences/move.ts`) walidują UUID i dokładają `.eq("project_id"/"milestone_id", …)`; przy cudzym rekordzie RLS daje 0 wierszy, serwis zwraca `not_found` → 404 (`projects.ts:90-93`, `milestones.ts:124-125`, `tasks.ts:170-173`).

### #7 — Co już pokrywają testy

`core_domain_rls.test.sql` (plan 61) jako A atakujący B: widoczność (3 tabele), `update`/`delete` cudzych rekordów (0 wierszy, brak błędu) z weryfikacją jako `postgres`, `insert` z `user_id` B (`42501`), przepięcie własnego wiersza na B (`42501`), podpięcie pod rodzica B (`23503`), pozytywne kontrole A, `anon` (`42501`), brak `TRUNCATE` (`:36-269`). Dodatkowo:
- `core_domain_today_list.test.sql:138-147,323-327` — `today_list` dla b1 zwraca tylko dane b1; a1 nie widzi `project_id` b1.
- `core_domain_recurring_tasks.test.sql:366-396` — b1 nie widzi, nie wstawia (`23503`, `42501`) i nie usuwa odhaczeń a1.

Luki (zakres: 13 plików pgTAP, `grep` po `jwt.claim.sub` i `b1`):
1. Tylko kierunek A→B w pliku RLS; B jako aktor (symetria) nigdzie. Ryzyko: test z jednym kierunkiem przejdzie, gdy polityka błędnie przepuszcza jednego konkretnego użytkownika lub gdy dane A mają inny kształt niż B.
2. `task_occurrences` stan `moved` (kolumna `moved_to`, indeks unikalny po `moved_to`): brak testu, że B nie wstawi/nie usunie przeniesienia na zadaniu A. Dla stanu `done` jest.
3. Brak testu, że `today_list` jako B nie zawiera **wierszy `routine`/`skipped`** z danych A (istniejący test sprawdza tylko wiersze `task`).
4. Brak testu przez API (HTTP) na dwóch kontach. Smoke (`scripts/smoke.mjs`) pokrywa wyłącznie przepływ auth.
5. Edge: kaskada wywołana przez B. `delete` projektu A jako B ma 0 wierszy; test pokazuje to jako brak błędu, ale nie sprawdza, że dzieci A (milestony, zadania, odhaczenia) są nietknięte — a to jest właściwa gwarancja kaskady. Dziś `core_domain_rls.test.sql:107-118` sprawdza tylko wiersze B po atakach A (nazwa, tytuł), nie liczność dzieci.

### #7 — „Zalogowany to uprawniony": korekta

Wskazówka jest trafna jako *hasło do obalenia*, ale w tym kodzie zabezpieczenie jest silniejsze niż w typowej aplikacji: autoryzacja nie opiera się na middleware (zalogowany przechodzi) tylko na RLS w bazie, a endpointy nie mają ścieżki z kluczem serwisowym. Czyli:
- Nie ma sensu pisać testu „zalogowany użytkownik dostaje 200 dla cudzego id" jako testu logiki aplikacji; kontrakt to „0 wierszy z RLS → 404", który `vitest` ze stubem **nie** dowiedzie (stub nie ma RLS — dokładnie ten kłamiący mock, przed którym ostrzega plan).
- Test przez API (HTTP + dwa konta + prawdziwa baza) wymagałby uruchomionego serwera Astro i dwóch zalogowanych sesji; infrastruktura do tego jest dopiero w Fazie 4 (e2e). Cena nieproporcjonalna do sygnału, bo wszystkie endpointy dochodzą do bazy tym samym klientem z tym samym JWT; pgTAP z `set local role authenticated` + `request.jwt.claims` odtwarza to, co PostgREST robi dla żądania.

Hipoteza do zweryfikowania w teście, nie fakt (nie sprawdzano uruchomieniem): wstawienie wiersza z cudzym kluczem głównym (np. `task_occurrences (task_id, occurrence_date)` istniejącym u A) jako B z `user_id = B` może dać `23505` zamiast `23503`/`42501`, bo `BEFORE`-trigger `check_task_occurrence` zwraca `new` gdy nie widzi zadania (`recurring_tasks.sql:107-111`), a unikalność sprawdza się przed kluczem obcym. Gdyby tak było, to wyciek istnienia wiersza (oracle), do tego wymagałby znajomości UUID zadania A; waga niska, ale test `throws_ok` z konkretnym kodem to rozstrzygnie jednym zdaniem.

## Code References

- `supabase/migrations/20261021120000_recurring_occurrence_actions.sql:182-388` — aktualna definicja `today_list` (`nearest`, `open_tasks`, `rows_all`, `routine`, `skipped`), `security invoker`, `strict`
- `supabase/migrations/20261009120000_create_core_domain_schema.sql:22-56` — tabele z `on delete cascade` i złożonymi FK
- `supabase/migrations/20261009120000_create_core_domain_schema.sql:90-142` — strażniki dat milestone ↔ projekt
- `supabase/migrations/20261014120000_milestone_close_rule.sql:257-261` — wyzwalacz zamykania tylko na `NULL → wartość`
- `supabase/migrations/20261020120000_recurring_weekdays.sql:136-160` — aktualna `check_milestone_closable` (wyłącza zadania powtarzalne)
- `supabase/migrations/20261021130000_milestone_date_covers_moves.sql:7-45` — aktualna `check_milestone_date_covers_tasks`
- `supabase/migrations/20261015120000_task_rules.sql:10-16` — opis znanego deadlocku `40P01` przy usunięciu milestona
- `supabase/migrations/20261009120100_enable_core_domain_rls.sql:156-221` — `revoke`/`grant` i 12 polityk RLS
- `supabase/migrations/20261019120000_recurring_tasks.sql:47-77,82-136` — `task_occurrences`, polityki, `check_task_occurrence`
- `src/lib/services/milestones.ts:152-161`, `src/lib/services/projects.ts:95-107` — `delete` bez reguł, błąd → `GENERIC_ERROR`
- `src/lib/services/today.ts:22-24` — `rpc("today_list", …)`; sortowanie i regułę zostawia SQL
- `src/lib/supabase.ts:6-20`, `src/middleware.ts:5-6,28-35` — klient z ciasteczkami użytkownika, 401 tylko dla niezalogowanych
- `supabase/tests/database/core_domain_rls.test.sql:8,63-262` — izolacja A→B, anon, TRUNCATE
- `supabase/tests/database/core_domain_schema.test.sql:122-148` — kaskady (jako `postgres`)
- `supabase/tests/database/core_domain_today_list.test.sql:201-232,323-327` — najbliższy milestone (statyczny), RLS na liście
- `supabase/tests/database/core_domain_recurring_tasks.test.sql:366-411` — RLS odhaczeń i kaskada zadanie→odhaczenia

## Architecture Insights

- Wzorzec projektu: niezmienniki i widoczność siedzą w bazie (trigger + RLS + FK), serwisy tłumaczą komunikaty po podciągach, a kontrakt jest w komentarzach migracji. Dla #6 i #7 najtańszy test z prawdziwym sygnałem to pgTAP na prawdziwej bazie (rola `authenticated` + JWT), jak w istniejących plikach.
- Kierunek testu #6 jest sekwencyjny (stan przed → mutacja jako `authenticated` → `today_list` dla dnia stałego), a wyrocznia pisana ręcznie z PRD FR-003/FR-005 i Business Logic (nie z SQL funkcji); jedna oracle-reguła: „lista pokazuje najbliższy wg (`due_date`, `seq`) niezamknięty milestone projektu".
- Test #7 powinien być parametryczny po aktorze: ten sam zestaw prób wykonany jako A→B i B→A (np. jeden zestaw danych symetryczny, pętla `for` w SQL lub dwa bloki), z weryfikacją **jako `postgres` po każdym ataku**, nie tylko braku błędu (RLS przy `update`/`delete` milczy).

## Historical Context (from prior changes)

- `context/archive/2026-10-26-testing-today-list-correctness/plan.md:35` — #4–#7 świadomie poza Fazą 1.
- `context/archive/2026-10-26-testing-list-actions-and-rhythms/plan.md:36` — #6 i #7 świadomie zostawione na Fazę 3.
- `context/foundation/test-plan.md` §6.2 — wzorzec pgTAP (`core_domain_<topic>.test.sql`, run: `npm run test:db`); §6.4 — wymagany break-check (wgranie wariantu funkcji do kontenera, czerwone, przywrócenie); §6.5 — nadal `TBD`, do wypełnienia przez tę fazę; §7 — „wielu użytkowników na dużą skalę" i współbieżność poza zakresem (to nie wyklucza testu dwóch kont w pgTAP; wyklucza rate-limit i obciążenie).
- `core_domain_rls.test.sql` w `plan(61)`; dopisanie asercji wymaga zmiany liczby w `plan(...)` albo osobnego pliku (rekomendacja: nowy plik, żeby nie ruszać stabilnego testu).

## Related Research

- `context/archive/2026-10-26-testing-today-list-correctness/research.md` i `context/archive/2026-10-26-testing-list-actions-and-rhythms/research.md` — poprzednie fazy (lista, akcje, rytmy); nie badały kaskad ani izolacji.

## Open Questions

1. Czy produkcyjny `SUPABASE_KEY` to klucz anon (a nie service role)? Z repo nie do rozstrzygnięcia (wartość w sekretach Cloudflare/`.dev.vars`). Rekomendacja: poza zakresem testów, wymaga jednorazowego sprawdzenia u właściciela projektu; jeśli to service role, #7 jest nieosłonięte niezależnie od RLS.
2. Hipoteza `23505` jako oracle istnienia wiersza (patrz #7): do potwierdzenia w teście, nie zakładać z góry.
3. Czy w planie wypełnić §6.5 cookbooka jednym wzorcem (pgTAP sekwencja mutacja→lista + dwu-aktorowa izolacja)? To decyzja dla `/10x-plan`, research tylko wskazuje, że §6.5 nadal `TBD`.
4. Rekomendowana kolejność dla planu (do decyzji w `/10x-plan`, nie ustalenie): (a) nowy plik pgTAP dla #6: mutacje milestona jako `authenticated` i odczyt `today_list` dla stałej daty — edycja daty najbliższego milestona (obie strony), zamknięcie najbliższego → następny, ponowne otwarcie → wraca, usunięcie najbliższego z otwartymi zadaniami → następny i brak zadań usuniętego, usunięcie projektu → brak wierszy projektu i nietknięty drugi projekt, kaskada milestone→zadania→odhaczenia; (b) nowy plik pgTAP dla #7: ten sam zestaw prób jako A→B i B→A na 4 tabelach z `task_occurrences` w stanie `moved`, `today_list` bez wierszy `routine`/`skipped` cudzego konta, weryfikacja liczności dzieci jako `postgres` po usunięciu projektu przez obcego; (c) bez `vitest` i bez e2e dla #7 (stub nie ma RLS; HTTP dwóch kont to infrastruktura Fazy 4).
