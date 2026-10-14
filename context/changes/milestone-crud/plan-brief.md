# Zarządzanie milestonami (CRUD) — Plan Brief

> Full plan: `context/changes/milestone-crud/plan.md`

## What & Why

Dodajemy do widoku projektu zarządzanie milestonami: dodawanie z obowiązkową datą, edycję, usuwanie z potwierdzeniem i licznikiem zadań oraz zamykanie i ponowne otwieranie. To drugi slice roadmapy (S-02, FR-004/FR-005) i fundament pod zadania (S-03) oraz listę na dziś (S-04), która opiera się na „najbliższym niezamkniętym milestonie".

## Starting Point

Baza ma tabelę `milestones` (z `completed_at` i `seq`), kaskady, RLS i trigger daty względem terminu projektu, a S-01 dostarczył wzorce: serwis, trasy JSON, hook, dialogi i smoke. W widoku projektu jest tylko placeholder „Milestony pojawią się tutaj wkrótce.", a zamykanie milestona nie ma żadnej reguły ani UI.

## Desired End State

W `/projects/[id]` użytkownik widzi listę milestonów wg daty (remis wg kolejności utworzenia), dodaje i edytuje je w dialogu, usuwa po potwierdzeniu i zamyka lub otwiera ponownie. Data milestona nie może przekroczyć terminu projektu, a zamknięcie milestona z niezrobionymi zadaniami odrzuca baza, z komunikatem po polsku przy akcji.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zamykanie milestona | Akcja „Zamknij milestone"/„Otwórz ponownie" w S-02 (`completed_at`) | S-04 potrzebuje danych, a żaden slice nie opisuje tej akcji. | Plan |
| Zamknięcie z otwartymi zadaniami | Zablokowane, dopóki wszystkie zadania nie są `done` | Chroni guardrail PRD (zadania nie znikają z listy na dziś bez wiedzy użytkownika). | Plan |
| Gdzie reguła zamykania | Trigger w bazie (nowa migracja) + test pgTAP | Spójne z regułą daty i niemożliwe do obejścia przez S-05 ani psql. | Plan |
| Ponowne zamknięcie/otwarcie | Idempotentne w serwisie (bez zapisu, gdy stan już zgodny) | Trigger sprawdza tylko przejście NULL → wartość, więc inaczej powtórne zamknięcie nadpisałoby datę i omijało regułę. | Plan review |
| Zamknięty milestone | Edycja i usunięcie dozwolone | Te same akcje co przy otwartym, z „Otwórz ponownie" zamiast „Zamknij milestone". | Plan |
| Zakres listy | Prosta lista z rombem, datą, licznikiem zadań i akcjami | Zadań jeszcze nie ma, a pełna oś czasu byłaby do przeróbki w S-03. | Plan |
| Trasy | `POST /api/projects/[id]/milestones`, `PUT`/`PATCH`/`DELETE …/[milestoneId]` | Prefiks `/api/projects` jest już chroniony, bez zmian w middleware. | Plan |
| Data a termin projektu | `max` w polu daty + sprawdzenie w formularzu + trigger w bazie | UX zapobiega błędowi, baza pozostaje autorytetem. | Plan |
| Usuwanie | Zawsze z potwierdzeniem i liczbą zadań | Jedna ścieżka UI, jak przy projekcie. | Plan |
| Wspólny kod | Wspólne pola walidacji, `postgrest.ts` i `api-client.ts` | Unika kopiowania reguł i pomocników z S-01. | Plan |
| Data zamknięcia | Strefa `Europe/Warsaw` (`formatTimestamp`) | Dzień nie przesuwa się w nocy lokalnie. | Plan |

## Scope

**In scope:**
- Migracja z triggerem zamykania i test pgTAP
- Wspólne reguły walidacji, serwis milestonów, trzy trasy JSON, smoke dla API
- Hook, dialogi (formularz, usuwanie), akcje wiersza, sekcja „Milestony" w `/projects/[id]`, smoke dla strony

**Out of scope:**
- UI zadań (S-03), lista na dziś (S-04/S-05), opis milestona, przenoszenie między projektami
- FR-015, pasek postępu, oś czasu, karty milestonów
- `supabase db push` na zdalny projekt (trzy migracje razem, ręcznie)

## Architecture / Approach

Baza → backend → UI. Trigger `milestones_check_closable` pilnuje niezmiennika zamknięcia. Serwis `src/lib/services/milestones.ts` robi listę z licznikami zadań w jednym zapytaniu, CRUD i zamknięcie, tłumacząc błędy Postgresa po komunikacie (przypiętym testem pgTAP). Trasy pod `/api/projects/[id]/milestones` walidują zod i zwracają JSON. W widoku jedna wyspa na wiersz (`MilestoneRowActions`) zbiera edycję, zamknięcie i usunięcie, a dialogi używają `trigger asChild` i blokady po sukcesie.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguła w bazie | Migracja z triggerem zamykania + testy pgTAP | Trigger zależny od RLS i statusów zadań musi działać dla roli `authenticated` |
| 2. Backend | Walidacja, serwis, trasy, smoke dla API (z regułą daty przez aplikację) | Komunikaty triggerów są kontraktem — rozjazd zepsuje tłumaczenie błędów |
| 3. UI | Hook, dialogi, lista w widoku projektu, smoke strony | Wydzielenie wspólnego klienta może zepsuć istniejące dialogi projektu |

**Prerequisites:** działający Docker i lokalny Supabase (`.env`/`.dev.vars`), S-01 i F-01 zarchiwizowane (są).
**Estimated effort:** ~3 sesje po godzinach w 3 fazach (najwięcej w fazie 3).

## Open Risks & Assumptions

- Blokadę zamknięcia i liczniki usuwania da się zobaczyć tylko na zadaniach wstawionych przez psql, bo UI zadań dochodzi w S-03.
- Trzecia migracja musi trafić na zdalny projekt razem z poprzednimi (ręczny `db push`).
- Wydzielenie `api-client.ts` dotyka działającego hooka projektów; regresja sprawdzana ręcznie (brak runnera).
- Założenie: `select("*, tasks(count)")` zwraca licznik w jednym zapytaniu (osadzenie `milestones(count)` zaobserwowano w S-01) — do potwierdzenia w fazie 2.
- Tłumaczenie błędów opiera się na tekście komunikatów triggerów (przypięte testem pgTAP).

## Success Criteria (Summary)

- Użytkownik dodaje, edytuje, zamyka, otwiera i usuwa milestone w widoku projektu, a milestony z tą samą datą są w kolejności utworzenia.
- Data milestona nigdy nie przekracza terminu projektu, a milestone z niezrobionymi zadaniami nie da się zamknąć (komunikat z liczbą).
- `supabase test db`, lint zmienionych plików, `astro check`, build i rozszerzony smoke przechodzą.
