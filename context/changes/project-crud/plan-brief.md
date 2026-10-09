# Zarządzanie projektem (CRUD) — Plan Brief

> Full plan: `context/changes/project-crud/plan.md`
> Research: `context/changes/project-crud/research.md`

## What & Why

Dodajemy pierwszą warstwę aplikacyjną SukcesPlaner nad gotową bazą: użytkownik tworzy, edytuje i usuwa projekt (nazwa, termin, opcjonalny opis, obszar życia), a usunięcie wymaga potwierdzenia z liczbą milestonów i zadań, które znikną. To pierwszy slice roadmapy (S-01) z interfejsem i od niego zależą milestony, zadania i lista na dziś.

## Starting Point

Baza ma tabele, RLS, kaskady i trigger walidujący termin (zmiana `core-domain-schema`), a w kodzie są typy `Project` i typowany klient. Brakuje stron i tras API dla projektów, `zod`, komponentów formularza i dialogu, a `button.tsx` jest stockowy i niezgodny z design systemem. Istniejące strony (auth, dashboard) używają starych literałów kolorów i nie są wzorem stylu.

## Desired End State

Po zalogowaniu użytkownik trafia na `/projects`, widzi swoje projekty posortowane po terminie, dodaje projekt w dialogu, wchodzi w `/projects/[id]`, edytuje go i usuwa po potwierdzeniu. Niezalogowany jest odsyłany do logowania (API zwraca 401 JSON), błędy walidacji i reguły dat pojawiają się po polsku przy polach.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Formularz i transport | Dialog (React) + fetch JSON do `POST/PUT/DELETE /api/projects` | Zgodne z design systemem, a ConfirmDialog i tak wymaga prymitywów Radix. | Plan |
| Zakres tras | Lista `/projects` + minimalny widok `/projects/[id]` | Referencja widoku istnieje, a S-02 dokłada milestony do gotowego widoku. | Plan |
| Powłoka | Minimalny nagłówek (`AppLayout`) + redirect po zalogowaniu na `/projects` | Daje punkt wejścia bez budowy sidebaru/tabbaru, które potrzebne są dopiero przy S-04. | Plan |
| Obszar życia | Edytowalny | Jeden formularz dla tworzenia i edycji, baza to dopuszcza. | Plan |
| Usuwanie | Zawsze z potwierdzeniem i licznikami (także pusty projekt) | Jedna ścieżka UI zgodna z design systemem. | Plan |
| Komponenty | Przebudowa `button.tsx` do kontraktu + shadcn `dialog`, `alert-dialog`, `input`, `textarea` | Nowe widoki od razu zgodne z design systemem, bez drugiego Buttona. | Plan |
| Pole obszaru | Natywny `<select>` na tokenach | Brak dodatkowej zależności i dobre działanie na telefonie. | Plan |
| Walidacja | `zod` jako bezpośrednia zależność; `description` do 2000 znaków, terminy w przeszłości dozwolone | Wymóg `CLAUDE.md`; limit wybrany przez plan, bo PRD i baza go nie podają. | Plan |
| Błędy | 422 z `fieldErrors`; `23514` o terminie rozpoznawany po komunikacie triggera, przypięty testem pgTAP | CHECK i trigger mają ten sam kod, więc komunikat jest kontraktem z bazą. | Research |
| Ochrona CSRF tras JSON | Wymóg `Content-Type: application/json` (415 inaczej) | Astro `checkOrigin` nie obejmuje JSON. | Research |
| Kolor projektu | Poza zakresem | Tabela nie ma kolumny, FR-014 jest odłożony. | Research |

## Scope

**In scope:**
- `zod`, schematy walidacji, serwis projektów, ochrona tras, trzy trasy JSON
- Button i komponenty UI zgodne z design systemem, `AppLayout`, helpery polskich dat i liczb mnogich
- Strony `/projects`, `/projects/[id]`, dialogi dodawania/edycji/usuwania, redirect po zalogowaniu
- Rozszerzony smoke i asercja komunikatu triggera w pgTAP

**Out of scope:**
- Milestony i zadania w UI (S-02, S-03), kolor projektu, FR-013/014/015, pełna nawigacja
- Restyling auth, Topbara, dashboardu i Welcome
- `supabase db push`, runner testów, naprawa `npm run lint` na Windowsie

## Architecture / Approach

Wzorzec baza → serwis → API → UI. Serwis `src/lib/services/projects.ts` zamyka dostęp do tabeli i tłumaczenie błędów Postgresa, trasy `src/pages/api/projects/*` walidują zod i zwracają JSON, middleware zwraca 401 dla API i redirect dla stron. Strony Astro renderują dane po stronie serwera (w tym liczniki do potwierdzenia usunięcia), a dialogi to wyspy React wołające API przez hook `use-project-api`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend | `zod`, walidacja, serwis, ochrona tras, trasy JSON, smoke i pgTAP dla API | Błędne tłumaczenie błędu triggera daty (nieprzetestowane end-to-end do S-02) |
| 2. Fundament UI | Button zgodny z kontraktem, dialogi, pola, `ConfirmDialog`, helpery, `AppLayout`, smoke dla stron auth | Zmiana Buttona psuje wygląd formularzy auth lub nadpisanie `button.tsx` przez CLI shadcn |
| 3. Strony i wyspy | `/projects`, `/projects/[id]`, dialogi, redirect po zalogowaniu | Hydracja dialogów Radix w Astro i zgodność z design systemem bez referencji dla formularzy |

**Prerequisites:** działający Docker i lokalny Supabase (`.env`/`.dev.vars` z kluczami), obie migracje `core-domain-schema` zastosowane, zmiana `core-domain-schema` zacommitowana.
**Estimated effort:** ~4 sesje po godzinach w 3 fazach (najwięcej UI w fazach 2–3).

## Open Risks & Assumptions

- Błąd daty z triggera da się zobaczyć dopiero na danych wstawionych poza aplikacją (S-02 nie istnieje); mitygacja: asercja komunikatu w pgTAP i ręczny test w fazie 3.
- Zmiana `button.tsx` dotyka formularzy auth, które nadpisują klasy; weryfikacja ręczna w fazie 2.
- Lint: `npm run lint` jest na Windowsie czerwony z przyczyn sprzed zmiany (CRLF, 6 plików spoza `src/`), więc kryteria używają lintu zmienionych plików z `endOfLine: auto`.
- Założenie: ciasteczka sesji `@supabase/ssr` mają `SameSite=Lax`, co razem z wymogiem JSON-a chroni trasy mutacji; do potwierdzenia w fazie 1.
- Liczniki usuwania liczone przy renderze mogą się rozminąć z równoległą zmianą (akceptowane, wynik doradczy).
- Obie migracje z `core-domain-schema` trzeba wypchnąć na zdalny projekt razem przed wdrożeniem.

## Success Criteria (Summary)

- Użytkownik przechodzi przepływ logowanie → lista → dodanie → edycja → usunięcie z potwierdzeniem, w jasnym i ciemnym motywie, na telefonie i komputerze.
- Walidacja i reguła terminu zwracają polskie błędy przy polach, a niezalogowany nie ma dostępu do stron ani API.
- `supabase test db`, lint zmienionych plików, `astro check`, build i rozszerzony smoke przechodzą.
