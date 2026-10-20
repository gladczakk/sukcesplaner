# Akcje na wystąpieniu zadania powtarzalnego Implementation Plan

## Overview

Zadanie powtarzalne dostaje dwie brakujące akcje z PRD v2: niezrobione wystąpienie jest następnego dnia widocznie oznaczone jako „pominięte wczoraj” (liczone samoczynnie, bez przycisku), a dzisiejsze wystąpienie można jednorazowo przenieść „na jutro”, o ile jutro to zadanie nie ma własnego wystąpienia. Zadania niepowtarzalne i istniejące akcje z S-05 działają bez zmian.

## Current State Analysis

- Wystąpienia nie są wierszami: `today_list(p_today)` wylicza je dla jednego dnia, a w `task_occurrences` zapisane są wyłącznie odhaczenia (`state` ograniczony do `'done'`, klucz `(task_id, occurrence_date)`, brak polityki update) — `supabase/migrations/20261019120000_recurring_tasks.sql:47-77`.
- Niezrobione wczorajsze wystąpienie znika bez śladu, bo `today_list` ocenia tylko `p_today` (`20261020120000_recurring_weekdays.sql:316-348`); PRD v2 wymaga, by znikało wyłącznie widocznie oznaczone jako pominięte (`context/foundation/prd-v2.md:47`).
- Przeniesienie nie ma gdzie się zapisać: „Na jutro” z S-05 to `tasks.deferred_until` (jedna wartość na zadanie), a `tasks_recurrence_shape` blokuje je dla rutyn (`20261020120000_recurring_weekdays.sql:63-67`). Wyzwalacz `check_task_occurrence` odrzuca też dzień spoza rytmu (`:74-130`).
- Warstwa aplikacji ma gotowy wzorzec dla akcji na wystąpieniu: `completeOccurrence` w `src/lib/services/tasks.ts:210-232`, trasa POST `.../[taskId]/occurrences.ts` bez ciała (serwer liczy dzień), wrapper w `use-task-api.ts`, przycisk w gałęzi `recurring` wyspy `src/components/today/TodayTaskActions.tsx:82`.
- Smoke z S-07 wymusza brak „Na jutro” w wyspie rutyny (`scripts/smoke.mjs:873`); po tej zmianie asercja zostaje dla rutyn codziennych, a dla rutyn z wolnym „jutro” przycisk się pojawia.

## Desired End State

Na `/today` pod dzisiejszymi rutynami widać wiersze „Pominięte wczoraj” (tylko z wczorajszego dnia, bez przycisków). Rutyna z wolnym jutrem ma przycisk „Na jutro”: po kliknięciu znika z dzisiejszej listy i wraca jutro na górze z etykietą „przeniesione ze środy”, gdzie można ją zrobić, a niezrobiona jest pojutrze „pominięta”. Przeniesionego wystąpienia nie można przenieść drugi raz, a zadanie codzienne nie ma przycisku „Na jutro” w ogóle. Reguła PRD (dzień docelowy bez własnego wystąpienia, nie później niż data milestona) jest wymuszona w bazie, nie tylko w UI.

### Key Discoveries:

- Samoczynne „pominięte” da się wyliczyć w SQL bez zapisu: wczoraj był dzień rytmu (lub dzień przeniesienia na wczoraj), brak wiersza dla wczoraj w `task_occurrences`, milestone otwarty, wczoraj ≥ data startu — `today_list` zwraca dla takiego zadania nowy rodzaj wiersza `skipped`.
- Wiersz `moved` w `task_occurrences` (`occurrence_date` = dzień źródłowy, `moved_to` = dzień docelowy) mieści się w istniejącym kluczu: ten sam dzień nie może być jednocześnie `done` i `moved` (23505), a drugie przeniesienie wymaga źródła będącego dniem rytmu, więc przeniesiony wiersz nie przejdzie dalej.
- W wyzwalaczach BEFORE ROW kolumna wyliczana `is_recurring` jest niewidoczna; obowiązuje jawny predykat `recurrence_interval_days IS NOT NULL OR recurrence_weekdays IS NOT NULL` (S-08, `context/archive/2026-10-20-recurring-tasks-by-weekdays/plan.md:23,50`).
- Komunikaty wyzwalacza są kontraktem z TS (dopasowanie po tekście: „Wystapienie” → `OCCURRENCE_ERROR`, `src/lib/services/tasks.ts:34,227`); nowe komunikaty przeniesienia muszą mieć inną, własną frazę.
- „Dzisiaj” i „jutro” liczy serwer w Europe/Warsaw (`todayInWarsaw()`, `tomorrowInWarsaw()` w `src/lib/today.ts`), nigdy przeglądarka ani SQL `current_date` (S-05, `context/archive/2026-10-16-today-list-actions/plan.md:57`).
- Lekcje: smoke dla strony z wyspami sprawdza treść wyspy i wymaga testu zepsucia (`context/foundation/lessons.md:5-10`); `today_list` zmienia kolumny wyniku, więc `drop function` + `create function` + `revoke`/`grant` (jak S-07 i S-08).

## What We're NOT Doing

- Przycisku „Pomiń” (świadomego pominięcia dzisiejszego wystąpienia) — pominięte jest wyłącznie samoczynne; zawężenie wobec zdania „odhaczyć, przenieść albo pominąć” w PRD zapisuję w PRD v2 w fazie 3.
- Odhaczania pominiętego wystąpienia z opóźnieniem — wiersz „pominięte” jest informacją, bez przycisków.
- Widoczności pominięć starszych niż wczorajsze (okno 7 dni, zaległości po przerwie w logowaniu).
- Wyboru daty przeniesienia — tylko „na jutro”; późniejsze dni, kontrolka daty i „następny wolny dzień” poza zakresem.
- Ponownego przenoszenia już przeniesionego wystąpienia oraz cofania przeniesienia.
- Zmiany rytmu i wyłączenia powtarzania (S-10), w tym decyzji, jak zmiana rytmu wpływa na wyliczanie „pominiętego” z wczoraj.
- Zmian w akcjach zadań niepowtarzalnych (PATCH `{status}` i `{deferred}`), „Częściowo” dla rutyn, ekstrakcji hooka `use-reload-action`.
- Obsługi strony otwartej przez północ (znane i zaakceptowane z S-07; dla „Na jutro” skutkuje przeniesieniem kolejnego dnia).

## Implementation Approach

Trzy fazy od dołu: baza (stan `moved`, wspólna definicja dnia rytmu, wyzwalacz, `today_list`), potem trasa i usługa przeniesienia z krokami smoke API, na końcu widok listy i wyspa z aktualizacją smoke i PRD. Jedna tabela `task_occurrences` zostaje jedynym miejscem zapisu stanu wystąpień; „pominięte” jest wyliczane, żeby nie wprowadzać drugiego źródła prawdy. Dostępność przycisku „Na jutro” liczy SQL (nowa kolumna), żeby UI nie duplikowało logiki rytmu.

## Critical Implementation Details

- **Stan wspólnej definicji rytmu**: funkcja pomocnicza „czy dzień jest dniem rytmu” zastępuje trzy kopie warunku (wyzwalacz odhaczenia, rutyna w `today_list`, nowe predykaty); istniejące 263 testy pgTAP z S-07 i S-08 są siatką bezpieczeństwa i nie wolno ich osłabić ani zmienić ich oczekiwań.
- **Komunikaty wyzwalacza**: komunikaty gałęzi „moved” zaczynają się od „Przeniesienie wystapienia”, a gałąź „done” zachowuje frazę „Wystapienie”; usługa TS rozróżnia je po tekście.

## Phase 1: Baza danych — przeniesienie i pominięte wystąpienia

### Overview

Dodaje stan `moved` z dniem docelowym, jedną definicję dnia rytmu, walidację przeniesienia i odhaczenia przeniesionego wystąpienia oraz nowe wiersze w `today_list`. Testy pgTAP ze stałym `p_today` pokrywają przykład Wed+Fri z PRD oraz przypadki graniczne.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261021120000_recurring_occurrence_actions.sql` (nowy)

**Intent**: Rozszerza `task_occurrences` o przeniesienie, wydziela wspólną definicję dnia rytmu, przepisuje wyzwalacz odhaczenia i `today_list`.

**Contract**:
- `task_occurrences`: `state` dopuszcza `'done'` i `'moved'` (nazwa ograniczenia `task_occurrences_state_check` zachowana); nowa kolumna `moved_to date null`; ograniczenia: `(state = 'moved') = (moved_to is not null)` i `moved_to > occurrence_date`; częściowy indeks unikalny `(task_id, moved_to) where moved_to is not null` (jedno przeniesienie na dzień docelowy). Polityki RLS i granty bez zmian.
- Funkcja pomocnicza (immutable, `security invoker`, `set search_path = ''`): dla `(interwał smallint, dni smallint[], start date, d date)` zwraca, czy `d` jest dniem rytmu (modulo od startu dla interwału, `isodow = any(dni)` dla dni tygodnia, NULL-bezpieczna). Używana w trzech miejscach poniżej.
- `check_task_occurrence` (BEFORE INSERT, zastępuje wersję z `20261020120000_recurring_weekdays.sql:74-130`): wspólne odrzucenia bez zmian (zadanie niepowtarzalne, zamknięty milestone, data poza `start .. data milestona`). Gałąź `done`: data musi być dniem rytmu albo dniem docelowym przeniesienia (istnieje wiersz `moved` z `moved_to` = data dla tego zadania). Gałąź `moved`: źródło musi być dniem rytmu (więc przeniesionego wiersza nie da się przenieść dalej), `moved_to` nie może być dniem rytmu i nie może przekraczać daty milestona. Komunikaty gałęzi `moved` zaczynają się od „Przeniesienie wystapienia”.
- `today_list(date)` (`drop` + `create` + `revoke all ... from public, anon` + `grant execute ... to authenticated`): dwie nowe kolumny na końcu wyniku — `task_moved_from date` i `task_can_move boolean` (NULL poza wierszami `routine`, a `task_moved_from` NULL poza wierszami z przeniesionego wystąpienia). Rodzaje wierszy:
  - `routine`: zadanie powtarzalne w otwartym milestonie, `p_today` w zakresie `start .. data milestona`, i (dzień rytmu **albo** dzień docelowy przeniesienia), bez wiersza `task_occurrences` dla `p_today`. `task_moved_from` = dzień źródłowy przeniesienia (lub NULL). `task_can_move` = prawda tylko dla wystąpień z rytmu (nie przeniesionych), gdy jutro nie jest dniem rytmu i nie wypada po dacie milestona.
  - `skipped` (nowy): zadanie powtarzalne w otwartym milestonie, wczoraj (`p_today - 1`) w zakresie `start .. data milestona`, było dniem rytmu albo dniem docelowym przeniesienia, i nie ma wiersza `task_occurrences` dla wczoraj (czyli nie zrobione i nie przeniesione dalej). Te same kolumny zadania co `routine`.
  - Kolejność: `routine` 0, `skipped` 1, `task` 2, `milestone` 3, `deferred` 4; w obrębie rodzaju kolejne klucze bez zmian.
  - Pozostałe rodzaje i zasady (`strict`, `stable`, `security invoker`, uprawnienia) bez zmian.
- Nagłówek migracji opisuje decyzje i wycofanie (jak `20261019120000_recurring_tasks.sql:1-18`).

#### 2. Testy pgTAP

**File**: `supabase/tests/database/core_domain_recurring_occurrence_actions.test.sql` (nowy)

**Intent**: Pokrywa regułę przeniesienia i wyliczanie „pominiętego” na stałych datach, w stylu `core_domain_recurring_weekdays.test.sql`.

**Contract**: Scenariusze (zadanie Wed+Fri, start środa 2026-10-21, milestone do 2026-10-30, dalej `p_today` stałe):
- przeniesienie środy na czwartek jest przyjęte; przeniesienie na piątek (dzień rytmu), na dzień przed źródłem, na dzień po dacie milestona i ze źródła spoza rytmu jest odrzucone; drugie przeniesienie na ten sam dzień docelowy jest odrzucone; zadanie codzienne nie przyjmuje przeniesienia na jutro; zadanie niepowtarzalne i zamknięty milestone odrzucają; wiersz `done` i `moved` na tym samym dniu źródłowym wykluczają się (23505); stan `'skipped'` nadal jest odrzucany (23514).
- `today_list('2026-10-22')`: czwartek pokazuje wiersz `routine` z `task_moved_from = 2026-10-21` i `task_can_move = false`; środa nie jest już `skipped`; odhaczenie czwartku (wiersz `done` na dniu docelowym) ukrywa wiersz; nieodhaczony jest `skipped` w piątek 2026-10-23.
- „Pominięte”: niezrobiona środa daje wiersz `skipped` w czwartek 22 i nie daje go w piątek 23; dzień przed startem, zamknięty milestone i wiersz `done` wykluczają `skipped`; kolejność `routine` < `skipped` < `task`.
- `task_can_move`: środa (jutro wolny) prawda, piątek (sobota wolna) prawda, zadanie codzienne fałsz, dzień daty milestona fałsz.

#### 3. Typy bazy

**File**: `src/db/database.types.ts`

**Intent**: Regeneracja typów po zmianie `task_occurrences` i `today_list` (nowe kolumny `moved_to`, `task_moved_from`, `task_can_move`).

**Contract**: Plik wygenerowany poleceniem z `CLAUDE.md` / S-08 (`npx supabase gen types typescript --local`, w Git Bash); nie edytować ręcznie.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się czysto na lokalnej bazie: `npx supabase db reset`
- Wszystkie testy pgTAP przechodzą, w tym dotychczasowe 263 bez zmian oczekiwań i nowy plik: `npx supabase test db`
- Typy po regeneracji zawierają nowe kolumny, a sprawdzenie typów przechodzi: `npx astro check`
- Test zepsucia: tymczasowe zepsucie warunku wiersza `skipped` w `today_list` (np. p_today + 1 zamiast p_today - 1) zaczerwienia test pgTAP „pominięte”; po wycofaniu test jest zielony

#### Manual Verification:

- Przegląd migracji: komunikaty gałęzi `moved` nie zawierają frazy „Wystapienie”, a gałąź `done` zachowała dotychczasowy komunikat

**Implementation Note**: Po fazie i zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 2. Bloki faz mają zwykłe wypunktowania; pola wyboru są tylko w `## Progress`.

---

## Phase 2: API przeniesienia wystąpienia

### Overview

Dodaje usługę i trasę „przenieś dzisiejsze wystąpienie na jutro” (serwer liczy dni, wywołanie idempotentne), tłumaczenie błędów bazy i kroki smoke API.

### Changes Required:

#### 1. Usługa

**File**: `src/lib/services/tasks.ts`

**Intent**: Funkcja obok `completeOccurrence`, która zapisuje wiersz `moved` dla dzisiejszego dnia z dniem docelowym „jutro” i tłumaczy błędy bazy na wynik usługi.

**Contract**: `moveOccurrenceToTomorrow(supabase, projectId, milestoneId, taskId, today, tomorrow)` zwraca ten sam typ wyniku co `completeOccurrence`. Kolejność jak tam: `findMilestone`, odczyt zadania (`not_found`), `INSERT task_occurrences { task_id, occurrence_date: today, state: 'moved', moved_to: tomorrow }`. Duplikat 23505: odczyt wiersza dla `today`; przeniesiony na `tomorrow` → sukces (idempotentne), wiersz `done` → błąd walidacji „To wystąpienie jest już zrobione.”. Błąd 23514 z frazą „Przeniesienie wystapienia” → błąd walidacji „Tego wystąpienia nie można przenieść na jutro.” (stała obok `OCCURRENCE_ERROR`); fraza „Wystapienie” zachowuje dotychczasowe tłumaczenie.

#### 2. Trasa

**File**: `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId]/occurrences/move.ts` (nowy)

**Intent**: POST bez ciała, tak jak `occurrences.ts`: serwer wylicza dzień, klient go nie przekazuje.

**Contract**: `export const prerender = false`; uppercase `POST`; identyfikatory walidowane jak w `occurrences.ts` (404 przy błędnym id); `todayInWarsaw()` i `tomorrowInWarsaw()` z `@/lib/today`; odpowiedzi: 201 `{ task }` przy sukcesie (także powtórka), 404 `not_found`, 422 dla błędów walidacji, 500 przy niedostępności, przez `errorResponse` i `json` z `@/lib/api`.

#### 3. Wrapper klienta

**File**: `src/components/hooks/use-task-api.ts`

**Intent**: Dodaje wywołanie trasy obok `completeOccurrence`.

**Contract**: `moveOccurrence(projectId, milestoneId, taskId)` → POST `.../occurrences/move` z pustym ciałem i tym samym kształtem wyniku co `completeOccurrence`.

#### 4. Smoke API

**File**: `scripts/smoke.mjs`

**Intent**: Pokrywa trasę na prawdziwym dniu tygodnia (smoke nie steruje datą).

**Contract**: Nowe kroki w sekcji rutyn: rutyna z dniami = dzisiejszy dzień tygodnia (helper `warsawIsoWeekday()` z S-08) przenosi się 201, powtórka 201, znika z `/today`; rutyna codzienna daje 422; nieistniejące zadanie 404; zadanie niepowtarzalne 422. Rutyny tworzone i usuwane przez ten krok, bez asercji na liczbę wierszy. Milestone w smoke musi mieć datę co najmniej dwa dni po dzisiejszej, żeby „jutro” mieściło się w zakresie (sprawdzić dotychczasową datę).

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików przechodzi (z zastrzeżeniem bazowych błędów spoza zmiany): `npm run lint`
- Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- Smoke przechodzi, w tym kroki przeniesienia (201, powtórka 201, znika z listy, codzienne 422, nieznane 404, niepowtarzalne 422): `npm run smoke`
- Test zepsucia: tymczasowy zwrot sukcesu bez zapisu w usłudze przeniesienia zaczerwienia krok „znika z listy”; po wycofaniu smoke jest zielony

### Manual Verification:

- Wywołanie przeniesienia dla rutyny z dzisiejszym dniem w lokalnej aplikacji kończy się odpowiedzią 201, a rutyna znika z `/today` po odświeżeniu

**Implementation Note**: Po fazie i zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Lista na dziś — pominięte, przeniesione, przycisk „Na jutro”

### Overview

Pokazuje wiersze „Pominięte wczoraj”, etykietę „przeniesione ze środy” i przycisk „Na jutro” w wyspie rutyny; aktualizuje smoke i PRD v2.

### Changes Required:

#### 1. Typy widoku

**File**: `src/types.ts`

**Intent**: Rozszerza model widoku o pominięte wystąpienia i nowe pola rutyny.

**Contract**: `TodayRoutine` dostaje `moved_from: string | null` i `can_move: boolean`; nowy typ `TodaySkipped` z polami tytułu, `interval_days`, `weekdays`, `project`, `milestone` jak `TodayRoutine`; `TodayView` dostaje `skipped: TodaySkipped[]`.

#### 2. Mapowanie

**File**: `src/lib/services/today.ts`

**Intent**: Mapuje nowe kolumny i rodzaj `skipped`, zachowując kolejność z SQL.

**Contract**: Rodzaj `skipped` trafia do `view.skipped`; wiersze `routine` niosą `moved_from: row.task_moved_from` i `can_move: row.task_can_move` (typy generowane są niepuste, a SQL zwraca NULL — udokumentować komentarzem jak przy `interval_days`). Nieznany rodzaj nadal loguje błąd.

#### 3. Etykieta dnia źródłowego

**File**: `src/lib/weekdays.ts`

**Intent**: Dopełniacz nazw dni do etykiety „przeniesione ze środy”.

**Contract**: Funkcja zwracająca z daty ISO (`YYYY-MM-DD`, liczona bez strefy czasowej) frazę „z poniedziałku / z wtorku / ze środy / z czwartku / z piątku / z soboty / z niedzieli”; `WEEKDAYS` bez zmian.

#### 4. Widok i wyspa

**File**: `src/pages/today.astro`, `src/components/today/TodayTaskActions.tsx`

**Intent**: Wiersze „Pominięte wczoraj” pod rutynami, etykieta przeniesienia, przycisk „Na jutro” dla rutyn z wolnym jutrem.

**Contract**:
- `today.astro`: pod blokiem rutyn blok `skipped` — wiersze z odznaką „Pominięte wczoraj”, bez wyspy akcji (tytuł, projekt, milestone, etykieta rytmu); odznaka wg wzorca istniejącego chipa (`DueChip`) i tokenów design systemu, bez literałów. Wiersze rutyn z `moved_from` pokazują „przeniesione ze środy” obok etykiety rytmu i przekazują do wyspy `canMove={routine.can_move}`. Stan „pusty” listy uwzględnia wiersze `skipped` (sprawdzić dotychczasowy warunek).
- `TodayTaskActions.tsx`: nowa prop `canMove?: boolean`; w gałęzi `recurring` obok „Zrobione” pojawia się „Na jutro” (etykieta dostępnościowa jak dla zadań: „Na jutro: {tytuł}”), gdy `canMove`, i wywołuje `moveOccurrence`; „Częściowo” nadal tylko dla niepowtarzalnych; zachowanie niepowtarzalnych bez zmian (`setTaskStatus`, `setTaskDeferral`, `window.location.reload()` po sukcesie).

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Asercje na treść wyspy zgodnie z lekcją o wyspach.

**Contract**: Wyspa rutyny z dzisiejszym dniem tygodnia zawiera `aria-label="Na jutro: <tytuł>"` i nie zawiera `Częściowo:`; wyspa rutyny codziennej nadal nie zawiera `Na jutro:` (dotychczasowa asercja, linia ok. 873); zadanie niepowtarzalne nadal ma trzy akcje (ok. 929-930). Po dodaniu kroków test zepsucia (`throw` w `TodayTaskActions`) musi zaczerwienić krok z treścią wyspy.

#### 6. PRD v2

**File**: `context/foundation/prd-v2.md`

**Intent**: Doprecyzowanie reguł z odpowiedzi użytkowniczki, żeby PRD nie sprzeciwiało się implementacji.

**Contract**: W Business Logic Changes i Scope (FR-011, FR-019): pominięte wystąpienie jest wyliczane samoczynnie i widoczne tylko następnego dnia; brak przycisku „Pomiń”; przeniesienie dotyczy wyłącznie „na jutro”, jest jednorazowe, a przeniesione wystąpienie zachowuje się jak zwykłe (zrobione albo pominięte następnego dnia).

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików przechodzi (z zastrzeżeniem bazowych błędów spoza zmiany): `npm run lint`
- Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- Smoke przechodzi, w tym asercje na treść wyspy (rutyna z jutrem wolnym ma „Na jutro”, codzienna nie ma, zadanie niepowtarzalne ma trzy akcje): `npm run smoke`
- Test zepsucia: tymczasowy `throw` w `TodayTaskActions` zaczerwienia krok smoke z treścią wyspy rutyny; po wycofaniu jest zielony
- Testy pgTAP nadal przechodzą: `npx supabase test db`

#### Manual Verification:

- Na `/today` rutyna z dzisiejszym dniem ma przycisk „Na jutro”; po kliknięciu znika z listy, a zadanie codzienne nie ma tego przycisku
- Wiersz „Pominięte wczoraj”: po cofnięciu o 1 dzień daty startu zadania codziennego w lokalnej bazie (`update public.tasks set recurrence_start_date = recurrence_start_date - 1 where id = '<id>'`, np. w Supabase Studio) wiersz pojawia się pod rutynami z odznaką, bez przycisków
- Treść PRD v2 (FR-011, FR-019, Business Logic) odpowiada decyzjom z planu

**Implementation Note**: To ostatnia faza; po zielonych bramkach i ręcznym potwierdzeniu zamknij zmianę według rytuału epilogu.

---

## Testing Strategy

### Unit Tests:

- Brak osobnych testów jednostkowych TS (repo nie ma runnera); logika dni i reguły przeniesienia są w bazie i testowane w pgTAP.
- Przypadki brzegowe w pgTAP: dzień przed startem, ostatni dzień milestona, zamknięty milestone, drugie przeniesienie, przeniesienie na dzień rytmu, wiersz `done` kontra `moved`.

### Integration Tests:

- Smoke przeniesienia i treści wyspy na prawdziwym dniu tygodnia; „pominięte” i przeniesienie na jutro sprawdza wyłącznie pgTAP ze stałym `p_today`, bo smoke nie steruje datą.

### Manual Testing Steps:

1. Dodaj zadanie z dzisiejszym dniem tygodnia, kliknij „Na jutro”, sprawdź, że znika z listy.
2. Dodaj zadanie codzienne i sprawdź brak „Na jutro”.
3. Cofnij datę startu zadania codziennego o 1 dzień w bazie i sprawdź wiersz „Pominięte wczoraj”.

## Performance Considerations

Dodatkowe warunki w `today_list` (wczoraj, przeniesienie) działają na tych samych tabelach; skala jest mała, więc dodatkowe indeksy nie są potrzebne poza częściowym unikalnym `(task_id, moved_to)`.

## Migration Notes

Migracja dodaje kolumnę i ograniczenia na pustej w praktyce tabeli `task_occurrences`; istniejące wiersze mają `state = 'done'` i `moved_to` NULL, więc nowe ograniczenia ich nie naruszają. Zdalna baza wymaga ręcznego wypchnięcia migracji. Wycofanie: osobna migracja przywracająca `today_list` i wyzwalacz ze stanu sprzed zmiany i usuwająca `moved_to`.

## References

- Related research: `context/changes/recurring-occurrence-actions/research.md`
- Similar implementation: `src/lib/services/tasks.ts:210-232` (odhaczenie wystąpienia), `src/components/today/TodayTaskActions.tsx:82`
- Model wystąpień: `context/archive/2026-10-19-recurring-tasks-by-interval/plan.md`, `context/archive/2026-10-20-recurring-tasks-by-weekdays/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza danych — przeniesienie i pominięte wystąpienia

#### Automated

- [x] 1.1 Migracja stosuje się czysto na lokalnej bazie: `npx supabase db reset` — 45bbde1
- [x] 1.2 Wszystkie testy pgTAP przechodzą, w tym dotychczasowe 263 bez zmian oczekiwań i nowy plik: `npx supabase test db` — 45bbde1
- [x] 1.3 Typy po regeneracji zawierają nowe kolumny, a sprawdzenie typów przechodzi: `npx astro check` — 45bbde1
- [x] 1.4 Test zepsucia: tymczasowe zepsucie warunku wiersza `skipped` w `today_list` zaczerwienia test pgTAP „pominięte”; po wycofaniu test jest zielony — 45bbde1

#### Manual

- [x] 1.5 Przegląd migracji: komunikaty gałęzi `moved` nie zawierają frazy „Wystapienie”, a gałąź `done` zachowała dotychczasowy komunikat — 45bbde1

### Phase 2: API przeniesienia wystąpienia

#### Automated

- [x] 2.1 Lint zmienionych plików przechodzi (z zastrzeżeniem bazowych błędów spoza zmiany): `npm run lint`
- [x] 2.2 Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- [x] 2.3 Smoke przechodzi, w tym kroki przeniesienia (201, powtórka 201, znika z listy, codzienne 422, nieznane 404, niepowtarzalne 422): `npm run smoke`
- [x] 2.4 Test zepsucia: tymczasowy zwrot sukcesu bez zapisu w usłudze przeniesienia zaczerwienia krok „znika z listy”; po wycofaniu smoke jest zielony

#### Manual

- [x] 2.5 Wywołanie przeniesienia dla rutyny z dzisiejszym dniem w lokalnej aplikacji kończy się odpowiedzią 201, a rutyna znika z `/today` po odświeżeniu

### Phase 3: Lista na dziś — pominięte, przeniesione, przycisk „Na jutro”

#### Automated

- [ ] 3.1 Lint zmienionych plików przechodzi (z zastrzeżeniem bazowych błędów spoza zmiany): `npm run lint`
- [ ] 3.2 Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- [ ] 3.3 Smoke przechodzi, w tym asercje na treść wyspy (rutyna z jutrem wolnym ma „Na jutro”, codzienna nie ma, zadanie niepowtarzalne ma trzy akcje): `npm run smoke`
- [ ] 3.4 Test zepsucia: tymczasowy `throw` w `TodayTaskActions` zaczerwienia krok smoke z treścią wyspy rutyny; po wycofaniu jest zielony
- [ ] 3.5 Testy pgTAP nadal przechodzą: `npx supabase test db`

#### Manual

- [ ] 3.6 Na `/today` rutyna z dzisiejszym dniem ma przycisk „Na jutro”; po kliknięciu znika z listy, a zadanie codzienne nie ma tego przycisku
- [ ] 3.7 Wiersz „Pominięte wczoraj”: po cofnięciu o 1 dzień daty startu zadania codziennego w lokalnej bazie wiersz pojawia się pod rutynami z odznaką, bez przycisków
- [ ] 3.8 Treść PRD v2 (FR-011, FR-019, Business Logic) odpowiada decyzjom z planu
