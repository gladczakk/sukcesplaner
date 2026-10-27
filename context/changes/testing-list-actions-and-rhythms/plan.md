# Testy akcji na liście i zmiany rytmu (test-plan, Faza 2) Implementation Plan

## Overview

Dowodzimy testami, że akcje na liście (zrobione, częściowo, na jutro, przywróć, zrobione i przeniesione wystąpienie) zostawiają zadanie we właściwym stanie i że lista następnego dnia się z tym zgadza (ryzyko #4), oraz że zmiana rytmu zachowuje odhaczenia i czyści przeniesienia zgodnie z regułą (ryzyko #5). Bez zmian kodu produkcyjnego. Warstwy: vitest ze stubem klienta dla serwisów (mapowanie błędów, gałęzie, warunkowe zapisy) i pgTAP na prawdziwej bazie dla stanu końcowego listy.

## Current State Analysis

- Każda z sześciu akcji w `src/lib/services/tasks.ts` wykonuje dokładnie jeden zapis (`setTaskStatus` l.249, `setTaskDeferral` l.271, `completeOccurrence` l.306, `moveOccurrenceToTomorrow` l.351, `updateTask` l.193, `deleteTask` l.400); pozostałe wywołania to odczyty. Sekwencji „połowicznego zapisu” nie ma. Wszystkie funkcje przyjmują klienta Supabase jako pierwszy argument, więc można je stubować; `createTask` i `updateTask` wołają `todayInWarsaw()` wewnętrznie (l.132, 202, 217).
- Błędy z wyzwalaczy są mapowane po podciągach komunikatów (`translateError` l.47-97; akcje wystąpień po `23514` plus `includes("Wystapienie")` albo „Przeniesienie wystapienia”, kolejność sprawdzeń ma znaczenie, wielkość liter też).
- Funkcje serwisowe nie mają żadnego testu. Akcje niepowtarzalne nie mają testu stanu końcowego ani listy następnego dnia. Reguły wystąpień i zmiany rytmu mają dobre pokrycie pgTAP (`core_domain_recurring_*`), z lukami: dwie zmiany rytmu pod rząd, zmiana rytmu w zamkniętym milestonie, start rytmu przesunięty za datę milestona, kasowanie wierszy `moved` przy usunięciu zadania, `task_can_move` po przeniesieniu.
- Po Fazie 1 istnieją: vitest (`npm run test:app`, `src/**/*.test.ts`, alias `@/`), pgTAP w CI (`npm run test:db`), wzorzec testu SQL `supabase/tests/database/core_domain_today_list_days.test.sql`.

## Desired End State

- `src/lib/services/tasks.test.ts` pokrywa pięć funkcji akcji i `deleteTask` stubem klienta; oczekiwane statusy wyników wpisane ręcznie z reguł (PRD v2, decyzje S-05/S-09/S-10), a teksty błędów DB skopiowane z migracji.
- Nowy plik pgTAP dla akcji niepowtarzalnych i listy następnego dnia oraz nowy plik pgTAP dla luk zmiany rytmu; `npm run test:db` zielone.
- `test-plan.md` ma §6.4 (wzorzec) i wpisy w §7/§8; wiersz Fazy 2 w §3 aktualizuje orkiestrator.

Weryfikacja: `npm run test:app`, `npm run test:db`, `npm run lint`, `npx astro check`.

### Key Discoveries:

- Brak sekwencji zapisów: ryzyko #4 leży w kontrakcie tekstowym trigger↔serwis, stanie listy następnego dnia i trzech regułach bez oparcia w PRD (`research.md` §2, Open Questions 1-2).
- Zmiana rytmu czyści wiersze `moved` ze źródłem lub celem `>=` nowej daty startu, `done` zostają (`20261022120000_recurring_rhythm_change.sql:43-51`, blokada w `20261022130000_..._lock.sql:22-25`).
- Wyłączenie powtarzania to usunięcie zadania z kaskadą (`tasks.ts:187-189`, `deleteTask` l.387).
- Gałęzie komunikatów przeniesienia i wystąpienia są rozłączne: komunikaty ruchu zawierają małe „wystapienia”, więc nie pasują do `includes("Wystapienie")` (`20261021120000_recurring_occurrence_actions.sql:19-20,125,133,139`); kolejność ich sprawdzania nie ma znaczenia, a test pilnuje mapowania każdej gałęzi osobno.

## What We're NOT Doing

- Zmian kodu produkcyjnego (strażnik `done` w `setTaskStatus`, atomowość odczytów, zmiana komunikatów, model „pozostałej części” dla częściowo + na jutro).
- Testów współbieżności dwóch sesji (blokada `FOR UPDATE`): pgTAP jest jednosesyjny; ryzyko opisane w §7.
- Testów UI, Playwright/e2e i przeładowania strony po akcji (Faza 4 test-planu).
- Testu przestarzałej strony po północy (znane, zaakceptowane ograniczenie S-07/S-09).
- Duplikowania scenariuszy już pokrytych w `core_domain_recurring_*` (macierz w `research.md` §4).
- Ryzyk #6 i #7 (Faza 3 test-planu) i zmian w `test:unit`.

## Implementation Approach

Najtańsza warstwa z realnym sygnałem: serwisy ze stubem (vitest, bez Dockera) dla logiki, której baza nie widzi (mapowanie błędów, `.neq`, odczyt rozstrzygający); pgTAP dla stanu końcowego listy (sedno #4). Oracle pochodzi z PRD i decyzji, nie z kodu: oczekiwane statusy wyników i listy tytułów wpisujemy ręcznie; stub zwraca błędy z komunikatami skopiowanymi z migracji (`raise exception` w `20261021120000_recurring_occurrence_actions.sql`) lub z istniejących asercji pgTAP, nie z stałych w `tasks.ts` (to byłby test lustrzany).

Rozstrzygnięcia z wywiadu: częściowo + na jutro: status bez zmian (wiersz wraca jutro jako `task` ze statusem `partial`); dwie reguły S-05 (przeniesienie zrobionego daje 422; zapis statusu zeruje `deferred_until`) pinowane jako kontrakt z komentarzem „reguła projektowa S-05, nie PRD”; granica `>=` nowej daty startu pinowana; wszystkie cztery luki SQL dla #5; współbieżność poza zakresem. Każdy test przechodzi kontrolę zepsucia.

## Faza 1: Testy serwisów akcji (vitest + stub klienta)

### Overview

Pokryć funkcje serwisowe ze stubem klienta Supabase i sprawdzić wynik (`status` wyniku, komunikat, zapisane pola), nie kształt wywołań.

### Changes Required:

#### 1. Stub klienta

**File**: `src/lib/services/tasks.test.ts` (nowy; pomocnik stubu w tym samym pliku, bez nowego modułu)

**Intent**: Prosty stub łańcucha `from(table).select|update|insert|delete()...` zwracający zaprogramowane odpowiedzi dla kolejnych wywołań i zapisujący ostatni `patch`/`row`, żeby asercje dotyczyły wyniku i zapisanych pól.

**Contract**: Stub wspiera kształty łańcuchów z `research.md` §2: `.select().eq().eq().maybeSingle()`, `.update(p).eq().eq()[.neq()].select()`, `.insert(row)` (await bez `.select()`), `.delete().eq().eq().select("id")`. Odpowiedź `{ data, error }` programowana per tabela i operacja. `logError` (wywoływany w ogólnej gałęzi błędów) wyciszyć lub podsłuchać w teście, żeby nie zaśmiecał wyjścia.

#### 2. Przypadki testowe (parametryzowane tabelami)

**File**: `src/lib/services/tasks.test.ts`

**Intent**: Dla każdej funkcji tabela `[scenariusz, odpowiedzi stubu, oczekiwany wynik]` z ręcznie wpisanymi oczekiwaniami.

**Contract**: Przypadki (oczekiwania z reguł, teksty błędów DB z migracji):

- `setTaskStatus`: sukces zwraca zadanie i zapisuje `{status, deferred_until: null}` (reguła S-05: zapis statusu zeruje przeniesienie); 0 wierszy → `not_found`; błąd `23514` z komunikatem ograniczenia `tasks_recurrence_shape` → `validation` (zadanie powtarzalne nie może być `done`).
- `setTaskDeferral`: ustawienie `until` zapisuje `{deferred_until}` z warunkiem `status <> 'done'`; 0 wierszy + odczyt rozstrzygający zwraca wiersz → `validation` (zrobionego zadania nie można przenieść, reguła S-05); 0 wierszy + brak wiersza → `not_found`; przywrócenie (`until = null`) zapisuje bez warunku `done`; błąd odczytu rozstrzygającego → wynik `unavailable`.
- `completeOccurrence`: sukces → `ok`; `23505` + stan `done` → `ok` (powtórne kliknięcie, idempotencja); `23505` + stan `moved` → `validation` („przeniesione na jutro”); `23514` z komunikatem `Wystapienie (...) nie pasuje do rytmu zadania` → `validation`; błąd odczytu po `23505` → `unavailable`.
- `moveOccurrenceToTomorrow`: sukces → `ok`; `23505` + ten sam dzień docelowy → `ok`; `23505` + stan `done` → `validation` („już zrobione”); `23514` z komunikatami `Przeniesienie wystapienia (...) dotyczy dnia spoza rytmu zadania`, `... wykracza poza date milestona ...` i `... to dzien rytmu zadania` → wszystkie `validation` z komunikatem przeniesienia, a komunikat zaczynający się od `Wystapienie` → komunikat wystąpienia (gałęzie rozłączne).
- `updateTask`: rytm bez zmiany → zapis tylko `{title}`; nowy rytm zadania powtarzalnego → zapis ze `recurrence_start_date` równym dniu z zegara testowego (`vi.useFakeTimers`/ustawiony czas; oczekiwany dzień wpisany ręcznie, np. instant `2026-10-24T22:30:00Z` → `2026-10-25` w Warszawie) i `due_date: null`; „wyłączenie” rytmu przez `updateTask` → `validation` bez zapisu (wyłączenie to usunięcie zadania); zwykłe → rytm zeruje `status`/`deferred_until` i ma warunek `status <> 'done'`; 0 wierszy + istniejący wiersz → `validation` (zrobionego nie zmienia się w powtarzalne).
- `deleteTask`: sukces → `ok`; 0 wierszy → `not_found`; błąd inny niż `unavailable` → komunikat ogólny.
- Błąd `23514` z komunikatem niepasującym do żadnego podciągu → wynik `unavailable` (ogólny), nigdy `ok`.

### Success Criteria:

#### Automated Verification:

- Testy aplikacji przechodzą: `npm run test:app`
- Lint i typecheck przechodzą: `npm run lint` oraz `npx astro check`
- Plik testowy dotyka wszystkich sześciu funkcji: `grep -c "describe(" src/lib/services/tasks.test.ts`

#### Manual Verification:

- Test zepsucia 1: usunięcie warunku `.neq("status", "done")` w `setTaskDeferral` robi czerwony przypadek „zrobiony nie przechodzi na jutro”; po cofnięciu zielony.
- Test zepsucia 2: zamiana kolejności gałęzi komunikatów w `moveOccurrenceToTomorrow` (sprawdzanie „Wystapienie” przed „Przeniesienie wystapienia”) robi czerwony przypadek pułapki; po cofnięciu zielony.
- Uwaga z implementacji: gałęzie komunikatów są rozłączne (różna wielkość liter i końcówka), więc zamiana kolejności nic nie zmienia i ta kontrola nie może zrobić testu czerwonym. Wiersz 1.5 wykonano jako zepsucie dopasowania komunikatów przeniesienia (podmiana podciągu `Przeniesienie wystapienia` w `moveOccurrenceToTomorrow`), które robi czerwone trzy przypadki.

**Implementation Note**: Po zielonych kryteriach automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: pgTAP: stan końcowy akcji i lista następnego dnia

### Overview

Na prawdziwej bazie dowieść, że po akcjach niepowtarzalnych i po przeniesieniu wystąpienia lista dziś i następnego dnia zgadza się z regułami.

### Changes Required:

#### 1. Test stanu końcowego akcji

**File**: `supabase/tests/database/core_domain_today_list_actions.test.sql` (nowy; konwencja nazewnicza `core_domain_<topic>.test.sql`)

**Intent**: Akcje wykonywać jako `authenticated` tym samym `update`, który wykonuje serwis (`update public.tasks set status = ..., deferred_until = null` albo `set deferred_until = <jutro>`), a stan sprawdzać zapytaniami `today_list` dla dnia D i D+1. Oczekiwane listy wpisane ręcznie z reguł PRD i decyzji S-05.

**Contract**: Szkielet jak w `core_domain_today_list_days.test.sql`: transakcja, pgtap, użytkownik w roli `authenticated` z JWT, własny projekt na przypadek, jawne `created_at`. Przypadki:

- Zrobione: zadanie `done` nie jest wierszem `task`/`deferred` w D ani D+1; gdy było ostatnim niedokończonym, wiersz `milestone` („do zamknięcia”) pojawia się w D i D+1 (PRD Business Logic).
- Częściowo: zadanie `partial` jest `task` ze statusem `partial` w D i D+1.
- Na jutro: zadanie `todo` po przeniesieniu jest `deferred` w D i `task` w D+1, status bez zmian; ten sam przypadek dla `partial` (decyzja z wywiadu: status `partial` zostaje i jutro jest `task` ze statusem `partial`).
- Zapis statusu po przeniesieniu (reguła S-05): `update ... set status = 'partial', deferred_until = null` → `task` w D (wraca na dziś); „przywróć” (`deferred_until = null`) → `task` w D.
- Milestone z jedynym zadaniem przeniesionym nie jest `milestone` w D (przeniesione to niedokończone); po przywróceniu i zrobieniu jest.
- Wystąpienie po przeniesieniu (zadanie z rytmem dni tygodnia: środa, piątek; D = środa): przed przeniesieniem `task_can_move` jest prawdą w środę; po przeniesieniu na czwartek środa nie ma wiersza `routine`, czwartek ma wiersz `routine` z `task_moved_from` = środa i `task_can_move` fałszem (przeniesienie jest jednorazowe), a w piątek jest wiersz `skipped` dla czwartku (jeśli nie zrobione); wartości dat wpisane ręcznie (np. D = 2026-10-21, środa).

`plan(n)` ustawić na rzeczywistą liczbę asercji; powtarzające się przypadki realizować wspólnymi zapytaniami (`values`/`generate_series`), nie kopiami; dodać kontrolę pozytywną (zbiory tytułów trafiają w oczekiwaną liczbę zadań).

### Success Criteria:

#### Automated Verification:

- Wszystkie pliki pgTAP przechodzą: `npm run test:db`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Test zepsucia: w lokalnej bazie podmienić `today_list` wariantem, w którym `deferred_until > p_today` jest zastąpione `>=` (albo wiersz `task_can_move` zawsze prawdziwy); `npm run test:db` czerwony na nowym pliku; po ponownym wgraniu oryginalnej funkcji zielony.

**Implementation Note**: Po zielonych kryteriach automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: pgTAP: luki zmiany rytmu (#5)

### Overview

Domknąć macierz pokrycia #5: dwie zmiany rytmu pod rząd, zmiana w zamkniętym milestonie, zmiana ze startem za datą milestona i usunięcie zadania z kaskadą wierszy `moved`.

### Changes Required:

#### 1. Test luk zmiany rytmu

**File**: `supabase/tests/database/core_domain_recurring_rhythm_change_edges.test.sql` (nowy)

**Intent**: Zmiany rytmu wykonywać tak jak aplikacja: jeden `update` z nowym rytmem i `recurrence_start_date` = dzień zmiany; stan sprawdzać zapytaniem o wiersze `task_occurrences` (`occurrence_date`, `state`, `moved_to`) i listą `today_list` dla dni po zmianie.

**Contract**: Szkielet jak w `core_domain_recurring_rhythm_change.test.sql` (role `postgres` do danych, `authenticated` do akcji). Oczekiwania z PRD v2 (rytm zmieniony od dziś: data startu = dziś, przyszłe przeniesienia znikają, wiersze „zrobione” zostają; usunięcie zadania usuwa odhaczenia) i z decyzji S-10 (granica `>=`):

- Dwie zmiany pod rząd: po pierwszej zmianie (dzień D1) przeniesienia `>= D1` znikają, `done` sprzed D1 zostają; po wstawieniu nowego przeniesienia i drugiej zmianie (dzień D2 > D1) znikają przeniesienia `>= D2`, wcześniejsze `done` i `moved` sprzed D2 zostają; stan wpisany ręcznie po każdym kroku.
- Zmiana w zamkniętym milestonie: lista dnia po zmianie nie ma wiersza `routine` ani `skipped` dla tego zadania (zamknięcie kończy powtarzanie; PRD v2 „kończy się w chwili zamknięcia”); wiersze `done` zostają. Komentarz w teście: czy baza przyjmuje samą zmianę w zamkniętym milestonie PRD nie rozstrzyga; test pinuje obecne zachowanie (`lives_ok`) i oznacza je jako nierozstrzygnięte w Open Questions.
- Zmiana, która ustawia start za datą milestona: odrzucona komunikatem `Powtarzanie zadania nie moze zaczac sie (...) po dacie milestona (...)` (`throws_ok`), a po odrzuceniu wiersze `task_occurrences` i rytm zadania są bez zmian.
- Usunięcie zadania usuwa jego wiersze `done` i `moved` (kaskada): liczba wierszy `task_occurrences` zadania wynosi 0, wiersze innego zadania zostają.

`plan(n)` równy liczbie asercji; kontrole pozytywne dla zbiorów wierszy; brak kopii (wspólne zapytania stanu).

### Success Criteria:

#### Automated Verification:

- Wszystkie pliki pgTAP przechodzą: `npm run test:db`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Test zepsucia: w lokalnej bazie podmienić funkcję `cleanup_moved_occurrences_on_rhythm_change` wariantem z `>` zamiast `>=` (albo bez czyszczenia `moved_to`); `npm run test:db` czerwony na nowym lub istniejącym pliku; po ponownym wgraniu oryginału zielony.

**Implementation Note**: Po zielonych kryteriach automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Faza 4: Cookbook i synchronizacja test-planu

### Overview

Zapisać wzorzec dla kolejnych testów akcji i rytmów oraz luki, żeby następne fazy nie zgadywały.

### Changes Required:

#### 1. Test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: Uzupełnić §6.4 (wzorzec dla akcji i rytmów; zastąpić „TBD — see §3 Phase 2”), §6.7 (2–3 linie notatki z Fazy 2), §7 (wpisy: współbieżność dwóch sesji; oracle częściowo + na jutro i reguły S-05 jako reguły projektowe, nie PRD; test pinuje zachowanie zmiany rytmu w zamkniętym milestonie jako nierozstrzygnięte w PRD) i §8 (data weryfikacji stosu bez zmian wersji). Status wiersza Fazy 2 w §3 aktualizuje orkiestrator, nie ta faza.

**Contract**: §6.4: akcje wykonywać tym samym `update`/`insert` co serwis, stan sprawdzać `today_list` dla D i D+1; vitest ze stubem tylko dla logiki, której baza nie widzi (mapowanie błędów, `.neq`, odczyt rozstrzygający); komunikaty błędów w stubie kopiować z migracji; oczekiwane wartości ręcznie; test zepsucia każdej nowej asercji; wskazać pliki referencyjne z Faz 1–3.

### Success Criteria:

#### Automated Verification:

- W test-planie nie ma już „TBD — see §3 Phase 2”: `grep -n "TBD — see §3 Phase 2" context/foundation/test-plan.md` (brak wyników)
- Polecenia z cookbooka działają: `npm run test:app` oraz `npm run test:db`

#### Manual Verification:

- §6.4 mówi nowej osobie, jak dodać test akcji lub zmiany rytmu (warstwa, plik, polecenie, oracle).
- Wpisy w §7 poprawnie opisują reguły projektowe i nie obiecują testu, którego nie ma.

---

## Testing Strategy

### Unit Tests (vitest, stub klienta):

- Wyniki sześciu funkcji akcji dla odpowiedzi stubu: sukces, 0 wierszy, `23505`, `23514` z komunikatami z migracji, błąd odczytu rozstrzygającego.
- Zapisane pola: `{status, deferred_until:null}`, `{deferred_until}`, rytm z dniem startu z zegara testowego.

### Integration Tests (pgTAP, prawdziwa baza):

- Stan końcowy listy po akcjach niepowtarzalnych i po przeniesieniu wystąpienia (dni D i D+1).
- Luki zmiany rytmu: dwie zmiany pod rząd, zamknięty milestone, start za datą milestona, kaskada przy usunięciu.

### Manual Testing Steps:

1. Test zepsucia dla każdej warstwy (Fazy 1–3), potem cofnięcie.

## Performance Considerations

Testy vitest działają bez bazy (milisekundy); dwa nowe pliki pgTAP dodają ułamek sekundy do `supabase test db`.

## Migration Notes

Brak migracji i zmian danych. Wycofanie: usunięcie nowych plików testowych i wpisów w test-planie.

## References

- Related research: `context/changes/testing-list-actions-and-rhythms/research.md`
- Strategia: `context/foundation/test-plan.md` §2 (ryzyka #4, #5), §3 Faza 2, §6.3
- Wyrocznia: `context/foundation/prd.md` (US-01, FR-011, FR-012), `context/foundation/prd-v2.md` (FR-011, FR-016, FR-017, FR-019, FR-020, US-02)
- Wzorzec testu SQL: `supabase/tests/database/core_domain_today_list_days.test.sql`; wzorzec zmiany rytmu: `supabase/tests/database/core_domain_recurring_rhythm_change.test.sql`
- Kod pod testem: `src/lib/services/tasks.ts:115-409`; `supabase/migrations/20261021120000_recurring_occurrence_actions.sql`, `20261022120000_recurring_rhythm_change.sql`, `20261022130000_recurring_rhythm_change_lock.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Testy serwisów akcji (vitest + stub klienta)

#### Automated

- [x] 1.1 Testy aplikacji przechodzą: `npm run test:app` — 7eca8d8
- [x] 1.2 Lint i typecheck przechodzą: `npm run lint` oraz `npx astro check` — 7eca8d8
- [x] 1.3 Plik testowy dotyka wszystkich sześciu funkcji: `grep -c "describe(" src/lib/services/tasks.test.ts` — 7eca8d8

#### Manual

- [x] 1.4 Test zepsucia 1: usunięcie warunku `.neq("status", "done")` w `setTaskDeferral` robi czerwony przypadek, po cofnięciu zielony — 7eca8d8
- [x] 1.5 Test zepsucia 2: zamiana kolejności gałęzi komunikatów w `moveOccurrenceToTomorrow` robi czerwony przypadek pułapki, po cofnięciu zielony — 7eca8d8

### Phase 2: pgTAP: stan końcowy akcji i lista następnego dnia

#### Automated

- [x] 2.1 Wszystkie pliki pgTAP przechodzą: `npm run test:db` — ad0a79a
- [x] 2.2 Lint przechodzi: `npm run lint` — ad0a79a

#### Manual

- [x] 2.3 Test zepsucia: wariant `today_list` z `>=` zamiast `>` albo z zawsze prawdziwym `task_can_move` robi `npm run test:db` czerwonym na nowym pliku, po ponownym wgraniu oryginału zielony — ad0a79a

### Phase 3: pgTAP: luki zmiany rytmu (#5)

#### Automated

- [x] 3.1 Wszystkie pliki pgTAP przechodzą: `npm run test:db` — a2ace6e
- [x] 3.2 Lint przechodzi: `npm run lint` — a2ace6e

#### Manual

- [x] 3.3 Test zepsucia: wariant `cleanup_moved_occurrences_on_rhythm_change` z `>` zamiast `>=` robi `npm run test:db` czerwonym, po ponownym wgraniu oryginału zielony — a2ace6e

### Phase 4: Cookbook i synchronizacja test-planu

#### Automated

- [x] 4.1 W test-planie nie ma już „TBD — see §3 Phase 2”: `grep -n "TBD — see §3 Phase 2" context/foundation/test-plan.md` (brak wyników)
- [x] 4.2 Polecenia z cookbooka działają: `npm run test:app` oraz `npm run test:db`

#### Manual

- [x] 4.3 §6.4 mówi nowej osobie, jak dodać test akcji lub zmiany rytmu
- [x] 4.4 Wpisy w §7 poprawnie opisują reguły projektowe i nie obiecują testu, którego nie ma
