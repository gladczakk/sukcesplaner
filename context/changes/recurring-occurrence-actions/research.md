---
date: 2026-10-20T13:50:00+0200
researcher: Claude Sonnet 5.5 (na zlecenie Karoliny Jurowicz)
git_commit: 76e655b
branch: master
repository: xDevs
topic: "S-09 recurring-occurrence-actions: co dziś robią akcje na liście na dziś i jak model wystąpień zadań powtarzalnych ma przyjąć „pominięte” i przeniesienie wystąpienia"
tags: [research, codebase, today-list, task_occurrences, today_list, TodayTaskActions, recurring-tasks]
status: complete
last_updated: 2026-10-20
last_updated_by: Claude Sonnet 5.5
---

# Research: akcje na wystąpieniu zadania powtarzalnego (S-09)

**Date**: 2026-10-20T13:50:00+0200
**Researcher**: Claude Sonnet 5.5
**Git Commit**: 76e655b
**Branch**: master
**Repository**: xDevs

## Research Question

Slice S-09 (`context/foundation/roadmap.md`, blok S-09) ma dać dwie rzeczy dla zadań powtarzalnych: (1) niezrobione wystąpienie następnego dnia jest widoczne jako „pominięte”, po czym znika; (2) wystąpienie można przenieść na inny dzień tylko wtedy, gdy tego dnia to zadanie nie ma własnego wystąpienia. Zadania niepowtarzalne mają działać dokładnie jak dotąd. Co w bazie, usługach i UI już istnieje, co S-07/S-08/S-05 rozstrzygnęły, i które decyzje produktowe zostają otwarte przed `/10x-plan`?

## Summary

- **Model wystąpień.** Wystąpienia nie są przechowywane jako wiersze. `today_list(p_today)` wylicza je dla jednego dnia, a w `task_occurrences` zapisane są wyłącznie oznaczenia „zrobione” (kolumna `state` ma ograniczenie tylko do `'done'`; klucz główny `(task_id, occurrence_date)`; polityki RLS tylko select/insert/delete, bez update) — `supabase/migrations/20261019120000_recurring_tasks.sql:47-77`.
- **„Pominięte” nie istnieje.** W sprawdzonych migracjach i testach jedyna wzmianka o `'skipped'` to asercja, że taki `state` jest odrzucany kodem 23514 — `supabase/tests/database/core_domain_recurring_tasks.test.sql:358-362`. `today_list` ocenia tylko `p_today`, więc przeszłe niezrobione wystąpienie jest po prostu nieobecne i nie zostawia śladu (`20261020120000_recurring_weekdays.sql:238-377`). To jest sprzeczne z regułą PRD v2, że zadanie „nie znika z listy bez wiedzy użytkownika” (`context/foundation/prd-v2.md:47`).
- **Przeniesienie nie ma gdzie się zapisać.** Dla zadań niepowtarzalnych „Na jutro” to `tasks.deferred_until` (jedna wartość na zadanie, bez wyzwalacza walidującego — `20261009120000_create_core_domain_schema.sql:48`). Dla zadań powtarzalnych ograniczenie `tasks_recurrence_shape` wymusza `due_date IS NULL`, `status = 'todo'`, `deferred_until IS NULL` (`20261020120000_recurring_weekdays.sql:53-67`), więc „Częściowo” i „Na jutro” są dla nich zablokowane w bazie, a ukryte w UI (`src/components/today/TodayTaskActions.tsx:82`). Wyzwalacz `check_task_occurrence` wymaga dodatkowo, by data pasowała do rytmu (`20261020120000_recurring_weekdays.sql:74-130`), więc zapis „zrobione” na dniu spoza rytmu zostałby dziś odrzucony.
- **Zakres S-09 z samego PRD**: stany wystąpienia to wyłącznie „zrobione” i „pominięte” (`prd-v2.md:96,98`); „częściowo” nie dotyczy zadań powtarzalnych; przeniesienie to „to samo wystąpienie zmienia dzień” (`prd-v2.md:75`); codzienne zadanie nie może iść na jutro, a bieganie w środy i piątki niezrobione w środę można przenieść na czwartek, ale nie na piątek (`prd-v2.md:48,62`).
- **PRD deklaruje „Brak otwartych pytań”** (`prd-v2.md:113-119`), ale cztery rzeczy implementacyjnie istotne nie są nigdzie określone (patrz Open Questions): wygląd i zasięg „pominiętego”, los dnia źródłowego po przeniesieniu, UI wyboru dnia docelowego, oraz co się dzieje z przeniesionym wystąpieniem, którego nie zrobiono.

## Detailed Findings

### Baza danych — `task_occurrences` i wyzwalacz

- Kolumny: `task_id`, `user_id` (domyślnie `auth.uid()`), `occurrence_date`, `state text default 'done'` z ograniczeniem `task_occurrences_state_check` (tylko `'done'`), `created_at`. Klucz główny i unikalny: `(task_id, occurrence_date)` — duplikat daje 23505. Klucz obcy `(task_id, user_id)` → `tasks(id, user_id)` z kaskadą usuwania. Grants: select, insert, delete (bez update) — `20261019120000_recurring_tasks.sql:47-77`.
- Wyzwalacz `task_occurrences_check_occurrence` jest BEFORE INSERT. Aktualna treść funkcji: `20261020120000_recurring_weekdays.sql:74-130`. Odrzuca: zadanie niepowtarzalne, zamknięty milestone, datę przed `recurrence_start_date` lub po dacie milestona, datę niepasującą do rytmu (modulo dla interwału, `isodow = any(weekdays)` dla dni tygodnia). Komunikat zawiera słowo „Wystapienie”, a usługa TS dopasowuje je tekstem (`src/lib/services/tasks.ts:34,227`) — zmiana komunikatu wymaga zmiany TS.
- Skutek dla S-09: dodanie stanu `'skipped'` wymaga migracji (rozszerzenie ograniczenia `state`), a przeniesienie wymaga nowego miejsca zapisu — nic w obecnym schemacie nie przechowuje „wystąpienie z dnia A żyje w dniu B”. Brak polityki update oznacza, że zmiana istniejącego wiersza (np. skip → done) wymaga albo nowej polityki/grantu, albo delete + insert.

### Baza danych — `today_list`

- Aktualna definicja: `20261020120000_recurring_weekdays.sql:238-377` (`drop function` + `create function`, security invoker, grant dla `authenticated`). Kolumny wyniku: `kind`, dane projektu i milestona, `task_*`, `task_recurrence_interval_days`, `task_recurrence_weekdays`. Rodzaje wierszy: `task`, `deferred`, `milestone`, `routine`.
- Wiersz `routine` (linie 316-348 tej migracji): milestone otwarty, zadanie powtarzalne, `p_today` w zakresie `recurrence_start_date..milestone.due_date`, dzień pasuje do rytmu, brak wiersza `task_occurrences` dla dokładnie `p_today`. Routine bierze zadania z dowolnego otwartego milestona, a nie tylko najbliższego.
- Skutek dla S-09: „pominięte wczoraj” i „przeniesione na dziś” wymagają nowego predykatu albo nowego rodzaju wiersza w tej samej funkcji; zmiana kolumn wyniku znów oznacza `drop` + `create` + `grant` (tak samo robiły S-07 i S-08).

### Warstwa aplikacji — akcje na liście

- PATCH `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts` obsługuje dwa kształty ciała: `{status}` (`taskStatusSchema`, `src/lib/validation/task.ts`) i `{deferred: "tomorrow" | null}` (`taskDeferralSchema`); oba naraz → 422 „Podaj albo status, albo przeniesienie.”. Usługi: `setTaskStatus` (`tasks.ts:155-174`, zawsze też zeruje `deferred_until`) i `setTaskDeferral` (`tasks.ts:177-208`, „jutro” liczone po stronie serwera przez `tomorrowInWarsaw()`).
- POST `.../[taskId]/occurrences.ts` bez ciała: serwer sam wylicza dzień (`todayInWarsaw()`), wywołuje `completeOccurrence` (`tasks.ts:210-232`), duplikat 23505 traktuje jako sukces (idempotentne), 23514 z „Wystapienie” → `OCCURRENCE_ERROR` („To wystąpienie nie jest dziś aktualne. Odśwież stronę.”).
- UI: `src/pages/today.astro:79-105` renderuje rutyny jako pierwsze, z `formatRecurrence(...)` i wyspą `TodayTaskActions` z `recurring`. W wyspie „Zrobione” jest zawsze; „Częściowo” i „Na jutro” są pomijane przez `{recurring ? null : (...)}` (`TodayTaskActions.tsx:82`). Po sukcesie wyspa robi `window.location.reload()`.
- Dla S-09: nowe akcje wpiszą się w istniejący wzorzec — funkcja usługi obok `completeOccurrence`, trasa (nowa metoda lub `occurrences/[date]`) ze schematem zod w `validation/task.ts`, wrapper w `use-task-api.ts`, przycisk w gałęzi `recurring` wyspy. Ograniczenie rytmu w wyzwalaczu zderzy się z przeniesieniem na dzień spoza rytmu, więc przeniesienie musi mieć własny model danych albo własną gałąź wyzwalacza.
- Lekcje i konwencje z wcześniejszych zmian: smoke dla stron z wyspami musi sprawdzać treść wyspy i mieć test zepsucia (`context/foundation/lessons.md:5-10`); przed `shadcn add` sprawdzić zależności rejestru i nie nadpisać `button.tsx` (`lessons.md:12-17`) — ważne, jeśli wybór dnia dostanie nowy komponent.

### Co wcześniejsze zmiany świadomie zostawiły dla S-09

- S-07 wprost odłożył „pominięte” i przeniesienie wystąpienia do S-09; odhaczenie wystąpienia jest już dostarczone (`context/archive/2026-10-19-recurring-tasks-by-interval/plan.md:32,45`; `plan-brief.md:23,35`).
- `tasks_recurrence_shape` istnieje po to, by akcje z S-05 nie mogły zakończyć zadania powtarzalnego (`plan.md:69` tej zmiany). S-09 potrzebuje przeniesienia per wystąpienie, które nie używa `tasks.deferred_until`, bo to „jedna wartość na zadanie” i nie pasuje do FR-019 (`research.md:52` tej zmiany).
- S-08 ustalił: w wyzwalaczach i ograniczeniach jawny predykat `interval IS NOT NULL OR weekdays IS NOT NULL`, a wyliczana kolumna `is_recurring` tylko w zapytaniach i TS (`context/archive/2026-10-20-recurring-tasks-by-weekdays/plan.md:23,50`). S-09 i S-10 dotykają tych samych funkcji SQL, więc wymagają ustalonej kolejności migracji i jednej definicji „powtarzalnego” (`plan-brief.md:57`).

## Code References

- `supabase/migrations/20261019120000_recurring_tasks.sql:47-77` — tabela `task_occurrences`, ograniczenie `state`, klucz, RLS i grants.
- `supabase/migrations/20261020120000_recurring_weekdays.sql:74-130` — aktualny wyzwalacz `check_task_occurrence` (gałęzie interwał/dni tygodnia).
- `supabase/migrations/20261020120000_recurring_weekdays.sql:53-67` — `tasks_recurrence_shape` (due_date null, status todo, deferred_until null).
- `supabase/migrations/20261020120000_recurring_weekdays.sql:238-377` — aktualna `today_list`, rutyna w liniach 316-348.
- `supabase/migrations/20261009120000_create_core_domain_schema.sql:41-53` — kolumny `tasks`, w tym `status` (todo/partial/done) i `deferred_until`.
- `supabase/tests/database/core_domain_recurring_tasks.test.sql:358-362` — test odrzucenia `'skipped'`.
- `src/lib/services/tasks.ts:34,155-232` — `OCCURRENCE_ERROR`, `setTaskStatus`, `setTaskDeferral`, `completeOccurrence`.
- `src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId]/occurrences.ts` — POST odhaczenia wystąpienia.
- `src/components/today/TodayTaskActions.tsx:82` — ukrywanie „Częściowo” i „Na jutro” dla rutyn.
- `src/pages/today.astro:79-105` — render wierszy rutyn.
- `src/lib/today.ts` — `todayInWarsaw()`, `tomorrowInWarsaw()`.
- `scripts/smoke.mjs` ok. 813-980 — kroki rutyn i dni tygodnia; ok. 355-455 — kroki „na jutro”/status (numery przybliżone, z raportu agenta, niezweryfikowane osobiście).

## Architecture Insights

- Zasada „stan tylko dla odhaczeń, reszta wyliczana” jest fundamentem S-07/S-08. „Pominięte” da się zrealizować bez zapisu per dzień tylko częściowo: „wczoraj było wystąpienie i nie ma wiersza done” da się wyliczyć w SQL z rytmu, ale nie rozróżni „pominięte” od „przeniesione” ani nie przeżyje zmiany rytmu (FR-020, S-10 zachowuje historię). To jest kluczowy wybór projektowy planu: model wyliczany vs. jawne zapisy `skipped`/`moved`.
- Przeniesienie wymaga danych, których nie ma: dzień źródłowy, dzień docelowy i stan. Reguła „dzień docelowy nie ma własnego wystąpienia” jest sprawdzalna w SQL (rytm + istniejące zapisy w `task_occurrences`), jeśli przeniesienia zostaną zapisane w tej samej tabeli lub w nowej.
- „Dzisiaj” i „jutro” są wyliczane po stronie serwera w Europe/Warsaw, nigdy w przeglądarce ani w SQL `current_date` (UTC) — ograniczenie z S-05 (`context/archive/2026-10-16-today-list-actions/plan.md:57`), które przenosi się na nowe akcje.
- Znana, zaakceptowana luka: strona otwarta przed północą i kliknięta po niej może odhaczyć wystąpienie następnego dnia (S-07 impl-review F2). Dla „pominięte” i „przenieś” ma to większe znaczenie, bo ich sens zależy od „dziś” i „następnego dnia”.

## Historical Context (from prior changes)

- `context/archive/2026-10-16-today-list-actions/plan.md:46-57` — kontrakt akcji S-05 (PATCH ma dwa kształty ciała, każda zmiana statusu zeruje `deferred_until`, „jutro” po stronie serwera, `window.location.reload()` po sukcesie, przyciski z `aria-label` „Akcja: {tytuł}”) — wszystko to musi działać bez zmian dla zadań niepowtarzalnych.
- `context/archive/2026-10-16-today-list-actions/reviews/impl-review.md:49` — odroczona ekstrakcja hooka `use-reload-action` „przy czwartej wyspie”; S-09 może dodać czwartą wyspę lub wariant, co jest okazją do tej ekstrakcji.
- `context/archive/2026-10-19-recurring-tasks-by-interval/reviews/impl-review.md` — F1 (zamknięcie luki przy przesunięciu daty milestona poniżej startu rutyny, migracja `20261019130000_milestone_date_covers_routines.sql`) wciąż obowiązuje: dzień docelowy przeniesienia musi mieścić się w dacie milestona; F2 (strona przez północ) zaakceptowana.
- `context/archive/2026-10-20-recurring-tasks-by-weekdays/` — brak folderu `reviews/` (zmiana zarchiwizowana bez przeglądu).

## Related Research

- `context/archive/2026-10-19-recurring-tasks-by-interval/research.md` — model wystąpień i odroczenie S-09.
- `context/archive/2026-10-20-recurring-tasks-by-weekdays/research.md` — rytm dni tygodnia; tabela i wyzwalacz odhaczenia nie zakładają rodzaju rytmu.

## Open Questions

Decyzje produktowe, których PRD v2 nie rozstrzyga, a które plan musi podjąć albo zadać użytkowniczce:

1. **Wygląd i zasięg „pominiętego”.** Jak wygląda wiersz (etykieta, sekcja zwijana jak „Przeniesione na jutro” czy wiersz inline)? Czy pokazujemy tylko wczorajsze wystąpienie, czy każde z ostatnich N dni (po przerwie w logowaniu)? Czy pominięte można jeszcze odhaczyć?
2. **Los dnia źródłowego po przeniesieniu.** FR-019 mówi „to samo wystąpienie zmienia dzień”. Czy dzień źródłowy pokazuje wtedy „przeniesione”, czy jest pusty, i czy przeniesione w czasie dnia docelowego, a niezrobione, staje się „pominięte” następnego dnia?
3. **UI i reguły wyboru dnia docelowego.** Dowolna data, czy tylko „jutro” (dla zadań niepowtarzalnych istnieje wyłącznie „Na jutro”, bez wyboru daty — `today-list-actions/plan.md:40`)? Tylko do daty milestona włącznie? Co pokazać, gdy żaden dzień nie jest dozwolony (zadanie codzienne)? Czy przeniesione wystąpienie można przenieść ponownie?
4. **Przeniesione wystąpienie a „własne wystąpienie” dnia docelowego.** Czy przeniesione wystąpienie liczy się jako własne dla testu „dzień nie ma własnego wystąpienia” (np. dwa przeniesienia na ten sam dzień)?
5. **Relacja do S-10.** Zmiana rytmu działa od dziś, a historia (zrobione, pominięte, przeniesione) ma zostać (FR-020). Model danych S-09 powinien to z góry uwzględniać.
6. **Los przycisków S-05 dla rutyn.** Dziś „Na jutro” jest ukryte dla rutyn; po S-09 przeniesienie wystąpienia może zastąpić „Na jutro” jako akcja „Przenieś”.

Luki w badaniu (nie dotyczą zakresu pytań): nie czytałam osobiście kodu `src/lib/services/postgrest.ts`, `src/lib/api.ts`, testów pgTAP poza fragmentem o `'skipped'` ani polityk RLS dla `projects`/`milestones`/`tasks`; numery linii w `smoke.mjs` pochodzą z raportu agenta.
