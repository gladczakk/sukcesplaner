# Akcje na liście zadań na dziś — Plan Brief

> Full plan: `context/changes/today-list-actions/plan.md`

## What & Why

Dodajemy do listy `/today` akcje na zadaniu: **Zrobione**, **Częściowo** (przełącznik) i **Na jutro**, a przeniesione zadania pokazujemy w zwijanej liście z przyciskiem „Przywróć na dziś". To piąty slice roadmapy (S-05, FR-011, FR-012): lista z S-04 przestaje być tylko odczytem i staje się codziennym narzędziem pracy.

## Starting Point

Zmiana statusu zadania już istnieje (`PATCH` z `{status}`, S-03), a funkcja SQL `today_list` z S-04 ukrywa zadania z `deferred_until` w przyszłości i zwraca je jako wiersze `deferred`. Brakuje zapisu `deferred_until` (nic go nie ustawia), akcji na liście i widoczności przeniesionych zadań — dziś jest tylko liczba pod listą.

## Desired End State

Na `/today` przy każdym zadaniu są trzy zawsze widoczne przyciski z nazwą zadania w `aria-label`. Po akcji strona się przeładowuje: zrobione i przeniesione zadania znikają, `partial` dostaje „· częściowo", a ostatnie zrobione zadanie milestona zamienia się w wiersz „milestone do zamknięcia". Pod listą jest zwijana sekcja „Przeniesione na później: N" z datą powrotu i przyciskiem „Przywróć na dziś".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Interakcja po akcji | Przeładowanie strony | Serwer przelicza listę, podsumowanie i wiersz milestona, więc nie ma lokalnej synchronizacji stanu. | Plan |
| Przeniesione zadania | Zwijana lista pod licznikiem + „Przywróć na dziś" | Guardrail PRD: nic nie znika bez wiedzy użytkownika, a pomyłkę można cofnąć. | Plan |
| Zmiana statusu a przeniesienie | Każdy zapis statusu czyści `deferred_until` | Prosta niezmienna reguła: zadanie ruszone przez użytkownika wraca na listę. | Plan |
| „Częściowo" | Przełącznik `todo` ↔ `partial` (`aria-pressed`), „Zrobione" zawsze `done`, „Na jutro" bez zmiany statusu | Pomyłkę można cofnąć z listy; FR-012 przenosi niedokończone lub częściowe. | Plan |
| API przeniesienia | Drugi kształt ciała istniejącego `PATCH`: `{deferred: "tomorrow" \| null}` | Bez nowej trasy ani zmian w middleware; datę „jutro" liczy serwer w `Europe/Warsaw`. | Plan |
| Zrobione zadanie | Przeniesienie odrzucane (`422`) | Zrobione zadanie nie jest już na liście, więc przeniesienie nie ma sensu. | Plan |
| Baza | Bez migracji i zmian `today_list` | Funkcja już zwraca wiersze `deferred` z kompletem danych. | Plan |
| Przyciski | Zawsze widoczne, zwykłe `Button` z repo | Prostsze i dostępniejsze niż ukrywanie do najechania; polish później przez `/10x-ui`. | Plan |

## Scope

**In scope:**
- `tomorrowInWarsaw`, schemat `taskDeferralSchema`, serwis `setTaskDeferral`, czyszczenie przeniesienia przy zmianie statusu, drugi kształt `PATCH`
- Lista przeniesionych w `getToday` (`TodayView.deferred`), hook `setTaskDeferral`
- Wyspy `TodayTaskActions` i `RestoreDeferredButton`, zwijana sekcja w `today.astro`, smoke (API i strona) z testem zepsucia

**Out of scope:**
- Animacja znikania, akcje widoczne po najechaniu, `TaskCheck` z design systemu
- Wskaźnik przeniesienia w widoku projektu, cofanie „Zrobione" z listy, edycja/usuwanie z listy
- Dodawanie zadań z listy (S-06), filtry, FR-015, wybór daty przeniesienia

## Architecture / Approach

Backend → UI. `PATCH` zadania rozróżnia ciało po kluczu: `status` (jak dotąd, teraz z czyszczeniem `deferred_until`) albo `deferred` (`"tomorrow"` → serwer zapisuje jutrzejszą datę z Warszawy, `null` → czyści; zrobione zadanie → 422). `getToday` zwraca listę przeniesionych zamiast samego licznika. Strona `/today` renderuje akcje wiersza (wyspa `TodayTaskActions`) i zwijane `<details>` z `RestoreDeferredButton`; po sukcesie przeładowanie strony.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend | Przeniesienie i czyszczenie w API, lista przeniesionych w `getToday`, smoke API | Rozdzielenie dwóch kształtów `PATCH`; data „jutro" musi być w tej samej strefie co „dziś" |
| 2. UI na `/today` | Wyspy akcji i przywracania, zwijana sekcja, smoke z asercją na treść wysp | Błąd wyspy znika po cichu — asercja na tekst wysp i test zepsucia; układ przycisków na 390 px |

**Prerequisites:** działający Docker i lokalny Supabase (`.env`/`.dev.vars`), S-04 zarchiwizowane (jest).
**Estimated effort:** ~2 sesje po godzinach w 2 fazach.

## Open Risks & Assumptions

- Pięć migracji (z F-01, S-02, S-03 i S-04) nadal musi trafić na zdalny projekt razem (ręczny `db push`); S-05 nie dodaje migracji.
- Zmiana statusu w widoku projektu cicho czyści przeniesienie (bez wskaźnika) — świadome, do dopracowania w `/10x-ui`.
- Przyciski są zawsze widoczne, więc wiersz jest wyższy niż w design systemie; polish wizualny później.
- Smoke nie kontroluje daty „dziś": przeniesienie sprawdza obecność `deferred_until`, a poprawność dnia „jutro" tylko ręcznie (psql).

## Success Criteria (Summary)

- Użytkownik oznacza zadanie jako zrobione lub częściowe i przenosi je na jutro bezpośrednio z listy „Dziś", a przeniesione zadania są widoczne i można je przywrócić.
- Zmiana statusu czyści przeniesienie, przeniesienie zrobionego zadania jest odrzucane, a ostatnie zrobione zadanie milestona zamienia się w wiersz „milestone do zamknięcia".
- Lint zmienionych plików, `astro check`, build i rozszerzony smoke przechodzą (w tym asercje na tekst wysp i test zepsucia).
