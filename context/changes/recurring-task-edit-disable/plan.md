# Zmiana rytmu i wyłączenie powtarzania Implementation Plan

## Overview

Formularz edycji zadania dostaje kontrolki rytmu. Zmiana rytmu istniejącego zadania powtarzalnego działa od dziś: data startu przesuwa się na dziś, przyszłe przeniesienia i liczone „pominięte” znikają, a wiersze „zrobione” zostają. Opcja „Nie powtarzaj” na zadaniu powtarzalnym po potwierdzeniu usuwa zadanie. Na zwykłym, otwartym zadaniu można włączyć rytm. Zmiana jest możliwa tylko z formularza zadania, nie z listy na dziś.

## Current State Analysis

- Pełna edycja to PUT, który parsuje ciało schematem `taskInputSchema` (tylko `title` i `due_date`); pola rytmu są odrzucane, a `updateTask` zapisuje wyłącznie te dwa pola (`src/lib/validation/task.ts:9-23`, `src/lib/services/tasks.ts:137-156`).
- Dialog edycji pokazuje rytm tylko do odczytu; select „Powtarzanie”, pole interwału i `WeekdayPicker` renderują się tylko poza edycją, a `initialValues` nie wypełnia rytmu z zadania (`src/components/projects/TaskFormDialog.tsx:59-67,242-298`).
- Baza pozwala właścicielowi zmienić kolumny rytmu bezpośrednio (grant update, `tasks_update_own`), ale żaden wyzwalacz nie reaguje na zmianę rytmu: wiersze `task_occurrences` są walidowane tylko przy INSERT i zostają jako sieroty (`supabase/migrations/20261019120000_recurring_tasks.sql:62-65`, `20261021120000_recurring_occurrence_actions.sql`).
- `tasks_recurrence_pair_check` wymaga rytmu i `recurrence_start_date` naraz albo wcale, a `tasks_recurrence_shape` wymaga dla zadania powtarzalnego `due_date` NULL, `status = 'todo'`, `deferred_until` NULL; wszystkie sprawdzają końcowy stan wiersza, więc rytm, data startu, termin, status i przeniesienie muszą zmienić się w jednym UPDATE (`20261020120000_recurring_weekdays.sql:54-67`).
- Usuwanie zadania powtarzalnego już istnieje (`DeleteTaskDialog`, DELETE) i kaskadą kasuje wiersze `task_occurrences`.
- Dwa elementy są już gotowe do ponownego użycia: `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) i `Field` z polem `hint`.

## Desired End State

W formularzu edycji zadania powtarzalnego widać select rytmu z bieżącym ustawieniem. Zmiana na inny rytm albo inny tryb zapisuje się od razu, a na liście Dziś zadanie pojawia się według nowego rytmu, bez „pominiętego wczoraj” i bez przyszłych przeniesień. Wybór „Nie powtarzaj” pokazuje potwierdzenie „Usunąć zadanie… razem z historią odhaczeń?”, a po zatwierdzeniu zadanie znika. W edycji zwykłego, niezrobionego zadania wybór rytmu zamienia je w powtarzalne (termin, przeniesienie i „Częściowo” są zerowane); dla zrobionego zadania pole rytmu jest zablokowane z wyjaśnieniem.

### Key Discoveries:

- Wszystkie reguły końcowego stanu wiersza (`tasks_recurrence_shape`, `pair_check`) wymuszają jeden UPDATE: rytm, `recurrence_start_date`, `due_date`, `status` i `deferred_until` zmieniają się razem (`20261020120000_recurring_weekdays.sql:54-67`).
- Trigger sprzątający nie może liczyć „dziś” w SQL (`current_date` jest w UTC); granicą jest nowa `recurrence_start_date`, którą aplikacja ustawia na dziś w Europe/Warsaw (S-05, `context/archive/2026-10-16-today-list-actions/plan.md:57`; ten sam wzorzec w `createTask`, `services/tasks.ts:121-131`).
- Reset daty startu na dziś sam wyczyści „pominięte wczoraj”, bo wczoraj jest wtedy przed startem rytmu (`today_list`, gałąź `skipped`: `p_today - 1 between start and data milestona`, `20261021120000_recurring_occurrence_actions.sql:314-351`); nic więcej nie trzeba w funkcji.
- Wiersz `moved` czytany jest po `moved_to` bez sprawdzenia rytmu, więc pozostawiony po zmianie rytmu tworzyłby „ducha” na liście (`20261021120000_...sql:265-312`); stąd usuwanie od daty startu wzwyż.
- Wyjątek dla rutyny w zamkniętym milestonie dotyczy tylko wiersza, który po UPDATE nadal jest powtarzalny (`check_task_rules`, `20261020120000_...sql:197-206`); zrobionych zadań i tak nie zmieniamy w powtarzalne.
- Lekcja: smoke dla strony z wyspami sprawdza treść wyspy i wymaga testu zepsucia (`context/foundation/lessons.md:5-10`); formularz edycji siedzi w zamkniętym `Dialog`, więc smoke sprawdza przycisk edycji wyspy, a treść formularza pokrywa test ręczny.

## What We're NOT Doing

- Zadania „nieaktywnego” (wyłączenie z zachowaniem historii) — wyłączenie to usunięcie zadania razem z odhaczeniami; kryterium PRD v2 o zachowaniu historii zmieniamy w fazie 3.
- Zmiany rytmu z listy na dziś — tylko z formularza zadania pod milestonem.
- Potwierdzenia przy zmianie rytmu — wystarcza opis pod polem; potwierdzenie jest tylko przy usunięciu.
- Usuwania wierszy „zrobione” przy zmianie rytmu (zostają jako historia).
- Ręcznej edycji daty startu — aplikacja ustawia ją na dziś przy każdej zmianie rytmu.
- Zmiany `today_list`, `skipped`, `is_rhythm_day` ani istniejących wyzwalaczy odhaczenia i przeniesienia.
- Czyszczenia sierot przy bezpośrednim zerowaniu rytmu poza aplikacją (trigger sprząta tylko zmianę rytmu na inny rytm).
- Zmiany rytmu w zadaniach z milestona, którego data jest wcześniejsza niż dziś (baza odrzuca start po dacie milestona; komunikat już istnieje).
- Nowego runnera testów TS ani wspólnego komponentu chipa.

## Implementation Approach

Trzy fazy od dołu. Faza 1 dodaje trigger, który po zmianie rytmu usuwa wiersze `moved` od nowej daty startu wzwyż. Faza 2 rozszerza PUT i usługę: serwer wykrywa zmianę rytmu względem zapisanego zadania, ustawia datę startu na dziś, zeruje pola niezgodne z zadaniem powtarzalnym przy włączaniu rytmu i odrzuca wyłączenie przez PUT (usunięcie idzie istniejącym DELETE). Faza 3 podłącza formularz: select rytmu w edycji, opisy pod polem, blokada zrobionych zadań i „Nie powtarzaj” z potwierdzeniem usunięcia. Stan wystąpień pozostaje w `task_occurrences`; nic w `today_list` się nie zmienia.

## Critical Implementation Details

- **Jeden UPDATE**: zmiana rytmu, ustawienie `recurrence_start_date`, zerowanie `due_date`, `deferred_until` i ustawienie `status = 'todo'` muszą być jedną instrukcją; ograniczenia `pair_check` i `shape` sprawdzają końcowy wiersz i odrzuciłyby stan pośredni.
- **Granica sprzątania**: wyzwalacz używa nowej `recurrence_start_date` jako dnia granicznego, nie `current_date`; kontrakt: aplikacja ustawia ją na dziś w Warszawie.
- **Zrobione blokuje włączenie**: zapis „włącz rytm” na zadaniu `done` nie może po cichu cofnąć go do `todo`; usługa odczytuje stan i dodaje warunek `status <> 'done'` do UPDATE.

## Phase 1: Baza danych — sprzątanie przeniesień po zmianie rytmu

### Overview

Dodaje wyzwalacz po zmianie rytmu zadania, który usuwa wiersze `moved` (źródło lub dzień docelowy od nowej daty startu wzwyż) i zostawia wiersze `done`; testy pgTAP pokrywają zmianę typu rytmu, wiersze sprzed startu, niezmieniony rytm i wygaśnięcie „pominiętego”.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261022120000_recurring_rhythm_change.sql` (nowy)

**Intent**: Po zmianie rytmu zadania usuwa przyszłe przeniesienia, żeby jedno „zrobione” nie zaspokajało dwóch wystąpień w jednym wierszu listy.

**Contract**: Funkcja wyzwalacza (`security invoker`, `set search_path = ''`) i wyzwalacz `AFTER UPDATE OF recurrence_interval_days, recurrence_weekdays, recurrence_start_date ON public.tasks FOR EACH ROW` z warunkiem `WHEN (old.recurrence_interval_days IS DISTINCT FROM new.recurrence_interval_days OR old.recurrence_weekdays IS DISTINCT FROM new.recurrence_weekdays)`. Treść: gdy `new.recurrence_start_date` nie jest NULL, usuń z `public.task_occurrences` wiersze tego zadania ze `state = 'moved'`, w których `occurrence_date >= new.recurrence_start_date` albo `moved_to >= new.recurrence_start_date`. Wiersze `done` i wiersze `moved` całkowicie przed datą startu zostają. Gdy rytm zostaje wyzerowany (data startu NULL), wyzwalacz nic nie robi. Nagłówek opisuje decyzje i wycofanie (jak `20261021120000_recurring_occurrence_actions.sql:1-27`).

#### 2. Testy pgTAP

**File**: `supabase/tests/database/core_domain_recurring_rhythm_change.test.sql` (nowy)

**Intent**: Pokrywa regułę sprzątania i wygaśnięcie „pominiętego” na stałych datach w stylu `core_domain_recurring_occurrence_actions.test.sql`.

**Contract**: Dane stałe (zadanie Śr+Pt od 2026-10-21, milestone do 2026-10-30, `p_today` stałe). Scenariusze: zmiana dni tygodnia i nowa data startu 2026-10-23 usuwa wiersz `moved` z `moved_to` ≥ 2026-10-23 i zostawia wiersz `moved` sprzed startu (środa 21 → czwartek 22); wiersz `done` na 2026-10-23 zostaje; zmiana typu rytmu interwał → dni tygodnia sprząta tak samo; aktualizacja samego tytułu lub niezmienionego rytmu nie usuwa przeniesień; `today_list('2026-10-23')` po zmianie nie zwraca wiersza `skipped` dla wczoraj (czwartek 22 był dniem docelowym przeniesienia i bez zmiany rytmu dałby „pominięte”), a przed zmianą zwracał; wyzerowanie rytmu przez bezpośredni UPDATE (rytm i data startu NULL) przechodzi bez błędu.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się czysto na lokalnej bazie: `npx supabase db reset`
- Wszystkie testy pgTAP przechodzą, w tym dotychczasowe 310 bez zmian oczekiwań i nowy plik: `npx supabase test db`
- Test zepsucia: tymczasowe usunięcie warunku `moved_to >= new.recurrence_start_date` z wyzwalacza zaczerwienia test sprzątania przeniesienia; po wycofaniu test jest zielony

#### Manual Verification:

- Przegląd migracji: wyzwalacz nie dotyka wierszy `done`, używa daty startu zamiast `current_date` i ma warunek `WHEN` na zmianę samego rytmu

**Implementation Note**: Po fazie i zielonych bramkach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 2. Bloki faz mają zwykłe wypunktowania; pola wyboru są tylko w `## Progress`.

---

## Phase 2: API edycji — rytm w PUT

### Overview

PUT zadania przyjmuje rytm. Usługa wykrywa zmianę względem zapisanego zadania, ustawia datę startu na dziś, przy włączaniu rytmu na zwykłym zadaniu zeruje termin, przeniesienie i „Częściowo”, blokuje zrobione i odrzuca wyłączenie przez PUT; kroki smoke API pokrywają te przypadki.

### Changes Required:

#### 1. Schemat

**File**: `src/lib/validation/task.ts`, `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts`

**Intent**: PUT korzysta ze schematu z rytmem zamiast `taskInputSchema`.

**Contract**: Trasa PUT parsuje ciało przez `taskCreateSchema` (dwa refines — jeden rytm naraz, brak terminu przy rytmie — zostają bez zmian); brak kluczy rytmu w ciele oznacza „bez rytmu”. Komentarz o tym, że PUT nigdy nie zmienia rytmu (`validation/task.ts:32`), jest poprawiony. `taskInputSchema` zostaje, jeśli ma innych użytkowników.

#### 2. Usługa

**File**: `src/lib/services/tasks.ts`

**Intent**: `updateTask` obsługuje zmianę rytmu, włączenie rytmu na zwykłym zadaniu i odrzuca niedozwolone przypadki.

**Contract**: `updateTask(supabase, projectId, milestoneId, taskId, input: TaskCreateInput)`: `findMilestone`, odczyt zadania (`not_found`), potem według stanu zapisanego zadania i wejścia:
- zadanie powtarzalne, wejście bez rytmu → błąd walidacji „Aby wyłączyć powtarzanie, usuń zadanie.” (usunięcie robi klient przez DELETE);
- zadanie powtarzalne, ten sam rytm (porównanie interwału i posortowanych dni) → zapis samego tytułu, data startu bez zmian;
- zadanie powtarzalne, inny rytm (także zmiana typu) → jeden UPDATE: tytuł, `due_date` NULL, oba pola rytmu (nieużywane NULL), `recurrence_start_date = todayInWarsaw()`;
- zadanie zwykłe, wejście z rytmem → jeden UPDATE: tytuł, rytm, `recurrence_start_date = todayInWarsaw()`, `due_date` NULL, `deferred_until` NULL, `status = 'todo'`, z warunkiem `status <> 'done'` (brak zaktualizowanego wiersza → rozróżnienie „nie ma zadania” od zrobionego i błąd walidacji „Zrobionego zadania nie można zmienić w powtarzalne.”);
- zadanie zwykłe bez rytmu → jak dotąd (tytuł i `due_date`).
Błędy bazy tłumaczy `translateError` z argumentem `rhythmField` odpowiadającym nowemu rytmowi (jak w `createTask`).

#### 3. Hook klienta

**File**: `src/components/hooks/use-task-api.ts`

**Intent**: `updateTask` niesie rytm.

**Contract**: `updateTask(projectId, milestoneId, taskId, input: TaskApiCreateInput)` zamiast `TaskApiInput`; typ `TaskApiInput` zostaje, jeśli jest jeszcze używany, albo jest usunięty bez osieroconych importów.

#### 4. Smoke API

**File**: `scripts/smoke.mjs`

**Intent**: Pokrywa PUT z rytmem na zadaniach tworzonych przez krok.

**Contract**: Nowe kroki (zadania tworzone i usuwane przez ten blok, bez asercji na liczbę wierszy): zmiana rytmu zadania z dniami tygodnia na „co 3 dni” → 200, odpowiedź ma `recurrence_interval_days` 3, `recurrence_weekdays` null i `recurrence_start_date` równe dzisiejszej dacie warszawskiej; zmiana typu z powrotem na dni tygodnia → 200; PUT bez rytmu na zadaniu powtarzalnym → 422 z dokładnym tekstem „Aby wyłączyć powtarzanie, usuń zadanie.”; zwykłe zadanie ze statusem „Częściowo” i terminem z rytmem → 200, `is_recurring` prawda, `status` „todo”, `due_date` null; zrobione zwykłe zadanie z rytmem → 422 z dokładnym tekstem „Zrobionego zadania nie można zmienić w powtarzalne.”.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików przechodzi (z zastrzeżeniem bazowych błędów spoza zmiany): `npm run lint`
- Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- Smoke przechodzi, w tym kroki PUT z rytmem (zmiana rytmu z datą startu = dziś, zmiana typu, wyłączenie odrzucone, włączenie na zwykłym zadaniu, zrobione odrzucone): `npm run smoke`
- Test zepsucia: tymczasowe pominięcie ustawienia `recurrence_start_date` w usłudze zaczerwienia krok sprawdzający datę startu; po wycofaniu smoke jest zielony

**Implementation Note**: Po fazie i zielonych bramkach automatycznych zatrzymaj się na potwierdzenie przed fazą 3 (ta faza nie ma kroków ręcznych).

---

## Phase 3: Formularz edycji — rytm, wyłączenie z potwierdzeniem, PRD

### Overview

Formularz edycji dostaje kontrolki rytmu, opisy pod polem i blokadę dla zrobionych zadań; „Nie powtarzaj” na zadaniu powtarzalnym pyta o potwierdzenie i usuwa zadanie. Aktualizuje PRD v2 i asercje smoke.

### Changes Required:

#### 1. Formularz

**File**: `src/components/projects/TaskFormDialog.tsx`, `src/components/projects/TaskRowActions.tsx`

**Intent**: Te same kontrolki rytmu co przy tworzeniu pojawiają się w edycji, z bieżącym rytmem jako wartością początkową.

**Contract**:
- `EditableTask` dostaje `status` (przekazywany z `TaskRowActions`, który ma go już w propsach).
- `initialValues(task)` wyprowadza `repeat` z zadania: interwał 1 → „daily”, interwał > 1 → „every” z liczbą dni, dni tygodnia → „weekdays” z dniami, w przeciwnym razie „none”.
- Strażnicy `!isEdit` przy select, interwale i `WeekdayPicker` znikają; `repeating` zależy od `values.repeat` w obu trybach; w trybie edycji do walidacji i do `updateTask` idzie `taskCreateSchema` z rytmem (jak przy tworzeniu).
- Opis pod polem rytmu (`Field` `hint`): dla zadania powtarzalnego „Zmiana rytmu działa od dziś i usuwa przyszłe przeniesienia.”, dla zwykłego zadania po wyborze rytmu „Termin i status „Częściowo” zostaną wyczyszczone.”.
- Zrobione zadanie zwykłe: select rytmu zablokowany (`disabled`) z opisem „Zrobionego zadania nie można zmienić w powtarzalne.”.
- Wybór „Nie powtarzaj” na zadaniu powtarzalnym i „Zapisz” otwiera `ConfirmDialog` („Usunąć zadanie {tytuł}?” z opisem, że znikną też jego odhaczenia, przycisk „Usuń zadanie”); po zatwierdzeniu wywołuje `deleteTask` z `useTaskApi`, a po sukcesie przeładowuje stronę; błędy pokazywane jak w `DeleteTaskDialog`. Anulowanie wraca do formularza bez zmian.

#### 2. PRD v2

**File**: `context/foundation/prd-v2.md`

**Intent**: Dostosowuje brzmienie do podjętych decyzji, żeby PRD nie sprzeciwiało się implementacji.

**Contract**: FR-020, kryterium akceptacji US-02 („Wyłączenie powtarzania zachowuje historię i dzisiejsze wystąpienie”), akapit Business Logic o zmianie rytmu i wyłączeniu oraz wzmianka o edycji w FR-016: wyłączenie powtarzania to usunięcie zadania razem z odhaczeniami (po potwierdzeniu); zmiana rytmu działa od dziś, zeruje datę startu na dziś, usuwa przyszłe przeniesienia i liczone „pominięte”, a wiersze „zrobione” zostają; rytm da się włączyć na niezrobionym zwykłym zadaniu; zmiana tylko z formularza zadania.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Asercje na treść wyspy zgodnie z lekcją o wyspach.

**Contract**: Strona projektu z zadaniem powtarzalnym renderuje wyspę edycji zadania (przycisk edycji z etykietą dostępnościową zadania powtarzalnego) i wyspę usuwania; po dodaniu kroku test zepsucia (`throw` w `TaskFormDialog`) musi zaczerwienić ten krok.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików przechodzi (z zastrzeżeniem bazowych błędów spoza zmiany): `npm run lint`
- Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build`
- Smoke przechodzi, w tym asercja na wyspę edycji zadania powtarzalnego: `npm run smoke`
- Test zepsucia: tymczasowy `throw` w `TaskFormDialog` zaczerwienia krok smoke z wyspą edycji; po wycofaniu jest zielony
- Testy pgTAP nadal przechodzą: `npx supabase test db`
- Test jednostkowy helpera dni przechodzi: `npm run test:unit`

#### Manual Verification:

- Edycja zadania z dniami tygodnia: zmiana na „Co X dni” zapisuje się, etykieta na stronie projektu i na liście Dziś odpowiada nowemu rytmowi, a opis pod polem mówi, że zmiana działa od dziś
- „Nie powtarzaj” na zadaniu powtarzalnym: pojawia się potwierdzenie usunięcia, po zatwierdzeniu zadanie znika ze strony projektu i z listy Dziś, a anulowanie wraca do formularza
- Zwykłe zadanie ze statusem „Częściowo” i terminem: wybór rytmu pokazuje opis o wyczyszczeniu terminu i statusu, po zapisie zadanie jest powtarzalne bez terminu; zrobione zadanie ma zablokowany select z wyjaśnieniem
- Treść PRD v2 (FR-016, FR-020, kryterium akceptacji US-02, Business Logic) odpowiada decyzjom z planu

**Implementation Note**: To ostatnia faza; po zielonych bramkach i ręcznym potwierdzeniu zamknij zmianę według rytuału epilogu.

---

## Testing Strategy

### Unit Tests:

- Brak nowych testów jednostkowych TS (repo nie ma runnera poza `npm run test:unit` dla `weekdays.ts`); logika sprzątania jest w bazie i testowana w pgTAP.
- Przypadki brzegowe w pgTAP: wiersze `moved` przed i po dacie startu, `done` na dniu granicznym, zmiana typu rytmu, rytm niezmieniony, wyzerowanie rytmu.

### Integration Tests:

- Smoke na PUT z rytmem (zmiana, zmiana typu, włączenie, blokady) i na wyspie edycji; przypadki zależne od daty (pominięte, przeniesienia sprzed dziś) sprawdza wyłącznie pgTAP ze stałym `p_today`.

### Manual Testing Steps:

1. Zmień rytm zadania powtarzalnego z formularza edycji i sprawdź etykiety oraz listę Dziś.
2. Wybierz „Nie powtarzaj” na zadaniu powtarzalnym, anuluj, potem zatwierdź usunięcie.
3. Włącz rytm na zwykłym zadaniu „Częściowo” z terminem; sprawdź blokadę dla zrobionego.

## Performance Considerations

Trigger odpala się tylko przy zmianie rytmu i usuwa kilka wierszy jednego zadania po kluczu głównym `(task_id, …)`; przy skali tej aplikacji koszt jest pomijalny.

## Migration Notes

Migracja dodaje funkcję i wyzwalacz bez zmiany danych; istniejące wiersze nie są ruszane. Zdalna baza wymaga ręcznego wypchnięcia migracji. Wycofanie: osobna migracja usuwająca wyzwalacz `tasks_rhythm_change_cleanup` i jego funkcję.

## References

- Related research: `context/changes/recurring-task-edit-disable/research.md`
- Decyzje produktowe: sekcja Notes w `context/changes/recurring-task-edit-disable/change.md`
- Wymaganie z przeglądu S-09: `context/archive/2026-10-20-recurring-occurrence-actions/follow-ups/review-fixes.md`
- Podobna implementacja: `src/lib/services/tasks.ts:121-131` (data startu przy tworzeniu), `src/components/projects/DeleteTaskDialog.tsx` (usunięcie z potwierdzeniem)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza danych — sprzątanie przeniesień po zmianie rytmu

#### Automated

- [x] 1.1 Migracja stosuje się czysto na lokalnej bazie: `npx supabase db reset` — 214d970
- [x] 1.2 Wszystkie testy pgTAP przechodzą, w tym dotychczasowe 310 bez zmian oczekiwań i nowy plik: `npx supabase test db` — 214d970
- [x] 1.3 Test zepsucia: tymczasowe usunięcie warunku `moved_to >= new.recurrence_start_date` z wyzwalacza zaczerwienia test sprzątania przeniesienia; po wycofaniu test jest zielony — 214d970

#### Manual

- [x] 1.4 Przegląd migracji: wyzwalacz nie dotyka wierszy `done`, używa daty startu zamiast `current_date` i ma warunek `WHEN` na zmianę samego rytmu — 214d970

### Phase 2: API edycji — rytm w PUT

#### Automated

- [x] 2.1 Lint zmienionych plików przechodzi (z zastrzeżeniem bazowych błędów spoza zmiany): `npm run lint` — 5a7bf66
- [x] 2.2 Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build` — 5a7bf66
- [x] 2.3 Smoke przechodzi, w tym kroki PUT z rytmem (zmiana rytmu z datą startu = dziś, zmiana typu, wyłączenie odrzucone, włączenie na zwykłym zadaniu, zrobione odrzucone): `npm run smoke` — 5a7bf66
- [x] 2.4 Test zepsucia: tymczasowe pominięcie ustawienia `recurrence_start_date` w usłudze zaczerwienia krok sprawdzający datę startu; po wycofaniu smoke jest zielony — 5a7bf66

### Phase 3: Formularz edycji — rytm, wyłączenie z potwierdzeniem, PRD

#### Automated

- [x] 3.1 Lint zmienionych plików przechodzi (z zastrzeżeniem bazowych błędów spoza zmiany): `npm run lint` — 3d12a7a
- [x] 3.2 Typy i build przechodzą (po `npx astro preview stop`): `npx astro check` oraz `npm run build` — 3d12a7a
- [x] 3.3 Smoke przechodzi, w tym asercja na wyspę edycji zadania powtarzalnego: `npm run smoke` — 3d12a7a
- [x] 3.4 Test zepsucia: tymczasowy `throw` w `TaskFormDialog` zaczerwienia krok smoke z wyspą edycji; po wycofaniu jest zielony — 3d12a7a
- [x] 3.5 Testy pgTAP nadal przechodzą: `npx supabase test db` — 3d12a7a
- [x] 3.6 Test jednostkowy helpera dni przechodzi: `npm run test:unit` — 3d12a7a

#### Manual

- [x] 3.7 Edycja zadania z dniami tygodnia: zmiana na „Co X dni” zapisuje się, etykieta na stronie projektu i na liście Dziś odpowiada nowemu rytmowi, a opis pod polem mówi, że zmiana działa od dziś — 3d12a7a
- [x] 3.8 „Nie powtarzaj” na zadaniu powtarzalnym: pojawia się potwierdzenie usunięcia, po zatwierdzeniu zadanie znika ze strony projektu i z listy Dziś, a anulowanie wraca do formularza — 3d12a7a
- [x] 3.9 Zwykłe zadanie ze statusem „Częściowo” i terminem: wybór rytmu pokazuje opis o wyczyszczeniu terminu i statusu, po zapisie zadanie jest powtarzalne bez terminu; zrobione zadanie ma zablokowany select z wyjaśnieniem — 3d12a7a
- [x] 3.10 Treść PRD v2 (FR-016, FR-020, kryterium akceptacji US-02, Business Logic) odpowiada decyzjom z planu — 3d12a7a
