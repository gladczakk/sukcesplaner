---
date: 2026-10-30T00:00:00+01:00
researcher: Claude (Sonnet 5.5) for Karolina Jurowicz
git_commit: 4f504f9
branch: master
repository: xDevs
topic: "Ground rollout Phase 4 of test-plan.md: jeden przepływ e2e (#1, #4) i bramki jakości"
tags: [research, codebase, e2e, playwright, ci, today-list, hooks]
status: complete
last_updated: 2026-10-30
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Faza 4 rolloutu — jeden przepływ e2e i bramki

**Date**: 2026-10-30
**Git Commit**: 4f504f9 (working tree: `context/foundation/test-plan.md` zmodyfikowany, folder zmiany nieśledzony)
**Branch**: master
**Repository**: xDevs

## Research Question

Ugruntować Fazę 4 z `context/foundation/test-plan.md` §3 („Jeden przepływ e2e i bramki”, ryzyka #1 i #4 „domknięcie”): jaki jeden przepływ w przeglądarce ma sens, co po drodze jest już dowiedzione niżej (wyrocznia z PRD, nie z kodu), czego brakuje, żeby uruchomić Playwright (aplikacja, auth, CI), oraz co istnieje z bramek (CI, hook po edycji). Weryfikuję, nie przyjmuję, wskazówki z §2 Risk Response Guidance dla #1 i #4.

## Summary

- **Wartość e2e leży w tym, czego warstwy niższe nie widzą.** Reguły listy i akcji (#1, #4) są już dowiedzione w pgTAP i vitest (Fazy 1–3). W przeglądarce do udowodnienia zostają: logowanie formularzem z prawdziwą sesją cookie, redirect z `/today` dla niezalogowanego, hydracja wysp React (dialog dodawania zadania i przyciski akcji), kliknięcie → zapis → przeładowanie renderu serwerowego, oraz czy wiersz znika lub zmienia stan po przeładowaniu.
- **Przepływ docelowy** (jeden test): rejestracja unikalnego użytkownika → logowanie → projekt i milestone → zadanie bez terminu na `/today` → „Częściowo” (wiersz zostaje, stan częściowy) → „Zrobione” (wiersz znika, pojawia się wiersz milestona do zamknięcia). „Na jutro” jest osiągalne w przeglądarce, ale tylko jako „wiersz trafia do Przeniesione na później”.
- **Korekta wskazówki #4 z §2.** PRD v1 nie ma widoku „lista na następny dzień” (Non-Goal), a „dziś” liczy serwer w strefie Europe/Warsaw, którego Playwright nie może przesunąć. „Lista następnego dnia zgadza się z PRD” jest więc dowodliwa wyłącznie wstrzykniętą datą w bazie (już zrobione w Fazach 1–2), nie w przeglądarce. E2E dla #4 dowodzi stanu *po przeładowaniu tego samego dnia*.
- **Infrastruktura**: Playwright nie jest zainstalowany ani skonfigurowany; środowisko do e2e istnieje w jobie CI `smoke` (lokalny Supabase, build, preview na porcie 4321), więc e2e wpina się tam jako kolejne kroki. Hook po edycji nie istnieje w repo (jest tylko husky + lint-staged).
- **Ograniczenie istotne dla asercji**: lessons.md nakazuje asercje na treść renderowaną przez wyspę (nie sam status 200) oraz break-check przez `throw` w komponencie.

## Detailed Findings

### 1. Oracle: co produkt POWINIEN robić (PRD, nie kod)

- Główny przepływ sukcesu: „zalogować się → dodać projekt … → dodać zadania … → wejść na listę zadań na dziś … → przenieść zadanie na jutro, oznaczyć jako zrobione/częściowo zrobione, oraz ręcznie dodać zadanie z poziomu listy” — `context/foundation/prd.md:31`.
- Guardrail #1: „Żadne dodane zadanie ani milestone nie może zniknąć lub zostać pominięte na liście na dziś bez wiedzy użytkownika” — `prd.md:37`.
- Reguła listy: lista pokazuje „wszystkie niedokończone zadania należące do najbliższego, jeszcze niezamkniętego milestona każdego projektu … a gdy wszystkie zadania danego milestona zostaną ukończone, na liście pojawia się sam milestone jako ostatni krok do zamknięcia” — `prd.md:106`.
- AC US-01 (`prd.md:49-52`): zadanie niedokończone z dzisiejszym lub minionym terminem pojawia się na liście; „Oznaczenie zadania jako zrobione usuwa je z listy na dziś”; „częściowo zrobione i przeniesienie na jutro przenosi pozostałą część na listę następnego dnia”.
- FR-006 (`prd.md:75`): każde zadanie należy do milestona, więc przepływ musi zawierać projekt i milestone przed zadaniem. FR-008 (`prd.md:79`): zadanie można dodać z listy, wybierając projekt i milestone.
- **Luka wyroczni (potwierdzona w PRD v1, sprawdzony zakres: `prd.md` i `prd-v2.md`)**: PRD nie definiuje komunikatu zwrotnego po akcji (toast/tekst). Jedyną wyrocznią jest „wiersz znika / pojawia się na liście”. Komunikaty błędów i `aria-*` to decyzje projektowe S-05, nie wymagania PRD (potwierdzone w archiwum `context/archive/2026-10-16-today-list-actions/plan-brief.md`).
- Non-Goal PRD: brak podglądu list na kolejne dni. Skutek: „lista następnego dnia” nie ma widoku, który e2e mogłoby otworzyć.
- PRD v2 (powtarzalne): „pominięte” wystąpienie jest wyliczane samoczynnie i widoczne następnego dnia (`prd-v2.md:76`), nie jest przyciskiem. W e2e tego samego dnia nie da się go wywołać bez przesunięcia zegara.

### 2. Ścieżka UI (najkrótsza realna)

- Middleware: `PROTECTED_ROUTES = ["/projects", "/today"]` (`src/middleware.ts:4`), niezalogowany idzie na `/auth/signin`; `PROTECTED_API_ROUTES = ["/api/projects"]` zwraca 401 JSON (`src/middleware.ts:5, 31`).
- Projekt i otwarty milestone są wymagane przed zadaniem. Bez nich `/today` pokazuje wyłączone „Dodaj zadanie” z podpowiedzią (`src/components/today/AddTaskFromTodayDialog.tsx:488-506`).
- Ścieżka minimalna (ta inspekcja, bez uruchamiania):
  1. `/projects` → „Dodaj projekt”; pola getByLabel „Nazwa”, „Termin”, „Obszar życia” (natywny select), „Opis” opcjonalnie (`src/components/projects/ProjectFormDialog.tsx:148-185`); po sukcesie nawigacja do `/projects/<id>` (`ProjectFormDialog.tsx:107`).
  2. `/projects/<id>` → „Dodaj milestone”; pola „Nazwa”, „Data” (data milestona ≤ termin projektu, `MilestoneFormDialog.tsx:80-81`); po sukcesie `window.location.reload()`.
  3. Zadanie: przycisk `aria-label="Dodaj zadanie do milestona <nazwa>"` (`TaskFormDialog.tsx:270, 285`) albo „Dodaj zadanie” na `/today` (`AddTaskFromTodayDialog.tsx:509-638`: „Projekt”, „Milestone”, „Tytuł”, „Powtarzanie”, „Termin (opcjonalny)”, „Zapisz”). Po sukcesie `window.location.reload()` (`AddTaskFromTodayDialog.tsx:461`).
- Co jest na `/today`: dowolne otwarte zadanie (todo/partial, nieprzeniesione) z *najbliższego* otwartego milestona każdego projektu, niezależnie od własnego terminu zadania; termin wpływa tylko na kolejność i chip (`supabase/migrations/20261016120000_today_list.sql`, kolejne migracje rozszerzają; `src/lib/today.ts` `dueChip`). Zadanie w milestonie niebędącym najbliższym nie jest na liście (`AddTaskFromTodayDialog.tsx`, `NOT_NEAREST_HINT`). W teście tworzyć dokładnie jeden milestone.
- Termin zadania musi być ≤ data milestona (trigger `supabase/migrations/20261015120000_task_rules.sql:42`). Daty projektu i milestona: odległa przyszłość (smoke używa `2099-12-31`).

### 3. Auth pod automatyzację

- Lokalnie `enable_confirmations = false` (`supabase/config.toml:209`; druga wartość `false` w `:244`, sekcja nieustalona). Smoke polega na tym (`scripts/smoke.mjs:170-174`: rejestracja → 302 na `/auth/confirm-email`).
- Formularze: `/auth/signup` (pola „E-mail”, „Hasło”, „Powtórz hasło”, przycisk „Utwórz konto”, min 6 znaków), `/auth/signin`; natywne POST do `/api/auth/signup` i `/api/auth/signin`; po zalogowaniu redirect do `/today`; błędy w `?error=<kod>` i `role="alert"` (`InlineError`). Cookie sesji `@supabase/ssr`, więc `storageState` Playwrighta zadziała.
- Unikalny użytkownik na przebieg: `smoke-${Date.now()}@example.com` (`scripts/smoke.mjs:5-6`). Dane są per użytkownik przez RLS, więc świeży użytkownik ma pustą listę i izolację bez czyszczenia.
- Niepotwierdzone w działaniu: czy po rejestracji sesja jest od razu aktywna (wniosek z `enable_confirmations=false`); bezpiecznie logować się jawnie. Treść strony `confirm-email` różni się w buildzie nie-DEV („Sprawdź skrzynkę”).

### 4. Akcje na liście (lokatory i skutki)

- Przyciski mają `aria-label` nadpisujący widoczny tekst: `Zrobione: <tytuł>` (`src/components/today/TodayTaskActions.tsx:71`), `Częściowo: <tytuł>` z `aria-pressed` (`:104-105`), `Na jutro: <tytuł>` (`:89, :120`). W repo brak `data-testid` na wierszach i brak roli wiersza; wiersz to `<li>` z `TaskRow.astro`. Lokatory: `getByRole('button', { name: 'Zrobione: <tytuł>' })` itp.
- Stan nie jest optymistyczny: po sukcesie `window.location.reload()` (`TodayTaskActions.tsx:45`), przyciski zablokowane do przeładowania; błąd w `InlineError` (w `TodayTaskActions` bez `role`, wg raportu — do potwierdzenia w kodzie przed asercją).
- Oczekiwane skutki po przeładowaniu (zachowanie zaobserwowane w kodzie i zgodne z AC): Zrobione → wiersz znika; jeśli to było jedyne zadanie, pojawia się wiersz „milestone do zamknięcia”; Częściowo → wiersz zostaje z dopiskiem „· częściowo”, `aria-pressed=true`; Na jutro → wiersz trafia pod `<details>` „Przeniesione na później: N” (`src/pages/today.astro:190`).
- Decyzje S-05, których e2e nie wolno zaprzeczyć (nie są PRD): zadanie zrobione nie może być przeniesione (422), zapis statusu zeruje przeniesienie, częściowo + na jutro zachowuje status częściowy (test-plan §6.4, §7).

### 5. Źródło „dziś”

- Serwer liczy „dziś” raz na żądanie przez `todayInWarsaw()` (`src/lib/today.ts:653`; użycie `src/pages/today.astro:27`) i przekazuje do `today_list`. Klient nie liczy „dziś”. Mockowanie zegara w Playwrightcie (`page.clock`) nie wpływa na serwer. Zadanie bez terminu nie zależy od daty, więc to najstabilniejszy wybór; unikać asercji na chipy („dziś”, „wczoraj”) i nagłówek daty. Ryzyko wyścigu tylko przy kliknięciu na granicy północy Warsaw.

### 6. Środowisko uruchomieniowe i CI

- `package.json`: `dev`, `build`, `preview`, `smoke`, `test:app` (`vitest.config.ts` obejmuje tylko `src/**/*.test.ts`, więc specyfikacje Playwrighta powinny leżeć poza `src`, np. `e2e/`).
- `astro.config.mjs`: `output: "server"`, adapter Cloudflare; env `SUPABASE_URL`, `SUPABASE_KEY` (opcjonalne). Preview wymaga `.dev.vars` z tymi samymi sekretami (CI zapisuje `.env` i kopiuje do `.dev.vars`, `ci.yml:47-51`). Port domyślny 4321; lokalnie potrzebny `npm run build` przed `preview` i Docker dla `npx supabase start`.
- Playwright: brak w `package.json` i `node_modules`, brak `playwright.config.*` w repo (sprawdzony zakres: `ls` korzenia, `node_modules/@playwright`, `node_modules/playwright*`).
- CI (`.github/workflows/ci.yml`): triggery push i pull_request na master (`:3-7`). Job `ci` (`:10-27`): lint, `astro check`, `test:unit`, `test:app`, `build`. Job `smoke` (`:29-58`): `supabase start` (lista wyłączonych usług), `supabase test db`, zapis `.env`/`.dev.vars`, `build`, `preview` na 4321 z pętlą oczekiwania do 60 s, `npm run smoke`, na końcu `supabase stop`. Najtańsze miejsce na e2e: dodatkowe kroki w jobie `smoke` po kroku smoke (Supabase, build i preview już działają) — `npx playwright install --with-deps chromium`, `npx playwright test`, upload raportu `if: failure()`.
- Smoke to precedens tylko HTTP (`fetch` + ręczny cookie jar, bez przeglądarki), więc nie dowodzi hydracji wysp; pokrywa auth, projekty, milestone'y, zadania, rytmy (`scripts/smoke.mjs`, ~1500 linii).

### 7. Istniejące bramki i hooki

- test-plan §5: wired — lint i typecheck (husky pre-commit + CI), unit, smoke auth, pgTAP, vitest; „e2e on critical flow” (CI on PR) i „post-edit hook” (lokalnie) oznaczone „required/recommended after §3 Phase 4”.
- `.husky/pre-commit` zawiera `npx lint-staged --concurrent false`; lint-staged (`package.json`) uruchamia `eslint --fix`, `prettier --write` i `check-hardcoded-values`. Nie ma `tsc`/`astro check` w hooku commit, choć §5 mówi „lint + typecheck local (husky pre-commit)”; typecheck jest tylko w CI. Rozbieżność do rozstrzygnięcia w planie (poprawić §5 albo dodać krok).
- Hook agenta: brak `.claude/settings*.json` w repo (`.claude/` zawiera tylko manifest, `config-templates/`, `prompts/`, `skills/`); nie sprawdzono konfiguracji użytkownika `~/.claude`.

### 8. Pokrycie warstw niższych (czego e2e nie powtarza)

- pgTAP: `core_domain_today_list*.test.sql` (kwalifikacja, kolejność, daty), `core_domain_today_list_actions.test.sql` (done/partial/jutro/skip, lista dla D i D+1), `core_domain_recurring_*`, `core_domain_milestone_list_integrity.test.sql`, `core_domain_account_isolation.test.sql`, `core_domain_rls.test.sql`.
- vitest: `src/lib/today.test.ts` (granice dat), `src/lib/services/tasks.test.ts` (mapowanie błędów, stub).
- Smoke HTTP: auth, API zadań, błędy.
- Browser-only (wartość e2e): formularz logowania z cookie, redirect niezalogowanego w przeglądarce, hydracja wysp (`client:load`), kliknięcie → PATCH → przeładowanie, render serwerowy po akcji, ścieżka Wrangler preview.

## Code References

- `src/middleware.ts:4-5, 31-37` — chronione trasy i API
- `src/components/today/TodayTaskActions.tsx:45, 71, 89, 104-105, 120` — reload i aria-label akcji
- `src/components/today/AddTaskFromTodayDialog.tsx:461, 488-506, 509-638` — dialog dodawania zadania z listy
- `src/components/projects/ProjectFormDialog.tsx:107, 148-185` — formularz projektu
- `src/components/projects/MilestoneFormDialog.tsx:80-81, 140` — formularz milestona
- `src/components/projects/TaskFormDialog.tsx:270, 285` — dodanie zadania z poziomu projektu
- `src/pages/today.astro:27, 190` — „dziś” i sekcja Przeniesione na później
- `src/lib/today.ts:653` — `todayInWarsaw`
- `supabase/config.toml:209, 244` — `enable_confirmations = false`
- `supabase/migrations/20261015120000_task_rules.sql:42` — termin zadania ≤ data milestona
- `.github/workflows/ci.yml:29-58` — job `smoke` (miejsce na e2e)
- `scripts/smoke.mjs:5-6, 170-174` — unikalny użytkownik i rejestracja
- `context/foundation/prd.md:31, 37, 49-52, 75, 79, 106` — oracle
- `context/foundation/lessons.md` — lekcja 1: asercje na treść wyspy + break-check `throw`

## Architecture Insights

- Aplikacja renderuje listę po stronie serwera i przeładowuje stronę po każdej akcji; test e2e powinien czekać na stan po przeładowaniu (`expect(...)` na wierszu), nie na odpowiedź sieciową.
- Wyspy `client:load` wymagają hydracji przed kliknięciem; przed hydracją przyciski nic nie robią. Asercje czekające (auto-retry `expect`) i wejście na stronę po zalogowaniu wystarczą, ale to ryzyko niestabilności do obsłużenia w planie.
- Jeden użytkownik na przebieg (unikalny e-mail) wystarcza jako izolacja; §7 wyklucza e2e z dwoma kontami, dopóki infrastruktura się nie zmieni.

## Historical Context (from prior changes)

- `context/archive/2026-10-26-testing-list-actions-and-rhythms/plan.md:33` — Faza 2 wprost wykluczyła testy UI/Playwright i przeładowanie po akcji do Fazy 4.
- `context/archive/2026-10-16-today-list-actions/plan-brief.md` — UI akcji S-05: przyciski „Zrobione/Częściowo/Na jutro”, aria-label, przeładowanie strony.
- `context/foundation/test-plan.md` §6.4, §7 — decyzje S-05 zapinane jako reguły projektowe (nie PRD); §7 wyklucza `Intl` w Workers, auth poza smoke, e2e z dwoma kontami.
- Faza 1 miała otwarte wiersze Progress 3.6 (job `smoke` z `supabase test db` nie był uruchomiony na CI, brak zdalnego repozytorium) i 4.3 (prettier `test-plan.md`): wpływają na pewność co do CI, bo e2e wpina się w ten sam job.

## Related Research

- `context/archive/2026-10-26-testing-today-list-correctness/research.md`, `context/archive/2026-10-26-testing-list-actions-and-rhythms/research.md`, `context/archive/2026-10-27-testing-data-integrity-isolation/research.md` — warstwy niższe dla #1, #4, #6, #7.

## Open Questions

1. **Korekta §2 (#4)**: potwierdzić, że „domknięcie” #4 w przeglądarce znaczy „stan po przeładowaniu tego samego dnia”, a lista następnego dnia pozostaje pgTAP (PRD nie ma widoku). Do przeniesienia do `test-plan.md` §2 Risk Response Guidance po decyzji (kontrola przeniesienia po badaniu).
2. **Czy sesja jest aktywna po rejestracji** (`enable_confirmations=false`): do sprawdzenia w seedzie; bezpieczniej logować się jawnie.
3. **Etykiety nieprzeczytane**: `PasswordField` (może mieć przełącznik widoczności o podobnej etykiecie), `RestoreDeferredButton`, `CloseMilestoneButton`, nawigacja `AppLayout`; role/etykiety błędu w `TodayTaskActions`. Sprawdzić przed napisaniem lokatorów (`playwright-cli` lub odczyt).
4. **Wybór ścieżki tworzenia zadania**: przez `/projects/<id>` czy dialog na `/today` (FR-008). Dialog jest krótszy i sam dowodzi hydracji; do decyzji w planie.
5. **Rozbieżność §5**: „typecheck w husky pre-commit” nie występuje w hooku; naprawić wpis albo dodać krok.
6. **Hook po edycji**: brak konfiguracji w repo; jaki hook i jaka bramka na koniec tury — zadanie dla `/10x-configure-hook`, poza tą zmianą kodowo; czy Faza 4 ma go zainstalować, czy tylko zarekomendować (§5: „recommended”).
7. **Uruchomienie lokalnie na Windows**: `astro preview` z workerd nie sprawdzono lokalnie (CI na Linuksie dowodzi działania); ocenić przy `/10x-e2e-setup`.
8. **Nieweryfikowane w tym badaniu**: ręcznie przeczytano tylko wybrane kotwice (aria-label w `TodayTaskActions.tsx`, `PROTECTED_ROUTES`, `enable_confirmations`, `todayInWarsaw`, nagłówek sekcji przeniesionych); reszta pochodzi z raportów trzech badaczy tylko do odczytu i opiera się na ich odczycie plików. Nic nie uruchamiano (ani aplikacji, ani testów).
