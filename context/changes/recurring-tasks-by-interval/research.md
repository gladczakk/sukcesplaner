---
date: 2026-10-19T11:52:50+02:00
researcher: Claude (Sonnet 5.5) dla Karolina Jurowicz
git_commit: 543125be3b9c3b8a6f632d659caf8affd09e04e7
branch: master
repository: xDevs
topic: "Co w bazie kodu musi dotknąć S-07 (zadanie z rytmem „codziennie / co X dni” wraca na listę na dziś) i jakie ograniczenia z wcześniejszych zmian musi uszanować"
tags: [research, codebase, today-list, tasks, milestone-close, recurrence]
status: complete
last_updated: 2026-10-19
last_updated_by: Claude (Sonnet 5.5) dla Karolina Jurowicz
---

# Research: S-07 — zadanie z rytmem wraca na listę na dziś

**Date**: 2026-10-19T11:52:50+02:00
**Researcher**: Claude (Sonnet 5.5) dla Karolina Jurowicz
**Git Commit**: 543125be3b9c3b8a6f632d659caf8affd09e04e7
**Branch**: master
**Repository**: xDevs

## Research Question

Zmiana `recurring-tasks-by-interval` (S-07 w `context/foundation/roadmap.md`, wymagania FR-016 i FR-017 oraz US-02 z `context/foundation/prd-v2.md`): co w obecnej bazie kodu trzeba dotknąć, żeby zadanie z rytmem „codziennie” lub „co X dni” (X od 2 do 30) pojawiało się na liście na dziś od dnia dodania do daty milestona albo jego zamknięcia, także gdy milestone nie jest najbliższy, oraz żeby zadania powtarzalne nie blokowały zamknięcia milestona. Jakie decyzje i ograniczenia z wcześniejszych zmian (`context/archive/**`) ta zmiana musi uszanować.

Badanie jest tylko do odczytu; nie obejmuje projektowania rozwiązania ani decyzji produktowych.

## Summary

- **Lista na dziś ma jedno źródło prawdy w SQL.** Kwalifikację i sortowanie wykonuje funkcja `public.today_list(p_today date)` w `supabase/migrations/20261016120000_today_list.sql:31`. Dla każdego projektu bierze jeden najbliższy niezamknięty milestone (`nearest`, `:52-57`), z niego zadania ze statusem innym niż `done` (`open_tasks`, `:59-64`), i zwraca wiersze trzech rodzajów: `task`, `milestone` („do zamknięcia”) i `deferred`. Dla tej sprawdzonej ścieżki nie ma drugiego źródła pozycji listy, więc wystąpienia powtarzalne wymagają nowej gałęzi w tej funkcji albo osobnego zapytania.
- **Termin zadania na liście to wyłącznie jego własny `due_date`.** Sortowanie nie dziedziczy daty milestona (komentarz `today_list.sql:18-19`, kolejność `:116-123`). To różni się od brzmienia US-01 w PRD v1 („deadline własny lub milestona”) i od mojego opisu opcji przy pytaniu 4 w rozmowie; obowiązuje to, co robi kod.
- **Brak encji „wystąpienie”.** Model nie ma tabeli ani kolumn na rytm, punkt startu ani stan pojedynczego dnia (`tasks`, `supabase/migrations/20261009120000_create_core_domain_schema.sql:41-53`; wyszukiwanie „recur” w `src` i `supabase` nie dało trafień w sprawdzonym zakresie). PRD v2 wymaga stanu per dzień (zrobione / pominięte, „pominięte” widoczne następnego dnia, historia zostaje po wyłączeniu), więc plan musi rozstrzygnąć, czy wystąpienia są wierszami, czy wyliczane. To największa luka.
- **Zamknięcie milestona pilnują dwie reguły w bazie plus lista.** Okno zamknięcia blokuje `check_milestone_closable` (`20261014120000_milestone_close_rule.sql:12-40`, licznik `status <> 'done'` w `:21-24`), a niezrobione zadanie w zamkniętym milestonie blokuje `check_task_rules` (`20261015120000_task_rules.sql:48-51`). Lista wyznacza „milestone do zamknięcia” przez brak otwartych zadań (`today_list.sql:98-99`). Wyłączenie zadań powtarzalnych z blokady dotyka wszystkich trzech miejsc oraz kontraktu komunikatów błędów SQL↔TS.
- **Data „dziś” to data warszawska przekazywana jako parametr.** `todayInWarsaw()` (`src/lib/today.ts`), nigdy `current_date`. Rytm „co X dni liczone od dnia dodania” wymaga zapisanej daty kotwicy i różnicy dat po stronie SQL na `p_today`.
- **Formularze zadań są dwa i zduplikowane.** Rytm trzeba dodać w `TaskFormDialog.tsx` i `AddTaskFromTodayDialog.tsx`, bo oba wysyłają dane tą samą trasą API i tym samym schematem zod.
- **Weryfikacja:** pgTAP (uruchamiany ręcznie, CI go nie uruchamia) i `npm run smoke`; brak testów jednostkowych TS.

## Detailed Findings

### Lista na dziś (kwalifikacja, sortowanie, data)

- Funkcja `today_list(p_today date)` jest `strict`, `stable`, `security invoker`, z dostępem tylko dla `authenticated`; RLS ogranicza wynik do danych wywołującego (`today_list.sql:25-27`, uprawnienia na końcu pliku).
- `nearest`: `distinct on (project_id)` po niezamkniętych milestonach, kolejność `(due_date, seq)`; milestone po terminie nadal może być najbliższy (`today_list.sql:14-16`, `:52-57`).
- Trzy rodzaje wierszy: `task` (otwarte zadanie najbliższego milestona z `deferred_until` NULL albo ≤ `p_today`), `deferred` (`deferred_until > p_today`), `milestone` (najbliższy milestone bez otwartych zadań) (`today_list.sql:65-99`).
- Kolejność: `case kind` (task 0, milestone 1, deferred 2), potem `task_due_date asc nulls last`, data i `seq` milestona, `task_created_at`, `task_id` (`today_list.sql:116-123`). Zadanie przeterminowane (własny `due_date` wcześniejszy niż dziś) sortuje się nad zadaniem z terminem dzisiejszym, więc „na górę listy” dla wystąpień (FR-017) wymaga jawnej decyzji, np. nowego poziomu przed rodzajem `task`.
- Przepływ danych: `getToday` (`src/lib/services/today.ts`) wywołuje `supabase.rpc("today_list")` i rozdziela wiersze po `kind` na `TodayView {tasks, milestones, deferred}` (`src/types.ts`); nieznany `kind` jest tylko logowany. Strona `src/pages/today.astro` liczy datę raz na żądanie i renderuje listę, liczniki i wyspy React (wg raportu badania listy; strony i wysp nie czytano w całości).
- Dla „dziś” używana jest data Warsaw: `todayInWarsaw()` i `tomorrowInWarsaw()` (`src/lib/today.ts:3-20`), przekazywana do SQL jako parametr (komentarz `today_list.sql:22-24`).

### Przeniesienie na jutro (`deferred_until`)

- Kolumna `tasks.deferred_until date null` (`create_core_domain_schema.sql:48`). Trasa PATCH przyjmuje `deferred: "tomorrow" | null` i odrzuca jednoczesne `status` i `deferred` (`src/pages/api/projects/[id]/milestones/[milestoneId]/tasks/[taskId].ts`, wg raportu ok. `:70-80`; plik nie był czytany w całości). Każdy zapis statusu czyści `deferred_until` (`context/archive/2026-10-16-today-list-actions/plan-brief.md`).
- `deferred_until` jest jedną wartością na zadanie, więc nie nadaje się wprost do reguły FR-019 („przeniesienie tylko na dzień bez własnego wystąpienia”); to zakres S-09, ale S-07 musi nie psuć istniejącej ścieżki.

### Model zadania i ścieżka tworzenia/edycji

- Tabela `tasks`: `id`, `user_id`, `milestone_id`, `title` (1–200 znaków), `due_date date null`, `status` (`todo|partial|done`), `deferred_until date null`, `created_at`, `updated_at`, złożony klucz obcy `(milestone_id, user_id)` z kaskadowym usuwaniem (`create_core_domain_schema.sql:41-53`).
- Trigger `tasks_check_rules` odpala się „before insert or update of due_date, milestone_id, status” (`task_rules.sql:57-59`): nowa kolumna rytmu nie uruchamia go, dopóki nie zostanie dopisana do listy kolumn.
- RLS jest per operacja i niezależne od kolumn (`20261009120100_enable_core_domain_rls.sql`), więc nowa kolumna nie wymaga nowych polityk (wg raportu badania modelu; plik czytany częściowo).
- Ścieżka: `use-task-api.ts` → trasy `.../tasks/index.ts` (POST) i `.../tasks/[taskId].ts` (PUT/PATCH/DELETE) → `taskInputSchema` w `src/lib/validation/task.ts` (`TASK_FIELDS = ["title","due_date"]`) → serwis `src/lib/services/tasks.ts`, który wprost rozwija `TaskInput` do `insert`/`update`. Nowe pole zod przejdzie do bazy automatycznie, jeśli kolumna istnieje.
- Dwa formularze: `src/components/projects/TaskFormDialog.tsx` (tworzenie i edycja pod milestonem) i `src/components/today/AddTaskFromTodayDialog.tsx` (dodawanie z listy; ta sama trasa POST, brak osobnego API). Wspólne: `useTaskApi`, `taskInputSchema`, `flattenTaskErrors`; zduplikowane: stan `FormValues`, `submit()`, markup (wg raportu badania modelu; pliki nie były czytane w całości).
- Typy: `Task` w `src/types.ts` wynikają z `src/db/database.types.ts` (plik generowany; po zmianie schematu trzeba go wygenerować lub poprawić).

### Zamykanie milestona

- Zamknięcie (`completed_at` z NULL na wartość) uruchamia `check_milestone_closable`, które zlicza zadania `status <> 'done'` i przy ich istnieniu rzuca `check_violation` „Milestone nie moze zostac zamkniety: niezrobione zadania (N)” (`milestone_close_rule.sql:12-40`).
- `check_task_rules` odrzuca niezrobione zadanie w zamkniętym milestonie: komunikat „Zamkniety milestone nie moze miec niezrobionych zadan” (`task_rules.sql:48-51`). Obejmuje wstawienie zadania `todo`/`partial` do zamkniętego milestona, cofnięcie zadania `done` i przeniesienie niezrobionego zadania do zamkniętego milestona.
- Lista: milestone jest „do zamknięcia”, gdy najbliższy milestone nie ma otwartych zadań (`today_list.sql:98-99`); milestone bez żadnych zadań też się kwalifikuje.
- Kontrakt błędów: serwisy dopasowują komunikaty SQL po tekście i `error.code === "23514"` (`src/lib/services/milestones.ts` `translateError`, `parseOpenTaskCount`; `src/lib/services/tasks.ts`). Zmiana tekstu komunikatu w SQL wymaga zmiany w TS.
- Ponowne otwarcie ustawia `completed_at = null` bez kontroli w bazie (`milestones.ts` `setMilestoneCompleted`); TS nie liczy niezrobionych zadań (`listMilestones` zwraca tylko `task_count`).
- Wniosek o zmianach, gdy część zadań jest zwolniona z wymogu `done`: potrzebne zmiany w `check_milestone_closable`, w `check_task_rules` (czy niezrobione zadanie powtarzalne może istnieć w zamkniętym milestonie), w `today_list` (warunek „do zamknięcia”), nowa migracja odtwarzająca funkcje, typy i komunikaty; „zamknięcie kończy powtarzanie” najbezpieczniej realizować w tej samej transakcji (wyzwalacz lub RPC), bo `setMilestoneCompleted` wykonuje zwykły `update`.

### Data i strefa czasowa

- `todayInWarsaw()` zwraca `YYYY-MM-DD` przez `Intl.DateTimeFormat` z `Europe/Warsaw` (`src/lib/today.ts:3-15`); `tomorrowInWarsaw()` w `:20`. `created_at` jest `timestamptz`, więc rzutowanie go na datę w UTC byłoby błędne tuż po północy; dla rytmu „od dnia dodania” trzeba zapisać datę kotwicy i liczyć różnicę względem `p_today`.
- Smoke nie kontroluje daty „dziś”, więc poprawność logiki zależnej od dnia sprawdza się w pgTAP ze stałym `p_today` (wg `context/archive/2026-10-16-today-list-actions/plan-brief.md`, Open Risks, i raportu badania historii).

### Weryfikacja i konwencje

- pgTAP: `supabase/tests/database/core_domain_{schema,rls,milestone_close,task_rules,today_list}.test.sql`; uruchamiany `npx supabase test db`. CI (`.github/workflows/ci.yml`) uruchamia lint, `astro check`, build i smoke; nie uruchamia pgTAP (wg raportu badania historii; zawartości plików testów nie czytano).
- `npm run smoke` (`scripts/smoke.mjs`) sprawdza stronę `/today` po treści; `context/foundation/lessons.md:5-10` wymaga, by krok smoke dla strony z wyspą React sprawdzał treść wyspy i by po dodaniu kroku zrobić test zepsucia (`throw` w komponencie).
- `lessons.md:12-17`: przed `shadcn add` sprawdzić zależności rejestru i nie nadpisywać dostosowanego `button.tsx` (istotne, jeśli rytm dostanie nową kontrolkę z biblioteki).
- Nazewnictwo migracji `YYYYMMDDHHmmss_short_description.sql`, RLS per operacja (`CLAUDE.md`, sekcja Key conventions); stare migracje się nie edytuje.

## Code References

- `supabase/migrations/20261016120000_today_list.sql:31` — definicja `today_list(p_today date)`
- `supabase/migrations/20261016120000_today_list.sql:52-64` — `nearest` i `open_tasks`
- `supabase/migrations/20261016120000_today_list.sql:98-99` — „milestone do zamknięcia”
- `supabase/migrations/20261016120000_today_list.sql:116-123` — kolejność wyniku
- `supabase/migrations/20261014120000_milestone_close_rule.sql:12-40` — reguła zamknięcia, licznik w `:21-24`
- `supabase/migrations/20261015120000_task_rules.sql:48-51,57-59` — zamknięty milestone i wyzwalacz `tasks_check_rules`
- `supabase/migrations/20261009120000_create_core_domain_schema.sql:41-53` — tabela `tasks`
- `src/lib/today.ts:3-20` — data warszawska
- `src/lib/services/today.ts` — `getToday`, `getTaskTargets`
- `src/lib/services/tasks.ts`, `src/lib/services/milestones.ts` — zapisy i tłumaczenie błędów
- `src/lib/validation/task.ts` — `taskInputSchema`, `TASK_FIELDS`
- `src/components/projects/TaskFormDialog.tsx`, `src/components/today/AddTaskFromTodayDialog.tsx` — dwa formularze zadań
- `src/pages/today.astro` — strona listy

## Architecture Insights

- Kwalifikacja pozycji listy mieszka w SQL i jest testowana w pgTAP; prezentacja w TS bez runnera testów (`context/archive/2026-10-15-today-list-view/research.md`). Plan musi wybrać: rozszerzyć `today_list` (testowalne) albo liczyć wystąpienia w TS (tylko smoke).
- Niezmienniki biznesowe są egzekwowane wyzwalaczami w bazie, a serwisy TS tłumaczą ich komunikaty; zmiana reguły zamykania musi iść w parze ze zmianą komunikatów i ich parsowania.
- Strony są renderowane po stronie serwera z `try/catch` i `logError`; interakcje to wyspy React wywołujące istniejące trasy `/api/projects/...`; po sukcesie wyspy robią `window.location.reload()` (wg raportu badania historii).

## Historical Context (from prior changes)

- `context/archive/2026-10-15-today-list-view/research.md` — kwalifikacja w SQL, brak runnera testów TS (poparte: raport badania historii czytał plik w całości).
- `context/archive/2026-10-16-today-list-actions/plan-brief.md` — status `todo|partial|done`, `deferred_until` czyszczone przy zapisie statusu, drugi kształt PATCH `{deferred}`, zadanie `done` odrzucane przy przeniesieniu (poparte); ryzyko otwarte: poprawność `deferred_until` sprawdzana ręcznie przez psql (poparte).
- `context/archive/*/impl-review` (task-crud, today-list-view, today-list-actions, manual-task-add-from-list) — powtarzające się ustalenia: za słabe asercje smoke (`bodyEquals` zamiast `!== undefined`; test `bodyOrder` przechodził niezależnie od kolejności, bo Astro serializuje propsy wysp do HTML), zduplikowany szkielet wysp (odroczony hook „use-reload-action”), dostępność (`aria-disabled` zamiast `disabled`, `aria-label` na powtarzalnych linkach), „zamrożone” propsy wysp po błędzie sieci. Zakres przeczytania: pełne lub częściowe czytanie raportów, bez `today-list-view` od F5.
- Pozostałe wnioski historyczne oceniano osobno; stare liczności (np. 143/143 testów pgTAP) nie były ponownie weryfikowane w tym badaniu.

## Related Research

- `context/archive/2026-10-15-today-list-view/research.md`

## Open Questions

Luki i decyzje, które muszą zapaść w planie (nie są rozstrzygnięte tym badaniem):

1. **Model wystąpień.** Wiersze (materializowane) czy wyliczane na żądanie? FR-017/FR-011 i późniejsze S-09/S-10 wymagają stanu per dzień i historii; S-07 musi wybrać kształt, który tego nie zamyka.
2. **Zakres S-07 wobec S-09.** Według roadmapy S-07 obejmuje tylko pojawianie się na liście, a odhaczenie/pominięcie/przeniesienie to S-09. Co użytkownik widzi i może zrobić z wystąpieniem między S-07 a S-09 (istniejące akcje ustawiają `status = done`, co zakończyłoby zadanie)? Plan musi zdecydować: minimalne „zrobione” per wystąpienie w S-07 albo ukrycie akcji dla pozycji powtarzalnych.
3. **Pozycja „na górze”.** Przeterminowane zadania sortują się nad zadaniami z terminem dzisiejszym; wystąpienia z terminem dzisiejszym wymagają osobnego poziomu sortowania (np. przed rodzajem `task`).
4. **Granica daty milestona.** „Do daty milestona” — czy sama data milestona jest dniem wystąpienia? Lista uwzględnia milestony po terminie jako „najbliższe”.
5. **Zamknięcie i ponowne otwarcie.** Czy ponowne otwarcie milestona przywraca powtarzanie? Czy zadania powtarzalne mogą istnieć jako niezrobione w zamkniętym milestonie (`check_task_rules`)?
6. **Interakcja z `deferred_until`.** Co znaczy istniejące „przenieś na jutro” dla zadania powtarzalnego do czasu S-09.
7. **Rozjazdy w PRD v2.** Sekcja Current System Overview twierdzi, że ręczne dodawanie z listy jest niezaimplementowane, a S-06 jest zarchiwizowane jako zrobione; zakres FR-016 wymienia dni tygodnia, a roadmapa odkłada je do S-08.
8. **Wsparcie testowe.** Logika zależna od daty wymaga pgTAP ze stałym `p_today`; CI nie uruchamia pgTAP, więc bramką jest ręczne `npx supabase test db`. Zdalna baza wymaga ręcznego wypchnięcia nowej migracji (wg raportu badania historii).
