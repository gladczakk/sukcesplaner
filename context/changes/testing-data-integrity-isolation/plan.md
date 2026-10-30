# Spójność danych i izolacja kont — plan wdrożenia (Faza 3 rolloutu)

## Overview

Dowodzimy ryzyk #6 i #7 z `context/foundation/test-plan.md` §2 testami pgTAP na prawdziwej bazie. #6: po edycji lub usunięciu milestona/projektu `today_list` pokazuje właściwy, najbliższy niezamknięty milestone i zgodne zadania, a kaskady nie zostawiają sierot. #7: konto B nie czyta ani nie zmienia danych konta A (i odwrotnie), łącznie ze stanem `moved` w `task_occurrences`. Zmiana nie dotyka kodu aplikacji ani schematu: tylko dwa nowe pliki testowe i uzupełnienie cookbooka (§6.5).

## Current State Analysis

- Reguła „najbliższy niezamknięty milestone" jest w całości w SQL: `distinct on (m.project_id) … order by m.project_id, m.due_date, m.seq` w `today_list` (`supabase/migrations/20261021120000_recurring_occurrence_actions.sql:207-213`; to czwarta i ostatnia definicja funkcji). Kaskady to `on delete cascade` na złożonych FK (`20261009120000_create_core_domain_schema.sql:34-35`, `:51-52`; `20261019120000_recurring_tasks.sql:54-55`).
- Istniejące testy sprawdzają regułę najbliższego milestona na danych statycznych (`core_domain_today_list.test.sql:201-232`, P07-P11), a kaskady jako `postgres` bez odczytu listy (`core_domain_schema.test.sql:122-148`). Żaden z 13 plików w `supabase/tests/database/` nie zmienia/usuwa milestona i nie czyta potem `today_list` (research, „Co już pokrywają testy").
- Izolację wymusza RLS (`user_id = (select auth.uid())`) i złożone FK; funkcje są `security invoker`; w `src` i `scripts` nie ma `service_role` (research, #7). `core_domain_rls.test.sql` (61 asercji) testuje tylko kierunek A→B na 3 tabelach; `task_occurrences` w stanie `done` ma test RLS w `core_domain_recurring_tasks.test.sql:366-396`, stan `moved` nie.
- Zadań nie da się przenosić między milestonami przez API: schemat wejścia zadania nie zawiera `milestone_id` (sprawdzone przy planowaniu: `src/lib/validation/task.ts` bez trafień). Ścieżka zmiany `milestone_id` zadania nie jest więc planowana do testu.

## Desired End State

Dwa nowe pliki w `supabase/tests/database/` przechodzą w `npm run test:db`, każda asercja przeszła break-check (czerwona po zepsuciu reguły, zielona po przywróceniu), a `test-plan.md` §6.5 opisuje wzorzec („jak dodać test spójności danych i własności"). Weryfikacja: `npm run test:db` zielone i wszystkie nowe asercje mają wpis break-check w notatce fazy.

### Key Discoveries:

- Reguła i kaskady są w migracjach, nie w serwisach: hot-spot `src/lib/services` z §2 jest mylący dla #6 (research, „Wprowadzające w błąd dowody").
- Polityki RLS `update`/`delete` milczą przy cudzym rekordzie (0 wierszy, brak błędu), więc test musi weryfikować stan jako `postgres` po ataku (`core_domain_rls.test.sql:107-118` robi to dla nazwy/tytułu; brak liczności dzieci).
- Wzorzec pliku: `begin; create extension if not exists pgtap with schema extensions; select plan(N); … select * from finish(); rollback;`, dane jako `postgres`, potem `set local role authenticated` + `request.jwt.claim.sub` i `request.jwt.claims` (`core_domain_rls.test.sql:63-65`). Stałe daty z nagłówkiem dni tygodnia (wzór: `core_domain_recurring_rhythm_change_edges.test.sql:1-16`).
- `task_occurrences` nie ma `update` dla `authenticated`; stan `moved` wymaga `moved_to` (`…occurrence_actions.sql:64-74`), dzień docelowy nie może być dniem rytmu ani po dacie milestona (`:122-151`).

## What We're NOT Doing

- Testów `vitest` (stub klienta nie ma RLS ani kaskad — dokładnie ten mock, przed którym ostrzega §2) i testów HTTP/e2e z dwoma kontami (infrastruktura Fazy 4).
- Zmian w schemacie, migracjach i kodzie aplikacji, także gdyby wariant `23505` się potwierdził: wynik jest przypinany i zapisywany jako ryzyko do osobnej zmiany.
- Współbieżności (deadlock `40P01` opisany w `20261015120000_task_rules.sql:10-16`): pgTAP jest jednosesyjny, §7 już to wyłącza.
- Dziedziczenia terminu milestona w kolejności listy (decyzja produktowa, §7) i kolejności samych wierszy: Faza 1 pokrywa sortowanie; tu sprawdzamy, **który milestone i które zadania** są na liście.
- Weryfikacji, czy produkcyjny `SUPABASE_KEY` to klucz anon (sekret poza repo; Open Questions w research).
- Zmiany istniejących plików testowych (`core_domain_rls.test.sql` zostaje bez zmian, żeby nie ruszać `plan(61)`).

## Implementation Approach

Najtańsza warstwa z prawdziwym sygnałem to pgTAP na prawdziwej bazie, rola `authenticated` + JWT. Wyrocznia jest pisana ręcznie z PRD (FR-003, FR-005, Business Logic, Access Control) i z decyzji „najbliższy = niezamknięty o najmniejszym (`due_date`, `seq`)", nigdy liczona SQL-em funkcji. Dla #6 test jest sekwencją: stan → mutacja jako `authenticated` → `today_list('2026-10-15')` → oczekiwane wiersze wpisane ręcznie. Dla #7 ten sam zestaw prób wykonujemy dla obu kierunków; po każdej serii ataków sprawdzamy stan jako `postgres`. Każda nowa asercja przechodzi break-check wg `test-plan.md` §6.4 (wariant funkcji/polityki wgrany do kontenera, `npm run test:db` czerwone, przywrócenie, zielone).

## Phase 1: pgTAP #6 — milestone po edycji i usunięciu

### Overview

Nowy plik dowodzi, że po mutacjach milestonów i projektów lista na dziś jest spójna z regułą najbliższego niezamkniętego milestona, a kaskady usuwają całe poddrzewo.

### Changes Required:

#### 1. Plik testu reguły milestona

**File**: `supabase/tests/database/core_domain_milestone_list_integrity.test.sql`

**Intent**: Dla każdej mutacji, która może zmienić, który milestone jest „najbliższy" albo co jest pod nim, wykonać ją jako `authenticated` i sprawdzić `today_list` dla stałej daty `2026-10-15`. Dane bazowe jako `postgres`; każdy scenariusz ma własny projekt (asercje filtrują po `project_id`, jak w `core_domain_today_list.test.sql`). Nagłówek pliku wskazuje źródło wyroczni (PRD FR-003, FR-005, Business Logic) i oznacza, które oczekiwania są regułami projektowymi, nie PRD.

**Contract**: scenariusze (każdy: jeden projekt, ręcznie wpisane oczekiwane `kind`/`milestone_id`/`task_id`):
- *Przesunięcie daty najbliższego milestona na później*: po edycji najbliższym staje się drugi milestone (zadania drugiego na liście, pierwszego nie).
- *Przesunięcie daty następnego milestona na wcześniej niż obecny najbliższy* (nie wcześniej niż jego zadania): najbliższym staje się ten przesunięty.
- *Remis dat po edycji*: dwa milestony na tej samej dacie, najbliższy wg `seq` (starszy), także gdy remis powstał edycją.
- *Zamknięcie najbliższego* (wszystkie zadania `done`): lista przeskakuje na następny niezamknięty; *ponowne otwarcie*: wraca do tego z wcześniejszą datą.
- *Usunięcie najbliższego z otwartymi zadaniami*: zadań usuniętego milestona brak na liście i w tabeli; następny milestone jest najbliższy z własnymi zadaniami.
- *Usunięcie ostatniego niezamkniętego milestona*: projekt bez wierszy listy; drugi projekt (kontrola) nietknięty.
- *Usunięcie projektu*: brak wierszy tego projektu, drugi projekt z identyczną strukturą dalej ma swoje wiersze.
- *Kaskada milestone → zadania → odhaczenia* i *projekt → … → odhaczenia* (`done` i `moved`): liczność w `task_occurrences` po usunięciu równa 0 dla usuniętego poddrzewa i bez zmian dla kontrolnego.
- *Odrzucona edycja nie zmienia listy*: przesunięcie daty milestona przed termin jego zadania (`check_violation`) kończy się błędem i lista pozostaje taka jak przed próbą (`throws_ok` z kodem `23514`, potem `results_eq`).

Asercje jako `results_eq` z jawnie wpisanymi wierszami (bez porównywania z zapytaniem liczonym tą samą logiką); `plan(N)` zgodne z liczbą asercji.

### Success Criteria:

#### Automated Verification:

- Nowy plik przechodzi: `npm run test:db` (cały katalog zielony, plik widoczny w wyniku)
- Break-check reguły wyboru: wariant `today_list` z `order by m.project_id, m.due_date desc, m.seq` powoduje czerwone asercje „przesunięcie daty"; „remis" łapie dopiero wariant `m.seq desc`; po przywróceniu zielone
- Break-check filtra zamkniętych: wariant `today_list` bez `where m.completed_at is null` powoduje czerwone asercje „zamknięcie/ponowne otwarcie"; po przywróceniu zielone
- Break-check kaskady: wariant FK `task_occurrences_task_owner_fkey` bez `on delete cascade` (lub `on delete restrict`) powoduje czerwone asercje kaskady; po przywróceniu zielone
- Lint/format nie dotyczą SQL; `npm run lint` i `npm run test:app` pozostają zielone (brak zmian w `src`)

#### Manual Verification:

- Oczekiwane wiersze w każdym scenariuszu da się uzasadnić wyłącznie z nagłówka pliku (PRD/decyzje), bez czytania funkcji `today_list`
- Nagłówek jasno rozdziela wymagania PRD od reguł projektowych

**Note (implementacja Fazy 1)**: Break-check "remis" nie jest łapany wariantem `due_date desc` (przy remisie data jest równa); asercję G03 (test 10) łapie wariant `order by m.project_id, m.due_date, m.seq desc`. Break-checki wykonano na nowym pliku: wariant A (`due_date desc`) czerwone 2,4-5,7-8,11,15-16,36,38; wariant D (`seq desc`) czerwone 10; wariant bez `where m.completed_at is null` w bloku `nearest` czerwone 13 i 22; FK `on delete restrict` czerwone 29-30,32-34. Po każdym przywróceniu `npm run test:db` zielone (14 plików, 429 testów).

**Implementation Note**: Po zakończeniu fazy i zielonych kontrolach automatycznych zatrzymaj się na ręczne potwierdzenie, zanim przejdziesz do kolejnej fazy.

---

## Phase 2: pgTAP #7 — izolacja dwóch kont

### Overview

Nowy plik dowodzi, że konta A i B są rozdzielone w obu kierunkach na wszystkich czterech tabelach i na `today_list`, a próby ataku nie zmieniają stanu danych ofiary ani jej dzieci.

### Changes Required:

#### 1. Plik testu izolacji

**File**: `supabase/tests/database/core_domain_account_isolation.test.sql`

**Intent**: Symetryczny zestaw danych (po pełnym drzewie na konto: projekt, milestone, zadanie jednorazowe, zadanie powtarzalne z odhaczeniem `done` i przeniesieniem `moved`) i ten sam zestaw prób wykonany jako A→B oraz B→A. Po każdej serii ataków `reset role` i weryfikacja stanu ofiary jako `postgres` (nazwy, liczność dzieci, brak zmienionych `user_id`). Wzorzec ról i JWT jak w `core_domain_rls.test.sql:63-65`.

**Contract**: dla aktora X i ofiary Y:
- *Odczyt*: X nie widzi żadnego wiersza Y w `projects`, `milestones`, `tasks`, `task_occurrences` (w tym `moved`); `today_list('2026-10-15')` dla X nie zawiera wierszy `task`, `milestone`, `routine`, `skipped` z `project_id` Y (dzień dobrany tak, by dane Y dawały wiersze `routine` i `skipped`, gdyby były widoczne).
- *Zmiana/usunięcie*: `update`/`delete` rekordów Y przez X nie zgłasza błędu, a stan Y po ataku (jako `postgres`) jest identyczny; w szczególności `delete` projektu Y przez X zostawia liczność milestonów, zadań i odhaczeń Y bez zmian.
- *Wstawianie*: `insert` z `user_id` Y na każdej z 4 tabel daje `42501`; wstawienie własnego dziecka pod rodzica Y daje `23503` (milestone pod projekt Y, zadanie pod milestone Y, odhaczenie `done` i `moved` pod zadanie Y).
- *Przepięcie*: `update … set user_id = Y` własnego wiersza daje `42501`.
- *Usunięcie odhaczeń*: `delete from task_occurrences` przez X nie rusza wierszy Y (liczność jako `postgres`).
- *Wariant `23505` (hipoteza z research)*: wstawienie przez X odhaczenia z kluczem (`task_id` zadania Y, `occurrence_date` istniejącej daty) i `user_id` X. Test jest `throws_ok` z kodem **zaobserwowanym** przy pierwszym uruchomieniu (spodziewane `23505` albo `23503`); kod i komentarz „obserwacja, nie wymaganie" trafiają do nagłówka. Jeśli wynik to `23505`, nagłówek i §7 odnotowują wyciek istnienia wiersza (wymaga znajomości UUID zadania) jako znane ryzyko; nie zmieniamy schematu.
- *Anon*: nie powtarzamy; pokrywają go istniejące testy (`core_domain_rls.test.sql:219-262`, `core_domain_today_list.test.sql:329-340`).

Powtarzające się próby zapisz jako pętlę `for` albo funkcję pomocniczą w pliku (jeden kod prób, dwa wywołania z zamienionymi aktorami), zamiast kopiowania asercji (antywzorzec „nadmiarowe kopie"). Sprawdź, że funkcja pomocnicza nie zostawia obiektów poza transakcją (plik kończy się `rollback`).

### Success Criteria:

#### Automated Verification:

- Nowy plik przechodzi: `npm run test:db` (cały katalog zielony)
- Break-check RLS: wariant polityki `tasks_select_own` z `using (true)` powoduje czerwone asercje odczytu w obu kierunkach; po przywróceniu zielone
- Break-check kierunku B→A: wariant polityki `milestones_update_own` z `using (user_id <> '00000000-0000-0000-0000-0000000000a1')` (A chroniony, B nie) powoduje czerwone asercje tylko dla jednego kierunku (potwierdza, że oba kierunki są niezależnie sprawdzane); po przywróceniu zielone
- Break-check `moved`: wariant polityki `task_occurrences_delete_own` z `using (true)` powoduje czerwone asercje usunięcia odhaczeń i liczności `moved`; po przywróceniu zielone
- Break-check listy: wariant `today_list` z `security definer` powoduje czerwone asercje „brak wierszy obcego konta"; po przywróceniu zielone
- Wynik wariantu `23505` zapisany w nagłówku pliku i w notatce fazy (kod błędu zaobserwowany, nie założony)
- `npm run lint` i `npm run test:app` pozostają zielone

#### Manual Verification:

- Dla każdej asercji da się wskazać ryzyko #7, które wykrywa; brak asercji bez regresji, którą łapią
- Wynik `23505` (jeśli wystąpi) jest wpisany jako znane ryzyko, a nie ukryty

**Note (implementacja Fazy 2)**: Plik używa kont `e1`/`e2`, a kod prób to funkcja `zz_iso_run(aktor, ofiara)` wołana dla A→B i B→A (66 asercji). Wariant klucza (`task_id` zadania ofiary, istniejąca data, `user_id` aktora) zwraca **23505** (`task_occurrences_pkey`) w obu kierunkach: wyciek istnienia wiersza przy znajomości UUID zadania, znane ryzyko bez zmiany schematu (do §7 w Fazie 3). Break-checki: `tasks_select_own using (true)` czerwone 5, 8, 37, 40 (oba kierunki); `milestones_update_own` chroniący tylko e1 czerwone tylko 30 (jeden kierunek); `security definer` na `today_list` czerwone 3-4, 35-36. Adaptacja 2.4: sama polityka `task_occurrences_delete_own using (true)` NIE zaczerwienia testu, bo `DELETE` wymaga widoczności wiersza z polityki `select` (ta nadal ukrywa cudze wiersze); realistyczny wariant to zepsute `select` i `delete` razem, czerwone 5, 9-10, 19, 28, 34-35, 41-42, 51, 60, 66.

**Implementation Note**: Po zakończeniu fazy i zielonych kontrolach automatycznych zatrzymaj się na ręczne potwierdzenie, zanim przejdziesz do kolejnej fazy.

---

## Phase 3: Cookbook §6.5 i synchronizacja test-planu

### Overview

Utrwalamy wzorzec w cookbooku i synchronizujemy stan rolloutu, żeby następna osoba (i `/10x-tdd`) wiedziała, jak dodać test spójności i własności.

### Changes Required:

#### 1. Cookbook i stan rolloutu

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić §6.5 (zamiast `TBD`), dopisać notatkę fazy w §6.7, zaktualizować §7 o świadome wykluczenia i znane ryzyko oraz oznaczyć fazę 3 w §3 jako `complete` po zamknięciu planu; odświeżyć `Last updated` i wpis w §8 (stos: bez zmian wersji).

**Contract**:
- §6.5: lokalizacja (`supabase/tests/database/`), nazewnictwo (`core_domain_<topic>.test.sql`), wzorce referencyjne (oba nowe pliki), polecenie `npm run test:db`; reguły: sekwencja mutacja→`today_list` jako `authenticated`, wyrocznia ręczna z PRD, weryfikacja stanu ofiary jako `postgres` po ataku (RLS milczy), symetria aktorów, break-check wg §6.4; wskazanie, że `vitest` ze stubem nie nadaje się do #6/#7.
- §6.7: 2-3 linie o tym, co faza pokazała (w tym wynik `23505`).
- §7: wpisy „Współbieżność usunięcia milestona i zapisu zadania (deadlock `40P01`)" oraz „HTTP/API na dwóch kontach (e2e w Fazie 4)" z warunkiem ponownej oceny; jeśli `23505` się potwierdziło — wpis o znanym ryzyku (wyciek istnienia wiersza przy znajomości UUID zadania) z warunkiem ponownej oceny.
- Wiersz fazy 3 w §3: status `complete` (po zamknięciu); §2 i §5 bez zmian.

### Success Criteria:

#### Automated Verification:

- Cookbook nie zawiera już `TBD` w §6.5: `grep -n "6.5" context/foundation/test-plan.md` pokazuje wypełnioną sekcję, a `grep -c "TBD — see §3 Phase 3" context/foundation/test-plan.md` zwraca 0
- Pliki wskazane w §6.5 istnieją: `ls supabase/tests/database/core_domain_milestone_list_integrity.test.sql supabase/tests/database/core_domain_account_isolation.test.sql`
- Format dokumentu nie psuje pre-commit: `npx prettier --check context/foundation/test-plan.md` (w Fazie 1 ten plik nie przechodził już przed zmianą; kryterium to brak pogorszenia, nie naprawa cudzych różnic)

#### Manual Verification:

- Osoba nieznająca zmiany potrafi z §6.5 dodać nowy test kaskady lub izolacji bez czytania research
- §7 i notatka w §6.7 zgadzają się z faktycznym wynikiem wariantu `23505`

---

## Testing Strategy

### Unit Tests:

- Brak (zmiana nie dotyka `src`); `npm run test:app` i `npm run test:unit` uruchamiane tylko jako kontrola braku regresji.

### Integration Tests:

- pgTAP na prawdziwej bazie (Faza 1 i 2). Przypadki brzegowe: remis dat po edycji, ponowne otwarcie, usunięcie ostatniego milestona, usunięcie projektu z kontrolnym projektem, usunięcie cudzego projektu (0 wierszy, dzieci nietknięte), wariant `23505`.

### Manual Testing Steps:

1. `npx supabase start`, następnie `npm run test:db` — cały katalog zielony.
2. Wykonać break-check dla każdej asercji wg §6.4 (wariant → czerwone → przywrócenie → zielone) i odnotować wynik w pliku notatek fazy (`context/changes/testing-data-integrity-isolation/`).

## Performance Considerations

Dwa dodatkowe pliki pgTAP wydłużą `npm run test:db` o ułamek sekundy każdy (małe zestawy danych, transakcja z `rollback`). Bez wpływu na CI poza tym.

## Migration Notes

Brak migracji i brak zmian schematu. Wycofanie: usunięcie dwóch plików testowych i przywrócenie §6.5–§7 w `test-plan.md`.

## References

- Related research: `context/changes/testing-data-integrity-isolation/research.md`
- Wzór pliku RLS: `supabase/tests/database/core_domain_rls.test.sql:1-65`
- Wzór pliku z listą i stałymi datami: `supabase/tests/database/core_domain_recurring_rhythm_change_edges.test.sql:1-60`
- Dane statyczne najbliższego milestona: `supabase/tests/database/core_domain_today_list.test.sql:201-232`
- Cookbook: `context/foundation/test-plan.md` §6.2, §6.4, §6.5

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: pgTAP #6 — milestone po edycji i usunięciu

#### Automated

- [x] 1.1 Nowy plik przechodzi: `npm run test:db` (cały katalog zielony, plik widoczny w wyniku) — 6ab0ff3
- [x] 1.2 Break-check reguły wyboru: wariant `today_list` z `order by m.project_id, m.due_date desc, m.seq` powoduje czerwone asercje „przesunięcie daty"; „remis" łapie dopiero wariant `m.seq desc`; po przywróceniu zielone — 6ab0ff3
- [x] 1.3 Break-check filtra zamkniętych: wariant `today_list` bez `where m.completed_at is null` powoduje czerwone asercje „zamknięcie/ponowne otwarcie"; po przywróceniu zielone — 6ab0ff3
- [x] 1.4 Break-check kaskady: wariant FK `task_occurrences_task_owner_fkey` bez `on delete cascade` powoduje czerwone asercje kaskady; po przywróceniu zielone — 6ab0ff3
- [x] 1.5 `npm run lint` i `npm run test:app` pozostają zielone (brak zmian w `src`) — 6ab0ff3

#### Manual

- [x] 1.6 Oczekiwane wiersze w każdym scenariuszu da się uzasadnić wyłącznie z nagłówka pliku (PRD/decyzje), bez czytania funkcji `today_list` — 6ab0ff3
- [x] 1.7 Nagłówek jasno rozdziela wymagania PRD od reguł projektowych — 6ab0ff3

### Phase 2: pgTAP #7 — izolacja dwóch kont

#### Automated

- [x] 2.1 Nowy plik przechodzi: `npm run test:db` (cały katalog zielony) — 13e2e37
- [x] 2.2 Break-check RLS: wariant polityki `tasks_select_own` z `using (true)` powoduje czerwone asercje odczytu w obu kierunkach; po przywróceniu zielone — 13e2e37
- [x] 2.3 Break-check kierunku B→A: wariant polityki `milestones_update_own` chroniący tylko A powoduje czerwone asercje tylko dla jednego kierunku; po przywróceniu zielone — 13e2e37
- [x] 2.4 Break-check `moved`: wariant polityki `task_occurrences_delete_own` z `using (true)` powoduje czerwone asercje usunięcia odhaczeń i liczności `moved`; po przywróceniu zielone — 13e2e37
- [x] 2.5 Break-check listy: wariant `today_list` z `security definer` powoduje czerwone asercje „brak wierszy obcego konta"; po przywróceniu zielone — 13e2e37
- [x] 2.6 Wynik wariantu `23505` zapisany w nagłówku pliku i w notatce fazy (kod błędu zaobserwowany, nie założony) — 13e2e37
- [x] 2.7 `npm run lint` i `npm run test:app` pozostają zielone — 13e2e37

#### Manual

- [x] 2.8 Dla każdej asercji da się wskazać ryzyko #7, które wykrywa; brak asercji bez regresji, którą łapią — 13e2e37
- [x] 2.9 Wynik `23505` (jeśli wystąpi) jest wpisany jako znane ryzyko, a nie ukryty — 13e2e37

### Phase 3: Cookbook §6.5 i synchronizacja test-planu

#### Automated

- [x] 3.1 Cookbook nie zawiera już `TBD` w §6.5: `grep -c "TBD — see §3 Phase 3" context/foundation/test-plan.md` zwraca 0 — d074bac
- [x] 3.2 Pliki wskazane w §6.5 istnieją: `ls` obu nowych plików testowych — d074bac
- [x] 3.3 `npx prettier --check context/foundation/test-plan.md` nie pogarsza stanu bazowego — d074bac

#### Manual

- [x] 3.4 Osoba nieznająca zmiany potrafi z §6.5 dodać nowy test kaskady lub izolacji bez czytania research — d074bac
- [x] 3.5 §7 i notatka w §6.7 zgadzają się z faktycznym wynikiem wariantu `23505` — d074bac
