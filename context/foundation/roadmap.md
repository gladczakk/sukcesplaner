---
project: SukcesPlaner
version: 1
status: draft
created: 2026-09-24
updated: 2026-10-19
prd_version: 2
main_goal: low-complexity
top_blocker: decisions
milestone_id: recurring-tasks
milestone_seq: 2
milestone_status: open
---

# Roadmap: SukcesPlaner

> Derived from `context/foundation/prd-v2.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-2: Zadania powtarzalne w milestonie** — Status: open

- **Intent:** Dostarczyć możliwość nadania zadaniu rytmu (codziennie, co X dni, wybrane dni tygodnia), tak by rutynowe zadania same wracały na listę na dziś, bez psucia istniejących akcji na liście (odhaczenie, przeniesienie na jutro).
- **Source materials:** `context/foundation/prd-v2.md` (v2) — delta względem PRD v1.
- **Done when:** każde S-NN poniżej ma status `done`.
- **Scope anchors:** FR-016, FR-017, FR-019, FR-011 (zmieniony), FR-020, US-02 (FR-018 jest nice-to-have i został odłożony — patrz `## Parked`).

## Vision recap

Rutynowe zadania (np. pranie codziennie, retinol co drugi dzień, trening w wybrane dni tygodnia) trzeba dziś dodawać ręcznie za każdym razem, bo aplikacja nie potrafi sama przypominać zadania w ustalonym rytmie. Zmiana pozwala, by zadanie wracało na listę na dziś według rytmu, a zadania niepowtarzalne zachowują się dokładnie jak dotąd.

## North star

**S-07: Zadanie co X dni wraca na listę na dziś** — to najmniejszy kompletny przepływ, który dowodzi, że rutyna sama wraca na listę, bez dotykania istniejących akcji z listy, więc pasuje do celu `low-complexity`.

> „Gwiazda przewodnia" oznacza tu: najmniejszy kompletny wycinek, którego dostarczenie dowodzi głównej hipotezy zmiany — że zadanie z rytmem samo pojawia się na liście w odpowiednie dni. Umieszczona tak wcześnie, jak pozwalają zależności, bo reszta ma sens tylko wtedy, gdy to działa.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
| --- | --- | --- | --- | --- | --- |
| S-07 | recurring-tasks-by-interval | ustawić zadaniu rytm „codziennie" lub „co X dni" i zobaczyć je na liście na dziś w pasujące dni | Zakończony M-1 (zadania w milestonie, lista na dziś, ręczne dodawanie z listy) | FR-016, FR-017, US-02 | ready |
| S-08 | recurring-tasks-by-weekdays | ustawić zadaniu rytm „w wybrane dni tygodnia" i zobaczyć je na liście w te dni | S-07 | FR-016, FR-017, US-02 | proposed |
| S-09 | recurring-occurrence-actions | odhaczyć, pominąć lub przenieść wystąpienie zadania powtarzalnego według reguł (przeniesienie tylko na dzień bez własnego wystąpienia) | S-07 | FR-011, FR-019, US-02 | proposed |
| S-10 | recurring-task-edit-disable | zmienić rytm albo wyłączyć powtarzanie zadania bez utraty historii | S-07, S-08 | FR-020 | proposed |

## Baseline

What's already in place in the codebase as of `2026-10-19` (auto-researched).
Slices below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro + React; komponenty `src/components/{projects,today,ui}`, strony projektów i `today`.
- **Backend / API:** present — trasy API dla projektów, serwisy w `src/lib/services/` (milestones, tasks, today).
- **Data:** present — migracje w `supabase/migrations/` (schemat domenowy, RLS, reguły milestona i zadań, lista na dziś).
- **Auth:** present — pełny przepływ logowania (middleware, strony auth).
- **Deploy / infra:** present — Cloudflare, workflow CI (`.github/workflows/ci.yml`).
- **Observability:** partial — wewnętrzny `src/lib/log.ts`, bez zewnętrznego śledzenia błędów.

## Foundations

Brak. Stan bazowy pokrywa wszystkie warstwy potrzebne tej zmiany; model danych rytmu i generowanie wystąpień powstają wewnątrz pierwszego wycinka, który ich używa (S-07), zamiast osobnego Foundation.

## Slices

### S-07: Zadanie co X dni wraca na listę na dziś

- **Outcome:** user może ustawić zadaniu (przy dodawaniu z listy na dziś i w formularzu zadania pod milestonem) rytm „codziennie" lub „co X dni" (X od 2 do 30), a zadanie pojawia się na liście na dziś w pasujące dni, od dnia dodania do daty milestona albo jego zamknięcia (co nastąpi wcześniej), nawet gdy ten milestone nie jest najbliższy, i trafia na górę listy; zadania powtarzalne nie blokują zamknięcia milestona, a zadania bez rytmu działają bez zmian.
- **Change ID:** recurring-tasks-by-interval
- **PRD refs:** FR-016, FR-017, US-02
- **Prerequisites:** Zakończony M-1 (zadania w milestonie, lista na dziś, ręczne dodawanie z listy)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To gwiazda przewodnia i pierwszy kontakt z regułą wyjątku od „najbliższego milestona" oraz ze zmianą reguły zamykania milestona, więc błąd tutaj propaguje się na wszystkie kolejne wycinki; sekwencjonowany pierwszy, bo nie dotyka akcji z S-05.
- **Status:** ready

### S-08: Rytm w wybrane dni tygodnia

- **Outcome:** user może ustawić zadaniu rytm „w wybrane dni tygodnia" (np. trening w środy i piątki) i widzi je na liście w te dni, na tych samych zasadach co zadanie z rytmem co X dni.
- **Change ID:** recurring-tasks-by-weekdays
- **PRD refs:** FR-016, FR-017, US-02
- **Prerequisites:** S-07
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Drugi mechanizm rytmu obok „co X dni"; sekwencjonowany po S-07, żeby wspólna reguła wystąpień została sprawdzona na prostszym przypadku.
- **Status:** proposed

### S-09: Akcje na wystąpieniu zadania powtarzalnego

- **Outcome:** user może odhaczyć wystąpienie zadania powtarzalnego (zadanie wraca według rytmu), widzi niezrobione wystąpienie następnego dnia jako pominięte (potem znika; stan „częściowo zrobione" nie dotyczy zadań powtarzalnych), i może przenieść wystąpienie na inny dzień tylko wtedy, gdy tego dnia to zadanie nie ma własnego wystąpienia.
- **Change ID:** recurring-occurrence-actions
- **PRD refs:** FR-011, FR-019, US-02
- **Prerequisites:** S-07
- **Parallel with:** S-08, S-10
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zmienia istniejące akcje z S-05 (odhaczenie, przeniesienie na jutro), wskazane w shapingu jako najbardziej narażone na regresję; zadania niepowtarzalne muszą działać dokładnie jak dotąd.
- **Status:** proposed

### S-10: Zmiana rytmu i wyłączenie powtarzania

- **Outcome:** user może zmienić rytm albo wyłączyć powtarzanie istniejącego zadania; historia i dzisiejsze wystąpienie zostają, a zmiana działa od dziś.
- **Change ID:** recurring-task-edit-disable
- **PRD refs:** FR-020
- **Prerequisites:** S-07, S-08
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Edycja po fakcie musi zachować zrobione wystąpienia; sekwencjonowany po obu rytmach, żeby zmiana obejmowała każdy rodzaj rytmu.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| --- | --- | --- | --- | --- |
| S-07 | recurring-tasks-by-interval | Zadanie z rytmem „codziennie / co X dni" wraca na listę na dziś | yes | Run `/10x-plan recurring-tasks-by-interval` |
| S-08 | recurring-tasks-by-weekdays | Rytm w wybrane dni tygodnia | no | Czeka na S-07 |
| S-09 | recurring-occurrence-actions | Akcje na wystąpieniu zadania powtarzalnego (zrobione / pominięte / przeniesione) | no | Czeka na S-07 |
| S-10 | recurring-task-edit-disable | Zmiana rytmu i wyłączenie powtarzania | no | Czeka na S-07 i S-08 |

## Open Roadmap Questions

Brak — pięć pytań otwartych z PRD v2 rozstrzygnięto 2026-10-19 i wpisano do `prd-v2.md` (patrz jego sekcja Open Questions).

## Parked

- **FR-018: Oznaczenie powtarzalnego zadania na liście** — Why parked: nice-to-have w PRD v2; cel `low-complexity`, czysto widoczne oznaczenie bez zmiany logiki.
- **Rytm tygodniowy i miesięczny (co tydzień, co miesiąc)** — Why parked: PRD v2 § Non-Goals; do zastąpienia „co 7 dni" lub dniem tygodnia.
- **Licznik realizacji i statystyki regularności** — Why parked: PRD v2 § Non-Goals; statystyki pozostają poza zakresem.
- **Wpływ cyklu na zamknięcie milestona** — Why parked: PRD v2 § Non-Goals; milestone zamyka się według obecnej reguły.
- **Zadania bez milestona (powtarzalne i niepowtarzalne)** — Why parked: PRD v2 i PRD v1 § Non-Goals; każde zadanie musi należeć do milestona.
- **FR-013: Filtrowanie listy wg obszaru życia** — Why parked: nice-to-have w PRD v1; poza zakresem tego milestona.
- **FR-014: Kolorowe oznaczenie zadań wg projektu** — Why parked: nice-to-have w PRD v1; poza zakresem tego milestona.
- **FR-015: Wizualne oznaczenie przeterminowanych projektów/milestonów** — Why parked: nice-to-have w PRD v1; czysto kosmetyczne.
- **Udostępnianie lub delegowanie projektów/zadań innym osobom** — Why parked: PRD v1 § Non-Goals — płaski model jednego konta.
- **Natywna aplikacja mobilna** — Why parked: PRD v1 § Non-Goals — tylko aplikacja webowa.
- **Statystyki i raporty postępu** — Why parked: PRD v1 § Non-Goals — brak wykresów/podsumowań.
- **Podgląd list zadań dla kolejnych dni** — Why parked: PRD v1 § Non-Goals — tylko lista na dziś.
- **Subtaski w ramach zadania** — Why parked: PRD v1 § Non-Goals — tylko stany zrobione/częściowo zrobione.

## Milestone History

- **M-1: Pierwsza działająca pętla — od projektu do listy na dziś** (`first-usable-daily-list`) — closed 2026-10-19. Dostarczona kompletna pętla MVP: projekt z milestonami i zadaniami, lista na dziś z akcjami (zrobione / częściowo / przeniesienie na jutro) oraz ręczne dodawanie zadań z listy.

## Done

(Puste — `/10x-archive` dopisze tu wpis, gdy zmiana pasująca do Change ID zostanie zarchiwizowana.)
