<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Zarządzanie milestonami (CRUD)

- **Plan**: context/changes/milestone-crud/plan.md
- **Mode**: Deep (inline; Docker niedostępny)
- **Date**: 2026-10-14
- **Verdict**: REVISE → SOUND po poprawkach z triage
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
12/12 istniejących ścieżek ✓; 12/12 nowych ścieżek nie koliduje ✓ (w tym `[id].ts` obok katalogu `[id]/`); symbole `logError`, `formatDate`, `plural`, `ConfirmDialog.trigger`, `Field.required` ✓; kotwice file:line ✓; Progress↔Phase 18/18 ✓; brief↔plan ✓. Niezweryfikowane (Docker Desktop nie działał): składnia triggera `BEFORE UPDATE OF … WHEN (…)` (zostanie sprawdzona przez `db reset` i pgTAP w fazie 1) oraz `select("*, tasks(count)")` (plan oznacza to jako „do potwierdzenia w fazie 2").

## Findings

### F1 — Ponowne „zamknij" na zamkniętym milestonie omija regułę i nadpisuje datę

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, pkt 1 (trigger WHEN) oraz Phase 2, pkt 5 (`setMilestoneCompleted`)
- **Detail**: Trigger działa tylko przy przejściu `completed_at` z NULL na wartość; serwis „ustawia `completed_at` na bieżący czas", więc `PATCH {completed:true}` na już zamkniętym milestonie (podwójne kliknięcie, dwie karty, bezpośrednie API) po cichu nadpisze pierwotną datę zamknięcia i nie sprawdzi otwartych zadań. Analogicznie `{completed:false}` na otwartym milestonie zapisuje `null` i zmienia `updated_at`.
- **Fix A ⭐ Recommended**: serwis jest idempotentny: czyta bieżący stan (po `id` i `project_id`), brak → `not_found`, stan już zgodny z żądanym → `ok` bez zapisu
  - Strength: Zachowuje pierwotną datę zamknięcia, bez zmian w migracji; jedna linia kontraktu i jedna asercja w smoke.
  - Tradeoff: Dodatkowy odczyt przed zapisem; okno wyścigu między odczytem a zapisem (pomijalne przy jednym koncie).
  - Confidence: HIGH — wynika wprost z warunku WHEN i opisu serwisu.
  - Blind spot: Zachowanie dwóch równoległych żądań nie było testowane.
- **Fix B**: trigger sprawdza każdą zmianę niepustej `completed_at` (`WHEN (new.completed_at IS NOT NULL AND new.completed_at IS DISTINCT FROM old.completed_at)`)
  - Strength: Niezmiennik dotyczy też nadpisania daty i każdego zapisującego.
  - Tradeoff: Ponowne zamknięcie z otwartymi zadaniami dodanymi po zamknięciu (S-03) dostaje 422, a nadpisanie daty bez zadań nadal przechodzi.
  - Confidence: MED — nie ustalono, czy takie zachowanie jest pożądane w S-03.
  - Blind spot: Wpływ na S-05, które może zamykać z listy na dziś.
- **Decision**: FIXED (Fix A) — `setMilestoneCompleted` jest idempotentne (odczyt stanu, brak zapisu gdy zgodny, więc pierwotna `completed_at` zostaje i reguła nie jest omijana); Faza 1 odsyła do serwisu; smoke dostał kroki 7b i 8b

### F2 — Kolejność i nazwy kroków smoke między fazą 2 i 3 są niedookreślone

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, pkt 7 oraz Phase 3, pkt 7
- **Detail**: Faza 2 ustala kroki (1)–(11), w tym zmianę nazwy milestona A (5), zamknięcie (7), otwarcie (8) i usunięcie B (11). Faza 3 ma „wstawić" kroki strony po utworzeniu A i B, po PATCH i po ponownym otwarciu oraz asercję `bodyOrder` po nazwach, ale plan nie podaje nazw milestonów ani miejsc wstawienia: kroki strony muszą trafić przed zmianę nazwy (5) i usunięcie B (11), a nazwy nie mogą być podciągami siebie nawzajem.
- **Fix**: w fazie 2 nadać odrębne nazwy (np. „Alfa smoke", „Beta smoke", po zmianie „Gamma smoke") i zapisać docelową kolejność z miejscami stron: po (4) kolejność Alfa → Beta, po (7) „zamknięty" i „Otwórz ponownie", po (8) znów „Zamknij milestone".
- **Decision**: FIXED (Fix in plan) — odrębne nazwy „Alfa smoke”/„Beta smoke”/„Gamma smoke”, pełna kolejność kroków (1)–(11) z 7b i 8b oraz miejsca kroków stron P1–P3 zapisane w Fazie 2 i Fazie 3

### F3 — Edycja i usunięcie zamkniętego milestona nie są zapisane w planie

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach, Phase 3 pkt 5
- **Detail**: Wiersz zamkniętego milestona pokazuje te same akcje co otwarty, ale ani „Implementation Approach", ani „What We're NOT Doing" nie mówią, że edycja nazwy i daty zamkniętego milestona oraz jego usunięcie są dozwolone. Ustalone w rozmowie, nie zapisane w planie ani briefie.
- **Fix**: dopisać jedną linię do „Implementation Approach" i do tabeli decyzji w briefie.
- **Decision**: FIXED (Fix in plan) — decyzja o edycji i usunięciu zamkniętego milestona dopisana do Implementation Approach i do tabeli decyzji w briefie
