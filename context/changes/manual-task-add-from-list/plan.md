# Ręczne dodanie zadania z listy na dziś Implementation Plan

## Overview

Szósty slice roadmapy (S-06, FR-008): na stronie `/today` w nagłówku pojawia się przycisk **Dodaj zadanie**, który otwiera dialog z wyborem projektu i milestona (oraz tytułem i opcjonalnym terminem). Zapis idzie istniejącą trasą `POST …/milestones/[milestoneId]/tasks` z S-03, a po sukcesie strona się przeładowuje. Do formularza dochodzi jeden nowy odczyt: projekty z ich otwartymi milestonami. Gdy wybrany milestone nie jest najbliższym niezamkniętym w projekcie, formularz ostrzega, że zadanie pojawi się na liście dopiero wtedy, gdy milestone stanie się najbliższy (guardrail PRD: nic nie znika bez wiedzy użytkownika). Baza, API i `today_list` zostają bez zmian.

## Current State Analysis

Stan na commit `f34c85a` (po archiwizacji S-05).

- **Tworzenie zadania już istnieje:** `POST /api/projects/[id]/milestones/[milestoneId]/tasks` → `createTask` z walidacją `taskInputSchema`, regułami triggera `tasks_check_rules` (termin zadania ≤ data milestona, brak niezrobionego zadania w zamkniętym milestonie) i tłumaczeniem błędów (`src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/index.ts`, `src/lib/services/tasks.ts`); hook `useTaskApi().createTask` (`src/components/hooks/use-task-api.ts`) i dialog `TaskFormDialog` w widoku projektu z nich korzystają (`src/components/projects/TaskFormDialog.tsx`).
- **Brakuje wyboru celu:** `TaskFormDialog` zna jeden, z góry ustalony milestone. `/today` nie ma danych „projekty z otwartymi milestonami"; `listProjects` i `listMilestones(projectId)` są per widok i nie nadają się do jednego selecta (N zapytań).
- **Reguła kwalifikacji do listy:** `today_list` pokazuje niedokończone zadania tylko z najbliższego niezamkniętego milestona każdego projektu (`distinct on (project_id) … order by due_date, seq` po milestonach z `completed_at is null`; `supabase/migrations/20261016120000_today_list.sql`). Zadanie dodane do dalszego milestona nie trafi więc od razu na listę.
- **`/today` dziś:** nagłówek (eyebrow, data, podsumowanie) bez żadnej akcji; lista, wiersze milestonów, sekcja przeniesionych (`src/pages/today.astro`); odczyt listy w `src/lib/services/today.ts` (`getToday`).
- **Komponenty do użycia:** natywny `Select` z opcjami `{value,label}` (`src/components/ui/select.tsx`), `Field` z `hint`/`error`, `Input`, `Dialog` (`src/components/ui/`), wzorzec wyniku `TaskApiSaveResult` i obsługi błędów z `TaskFormDialog`; design system przewiduje główny przycisk „Dodaj zadanie" po prawej w nagłówku Dziś (`context/foundation/design-system/design-system.md`, sekcja ekranu Dziś).
- **Lekcje** (`context/foundation/lessons.md`): smoke dla strony z wyspą React musi asercją na tekst z wyspy sprawdzać render i przejść test zepsucia (`throw` w komponencie); przed `shadcn add` sprawdzić zależności (tu bez nowych komponentów). Z przeglądów S-02…S-05: przyciski w wierszach/akcjach z `aria-label` z nazwą elementu; kontrolka wyłączona z podpowiedzią przez `aria-disabled` + `aria-describedby` (wzorzec zamkniętego milestona w `TaskFormDialog`); backslashe przez shell potrafią zepsuć znaki — pliki edytować narzędziami Edit/Write.
- **Testy:** brak runnera TS; pgTAP dla bazy (bez zmian w tym slice'ie) i smoke (`npm run smoke`, `scripts/smoke.mjs`, plik z zakończeniami CRLF).

## Desired End State

- Na `/today` w prawej części nagłówka widać przycisk **Dodaj zadanie** (także przy pustej liście). Po kliknięciu otwiera się dialog z polami: **Projekt** (select), **Milestone** (select zależny od projektu), **Tytuł**, **Termin (opcjonalny)**.
- Projekty w selecie są posortowane wg najbliższego otwartego milestona; po otwarciu dialogu domyślnie wybrany jest pierwszy projekt i jego najbliższy milestone; zmiana projektu ustawia najbliższy milestone nowego projektu. W selecie milestona są tylko otwarte milestony wybranego projektu (od najbliższego), z datą w etykiecie.
- Gdy wybrany milestone nie jest najbliższym niezamkniętym w projekcie, pod selectem milestona jest podpowiedź: „Ten milestone nie jest najbliższy w projekcie — zadanie pojawi się na liście Dziś, gdy stanie się najbliższy." Dla najbliższego milestona podpowiedzi nie ma.
- Po zapisie strona się przeładowuje; zadanie dodane do najbliższego milestona jest na liście. Błędy walidacji (pusty tytuł, termin późniejszy niż data milestona) i błędy serwera pokazują się po polsku w dialogu, a zapis nie tworzy duplikatu przy podwójnym kliknięciu.
- Gdy nie ma gdzie dodać zadania (brak projektów albo wszystkie milestony zamknięte), przycisk jest wyłączony (`aria-disabled`) z podpowiedzią „Najpierw dodaj projekt z otwartym milestonem." i linkiem „Projekty".
- Weryfikacja: lint zmienionych plików, `npx astro check`, `npm run build`, rozszerzony `npm run smoke` (asercje na tekst wyspy: stan pusty i stan z danymi, test zepsucia wyspy); ręcznie przepływ w przeglądarce w jasnym i ciemnym motywie na 390 i 1280 px.

### Key Discoveries:

- Backend dodawania jest kompletny (S-03): trasa `POST`, walidacja, triggery i komunikaty błędów obsługują ten przypadek bez zmian; brakuje wyłącznie odczytu celów i UI (`src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/index.ts`, `src/lib/services/tasks.ts` `createTask`).
- Zadanie dodane do milestona, który nie jest najbliższy, nie pojawi się na liście Dziś (`distinct on (project_id) … order by due_date, seq` w `today_list`) — to jedyna rzecz, która mogłaby wyglądać jak „zniknęło"; stąd podpowiedź w formularzu zamiast cichego zapisu.
- Dodanie niezrobionego zadania do najbliższego milestona, który właśnie był „do zamknięcia" (wszystkie zadania zrobione), zamienia go z powrotem w milestone z otwartym zadaniem — wiersz „milestone do zamknięcia" znika, a zadanie ląduje na liście; serwer przelicza to przy przeładowaniu.
- Smoke nie musi mieć nowych kroków API: `POST` zadań jest pokryty z S-03. Wystarczy rozszerzyć dwa istniejące kroki strony o tekst z wyspy; w stanie z danymi brak komunikatu „Najpierw dodaj projekt…" dowodzi, że odczyt celów zwrócił dane (`scripts/smoke.mjs`: „today page renders empty state", „today page lists the open task of the nearest milestone").

## What We're NOT Doing

- Zmiany w bazie i API (brak migracji, brak nowej trasy, brak zmian `today_list` i triggerów), dodawanie zadania do zamkniętego milestona, tworzenie projektu lub milestona z poziomu listy.
- Modyfikacja `TaskFormDialog` i widoku projektu (osobna wyspa; powielenie kilkunastu linii obsługi wyniku jest świadome, ekstrakcja wspólnego hooka dopiero przy kolejnej wyspie — por. F1 z przeglądu S-05).
- Wiersz „Dodaj zadanie do projektu…" na końcu listy (`sp-add` z design systemu), filtr po obszarze życia, kolor projektu, ustawianie przeniesienia/statusu przy tworzeniu, przejście na stronę milestona po zapisie.
- Zapamiętywanie ostatnio wybranego projektu między wizytami; podpowiedź „co dalej" po zapisie zadania spoza listy (ostrzeżenie jest przed zapisem).
- Runner testów jednostkowych i `supabase test db` w CI (Moduł 3); `supabase db push` (pięć migracji razem, ręcznie, przed wdrożeniem).

## Implementation Approach

Jedna faza, bo backend to tylko odczyt bez widocznego efektu — osobny commit nie miałby czego sprawdzić ręcznie. Decyzje z wywiadu:

- **Widoczność:** wszystkie otwarte milestony do wyboru, domyślnie najbliższy; dla dalszego milestona inline podpowiedź (`hint` pola) bez blokady zapisu.
- **Komponent:** nowa wyspa `AddTaskFromTodayDialog` w `src/components/today/` — ponownie używa `useTaskApi().createTask`, `Field`, `Input`, `Select`, `Dialog` i `taskInputSchema`; `TaskFormDialog` bez zmian.
- **Stan pusty:** przycisk zawsze obecny; bez celów jest `aria-disabled` z opisem i linkiem do `/projects`.
- **Odczyt celów:** `getTaskTargets(supabase)` w `src/lib/services/today.ts` — jedno zapytanie po milestonach z `completed_at is null` z nazwą projektu, pogrupowane po projekcie; kolejność milestonów `due_date, seq` jak w `today_list`, kolejność projektów wg ich najbliższego milestona.
- **Strona:** `today.astro` czyta cele razem z listą w tym samym bloku `try` (błąd odczytu → ten sam komunikat „Nie udało się wczytać listy na dziś", bez przycisku); nagłówek dostaje układ flex z przyciskiem po prawej jak na stronie projektów.
- **Po zapisie:** `window.location.reload()` z blokadą formularza do przeładowania (wzorzec S-03/S-05).
- **Testy:** smoke po stronie (stan pusty i stan z danymi, asercja na tekst z wyspy) i test zepsucia wyspy zgodnie z lekcją.

## Critical Implementation Details

- **Zgodność z regułą kwalifikacji:** „najbliższy milestone" w formularzu to pierwszy otwarty milestone projektu w kolejności `due_date, seq` — ta sama kolejność co `distinct on (project_id) … order by due_date, seq` w `today_list`. Rozjazd (np. sortowanie tylko po dacie) pokazałby podpowiedź w złym miejscu.

## Phase 1: Dodawanie zadania z listy Dziś

### Overview

Odczyt celów (projekty z otwartymi milestonami), wyspa z dialogiem dodawania zadania, podpięcie w nagłówku `/today` oraz smoke z asercjami na tekst wyspy i testem zepsucia.

### Changes Required:

#### 1. Typy celów

**File**: `src/types.ts`

**Intent**: Wspólny kształt danych dla selectów formularza.

**Contract**: `TaskTargetMilestone = Pick<Milestone, "id" | "name" | "due_date">` oraz `TaskTargetProject = { id: string; name: string; milestones: TaskTargetMilestone[] }`; `milestones` posortowane od najbliższego, więc pierwszy element to „najbliższy niezamknięty".

#### 2. Odczyt celów

**File**: `src/lib/services/today.ts`

**Intent**: Jedno zapytanie zamiast N, z kolejnością zgodną z regułą listy Dziś.

**Contract**: `getTaskTargets(supabase: Client): Promise<TaskTargetProject[]>` — `from("milestones").select("id, name, due_date, project_id, projects(id, name)").is("completed_at", null).order("due_date", {ascending: true}).order("seq", {ascending: true})`; wynik grupowany po `project_id` z zachowaniem kolejności pierwszego wystąpienia (projekty wg najbliższego milestona); błąd → `throw readFailure(error)` jak w `getToday`. Projekty bez otwartych milestonów nie występują w wyniku. Osadzenie `projects(...)` idzie po złożonym kluczu obcym `milestones_project_owner_fkey (project_id, user_id)` i w repo nie było jeszcze używane od strony `milestones`: najpierw sprawdzić, że zwraca obiekt (nie tablicę) i poprawny typ, odczytując go guardem bez rzutowania `as`. Plan awaryjny, gdy osadzenie nie działa lub nie daje obiektu: dwa zapytania — `listProjects(supabase)` oraz milestony `completed_at is null` (te same `order`) — łączone po `project_id` w pamięci, z tą samą kolejnością wyniku.

#### 3. Wyspa dialogu dodawania

**File**: `src/components/today/AddTaskFromTodayDialog.tsx`

**Intent**: FR-008 — dodanie zadania z listy Dziś z wyborem projektu i milestona oraz ostrzeżeniem o widoczności.

**Contract**: wyspa React; prop `targets: TaskTargetProject[]`. Dla `targets.length === 0` renderuje `Button` `secondary` „Dodaj zadanie" z `aria-disabled="true"`, `aria-describedby` wskazującym tekst „Najpierw dodaj projekt z otwartym milestonem." oraz link „Projekty" do `/projects` (wzorzec zamkniętego milestona w `TaskFormDialog`). W przeciwnym razie `Dialog` z `DialogTrigger` (`Button` „Dodaj zadanie") i formularzem `noValidate`: `Field` „Projekt" z `Select` (opcje = `targets`), `Field` „Milestone" z `Select` (opcje = otwarte milestony wybranego projektu, etykieta „{nazwa} · {formatDate(due_date)}", `hint` z podpowiedzią widoczności, gdy wybrany milestone nie jest `milestones[0]` projektu: „Ten milestone nie jest najbliższy w projekcie — zadanie pojawi się na liście Dziś, gdy stanie się najbliższy."; treść podpowiedzi jest renderowana wewnątrz stałego elementu `role="status"` (kontener zawsze w DOM, zmienia się tylko jego zawartość), żeby czytnik ekranu ogłosił ją po zmianie milestona, a nie dopiero przy kolejnym fokusie), `Field` „Tytuł" (`required`), `Field` „Termin (opcjonalny)" (`type="date"`, `max` = data wybranego milestona). Stan: wartości formularza (`projectId`, `milestoneId`, `title`, `due_date`), `fieldErrors`, `generalError`, `pending`. Otwarcie dialogu resetuje formularz do pierwszego projektu i jego najbliższego milestona; zmiana projektu ustawia najbliższy milestone nowego projektu i czyści błąd terminu. Walidacja po stronie klienta jak w `TaskFormDialog` (`taskInputSchema`, termin ≤ data milestona z komunikatem „Termin zadania nie może być późniejszy niż data milestona ({data})"), fokus na pierwszym błędnym polu. Zapis `createTask(projectId, milestoneId, parsed.data)`; wynik jak w `TaskFormDialog`: `ok` → przeładowanie z `navigating` (blokada do reloadu), `fieldErrors` → błędy pól lub ogólny, `notFound` → „Nie znaleziono projektu lub milestona. Odśwież stronę.", `unavailable` → komunikat, `unauthorized` → przekierowanie z hooka. Błąd ogólny w `role="alert"`, przyciski „Anuluj"/„Zapisz" z `disabled={pending}` jak w `TaskFormDialog`; identyfikatory pól z prefiksem `today-add-task`.

#### 4. Strona `/today`

**File**: `src/pages/today.astro`

**Intent**: Pokazać przycisk w nagłówku i dostarczyć wyspie dane.

**Contract**: `getTaskTargets` wywoływane obok `getToday` w tym samym bloku `try` (np. `Promise.all`), wynik w `targets` (inicjalizator `[]`); błąd odczytu → istniejący komunikat `unavailable`. Nagłówek (eyebrow, `h1`, podsumowanie) w kontenerze `flex flex-wrap items-end justify-between gap-4` jak na `src/pages/projects/index.astro`, po prawej `<AddTaskFromTodayDialog client:load targets={targets} />` renderowany tylko gdy `!unavailable`. Reszta strony (lista, milestony, przeniesione, stan pusty) bez zmian.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Dowieść renderu wyspy zgodnie z lekcją (tekst z wyspy, nie ze strony) i że odczyt celów działa.

**Contract**: w kroku „today page renders empty state" (użytkownik bez projektów) dopisać do `bodyIncludes`: „Najpierw dodaj projekt z otwartym milestonem" (tekst renderowany wyłącznie przez wyspę w stanie wyłączonym). W kroku „today page lists the open task of the nearest milestone" dopisać do `bodyIncludes` „Dodaj zadanie" i do `bodyExcludes` „Najpierw dodaj projekt z otwartym milestonem" (brak tekstu stanu pustego dowodzi, że `getTaskTargets` zwrócił dane). Pozostałe kroki bez zmian; plik ma zakończenia CRLF — zachować, edytować narzędziami Edit/Write lub skryptem node z pliku, nie przez shell z backslashami; w asercjach używać apostrofów dla łańcuchów z cudzysłowem (prettier). Po dodaniu zrobić test zepsucia (`throw` w komponencie wyspy), potwierdzić, że oba kroki stają się czerwone, i przywrócić plik.

### Success Criteria:

#### Automated Verification:

- Lint zmienionych plików bez błędów (`endOfLine: auto`): `npx eslint --rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}' $(git ls-files -m -o --exclude-standard -- '*.ts' '*.tsx' '*.astro' '*.mjs')`
- Sprawdzanie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym asercje na tekst wyspy (stan pusty i stan z danymi): `npm run smoke`

#### Manual Verification:

- W przeglądarce: „Dodaj zadanie" z nagłówka dodaje zadanie do najbliższego milestona wybranego projektu i po przeładowaniu zadanie jest na liście; zmiana projektu przełącza listę milestonów na najbliższy milestone nowego projektu; błędy (pusty tytuł, termin późniejszy niż data milestona) są po polsku i wskazują pole
- Wybór dalszego milestona pokazuje podpowiedź o widoczności i czytnik ekranu ogłasza ją po zmianie milestona (bez ponownego fokusu na select); zadanie zapisuje się, ale nie ma go na liście Dziś (widać je w widoku projektu), a po zamknięciu wcześniejszego milestona pojawia się na liście
- Stan pusty (brak projektów albo wszystkie milestony zamknięte): przycisk wyłączony z podpowiedzią i linkiem „Projekty"; jasny i ciemny motyw, 390 px i 1280 px bez poziomego przewijania, fokus w dialogu i po jego zamknięciu, nawigacja klawiaturą (Tab, Enter, Esc), pola mają etykiety

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera TS; reguły bazy bez zmian (pgTAP nadal pokrywa triggery zadań i `today_list`). `POST` zadań jest pokryty smoke z S-03.
- Kolejność celów i „najbliższy milestone" nie mają osobnego testu; widać je w ręcznej weryfikacji i pośrednio w smoke (stan z danymi).

### Integration Tests:

- Smoke (`npm run smoke`): dwa kroki strony z asercją na tekst wyspy (stan pusty i stan z danymi) oraz test zepsucia wyspy (lekcja z `context/foundation/lessons.md`).
- pgTAP uruchamiany ręcznie (`npx supabase test db`), bez zmian w tym slice'ie.

### Manual Testing Steps:

1. Przygotuj dwa projekty, w jednym dwa milestony o różnych datach; dodaj zadanie do najbliższego milestona i sprawdź, że jest na liście.
2. Dodaj zadanie do dalszego milestona: podpowiedź w formularzu, zadanie poza listą, widoczne w widoku projektu.
3. Sprawdź walidację (pusty tytuł, termin po dacie milestona), podwójne kliknięcie „Zapisz" (jedno zadanie), zmianę projektu w trakcie wypełniania.
4. Zamknij wszystkie milestony i sprawdź wyłączony przycisk z linkiem; sprawdź klawiaturę, fokus, jasny/ciemny motyw, 390 i 1280 px.

## Performance Considerations

Jedno dodatkowe zapytanie na wejście na `/today` (milestony z osadzonym projektem; skala MVP `data_volume: small`), wykonywane równolegle z RPC listy. Wyspa dialogu hydratuje się jednorazowo (`client:load`); dialog renderuje formularz dopiero po otwarciu.

## Migration Notes

Brak migracji i zmian schematu. Wdrożenie wymaga tylko ręcznego `supabase db push` **pięciu migracji razem** (z F-01, S-02, S-03 i S-04) przed wdrożeniem aplikacji, jak dotąd. Wycofanie: cofnięcie commitów aplikacji; dane zadań pozostają zgodne.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-06), PRD: `context/foundation/prd.md` (FR-008, guardrail „bez wiedzy użytkownika")
- Poprzednie slice'y: `context/archive/2026-10-15-task-crud/plan.md` (trasa `POST`, `TaskFormDialog`, trigger zadań), `context/archive/2026-10-16-today-list-actions/plan.md` i `reviews/impl-review.md` (wzorzec wysp, F1 o powielonym szkielecie), `context/archive/2026-10-15-today-list-view/plan.md` (reguła listy)
- Lekcje: `context/foundation/lessons.md`; design system: `context/foundation/design-system/design-system.md` (ekran Dziś), `reference/components/TaskRow.md`
- Baza: `supabase/migrations/20261016120000_today_list.sql` (reguła „najbliższy milestone"), `20261015120000_task_rules.sql`; kod: `src/lib/services/today.ts`, `src/lib/services/tasks.ts`, `src/components/projects/TaskFormDialog.tsx`, `src/components/hooks/use-task-api.ts`, `src/components/ui/select.tsx`, `src/pages/today.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dodawanie zadania z listy Dziś

#### Automated

- [x] 1.1 Lint zmienionych plików bez błędów (`endOfLine: auto`) — 67db7cc
- [x] 1.2 Sprawdzanie typów przechodzi: `npx astro check` — 67db7cc
- [x] 1.3 Build przechodzi: `npm run build` — 67db7cc
- [x] 1.4 Smoke przechodzi, w tym asercje na tekst wyspy (stan pusty i stan z danymi): `npm run smoke` — 67db7cc

#### Manual

- [x] 1.5 Dodanie zadania do najbliższego milestona z listy, przełączanie projektu i milestona oraz błędy walidacji po polsku — 67db7cc
- [x] 1.6 Dalszy milestone: podpowiedź o widoczności (ogłaszana przez czytnik ekranu), zadanie poza listą, widoczne w widoku projektu — 67db7cc
- [x] 1.7 Stan pusty (wyłączony przycisk z linkiem) oraz wygląd i dostępność: motywy, 390 px i 1280 px, fokus, klawiatura, etykiety pól — 67db7cc
