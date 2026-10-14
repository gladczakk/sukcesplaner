---
project: SukcesPlaner
version: 1
status: draft
created: 2026-09-24
updated: 2026-10-14
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: first-usable-daily-list
milestone_seq: 1
milestone_status: open
---

# Roadmap: SukcesPlaner

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Pierwsza działająca pętla — od projektu do listy na dziś** — Status: open

- **Intent:** Dostarczyć kompletną, wertykalną pętlę MVP — użytkownik zakłada projekt z milestonami i zadaniami, a produkt sam wylicza, co zrobić dziś — dowodząc głównej hipotezy Vision przed twardym terminem 2026-11-04.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** każde F-NN i S-NN poniżej ma status `done`.
- **Scope anchors:** FR-001 do FR-012, US-01 (FR-013, FR-014, FR-015 są nice-to-have i zostały odłożone — patrz `## Parked`).

## Vision recap

Osoby żonglujące kilkoma równoległymi, długoterminowymi projektami z różnych obszarów życia (dom, sport, praca) rozpraszają śledzenie zadań i terminów pomiędzy wieloma narzędziami, a terminy kluczowych kamieni milowych bywają przeoczone. SukcesPlaner łączy te obszary w jednym miejscu i sam wylicza, co należy zrobić danego dnia, na podstawie milestonów, deadline'ów i zadań — bez ręcznego planowania dnia.

## North star

**S-04: Automatycznie generowana lista zadań na dziś** — to jedyna sformułowana historyjka użytkownika (US-01) w PRD i sedno propozycji wartości produktu.

> "Gwiazda przewodnia" oznacza tu: najmniejszy kompletny wycinek, którego dostarczenie dowodzi głównej hipotezy produktu — że jedno miejsce może automatycznie połączyć różne obszary życia w codzienną listę do zrobienia, bez ręcznego planowania. Umieszczona tak wcześnie, jak pozwalają jej zależności danych (S-01–S-03), bo reszta funkcji ma sens tylko wtedy, gdy to działa.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | core-domain-schema | (foundation) tabele projects/milestones/tasks + RLS istnieją w Supabase | — | FR-003, FR-005, Access Control | done |
| S-01 | project-crud | tworzyć/edytować/usuwać projekt (nazwa, termin, opis, obszar życia) | F-01, istniejący przepływ logowania (baseline: present) | FR-001, FR-002, FR-003 | in-progress |
| S-02 | milestone-crud | dodawać/edytować/usuwać milestony projektu z obowiązkową datą | S-01 | FR-004, FR-005 | proposed |
| S-03 | task-crud | dodawać/edytować/usuwać zadania w ramach milestona | S-02 | FR-006, FR-007 | proposed |
| S-04 | today-list-view | zobaczyć automatycznie wygenerowaną listę zadań na dziś ze wszystkich projektów | S-01, S-02, S-03 | US-01, FR-009, FR-010 | proposed |
| S-05 | today-list-actions | oznaczyć zadanie jako zrobione/częściowo zrobione i przenieść na jutro | S-04 | FR-011, FR-012 | proposed |
| S-06 | manual-task-add-from-list | ręcznie dodać zadanie z poziomu listy na dziś | S-04 | FR-008 | proposed |

## Baseline

Co już jest w kodzie na dzień `2026-09-24` (auto-zbadane + potwierdzone przez użytkownika).
Foundations poniżej zakładają, że to jest na miejscu i NIE odtwarzają tego od nowa.

- **Frontend:** partial — szkielet Astro (`src/layouts/Layout.astro`, `src/components/Topbar.astro`, `Banner.astro`, `Welcome.astro`) + jeden komponent shadcn (`src/components/ui/button.tsx`); brak ekranów domenowych (projekty/milestony/zadania/lista na dziś).
- **Backend / API:** partial — wyłącznie trasy auth (`src/pages/api/auth/{signin,signup,signout}.ts`); brak API dla projektów/milestonów/zadań.
- **Data:** absent — `supabase/migrations/` puste, brak `src/types.ts`.
- **Auth:** present — pełny przepływ (`src/middleware.ts`, `src/lib/supabase.ts`, strony `signin`/`signup`/`confirm-email`, chroniony `dashboard.astro`).
- **Deploy / infra:** present, per `tech-stack.md` + `infrastructure.md` — Cloudflare Workers, `wrangler.jsonc` już wdrożony w scaffoldzie, zero migracji potrzebne.
- **Observability:** absent — brak biblioteki logowania/śledzenia błędów w zależnościach.

## Foundations

### F-01: Domenowy schemat danych (projects / milestones / tasks)

- **Outcome:** (foundation) tabele `projects`, `milestones`, `tasks` istnieją w Supabase Postgres z politykami RLS (jedno konto = jeden prywatny zestaw danych), kaskadowym usuwaniem (projekt → milestony → zadania; milestone → zadania) i ograniczeniem, że data milestona nie może wykraczać poza termin projektu.
- **Change ID:** core-domain-schema
- **PRD refs:** FR-003, FR-005, Access Control
- **Unlocks:** S-01, S-02, S-03
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schemat i reguły kaskadowego usuwania muszą być poprawne od razu — błąd tutaj propaguje się do każdego wycinka, który go konsumuje. Sekwencjonowany jako pierwszy, zanim jakikolwiek CRUD ruszy.
- **Status:** done

## Slices

### S-01: Zarządzanie projektem

- **Outcome:** user może utworzyć, edytować i usunąć projekt (nazwa, termin, opcjonalny opis, obszar życia); usunięcie projektu z milestonami/zadaniami wymaga potwierdzenia i kasuje je kaskadowo.
- **Change ID:** project-crud
- **PRD refs:** FR-001, FR-002, FR-003
- **Prerequisites:** F-01, istniejący przepływ logowania (baseline: present, bez pracy Foundation)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Musi powstać przed czymkolwiek innym — milestony i zadania wymagają istniejącego projektu; opóźnienie tutaj opóźnia cały łańcuch.
- **Status:** in-progress

### S-02: Zarządzanie milestonami

- **Outcome:** user może dodać do projektu milestony z obowiązkową datą (uporządkowane wg dat, duplikaty dopuszczalne), edytować je i usuwać; usunięcie milestona z zadaniami wymaga potwierdzenia i kasuje je kaskadowo; data milestona jest walidowana względem terminu projektu (FR-003).
- **Change ID:** milestone-crud
- **PRD refs:** FR-004, FR-005
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Walidacja daty względem projektu i kaskadowe usuwanie muszą być spójne z regułą z S-01 (FR-003) — błąd tutaj przenosi się na listę na dziś (S-04).
- **Status:** proposed

### S-03: Zarządzanie zadaniami

- **Outcome:** user może dodać do milestona zadania (opcjonalnie z własnym deadline'em), edytować je i usuwać.
- **Change ID:** task-crud
- **PRD refs:** FR-006, FR-007
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Musi istnieć, zanim jakikolwiek stan zadania (zrobione/częściowo/przeniesione) będzie miał co reprezentować na liście na dziś.
- **Status:** proposed

### S-04: Lista zadań na dziś

- **Outcome:** user widzi automatycznie wygenerowaną listę zadań na dziś — wszystkie niedokończone zadania z najbliższego, jeszcze niezamkniętego milestona każdego projektu, posortowane od najbliższego terminu do najdalszego (zadania bez terminu na końcu); gdy wszystkie zadania milestona są ukończone, na liście pojawia się sam milestone jako ostatni krok do zamknięcia.
- **Change ID:** today-list-view
- **PRD refs:** US-01, FR-009, FR-010
- **Prerequisites:** S-01, S-02, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To jest gwiazda przewodnia — reguła kwalifikacji z Business Logic musi być poprawna od razu, bo na niej opiera się cała propozycja wartości produktu. Sekwencjonowana najwcześniej, jak pozwalają jej zależności od realnych danych.
- **Status:** proposed

### S-05: Działania na liście na dziś

- **Outcome:** user może oznaczyć zadanie na liście na dziś jako zrobione lub częściowo zrobione, oraz przenieść niedokończone/częściowo zrobione zadanie na jutro.
- **Change ID:** today-list-actions
- **PRD refs:** FR-011, FR-012
- **Prerequisites:** S-04
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zależy od istnienia widoku listy na dziś (S-04); przeniesienie na jutro musi respektować regułę kwalifikacji, żeby zadanie nie zniknęło bez wiedzy użytkownika (guardrail PRD).
- **Status:** proposed

### S-06: Ręczne dodanie zadania z listy

- **Outcome:** user może ręcznie dodać nowe zadanie bezpośrednio z listy na dziś, wybierając projekt i milestone, do którego zadanie ma należeć.
- **Change ID:** manual-task-add-from-list
- **PRD refs:** FR-008
- **Prerequisites:** S-04
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Mała, samodzielna funkcja — może być budowana równolegle z S-05, bo obie tylko konsumują widok z S-04 bez wzajemnej zależności.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| --- | --- | --- | --- | --- |
| F-01 | core-domain-schema | Domenowy schemat danych: projects / milestones / tasks + RLS | yes | Run `/10x-plan core-domain-schema` |
| S-01 | project-crud | Zarządzanie projektem (create/edit/delete) | no | Czeka na F-01 |
| S-02 | milestone-crud | Zarządzanie milestonami (create/edit/delete) | no | Czeka na S-01 |
| S-03 | task-crud | Zarządzanie zadaniami (create/edit/delete) | no | Czeka na S-02 |
| S-04 | today-list-view | Automatycznie generowana lista zadań na dziś | no | Czeka na S-01, S-02, S-03 — gwiazda przewodnia |
| S-05 | today-list-actions | Akcje na liście na dziś: zrobione / częściowo / przeniesienie na jutro | no | Czeka na S-04 |
| S-06 | manual-task-add-from-list | Ręczne dodanie zadania z listy na dziś | no | Czeka na S-04 |

## Open Roadmap Questions

Brak — wszystkie pierwotne pytania PRD zostały rozstrzygnięte przed wygenerowaniem tej mapy drogowej (patrz `prd.md` § Open Questions), a wywiad z Kroku 5 nie ujawnił nowych pytań przekrojowych.

## Parked

- **FR-013: Filtrowanie listy zadań/projektów wg obszaru życia** — Why parked: priorytet nice-to-have w PRD; odłożone, aby dotrzymać sztywnego terminu 2026-11-04 (main_goal: speed).
- **FR-014: Kolorowe oznaczenie zadań wg projektu** — Why parked: priorytet nice-to-have w PRD; odłożone z tego samego powodu co FR-013.
- **FR-015: Wizualne oznaczenie przeterminowanych projektów/milestonów** — Why parked: priorytet nice-to-have w PRD; czysto kosmetyczne oznaczenie bez zmiany logiki kwalifikacji.
- **Zadania powtarzalne i projekty typu "rutyna"** — Why parked: PRD § Non-Goals — MVP nie obsługuje powtarzalności.
- **Udostępnianie lub delegowanie projektów/zadań innym osobom** — Why parked: PRD § Non-Goals — płaski model jednego konta.
- **Zadania wolnostojące (bez milestona)** — Why parked: PRD § Non-Goals — każde zadanie musi należeć do milestona.
- **Natywna aplikacja mobilna** — Why parked: PRD § Non-Goals — tylko aplikacja webowa.
- **Statystyki i raporty postępu** — Why parked: PRD § Non-Goals — brak wykresów/podsumowań w MVP.
- **Podgląd list zadań dla kolejnych dni** — Why parked: PRD § Non-Goals — tylko lista na dziś.
- **Subtaski w ramach zadania** — Why parked: PRD § Non-Goals — tylko stany zrobione/częściowo zrobione.

## Milestone History

(Puste — to pierwszy kamień milowy tego projektu.)

## Done

- **F-01: (foundation) tabele `projects`, `milestones`, `tasks` istnieją w Supabase Postgres z politykami RLS (jedno konto = jeden prywatny zestaw danych), kaskadowym usuwaniem (projekt → milestony → zadania; milestone → zadania) i ograniczeniem, że data milestona nie może wykraczać poza termin projektu.** — Archived 2026-10-14 → `context/archive/2026-10-09-core-domain-schema/`. Lesson: —.

