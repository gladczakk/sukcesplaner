<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Akcje na liście zadań na dziś

- **Plan**: context/changes/today-list-actions/plan.md
- **Scope**: Full plan (Phase 1–2 of 2)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

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
- `npm run smoke` na podglądzie produkcyjnym: PASS (wszystkie kroki, w tym D1–D7 i kroki wysp)
- `npm run build`: PASS w bramkach faz (brak zmian kodu od tamtego czasu)
- Pozycje ręczne 1.5, 1.6, 2.5–2.7: odhaczone po potwierdzeniu użytkownika; dowody w diffie spójne (komunikaty PL, `tomorrowInWarsaw`, sekcja `<details>`)

## Findings

### F1 — Powielony szkielet akcji w trzech wyspach

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/today/TodayTaskActions.tsx:20, src/components/today/RestoreDeferredButton.tsx:17, src/components/today/CloseMilestoneButton.tsx:15
- **Detail**: Ten sam ~30-liniowy blok (`pending`, `error`, `navigating`, `try/finally`, `switch` po statusie wyniku, `window.location.reload()`) jest w trzech komponentach; różni je wywołanie API i komunikat `notFound`. Każda poprawka obsługi wyniku (np. `unauthorized`) wymaga zmiany w trzech miejscach. Plan świadomie wskazał wzorzec `CloseMilestoneButton`, więc to nie jest odchylenie od planu, tylko dług utrzymaniowy.
- **Fix A ⭐ Recommended**: Zostawić jak jest i wrócić do ekstrakcji, gdy pojawi się czwarta wyspa lub trzeba będzie zmienić obsługę wyniku
  - Strength: Zero ryzyka regresji w działającym, przetestowanym smoke kodzie; skala MVP.
  - Tradeoff: Dług rośnie z każdą kolejną wyspą (S-06 doda następną).
  - Confidence: MED — zależy od tego, czy S-06 powieli wzorzec.
  - Blind spot: Nie sprawdzono, ile jeszcze wysp w repo ma ten sam blok.
- **Fix B**: Wydzielić hook `use-reload-action.ts` zwracający `{ pending, error, run(save, notFoundMessage) }` i przepiąć trzy wyspy
  - Strength: Jedno miejsce na obsługę wyniku i `navigating`; `run` z `TodayTaskActions` już jest jego uogólnieniem.
  - Tradeoff: Dotyka też `CloseMilestoneButton` z zarchiwizowanego S-04 i wymaga ponownego testu zepsucia wysp.
  - Confidence: HIGH — wzorzec jest identyczny w trzech plikach.
  - Blind spot: Wpływ na `MilestoneRowActions`/`TaskRowActions` w widoku projektu nie został sprawdzony.
- **Decision**: ACCEPTED-AS-IS (Fix A) — szkielet zostaje; ekstrakcja hooka przy czwartej wyspie (S-06)

### F2 — `<details>` zwija się po każdym przywróceniu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/today.astro:140, src/components/today/RestoreDeferredButton.tsx:28
- **Detail**: `window.location.reload()` odtwarza `<details>` jako zwinięte, więc przy kilku przeniesionych zadaniach trzeba rozwijać listę przed każdym „Przywróć na dziś". Decyzja o przeładowaniu strony była świadoma (plan), a skala MVP jest mała.
- **Fix**: Pominąć teraz; ewentualnie zapamiętać stan w `sessionStorage` w ramach polishu `/10x-ui`.
- **Decision**: FIXED (Fix now) — stan <details> zapamiętany w sessionStorage (skrypt w today.astro, atrybut data-deferred-details)

### F3 — Zamrożony prop `status` po błędzie sieci

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/today/TodayTaskActions.tsx:49
- **Detail**: Prop `status` jest zamrożony do przeładowania. Po błędzie sieci „Częściowo" nadal przełącza względem starego stanu; jeśli inna karta zmieniła status, przełączenie może zadziałać odwrotnie. Serwer pozostaje źródłem prawdy, wynik jest bezpieczny.
- **Fix**: Pominąć; wąski przypadek bez ryzyka dla danych.
- **Decision**: FIXED (Fix now) — po nieudanym przełączeniu „Częściowo” komunikat dostaje dopisek „Jeśli status się nie zgadza, odśwież stronę.” (bez przeładowania, żeby nie zgubić błędu)
