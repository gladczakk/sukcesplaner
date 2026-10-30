# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-30

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase`, `scripts`
(excluded: `dist`, `node_modules`, `context`, `.claude`; 65 commits in the last 30 days).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Zadanie, które powinno być na liście na dziś, się nie pojawia, więc użytkownik nie wie, że je pominął | High | High | interview Q1, Q3; PRD guardrail 1 i Business Logic; hot-spot dirs `src/lib/services` (27 commits/30d), `supabase/migrations` (17 commits/30d) |
| 2 | Zadanie ważne dla milestona pojawia się za późno lub za nisko na liście, np. dopiero w dniu deadline'u | High | Medium | interview Q2; PRD FR-010 i guardrail 2; PRD US-01 |
| 3 | Granice dat dają zadanie w złym dniu: przełom dnia, strefa czasowa, ostatni dzień milestona lub rytmu | High | Medium | interview Q4 (brak wiedzy, jak to rozwiązano i jak sprawdzić); roadmap S-07 (zakres od dodania do daty milestona lub zamknięcia); PRD v2 |
| 4 | Akcje na liście (zrobione, częściowo, na jutro, pominięte wystąpienie) zostawiają zadanie w złym stanie: znika albo nie wraca | High | Medium | PRD FR-011, FR-012 i AC z US-01; roadmap S-09 (akcje „najbardziej narażone na regresję"); hot-spot dir `src/components/today` (23 commits/30d) |
| 5 | Zmiana rytmu lub wyłączenie powtarzania gubi odhaczenia, wystąpienia albo przesuwa je na zły dzień | Medium | Medium | roadmap S-10 (nierozstrzygnięty los przeniesień, ryzyko edycji po fakcie); PRD v2; hot-spot dir `supabase/migrations` (17 commits/30d) |
| 6 | Reguła „najbliższy niezamknięty milestone" jest błędna po edycji lub usunięciu (kaskady, walidacja dat), więc lista przeskakuje albo gubi zadania | Medium | Medium | interview Q3; PRD FR-003, FR-005 i Business Logic |
| 7 | Nadużycie: zalogowany użytkownik widzi lub zmienia cudze projekty i zadania | High | Low (na starcie jeden użytkownik) | PRD Access Control i FR-001; tech-stack `has_auth`; interview Q5 (jedyny użytkownik na początku) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Każde niedokończone zadanie spełniające regułę kwalifikacji z PRD jest na liście; żadne nie znika po akcji ani zmianie dnia | „Lista się renderuje, więc jest kompletna" | gdzie powstaje lista, jakie ma wejścia, co już pokrywa istniejący test bazy dla listy na dziś | integration (prawdziwa baza) | implementation mirror; happy-path-only |
| #2 | Zadania są uporządkowane po bliskości deadline'u (własnego lub milestona); zadanie bez terminu jest na końcu, ale widoczne | „Sortowanie po dacie wystarcza do sygnalizacji z wyprzedzeniem" | skąd bierze się deadline do sortowania; czy guardrail 2 jest w ogóle zaimplementowany | integration plus test parametryczny | oczekiwana kolejność liczona tą samą logiką co kod |
| #3 | Wynik zależy od „dzisiejszej daty" z jednego spójnego źródła; granice (północ, ostatni dzień, strefa) dają dokładnie oczekiwany dzień | „Data to po prostu data" | skąd bierze się „dziś" (serwer, baza, klient) i w jakiej strefie; jak dziś wstrzyknąć datę | unit/integration parametryczny z wstrzykniętą datą | zegar systemowy w teście; jedna data zamiast granic |
| #4 | Po każdej akcji stan zadania i lista następnego dnia zgadzają się z PRD; w przeglądarce „domknięcie" = stan po przeładowaniu tego samego dnia (lista następnego dnia zostaje w pgTAP: PRD nie ma takiego widoku, a serwerowego „dziś" nie da się przesunąć) | „Akcja zwróciła sukces, więc stan jest poprawny" | czy sekwencja zapisów jest atomowa; obsługa częściowego błędu | integration plus hermetyczny stub częściowego błędu | over-mocking wnętrzności zamiast sprawdzania stanu końcowego |
| #5 | Po zmianie rytmu odhaczenia „zrobione" zostają, a przyszłe wystąpienia wynikają z nowego rytmu | „Zmiana rytmu to edycja jednego pola" | los przeniesień i pominięć przy zmianie rytmu (otwarta niewiadoma z roadmapy) | integration (prawdziwa baza) | nadmiarowe kopie testów tego samego przypadku |
| #6 | Po usunięciu lub edycji lista pokazuje właściwy, najbliższy niezamknięty milestone i zgodne zadania | „Usunięcie kaskadowe jest bezpieczne" | reguły zamykania i kaskady po stronie bazy | integration (prawdziwa baza) | mock bazy, który kłamie o kaskadach |
| #7 | Użytkownik B nie czyta ani nie zmienia danych użytkownika A, także przez bezpośrednie wywołanie API | „Zalogowany to uprawniony" | warstwa wymuszająca własność i to, czy zwykły klient może ją ominąć | integration (rozszerzenie istniejącego testu RLS) | test tylko na jednym koncie |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Poprawność listy na dziś | Dowieść, że lista jest kompletna, uporządkowana i stabilna na granicach dat; zainicjować runner testów aplikacji i podpiąć testy bazy do CI | #1, #2, #3 | integration, parametryczne granice dat | complete | context/archive/2026-10-26-testing-today-list-correctness/ |
| 2 | Akcje i rytmy | Dowieść, że akcje na liście i zmiana rytmu nie gubią zadań ani odhaczeń | #4, #5 | integration, hermetyczne stuby częściowych błędów | complete | context/archive/2026-10-26-testing-list-actions-and-rhythms/ |
| 3 | Spójność danych i izolacja | Dowieść poprawności reguły milestona po edycji i usunięciu oraz granicy własności danych | #6, #7 | integration (rozszerzenie testów bazy i RLS) | complete | context/archive/2026-10-27-testing-data-integrity-isolation/ |
| 4 | Jeden przepływ e2e i bramki | Domknąć krytyczny przepływ w przeglądarce i utrwalić bramki w CI i hooku | #1, #4 (domknięcie) | 1 test e2e, bramki jakości | complete | context/changes/testing-e2e-flow-and-gates/ |

Faza 1 zamknięta z dwoma świadomie otwartymi wierszami Progress: 3.6 (job `smoke` z `supabase test db` nie był uruchomiony na CI, brak zdalnego repozytorium) i 4.3 (`prettier --check` dla tego pliku i `CLAUDE.md` nie przechodził już przed zmianą). Zweryfikować 3.6 przy pierwszym pushu.

Faza 4 ma świadomie otwarty wiersz 3.5 (krok e2e w jobie `smoke` nie był uruchomiony na CI, brak zdalnego repozytorium); zweryfikować przy pierwszym pushu.

## 4. Stack

The classic test base for this project. Profil bazy testów: `sparse` na starcie rolloutu; po Fazie 1 są
testy `node --test` (4 pliki w `scripts/`, w tym test hooków agenta), testy `vitest` dla warstwy aplikacji (`src/**/*.test.ts`),
15 plików pgTAP w `supabase/tests/database/` (w CI), smoke auth oraz (po Fazie 4) e2e Playwright
(1 test przepływu + seed w `tests/e2e/`); serwisy, endpointy i widoki poza logiką dat nadal bez testów jednostkowych.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | `node --test` (wbudowany runner Node, `npm run test:unit`) | Node 22 | Pokrywa tylko `scripts/`; w CI |
| database / integration | pgTAP przez Supabase CLI (`supabase/tests/database/`) | Supabase CLI latest (z CI) | 15 plików reguł domeny i RLS (`npm run test:db`); krok w jobie `smoke` w CI |
| app-level unit + integration | `vitest` | 5.0.5 (checked: 2026-10-26) | `npm run test:app`, `src/**/*.test.ts` (alias `@/`); krok w jobie `ci` w CI |
| smoke | `scripts/smoke.mjs` (job `smoke` w CI) | — | Tylko przepływ auth; sprawdza treść wysp React, nie tylko status (lessons.md) |
| e2e | Playwright Test (`@playwright/test`, `npm run test:e2e`) | 1.64.1 (checked: 2026-10-30) | 1 przepływ krytyczny + seed, tylko Chromium; krok w jobie `smoke` w CI |
| accessibility | none | — | Poza zakresem (patrz §7) |

**Stack grounding tools (current session):**
- Docs: none — Context7 / docs MCP not available in current session; checked: 2026-10-26
- Search: none — Exa.ai / web search MCP not available in current session; checked: 2026-10-26
- Runtime/browser: `playwright-cli` (powłoka) zainstalowane i użyte do eksploracji aplikacji; MCP Playwright nadal niedostępne; checked: 2026-10-30
- Provider/platform: none — GitHub/Cloudflare/Supabase MCP not available in current session; checked: 2026-10-26

Rekomendacje wynikają wyłącznie z lokalnych manifestów i konfiguracji. Przed wyborem
runnera aplikacji `/10x-research` powinien sprawdzić aktualną dokumentację.

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck (`eslint`, `astro check`) | local: husky pre-commit uruchamia `lint-staged` (`eslint --fix`, `prettier`, `check-hardcoded-values`), bez typechecku; `astro check` w hooku końca tury agenta; CI: lint i `astro check` | required (wired) | syntactic / type drift |
| unit (`npm run test:unit`) | local + CI | required (wired) | regresje w skryptach pomocniczych |
| smoke auth | CI (job `smoke`) | required (wired) | zepsuty przepływ logowania, wyspy React nierenderujące się |
| database tests (pgTAP) | local + CI | required (wired) | regresje reguł domeny, listy na dziś i RLS |
| app-level unit + integration | local + CI | required (wired) | błędy logiki serwisów i walidacji |
| e2e on critical flow | CI on PR (job `smoke`, port 4321 po zatrzymaniu preview smoke) + local (`npm run test:e2e`) | required (wired); pierwszy zdalny przebieg do zweryfikowania (3.5) | zepsuty krytyczny przepływ (login → zadanie → lista → odhaczenie) |
| post-edit hook | local (agent loop, `.claude/settings.json`) | recommended (wired locally) | regresje w czasie edycji: PostToolUse ESLint edytowanego pliku; Stop: eslint + `astro check` + `vitest run`, jedna próba ponowienia; dowód `scripts/agent-hooks.test.mjs` w `test:unit` |
| mutation testing (Stryker) | local, ad hoc | optional, selektywnie po fazie ryzyka | testy, które nie wykryłyby zepsucia reguły |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- **Location**: `src/**/*.test.ts` (obok modułu, runner `vitest`); `scripts/*.test.mjs` zostają na `npm run test:unit`.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/today.test.ts`.
- **Run locally**: `npm run test:app`.

### 6.2 Adding a database / integration test

- **Location**: `supabase/tests/database/`.
- **Naming**: `core_domain_<topic>.test.sql`.
- **Reference test**: `supabase/tests/database/core_domain_today_list.test.sql`.
- **Run locally**: `npm run test:db` (`supabase test db`; wymaga `npx supabase start` i Dockera). Uruchamia wszystkie pliki z katalogu; w CI jako krok jobu `smoke`.
- **Reference test (przegląd dat)**: `supabase/tests/database/core_domain_today_list_days.test.sql`.

### 6.3 Adding a test for the today-list rule (qualification, ordering, date boundaries)

- Wyrocznia pisana ręcznie z PRD (FR-009, FR-010) i kalendarza Warszawy, nigdy liczona kodem pod testem.
- Jeden zestaw danych; zapytanie o kilka dat przez `generate_series`, jedna asercja na własność nad wspólnym zapytaniem (bez kopii per dzień).
- Datę podajemy jako parametr `p_today`, nigdy z zegara systemowego; do tego test strefy czasowej sesji i strażnik strukturalny (źródło funkcji bez odczytu zegara: `current_*`, `localtime*`, `now()`, `*_timestamp`, `timeofday`). Test strefy sam nie wykryje zegara, bo data jest podawana jawnie, więc to strażnik jest właściwą ochroną.
- Kolejność dosłownie wg FR-010: własny termin rosnąco, brak terminu na końcu, ale widoczny; data milestona tylko jako rozstrzygnięcie remisu.
- Logika dat po stronie aplikacji: tabele `vitest` z ręcznie wpisanymi oczekiwanymi dniami dla chwil wokół północy w Warszawie i obu zmian czasu (wzór: `src/lib/today.test.ts`).
- Każdy nowy test zepsuj celowo (break-check) i potwierdź, że robi się czerwony.
- Znana luka: PRD US-01 mówi o terminie „własnym lub milestona", a kolejność tego nie dziedziczy; nie ma testu, który by tego wymagał (patrz §7).

### 6.4 Adding a test for list actions and recurring rhythm changes

- **Dwie warstwy, najtańsza z sygnałem**: stan końcowy i lista dla dni D i D+1 sprawdzamy w pgTAP na prawdziwej bazie; w `vitest` ze stubem klienta tylko to, czego baza nie widzi (mapowanie błędów po podciągach komunikatów, warunkowe zapisy typu `.neq`, odczyt rozstrzygający). Każda akcja serwisu to jeden zapis, więc testów „połowicznego zapisu” nie piszemy.
- **pgTAP — akcje**: wykonuj ten sam `update`/`insert` co serwis jako rola `authenticated`, potem `today_list(p_today)` dla D i D+1. Dane jako `postgres`. Wzór: `supabase/tests/database/core_domain_today_list_actions.test.sql`.
- **pgTAP — zmiana rytmu**: jeden `update` z nowym rytmem i `recurrence_start_date` = dzień zmiany (tak jak aplikacja), stan wierszy `task_occurrences` (`occurrence_date`, `state`, `moved_to`) wpisany ręcznie po każdym kroku. Wzory: `core_domain_recurring_rhythm_change.test.sql` (reguła podstawowa), `core_domain_recurring_rhythm_change_edges.test.sql` (dwie zmiany pod rząd, milestone, kaskada).
- **vitest — serwisy**: stub klienta supabase-js, komunikaty błędów kopiowane z migracji, nigdy ze stałych serwisu (inaczej test lustrzany). Wzór: `src/lib/services/tasks.test.ts`. Uruchom: `npm run test:app`.
- **Oracle**: oczekiwane wartości wpisane ręcznie z PRD i decyzji (nagłówek pliku wskazuje źródło). Reguły z decyzji S-05 (422 dla zrobionego, zapis statusu zeruje przeniesienie, częściowo + na jutro zostawia status) to reguły projektowe, nie PRD; w nagłówku oznaczone jako takie.
- **Granica zmiany rytmu**: usuwane są przeniesienia ze źródłem lub celem `>=` nowej daty startu (decyzja S-10); test F i `edges` pinują `>=` na dniu docelowym (`moved_to`); strona źródłowa jest redundantna, bo cel jest zawsze późniejszy od źródła.
- **Break-check**: każda nowa asercja przechodzi kontrolę zepsucia. Dla bazy: wyciągnij definicję funkcji z migracji do pliku tymczasowego, wgraj wariant (`docker exec -i supabase_db_10x-astro-starter psql -U postgres < wariant.sql`), uruchom `npm run test:db` (ma być czerwony), wgraj oryginał i potwierdź zielony. Dla `vitest`: zmień kod serwisu w working tree i przywróć `git checkout`.
- **Uruchom**: `npm run test:db` (pgTAP, wymaga lokalnego Supabase i Dockera), `npm run test:app` (vitest).
- **Znane luki**: współbieżność dwóch sesji, widoczność przeniesienia sprzed nowego startu i zmiana rytmu w zamkniętym milestonie — patrz §7.

### 6.5 Adding a test for data integrity and ownership

- **Warstwa**: wyłącznie pgTAP na prawdziwej bazie. `vitest` ze stubem klienta nie nadaje się do #6 i #7: stub nie ma RLS ani kaskad, więc kłamałby dokładnie o tym, co chcemy dowieść (§2, „mock bazy, który kłamie o kaskadach").
- **Location**: `supabase/tests/database/`; **Naming**: `core_domain_<topic>.test.sql`; **Run locally**: `npm run test:db` (wymaga `npx supabase start` i Dockera).
- **Reference tests**: `supabase/tests/database/core_domain_milestone_list_integrity.test.sql` (reguła milestona po edycji/usunięciu, kaskady) i `supabase/tests/database/core_domain_account_isolation.test.sql` (izolacja dwóch kont).
- **Reguła milestona (#6)**: scenariusz to sekwencja stan → mutacja jako `authenticated` (ten sam `update`/`delete` co aplikacja) → `today_list(p_today)` dla stałej daty → `results_eq` z wierszami wpisanymi ręcznie. Każdy scenariusz ma własny projekt, a asercje filtrują po `project_id`; w scenariuszach usunięć projekt kontrolny z identyczną strukturą dowodzi, że mutacja nie dotknęła cudzego poddrzewa. Kaskady sprawdzamy licznością `task_occurrences` (w tym stan `moved`) dla usuniętego poddrzewa i dla kontrolnego.
- **Oracle**: z PRD (FR-003, FR-005, Business Logic, Access Control), nigdy z ciała `today_list`; reguły projektowe (np. „najbliższy = niezamknięty o najmniejszym `due_date`, `seq`") oznacz w nagłówku jako decyzje, nie PRD.
- **Izolacja (#7)**: symetryczne drzewo danych na konto i ten sam zestaw prób A→B oraz B→A (jedna funkcja prób w pliku wołana dwa razy z zamienionymi aktorami, bez kopiowania asercji; funkcje pomocnicze znikają z `rollback`). Odczyty ofiary muszą być puste, także dla `today_list` (dzień dobrany tak, by dane ofiary dawały wiersze, gdyby były widoczne).
- **Stan ofiary jako `postgres`**: RLS milczy przy `update`/`delete` cudzego wiersza (0 wierszy, brak błędu), więc sam brak błędu niczego nie dowodzi. Po serii ataków `reset role` i sprawdź jako `postgres` nazwy, `user_id` i liczność dzieci ofiary (np. delete projektu przez obce konto zostawia milestony, zadania i odhaczenia bez zmian). Zapisy z cudzym `user_id` dają `42501`, a własne dziecko pod cudzym rodzicem `23503`.
- **Break-check wg §6.4** (wariant polityki/funkcji/FK wgrany do kontenera, `npm run test:db` czerwone, przywrócenie, zielone). Ustalenie z Fazy 2: `DELETE` i `UPDATE` wymagają widoczności wiersza z polityki `select`, więc zepsucie samej polityki `delete` nie jest obserwowalne; break-check ochrony przed usunięciem musi psuć `select` i `delete` razem. Break-check kierunku: wariant chroniący tylko jedno konto ma zaczerwienić asercje tylko jednego kierunku.
- **Znane luki**: współbieżność i HTTP/API na dwóch kontach, plus znane ryzyko wycieku istnienia wiersza — patrz §7.

### 6.6 Adding an e2e test

- **Warstwa**: e2e dowodzi tylko tego, czego pgTAP i vitest nie widzą: sesji cookie, hydracji wysp React i ścieżki kliknięcie → zapis → przeładowanie renderu serwerowego. Reguły listy i akcji zostają w pgTAP (§6.3–§6.4); nowy test e2e dodajemy tylko dla ryzyka, którego nie pokrywa tańsza warstwa.
- **Location**: `tests/e2e/` (`*.spec.ts`; `*.setup.ts` to projekt `setup`; wspólne helpery w `tests/e2e/helpers/`). **Naming**: `<flow>.spec.ts`, w nagłówku ryzyko z §2 i źródło oczekiwań.
- **Reference tests**: `tests/e2e/today-flow.spec.ts` (jeden test, dwa zadania: A „Częściowo" → B „Na jutro" → A „Zrobione", asercje stanu po przeładowaniu), `tests/e2e/seed.spec.ts` (stan pusty `/today`, wyspa renderuje „Dodaj zadanie" z `aria-disabled`), `tests/e2e/helpers/auth.ts` (`registerAndSignIn`).
- **Run locally**: `npm run test:e2e`; jedna specyfikacja: `npx playwright test today-flow`. Konfiguracja: `playwright.config.ts` (projekt `setup` + projekt `chromium` ze `storageState: playwright/.auth/user.json`; `webServer` sam robi `npm run build && npm run preview -- --port <PORT>` z `ASTRO_PREVIEW_BACKGROUND=1`, port z `E2E_PORT`, domyślnie 4321). Pełny opis w `context/foundation/test-stack.md`.
- **Wymagania lokalne**: Docker i `npx supabase start`; `.dev.vars` (i `.env`) z lokalnym Supabase; port wolny (nic nie nasłuchuje na `E2E_PORT`, inaczej lokalnie testujesz po cichu cudzy serwer; lokalnie `E2E_PORT=4322` w `.env`, bo 4321 bywa zajęty przez `astro dev`). Nie commituj `playwright/.auth/` ani `.env`. W CI: krok w jobie `smoke` na porcie 4321, po zatrzymaniu preview smoke (`astro preview` trzyma blokadę per katalog; `reuseExistingServer` = false).
- **Lokatory**: `getByRole` / `getByLabel` / `getByText`; `data-testid` nie istnieje i nie dodajemy go bez potrzeby. Przyciski akcji mają `aria-label` `Zrobione: <tytuł>`, `Częściowo: <tytuł>`, `Na jutro: <tytuł>`; hasło: `getByLabel("Hasło", { exact: true })` (przełącznik „Pokaż hasło" ma też label). Nigdy CSS, XPath ani struktura DOM.
- **Oczekiwanie**: nigdy `page.waitForTimeout()`; `expect(...)` czeka na stan (`toBeVisible`, `toHaveCount`, `waitForURL`). Wyspy `client:load` gubią kliknięcia przed hydracją: czekaj na zniknięcie `astro-island[ssr]`. Po akcji strona robi `window.location.reload()`, więc asertuj stan po przeładowaniu, nie odpowiedź sieciową.
- **Dane i niezależność**: każdy test, który mutuje dane, rejestruje własnego użytkownika (`e2e-<Date.now()>-<losowy>@example.com`) przez `registerAndSignIn`; tytuły z sufiksem czasu. Bez osobnego cleanupu, bo dane należą do świeżego użytkownika (RLS); adnotacja `test-data` niesie tytuły. Zadania bez terminu i odległe daty (serwer liczy „dziś" w Europe/Warsaw, `page.clock` go nie przesunie); dokładnie jeden milestone na projekt (lista pokazuje tylko najbliższy). „Przeniesione na później" jest domyślnie zwinięte: rozwiń przed asercją. Znane, zaakceptowane źródło flaky: jeśli północ w Warszawie wypadnie między kliknięciem „Na jutro" a asercją po przeładowaniu, przeniesione zadanie staje się „dzisiejsze" i licznik znika (okno kilku sekund na dobę); w razie sporadycznej czerwieni około 22:00-00:00 UTC najpierw to wyklucz.
- **Oracle**: oczekiwania wpisane ręcznie z PRD (`today-flow.spec.ts` cytuje linie PRD w nagłówku), nigdy liczone z kodu; nie asertuj dat, chipów terminów, nagłówka dnia ani komunikatów spoza PRD. Wyjątki są świadome i opisane w nagłówku testu jako decyzje S-05, nie wymagania: `aria-pressed` na „Częściowo", dopisek „częściowo" i blok „Przeniesione na później"; że częściowo zrobione zostaje na liście, to wniosek z PRD 106, nie z PRD 52. Asertuj treść renderowaną przez wyspę, nie tylko status strony (lessons.md, lekcja nr 1).
- **Break-check** (jak §6.4, w working tree): `throw` w ciele komponentu wyspy (NIE w sygnaturze: to daje błąd builda, nie czerwoną asercję), `done` → `todo` w zapisie statusu, ukryty blok `view.deferred` w `today.astro`; ma zaczerwienić asercję ryzyka, nie timeout ani logowanie; przywrócenie `git checkout --`. Przed każdym break-checkiem port E2E musi być wolny, żeby `webServer` przebudował aplikację z uszkodzeniem.
- **Znane luki**: lista następnego dnia i „Pominięte wczoraj" w przeglądarce, drugi test e2e, dwa konta, inne przeglądarki i e2e w hookach — patrz §7.

### 6.7 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

- **Faza 1 (testing-today-list-correctness)**: baza pgTAP była już zielona przed zmianami; peers `vitest` 5.0.5 akceptują Vite 8. Słabość: nowy test kolejności w `core_domain_today_list_days.test.sql` czyta kolejność wierszy przez `row_number() over ()` bez `ORDER BY`; dziś kolejność gwarantuje pełny `ORDER BY` funkcji, ale zmiana planera mogłaby dać fałszywą czerwień (nie fałszywą zieleń).

- **Faza 2 (testing-list-actions-and-rhythms)**: research błędnie twierdził, że kolejność gałęzi komunikatów błędu w `moveOccurrenceToTomorrow` ma znaczenie; sprawdzenie pokazało, że gałęzie są rozłączne, więc break-check 1.5 psuje podciąg komunikatu, nie kolejność. Wszystkie ręcznie wpisane oczekiwania pgTAP zgodziły się z bazą od razu poza jednym (asercja 11 w `edges`: przeniesienie sprzed nowego startu nie pojawia się na liście, bo `today_list` obejmuje dni od startu rytmu; wiersz zostaje w tabeli).

- **Faza 3 (testing-data-integrity-isolation)**: oba pliki pgTAP zgodziły się z ręczną wyrocznią; jedyna korekta break-checku dotyczyła „remisu" dat (łapie go wariant `seq desc`, nie `due_date desc`). Wariant klucza w teście izolacji (odhaczenie z `task_id` zadania ofiary, istniejącą datą i `user_id` aktora) daje `23505` (`task_occurrences_pkey`) w obu kierunkach: wyciek istnienia wiersza przy znajomości UUID zadania, przypięty w teście i opisany w §7, bez zmiany schematu. Polityka `delete` nie jest osobno obserwowalna bez zepsucia `select` (patrz §6.5).

- **Faza 4 (testing-e2e-flow-and-gates)**: wspólny `storageState` jednego użytkownika dawał wyścigi (`--repeat-each=3` padało 3 z 3: równoległe przebiegi widziały nawzajem milestony i przeniesione zadania), więc każdy test mutujący dane rejestruje własnego użytkownika. Pierwszy break-check z `throw` w sygnaturze komponentu był fałszywy (błąd builda, nie czerwona asercja): `throw` musi być w ciele. Hooki agenta napisano w Node (`.claude/hooks/*.mjs`), bo na maszynie nie ma `jq`; dowód to `scripts/agent-hooks.test.mjs` w `test:unit`.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Wygląd UI i tokeny designu (w tym snapshoty UI)** — pilnuje ich już `check:values` w pre-commit. Re-evaluate if kontrakt designu przestanie być egzekwowany skryptem. (Source: interview Q5.)
- **Strony auth poza istniejącym smoke** — obecny smoke wystarcza. Re-evaluate if pojawi się OAuth lub dodatkowe przepływy auth. (Source: interview Q5.)
- **Kitchen sink (`/dev/kitchen-sink`) i skrypty pomocnicze** — narzędzia deweloperskie, niewidoczne dla użytkownika. Re-evaluate if zaczną wpływać na produkcję. (Source: interview Q5.)
- **Kontrola wielu użytkowników i nadużyć na dużą skalę (rate-limit, obciążenie)** — na starcie jedyny użytkownik to autor. Re-evaluate if aplikacja zostanie udostępniona szerszemu gronu. (Source: interview Q5.)
- **Dziedziczenie terminu milestona w kolejności (PRD US-01) i sygnał daty milestona na wierszu zadania (guardrail 2)** — nie testujemy ich jako wymagań, bo to nierozstrzygnięta decyzja produktowa; aktualne zachowanie jest utrwalone (FR-010 dosłownie, chip terminu). Re-evaluate if decyzja produktowa zapadnie. (Source: research/plan of change testing-today-list-correctness.)
- **Runtime Cloudflare Workers dla `Intl` / strefy Europe/Warsaw** — pokryty jest tylko Node. Re-evaluate if w produkcji zaobserwowany zostanie błąd granicy dnia albo pojawi się warstwa e2e/workerd. (Source: research/plan of change testing-today-list-correctness.)

- **Współbieżność dwóch sesji na tym samym zadaniu (akcja i zmiana rytmu równocześnie)** — pgTAP jest jednosesyjny, a wyścig wymagałby osobnej infrastruktury. Re-evaluate if pojawi się współdzielenie zadań lub użycie z kilku urządzeń naraz. (Source: plan of change testing-list-actions-and-rhythms.)
- **Zmiana rytmu w zamkniętym milestonie** — PRD nie rozstrzyga, czy baza ma ją przyjąć; test `core_domain_recurring_rhythm_change_edges.test.sql` tylko pinuje obecne zachowanie (przyjmuje zmianę, lista bez `routine`/`skipped`), nie jest wymaganiem. Re-evaluate if decyzja produktowa zapadnie. (Source: research of change testing-list-actions-and-rhythms.)
- **Widoczność przeniesienia sprzed nowej daty startu rytmu** — zachowanie (wiersz zostaje, lista go nie pokazuje) jest pinowane jako wynik reguły „start = dziś”, PRD tego wprost nie mówi. (Source: Phase 3 of change testing-list-actions-and-rhythms.)
- **Reguły S-05 (422 dla zrobionego zadania, zapis statusu zeruje przeniesienie, częściowo + na jutro zostawia status)** — pinowane jako reguły projektowe, nie wymagania PRD; zmiana decyzji S-05 powinna zmienić te testy świadomie. (Source: plan of change testing-list-actions-and-rhythms.)

- **Współbieżność usunięcia milestona i zapisu zadania (deadlock `40P01`)** — pgTAP jest jednosesyjny, a wyścig wymagałby osobnej infrastruktury; reguła jest tylko opisana w migracji. Re-evaluate if pojawi się współdzielenie danych lub użycie z kilku urządzeń naraz albo deadlock zostanie zaobserwowany w produkcji. (Source: plan of change testing-data-integrity-isolation.)
- **HTTP/API na dwóch kontach (e2e)** — izolację dowodzimy na poziomie bazy (RLS i funkcje `security invoker`), nie przez endpointy; Faza 4 nie dodała e2e z dwoma kontami. Re-evaluate if pojawi się infrastruktura e2e z dwoma kontami albo aplikacja zacznie używać klucza innego niż anon po stronie serwera. (Source: plan of change testing-data-integrity-isolation; Phase 4 of change testing-e2e-flow-and-gates.)
- **Znane ryzyko: wyciek istnienia wiersza `task_occurrences` (`23505`)** — wstawienie odhaczenia z kluczem zadania innego konta i istniejącą datą zwraca `23505` zamiast `23503`, co zdradza istnienie wiersza; wymaga znajomości UUID zadania. Test `core_domain_account_isolation.test.sql` pinuje wynik jako obserwację, nie wymaganie; schemat bez zmian. Re-evaluate if UUID zadań staną się odgadywalne lub ujawniane albo przed publicznym udostępnieniem API. (Source: Phase 2 of change testing-data-integrity-isolation.)

- **Lista następnego dnia i „Pominięte wczoraj" w przeglądarce** — PRD nie definiuje takiego widoku, a serwerowego „dziś" (Europe/Warsaw) nie da się przesunąć w teście e2e; te reguły zostają w pgTAP z wstrzykniętą datą. Re-evaluate if PRD doda widok następnego dnia albo pojawi się wstrzykiwalny zegar serwera. (Source: research/plan of change testing-e2e-flow-and-gates.)
- **Drugi test e2e i e2e z dwoma kontami** — jeden przepływ krytyczny wystarcza (cost × signal), izolacja kont zostaje w pgTAP. Re-evaluate if regresja przeglądarkowa ominie obecny test albo pojawi się współdzielenie danych. (Source: plan of change testing-e2e-flow-and-gates.)
- **Weryfikacja kroku e2e w CI do pierwszego pusha na zdalne repozytorium** — krok w jobie `smoke` (wiersz 3.5 planu) był sprawdzony tylko lokalnie, brak zdalnego repozytorium. Re-evaluate at the first push. (Source: Phase 3 of change testing-e2e-flow-and-gates.)
- **e2e tylko w Chromium** — projekt `chromium` wystarcza dla aplikacji z jednym użytkownikiem. Re-evaluate if pojawi się błąd specyficzny dla przeglądarki (Safari/Firefox) lub szerszy krąg użytkowników. (Source: plan of change testing-e2e-flow-and-gates.)
- **e2e poza hookami agenta** — za wolne (build + preview + przeglądarka); hooki to eslint, `astro check` i `vitest run`, e2e działa lokalnie na żądanie i w CI. Re-evaluate if e2e skróci się do kilkunastu sekund albo agent zacznie często łamać przepływ bez wykrycia lokalnie. (Source: Phase 3 of change testing-e2e-flow-and-gates.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-26
- Stack versions last verified: 2026-10-30 (Playwright 1.64.1; bez zmian pozostałych wersji, `vitest` 5.0.5)
- AI-native tool references last verified: 2026-10-26 (brak narzędzi AI-native w planie)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
