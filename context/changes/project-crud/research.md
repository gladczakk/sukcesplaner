---
date: 2026-10-09T16:18:56+02:00
researcher: Claude Sonnet 5.5 (sesja Karolina Jurowicz)
git_commit: 14dd019
branch: master
repository: xDevs
topic: "Co baza kodu już dostarcza, a czego brakuje, żeby zaimplementować CRUD projektu (S-01: tworzenie, edycja, usuwanie z potwierdzeniem, walidacja terminu)"
tags: [research, codebase, project-crud, supabase, astro, api-routes, design-system, rls]
status: complete
last_updated: 2026-10-09
last_updated_by: Claude Sonnet 5.5
---

# Research: Co baza kodu już dostarcza, a czego brakuje dla CRUD projektu (S-01)

**Date**: 2026-10-09T16:18:56+02:00
**Researcher**: Claude Sonnet 5.5 (sesja Karolina Jurowicz)
**Git Commit**: 14dd019
**Branch**: master
**Repository**: xDevs

## Research Question

Roadmapa S-01 (`project-crud`, PRD FR-002/FR-003) wymaga, żeby zalogowany użytkownik mógł utworzyć, edytować i usunąć projekt (nazwa, termin, opcjonalny opis, obszar życia), przy czym usunięcie projektu z milestonami/zadaniami wymaga potwierdzenia i kasuje je kaskadowo, a termin projektu nie może wypaść przed datą istniejącego milestona. Pytanie: jakie wzorce (endpointy, auth, dostęp do danych, UI, narzędzia) baza kodu już ustala, jaki kontrakt gwarantuje baza danych, co rozstrzygnęły wcześniejsze decyzje i czego brakuje?

Zakres sprawdzonych źródeł: stan repozytorium na commicie `14dd019` (pliki `src/**`, `supabase/**`, konfiguracje, `scripts/smoke.mjs`, `context/foundation/**`, `context/changes/core-domain-schema/**`), plus jedna sonda zachowania PostgREST na lokalnym Supabase (opis w „Zachowanie PostgREST”). Nie uruchamiano buildu ani testów.

## Summary

- **Warstwa danych jest gotowa i potwierdzona empirycznie.** Tabela `projects` ma pola z FR-002 (`name`, `due_date`, `description`, `life_area`), kaskady, RLS i trigger daty ([supabase/migrations/20261009120000_create_core_domain_schema.sql:8-20](supabase/migrations/20261009120000_create_core_domain_schema.sql#L8-L20)). Typy `Project`/`ProjectInsert`/`ProjectUpdate` i `LIFE_AREAS` istnieją ([src/types.ts:3-12](src/types.ts#L3-L12)), a klient jest typowany ([src/lib/supabase.ts:10](src/lib/supabase.ts#L10)).
- **Wszystko ponad bazą trzeba dopiero zbudować.** W sprawdzonym drzewie `src/` nie ma stron ani tras API dla projektów, powłoki aplikacji z nawigacją, komponentów formularza (input/label/textarea/select), dialogu potwierdzenia, ani `zod` jako zadeklarowanej zależności. Istniejące strony i komponenty UI (poza `global.css` i `Layout.astro`) powstały przed adopcją design systemu i używają literałów kolorów oraz angielskiej treści.
- **Najbliższe wzorce do naśladowania:** trasa `src/pages/api/auth/signin.ts` (POST `formData()` → redirect z `?error=`), chroniona strona `dashboard.astro` + `PROTECTED_ROUTES` w middleware, oraz React-owe formularze z `src/components/auth/*`. Każdy z nich odstępuje od konwencji z `CLAUDE.md` (brak `zod`, brak `prerender`, literały kolorów), więc są wzorem struktury, nie stylu.
- **Reguły z bazy pokrywają walidację z PRD**, ale błędy dochodzą do aplikacji jako surowy kod `23514` z tekstem, który trzeba rozróżnić po komunikacie; błędy edycji cudzego lub nieistniejącego rekordu nie dają błędu, tylko pusty wynik.
- **Do rozstrzygnięcia przez człowieka** (nie ustalone nigdzie w repo): m.in. czy edycja może zmieniać obszar życia, czy usunięcie pustego projektu też wymaga potwierdzenia, struktura tras, formularz jako dialog czy strona, kolor projektu (design system go przewiduje, tabela go nie ma), wybór transportu mutacji (formularz POST vs fetch JSON). Pełna lista w „Open Questions”.

## Detailed Findings

### Trasy API i walidacja (wzorzec auth)

- Trasy `signin`/`signup`/`signout` eksportują `POST: APIRoute`, parsują `request.formData()` i rzutują pola przez `as string`; nie ma w nich walidacji ([src/pages/api/auth/signin.ts:5-7](src/pages/api/auth/signin.ts#L5-L7)). Sukces i błąd kończą się `context.redirect(...)`; błąd jedzie w query stringu `?error=…` ([src/pages/api/auth/signin.ts:11](src/pages/api/auth/signin.ts#L11), [:16](src/pages/api/auth/signin.ts#L16), [:19](src/pages/api/auth/signin.ts#L19)). Strona czyta go przez `Astro.url.searchParams.get("error")` ([src/pages/auth/signin.astro:5](src/pages/auth/signin.astro#L5)).
- `zod` nie jest w `dependencies` ani `devDependencies` (`grep '"zod"' package.json` zwraca brak), a w `src/` nie ma importu `zod` ani wpisu `prerender` (sprawdzone `grep` po `src/`). W `package-lock.json` zod występuje tylko jako zależność tranzytywna. `CLAUDE.md` wymaga „validate input with zod” i `export const prerender = false`; trasy auth działają, bo `astro.config.mjs` ma `output: "server"` ([astro.config.mjs:11](astro.config.mjs#L11)).
- Ochrona CSRF: w `astro.config.mjs` nie ma bloku `security`, więc obowiązuje domyślne `checkOrigin: true` Astro; według źródła Astro (`node_modules/astro/dist/core/config/schemas/defaults.js:44`, `.../origin-check.js`, odczytane przez pracownika, nie uruchamiane) niebędące GET/HEAD/OPTIONS żądanie z form-podobnym `Content-Type` musi mieć `Origin` równy origin strony, a żądanie z `Content-Type: application/json` nie jest sprawdzane. `scripts/smoke.mjs` wysyła `Origin: BASE_URL` w każdym żądaniu ([scripts/smoke.mjs:29](scripts/smoke.mjs#L29)).
- W repo nie ma wzorca mutacji innych niż natywny formularz POST + redirect: brak JSON, brak `PUT`/`PATCH`/`DELETE`, brak `_method` override (przejrzane trasy w `src/pages/api/auth/`: 3 pliki).

### Middleware i ochrona tras

- `PROTECTED_ROUTES = ["/dashboard"]` ([src/middleware.ts:4](src/middleware.ts#L4)), dopasowanie `pathname.startsWith(route)` bez granicy segmentu ([src/middleware.ts:18](src/middleware.ts#L18)); niezalogowany dostaje 302 na `/auth/signin` bez `?next=` ([src/middleware.ts:20](src/middleware.ts#L20)). Nowe `/projects` i `/api/projects` nie są chronione, dopóki nie trafią na listę; `/api/projects` nie zaczyna się od `/projects`, więc wymaga osobnego wpisu.
- Chroniona trasa `/api/*` zwróci przekierowanie HTML (302), nie 401 JSON; w repo nie ma kodu zwracającego 401 (sprawdzone: middleware + 3 trasy auth).
- `locals.user` jest typowane w `src/env.d.ts` (`App.Locals`); `locals` nie zawiera klienta Supabase, więc każda strona/trasa tworzy go sama przez `createClient(headers, cookies)` ([src/lib/supabase.ts:5](src/lib/supabase.ts#L5)).
- Żadna istniejąca strona nie odpytuje Supabase we frontmatter (`dashboard.astro` czyta tylko `Astro.locals.user`); brak precedensu, ale i przeszkody. Po zalogowaniu redirect idzie na `/` ([src/pages/api/auth/signin.ts:19](src/pages/api/auth/signin.ts#L19)), nie na listę projektów.
- `wrangler.jsonc`: runtime Workers z `nodejs_compat`, bez dodatkowych bindingów — kod serwerowy ma opierać się o `fetch` i Supabase.

### Typowanie i dostęp do danych

- Wygenerowane typy: `life_area: string`, `due_date: string` (format `YYYY-MM-DD`), `description: string | null`; w Insert `user_id` jest opcjonalne ([src/db/database.types.ts](src/db/database.types.ts) — plik generowany). `ProjectInsert`/`ProjectUpdate` zawężają `life_area` do `LifeArea` ([src/types.ts:11-12](src/types.ts#L11-L12)).
- Tarcie przy odczycie: wynik `supabase.from("projects").select()` ma `life_area: string`, więc nie przypisuje się do `Project` bez rzutowania lub strażnika w czasie wykonania; w repo nie ma strażnika ani mappera (przejrzane `src/types.ts`, `src/lib/*`). Zapis zawężonym typem kompiluje się, bo `LifeArea` jest podtypem `string`.
- Dzięki RLS zapytania o projekty nie wymagają `.eq("user_id", …)` dla bezpieczeństwa, a `user_id` na insercie ustawia domyślna wartość `auth.uid()` (potwierdzone sondą poniżej — insert bez `user_id` zwrócił wiersz z `user_id` użytkownika).

### Kontrakt bazy dla operacji na projekcie

- Kolumny i ograniczenia `projects`: `name` (CHECK `projects_name_length`: `char_length(btrim(name)) between 1 and 200`), `description` (NULL, bez limitu długości), `life_area` (CHECK `projects_life_area_check`: `dom|sport|praca`), `due_date` NOT NULL, `created_at`/`updated_at`; indeks `(user_id, due_date)` ([migracja:8-20](supabase/migrations/20261009120000_create_core_domain_schema.sql#L8-L20)). Brak kolumny koloru, kolejności i archiwizacji; brak unikalności nazwy; brak ograniczenia na datę w przeszłości.
- Trigger `projects_check_due_date` (BEFORE UPDATE OF due_date) odrzuca skrócenie terminu poniżej daty istniejącego milestona; równość jest dozwolona ([migracja:119-142](supabase/migrations/20261009120000_create_core_domain_schema.sql#L119-L142)). Usunięcie projektu kasuje milestony i zadania przez `on delete cascade` ([migracja:35](supabase/migrations/20261009120000_create_core_domain_schema.sql#L35), [:52](supabase/migrations/20261009120000_create_core_domain_schema.sql#L52)).
- RLS: cztery polityki `to authenticated` na `projects` (`user_id = (select auth.uid())`), `anon` odcięty, `authenticated` ma tylko SELECT/INSERT/UPDATE/DELETE ([supabase/migrations/20261009120100_enable_core_domain_rls.sql:14-35](supabase/migrations/20261009120100_enable_core_domain_rls.sql#L14-L35)).

#### Zachowanie PostgREST (zaobserwowane)

Sonda wykonana 2026-10-09 na lokalnym Supabase (API `http://127.0.0.1:54321`, commit `14dd019`, obie migracje zastosowane), przez dwóch jednorazowych użytkowników testowych (A i B) utworzonych przez GoTrue; po sondzie obaj usunięci przez Admin API (kaskadowo z danymi). Skrypt sondy nie jest w repo. Każdy wiersz dotyczy tej jednej obserwacji:

| Przypadek | Odpowiedź (HTTP, `code`, `message`) |
|---|---|
| Insert poprawny (bez `user_id`) | 201, wiersz z `user_id` zalogowanego |
| (a) `name` złożone ze spacji; `name` 201 znaków | 400, `23514`, `new row for relation "projects" violates check constraint "projects_name_length"` |
| (b) `life_area` = `inne` | 400, `23514`, `…violates check constraint "projects_life_area_check"` |
| Brak `due_date` | 400, `23502`, `null value in column "due_date" … violates not-null constraint` |
| `due_date` = `jutro` | 400, `22007`, `invalid input syntax for type date: "jutro"` |
| `due_date` w przeszłości (2020-01-01) | 201 — baza dopuszcza |
| (c) skrócenie terminu poniżej milestona (2026-12-01 przy milestonie 2026-12-20) | 400, `23514`, `Termin projektu (2026-12-01) nie moze byc wczesniejszy niz data istniejacego milestona`; `details` i `hint` = null |
| Edycja poprawna (`name` + `life_area`) | 200, wiersz; `updated_at` zmieniony |
| (d) B: PATCH cudzego projektu bez `Prefer: return` / z `return=representation` | 204 pusty / 200 `[]` |
| (d) B: DELETE cudzego projektu z `return=representation`; GET cudzego | 200 `[]` oba |
| A: PATCH nieistniejącego uuid z `return=representation` | 200 `[]` |
| (e) anon: GET `/rest/v1/projects` | 401, `42501`, `permission denied for table projects` |

Wniosek bounded: dla tej sprawdzonej ścieżki (PostgREST, lokalnie) błąd CHECK i błąd triggera daty mają ten sam `code` `23514` i różnią się wyłącznie `message`; edycja/usunięcie cudzego i nieistniejącego rekordu daje brak błędu i pusty wynik (przy `return=representation`), więc „nie znaleziono” trzeba wykrywać po pustej tablicy.

#### Zliczanie tego, co zniknie przy usunięciu

W repo nie ma widoku ani funkcji RPC do zliczania (migracje: 2 pliki, brak `create view`/RPC). Zaobserwowano, że działają (RLS zawęża wynik do własnych rekordów):
- liczba milestonów: zapytanie `milestones?project_id=eq.<id>` z `Prefer: count=exact` → nagłówek `Content-Range: 0-0/1` (1 milestone);
- liczba zadań przez osadzenie: `tasks?select=id,milestones!inner(project_id)&milestones.project_id=eq.<id>` z `count=exact` → `Content-Range: 0-0/2` (2 zadania) — osadzenie po złożonym FK `(milestone_id, user_id)` rozwiązało się poprawnie;
- osadzenia `projects?select=id,milestones(count)` → `milestones:[{count:1}]` oraz `projects?select=id,milestones(id,tasks(id))` → zagnieżdżone id milestonów i zadań (HTTP 200).
- Po usunięciu projektu przez właściciela zapytanie o jego milestony zwróciło `[]` (kaskada działa).

### UI: klocki i stan zgodności z design systemem

- `src/components/ui/` zawiera tylko `button.tsx` i `LibBadge.astro`. `button.tsx` to standardowy shadcn new-york: warianty `default/destructive/outline/secondary/ghost/link`, `rounded-md`, rozmiar domyślny `h-9`, focus `ring-[3px]` ([src/components/ui/button.tsx:8-30](src/components/ui/button.tsx#L8-L30)); spec design systemu wymaga pigułki 40px, wariantów primary/secondary/ghost/danger i focusu 2px z offsetem ([context/foundation/design-system/design-system.md:106](context/foundation/design-system/design-system.md#L106)).
- Nie ma: input, label, textarea, select, dialog/alert-dialog, ConfirmDialog, Chip, ProjectDot, Navigation (sidebar/tabbar/fab), TaskRow, MilestoneCard (sprawdzone listingiem `src/components/**`). W `package.json` jedyną zależnością Radix jest `@radix-ui/react-slot`; `npx shadcn@latest add alert-dialog|dialog|label|select` dociągnęłoby pozostałe. `components.json` wskazuje alias hooków `@/hooks` ([components.json:18](components.json#L18)), a `CLAUDE.md` mówi `src/components/hooks/`; żaden z katalogów nie istnieje.
- Nie ma powłoki aplikacji: `Layout.astro` przyjmuje tylko `title` i renderuje `<slot/>` (+ banner konfiguracji); nawigacja Dziś/Kalendarz/Projekty z design systemu nie istnieje.
- Sprawdzone pliki poza `global.css` i `Layout.astro` — `dashboard.astro`, `Topbar.astro`, `Welcome.astro`, `Banner.astro`, `src/pages/auth/*.astro`, `src/components/auth/*` — używają literałów/klas palety (np. `bg-cosmic`, `border-white/10`, `text-purple-300`, `bg-purple-600`) i angielskiej treści; tokeny (`type-*`, `rounded-pill`, `shadow-card`, `project-*`, `destructive-*` itd.) są opublikowane w `src/styles/global.css` i nie znaleziono tokenu z design-system.md brakującego w tym pliku (nie porównywano z `tokens/tokens.json`). `bg-cosmic` to jedyny literałowy utility w `global.css`.
- Wzorzec formularza (`src/components/auth/SignInForm.tsx`): kontrolowane pola React (`useState`), natywny `<form method="POST" action=…>` z walidacją klienta, która robi `preventDefault` tylko przy błędzie; błąd serwera wraca w `?error=` i jest renderowany przez `ServerError`. `FormField` wymaga ikony i nie ma wariantów date/select/textarea; błąd nie ma `id`, a pole nie ma `aria-invalid`/`aria-describedby`.
- Lint: reguły `jsx-a11y` są podpięte tylko przez `eslintPluginAstro.configs["flat/jsx-a11y-recommended"]` ([eslint.config.js:87](eslint.config.js#L87)); w tym pliku nie ma osobnego wpisu `jsx-a11y` dla `.tsx`.
- Ikony: `lucide-react` jest zależnością; nie sprawdzano, czy nazwy z mapy ikon design systemu istnieją w zainstalowanej wersji.

### Co design system mówi o S-01

- Ekrany bez referencji: logowanie, **lista projektów**, **formularze dodaj/edytuj** — formularze w dialogu (desktop) lub bottom sheet (telefon), pola 40px ([design-system.md:141-142](context/foundation/design-system/design-system.md#L141-L142)). Widok projektu (nagłówek, panel szczegółów, ghost „Usuń projekt…”) ma referencję ([design-system.md:138-139](context/foundation/design-system/design-system.md#L138-L139)).
- ConfirmDialog: `role="alertdialog"`, tytuł-pytanie z nazwą obiektu, dokładne liczby, „Anuluj” + przycisk danger powtarzający czasownik, fokus startuje na „Anuluj”, nigdy `confirm()` ([design-system.md:117](context/foundation/design-system/design-system.md#L117), [:151](context/foundation/design-system/design-system.md#L151)); polskie liczby mnogie wymagane ([design-system.md:149](context/foundation/design-system/design-system.md#L149)).
- **Niezgodność kolor projektu:** design system przewiduje kolory `project-*` przypisywane projektom, wybór koloru w panelu szczegółów ([design-system.md:66](context/foundation/design-system/design-system.md#L66), [:109](context/foundation/design-system/design-system.md#L109)), a tabela `projects` nie ma kolumny koloru ([migracja:8-18](supabase/migrations/20261009120000_create_core_domain_schema.sql#L8-L18)); PRD wspomina kolor tylko w FR-014 (nice-to-have, odłożone w roadmapie `## Parked`). Kolor może więc być wyprowadzany (kolejność tworzenia, obszar życia) albo odłożony — w repo nie ma decyzji.

### Narzędzia, CI i konwencje

- Brak runnera testów (`package.json` scripts: `dev`, `build`, `preview`, `astro`, `lint`, `lint:fix`, `format`, `smoke`); jedyne testy to pgTAP uruchamiane ręcznie `supabase test db`. CI (`.github/workflows/ci.yml`): job `ci` = lint, `astro check`, build; job `smoke` startuje lokalny Supabase i uruchamia `npm run smoke`; `supabase test db` w CI nie jest uruchamiany.
- `scripts/smoke.mjs` (8 kroków auth: strona główna, redirect dashboardu, signup, signin zły/dobry, dashboard, signout, redirect po signout) sprawdza status i `Location`; rozszerzenie o kroki projektowe jest możliwe w tym samym stylu (formularze z `Origin`). Lokalnie potwierdzenia e-mail są wyłączone ([supabase/config.toml:209](supabase/config.toml#L209)), więc signin po signupie działa.
- Prettier: `.prettierrc.json` bez `endOfLine`, w repo nie ma `.gitattributes` ani `.editorconfig`; przy `core.autocrlf=true` na Windowsie lint zgłasza błędy CRLF w plikach spoza tej zmiany (znane z przeglądu `core-domain-schema`).
- ESLint: `strictTypeChecked` + `stylisticTypeChecked`, `restrict-template-expressions` dopuszcza tylko liczby, `no-misused-promises` z `checksVoidReturn.attributes: false` (asynchroniczne handlery w atrybutach JSX dozwolone), `no-console` jako ostrzeżenie. Hook pre-commit: `lint-staged` (eslint --fix dla ts/tsx/astro, prettier dla json/css/md).

## Code References

- `src/pages/api/auth/signin.ts:5-19` - wzorzec trasy: `formData()`, rzutowanie `as string`, redirect z `?error=`
- `src/middleware.ts:4,18-20` - `PROTECTED_ROUTES` i dopasowanie prefiksowe, redirect na `/auth/signin`
- `src/lib/supabase.ts:5-10` - `createClient(headers, cookies)` zwraca `null` bez env; `createServerClient<Database>`
- `src/types.ts:3-12` - `LIFE_AREAS`, `LifeArea`, `Project`, `ProjectInsert`, `ProjectUpdate`
- `supabase/migrations/20261009120000_create_core_domain_schema.sql:8-20,119-142` - tabela `projects`, indeks, trigger daty projektu
- `supabase/migrations/20261009120100_enable_core_domain_rls.sql:14-35` - uprawnienia i polityki RLS na `projects`
- `src/components/ui/button.tsx:8-30` - stockowy Button shadcn (do przejścia przez kontrakt design systemu)
- `src/components/auth/SignInForm.tsx` - wzorzec formularza React z natywnym POST
- `components.json:18` - alias hooków `@/hooks` (konflikt z `CLAUDE.md`)
- `eslint.config.js:87` - jedyne podpięcie `jsx-a11y` (przez konfigurację Astro)
- `scripts/smoke.mjs:29` - `Origin` wysyłany w każdym żądaniu
- `context/foundation/design-system/design-system.md:106-117,138-151` - kontrakt Button/ConfirmDialog, ekrany, copy

## Architecture Insights

- Stos: Astro 7 `output: "server"` na Cloudflare Workers; strony i trasy tworzą klienta Supabase per żądanie; autoryzację danych zapewnia RLS (a nie filtry w aplikacji), co upraszcza zapytania, ale oznacza, że „cudzy rekord” i „brak rekordu” są nierozróżnialne po stronie aplikacji.
- Reguły domenowe żyją w bazie (CHECK, trigger dat, kaskady); aplikacja ma ich nie duplikować, ale musi przetłumaczyć surowe błędy PostgREST na polską treść i rozróżnić `23514` po `message`.
- Istniejący kod auth jest spójny wewnętrznie (formularz POST + redirect), ale odstępuje od konwencji `CLAUDE.md` (zod, `prerender`, tokeny, język). Kod S-01 będzie pierwszym, który ma te konwencje spełniać — dotyczy to także Buttona i powłoki.
- Przy małej skali liczenie dzieci do potwierdzenia usunięcia da się zrobić bez zmian w bazie (zapytania z `count=exact` / osadzenia), co zaobserwowano; wynik jest doradczy (bez blokady).

## Historical Context (from prior changes)

- `context/foundation/roadmap.md` — S-01 `project-crud`: FR-001..FR-003; poprzednik F-01 (`core-domain-schema`) zaimplementowany i zacommitowany, ale niezarchiwizowany (status w roadmapie: `in-progress`).
- `context/changes/core-domain-schema/plan.md` („What We're NOT Doing”) — UI, trasy API, zmiany `PROTECTED_ROUTES` i walidacja zod są jawnie zakresem S-01..S-03; `supabase db push` na zdalny projekt jest ręcznym krokiem przed wdrożeniem S-01.
- `context/changes/core-domain-schema/reviews/impl-review.md` — F2: obie migracje wypychać zawsze razem; F6: `btrim` obcina tylko spacje i `description` nie ma limitu — odłożone do walidacji zod w S-01.
- `context/archive/` zawiera wyłącznie README; `context/foundation/lessons.md` i `docs/reference/contract-surfaces.md` nie istnieją.

## Related Research

Brak (`context/changes/**/research.md` i `context/archive/**/research.md` nie istnieją poza tym dokumentem).

## Open Questions

Decyzje produktowe/projektowe, których nie rozstrzyga ani PRD, ani repo (dla `/10x-plan`):

1. Czy edycja projektu może zmieniać `life_area` (baza pozwala; PRD mówi „edytować projekt” bez ograniczeń)?
2. Czy usunięcie projektu **bez** milestonów/zadań wymaga potwierdzenia? FR-003 wymaga go dla projektu z dziećmi; design system pokazuje dialog z liczbami zawsze.
3. Struktura tras i nawigacji: `/projects` (lista), `/projects/[id]` (widok), co po utworzeniu/usunięciu (redirect), czy powstaje powłoka aplikacji z nawigacją w tej zmianie.
4. Formularz dodaj/edytuj jako dialog/sheet (zalecenie design systemu) czy osobna strona — oraz zakres widoku projektu w S-01, skoro milestony dochodzą w S-02.
5. Transport mutacji: natywny formularz POST + redirect (jak auth; edycja/usunięcie wymagają tras POST lub `_method`) czy fetch JSON (`PATCH`/`DELETE`, wolne od kontroli `Origin`, wymaga własnej obsługi 401).
6. Kolor projektu: odłożyć, wyprowadzać (z kolejności/obszaru), czy dodać kolumnę migracją.
7. Limit długości `description`, odrzucanie nazw z samych tabulatorów/białych znaków, oraz czy terminy w przeszłości mają być odrzucane przy tworzeniu (baza je dopuszcza).
8. Mapowanie błędów: rozróżnianie `23514` po `message` (trigger daty vs CHECK) i komunikaty po polsku; odpowiedź na pusty wynik edycji/usunięcia (404 vs ciche przekierowanie).
9. Zakres przebudowy `button.tsx` (kontrakt design systemu) i dodania komponentów shadcn (`alert-dialog`/`dialog`, `input`, `label`, `textarea`, `select`) oraz dodania `zod` do zależności — czy w tej zmianie, czy przez osobną zmianę `/10x-ui`.
10. Czy rozszerzać `scripts/smoke.mjs` o kroki projektowe (CI uruchamia go na lokalnym Supabase) i czy `supabase test db` ma trafić do CI już teraz.
