<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Ręczne dodanie zadania z listy na dziś

- **Plan**: context/changes/manual-task-add-from-list/plan.md
- **Scope**: Full plan (Phase 1 of 1)
- **Reviewed phases**: 1
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria (uruchomione w przeglądzie)

- Lint (`src`, `scripts/smoke.mjs`, `endOfLine: auto`): PASS
- `npx astro check`: PASS (0 errors, 0 warnings)
- `npm run smoke` na podglądzie produkcyjnym (kod z commitu 67db7cc): PASS (wszystkie kroki)
- `npm run build`: PASS w bramce fazy (brak zmian kodu od tamtego czasu)
- Pozycje ręczne 1.5–1.7: odhaczone po potwierdzeniu użytkownika; dowody w diffie spójne (selecty i reset formularza, podpowiedź `role="status"`, wyłączony przycisk z linkiem)

Odchylenie od planu w stosunku do zapisu: plan i plan-review twierdziły, że opcje milestonów nie trafiają do SSR HTML. Astro serializuje propsy wyspy do HTML, więc nazwy projektów i milestonów tam są; asercję smoke `bodyExcludes "Beta smoke"` zastąpiono `"Zamknij milestone Beta smoke"` (rozsądne, intencja zachowana).

## Findings

### F1 — Szkielet obsługi wyniku powielony w kolejnej wyspie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/today/AddTaskFromTodayDialog.tsx:78, src/components/projects/TaskFormDialog.tsx:73, src/components/today/{TodayTaskActions,RestoreDeferredButton,CloseMilestoneButton}.tsx
- **Detail**: Przegląd S-05 (F1) zaakceptował powielony szkielet (`pending`/`navigating`/`try-finally`/`switch` po wyniku/reload) z zastrzeżeniem „hook przy czwartej wyspie". Teraz w `today` są cztery wyspy z tym blokiem, a `AddTaskFromTodayDialog` dodatkowo powtarza ~40 linii `submit`, `focusFirstInvalid` i walidacji terminu względem milestona z `TaskFormDialog`. Wyspy akcji (trzy) mają ten sam kształt `run(save)`; dialogi formularzowe (dwa) mają inny, wspólny dla siebie kształt.
- **Fix A ⭐ Recommended**: Odłożyć ekstrakcję do osobnej zmiany po S-06 (np. refaktor `use-reload-action` dla trzech wysp akcji) zamiast mieszać ją z zamykanym slice'em
  - Strength: Slice S-06 jest przetestowany smoke i ręcznie; refaktor trzech archiwalnych wysp wymagałby ponownego testu zepsucia każdej.
  - Tradeoff: Dług rośnie o jedną kopię; trzeba o nim pamiętać (wpis w lekcji lub roadmapie).
  - Confidence: MED — dialogi i wyspy akcji różnią się kształtem, więc zakres wspólnego hooka nie jest oczywisty.
  - Blind spot: Nie sprawdzono, czy `TaskRowActions`/`MilestoneRowActions` w widoku projektu mają ten sam blok.
- **Fix B**: Wydzielić teraz `use-reload-action` (pending, error, `run(save, notFoundMessage)`) i przepiąć trzy wyspy akcji, dialogi zostawić
  - Strength: Jedno miejsce na obsługę wyniku, `run` z `TodayTaskActions` już jest jego uogólnieniem.
  - Tradeoff: Dotyka trzech zarchiwizowanych wysp i wymaga ponownego testu zepsucia; nie rozwiązuje duplikacji dialogów.
  - Confidence: HIGH — wzorzec jest identyczny w trzech plikach.
  - Blind spot: Wpływ na wyspy widoku projektu.
- **Decision**: ACCEPTED-AS-IS (Fix A) — ekstrakcja wspólnego hooka odłożona do osobnej zmiany po S-06 (trzy wyspy akcji; dialogi formularzowe mają inny kształt)

### F2 — Guard `readEmbeddedProject` jest zbędny

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/today.ts:10
- **Detail**: Guard (`Reflect.get`, `unknown`, tolerowanie tablicy) bronił się przed niepewnym typem osadzenia `projects(id, name)` po złożonym FK. Sonda w przeglądzie (`const typed: { id: string; name: string } = row.projects`, `astro check` bez błędów) potwierdza, że supabase-js typuje to jako obiekt, a smoke potwierdza, że osadzenie działa w runtime. ~20 linii obrony przed czymś, czego typ nie dopuszcza.
- **Fix**: Zastąpić guard bezpośrednim `row.projects.id` i `row.projects.name`; usunąć `readEmbeddedProject`, zachować grupowanie po `project_id`.
- **Decision**: FIXED (Fix now) — guard readEmbeddedProject usunięty, getTaskTargets czyta typowane row.projects.id/.name

### F3 — Asercja `bodyOrder` w kroku z danymi nie sprawdza już kolejności wiersza listy

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:292
- **Detail**: Krok „today page lists the open task of the nearest milestone" ma `bodyOrder: ["Smoke project", "Gamma smoke"]`. Po dodaniu wyspy obie nazwy występują najpierw w serializowanych propsach nagłówka (projekt przed milestonami), więc asercja przechodzi niezależnie od kolejności w wierszu listy i niczego już nie chroni.
- **Fix**: Zastąpić asercję kolejnością tekstów renderowanych tylko w wierszu, np. `bodyOrder: ["Zadanie smoke", "Zrobione: Zadanie smoke"]` (tytuł przed akcjami wiersza).
- **Decision**: FIXED (Fix now) — bodyOrder zastąpiony tekstami tylko z wiersza: Zadanie smoke przed Zrobione: Zadanie smoke

### F4 — Wpisana data zostaje po zmianie projektu lub milestona

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/today/AddTaskFromTodayDialog.tsx:62
- **Detail**: Zmiana projektu lub milestona czyści błąd daty, ale zostawia wpisaną datę; po przełączeniu na wcześniejszy milestone może ona przekraczać nowy `max`. `submit` łapie to komunikatem pod polem z fokusem, więc nic się nie zapisuje źle.
- **Fix**: Pominąć; zachowanie jest bezpieczne i zgodne z komunikatem walidacji.
- **Decision**: FIXED (Fix now) — zmiana projektu/milestona od razu sprawdza wpisaną datę względem nowego max (helper dueDateError, ten sam co w submit)
