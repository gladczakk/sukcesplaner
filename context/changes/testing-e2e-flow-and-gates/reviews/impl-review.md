<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Jeden przepływ e2e i bramki jakości (Faza 4)

- **Plan**: context/changes/testing-e2e-flow-and-gates/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 8 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated gates re-run during review (wszystkie PASS): `grep` i `prettier --check` na `ci.yml`, greps §6.6/§4 w `test-plan.md`, `ls` plików testowych, `npm run test:e2e` (3 testy), `npx playwright test today-flow --repeat-each=3` (4 testy), `npm run lint` (0 błędów), `npm run test:app` (92), `npm run test:unit` (55), `npm run test:db` (495). `prettier --check` na `test-plan.md` zgłasza ostrzeżenie jak przed zmianą (stan bazowy). Diff: 32 pliki, zero zmian w `src/` i `supabase/`. Wiersz 3.5 (krok e2e na zdalnym CI) pozostaje świadomie otwarty.

## Findings

### F1 — Krok e2e w CI prawdopodobnie nie wystartuje: osierocony preview smoke blokuje drugi `astro preview`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:55-62, playwright.config.ts:35
- **Detail**: Krok smoke uruchamia `npm run preview -- --port 4321 &` i nigdy go nie zatrzymuje. Krok e2e każe Playwrightowi uruchomić w tym samym katalogu `npm run preview -- --port 4322`. `astro preview` zapisuje blokadę per katalog (`node_modules/astro/dist/cli/preview/index.js:93-124`) i przy działającym serwerze kończy się komunikatem „Another astro preview server is already running” (obejście: `--ignore-lock` albo `--force`). Zweryfikowano istnienie logiki blokady w źródle; nie zweryfikowano, czy proces w tle przeżywa do następnego kroku joba (brak zdalnego repozytorium). Obejście portem 4322 nie rozwiązuje blokady, tylko konfliktu portów.
- **Fix A ⭐ Recommended**: Zatrzymać preview smoke po smoke i wrócić do portu 4321.
  - Strength: Usuwa przyczynę (dwa preview naraz), a konfiguracja e2e traci obejście `E2E_PORT` w CI; test-stack.md i §5/§6.6 upraszczają się.
  - Tradeoff: Zmiana istniejącego kroku smoke (zapis PID i `kill` na końcu) oraz aktualizacja opisów §5/§6.6/test-stack.md.
  - Confidence: MEDIUM — wzorzec jest prosty, ale zachowanie procesów między krokami runnera niezweryfikowane.
  - Blind spot: Czy runner w ogóle zostawia proces smoke przy życiu; jeśli nie, problem nie występuje, a poprawka jest tylko zabezpieczeniem.
- **Fix B**: Dodać `--ignore-lock` do polecenia `webServer`.
  - Strength: Jedna linia, bez ruszania kroku smoke.
  - Tradeoff: Ukrywa podwójny serwer również lokalnie i zostawia dwa preview w CI na jednym katalogu `dist`.
  - Confidence: MEDIUM — flaga istnieje w źródle, nie uruchomiono jej.
  - Blind spot: Zachowanie dwóch workerdów na tym samym buildzie.
- **Decision**: FIXED via Fix A — krok smoke startuje preview przez `node node_modules/astro/bin/astro.mjs preview`, zatrzymuje go (`kill` + `wait`), a krok e2e wraca do portu 4321 bez `E2E_PORT`; zaktualizowano test-plan §5 i §6.6. Lokalnie sprawdzono: preview przez node + `npm run smoke` PASS + port wolny po zatrzymaniu; CI niezweryfikowane (wiersz 3.5). Dodatkowo, za zgodą, zatrzymano proces `astro dev` (PID 31776) na 4321, którego użytkownik nie uruchamiał.

### F2 — Pusty `E2E_PORT=` w `.env.example` daje port 0

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: playwright.config.ts:10, .env.example:3
- **Detail**: Po skopiowaniu `.env.example` do `.env` zmienna `E2E_PORT` jest pustym ciągiem; `"" ?? 4321` zostaje `""`, a `Number("")` to 0, więc baseURL to `http://localhost:0`, a preview startuje z `--port 0`.
- **Fix**: Zmienić na `Number(process.env.E2E_PORT || 4321)` (i ewentualnie zakomentować linię w `.env.example`).
- **Decision**: FIXED — puste lub brakujące `E2E_PORT` daje 4321 (`const requestedPort = Number(process.env.E2E_PORT); requestedPort > 0 ? requestedPort : 4321`); wariant z `||` zatrzymał hook po edycji (`prefer-nullish-coalescing`)

### F3 — Oracle w specyfikacji: „częściowo zostaje” przypisane do PRD 52, a część asercji pochodzi z kodu aplikacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/today-flow.spec.ts:11, 73-77, 84-90, 100; context/foundation/test-plan.md §6.6
- **Detail**: PRD 52 mówi, że „częściowo zrobione i przeniesienie na jutro przenosi pozostałą część na listę następnego dnia”; to, że częściowo zrobione zostaje dziś na liście, jest wnioskiem (nagłówek to ujawnia). Asercje `aria-pressed`, „częściowo” i etykiety „Przeniesione na później”/„Przywróć na dziś” pochodzą z decyzji S-05, nie z PRD (plan to dopuszcza), a §6.6 mówi „nie asertuj komunikatów spoza PRD”.
- **Fix**: Doprecyzować komentarz w nagłówku i zdanie w §6.6: wyrocznia z PRD to „zrobione znika, niedokończone zostaje na liście”, a `aria-pressed` i sekcja przeniesionych to świadome decyzje S-05.
- **Decision**: FIXED — nagłówek `today-flow.spec.ts` i §6.6 rozdzielają wyrocznię z PRD (51, 52, 106; „zostaje na liście” to wniosek z 106) od decyzji S-05 (`aria-pressed`, dopisek „częściowo”, blok „Przeniesione na później”); asercje bez zmian

### F4 — §4 test-planu twierdzi „11 plików pgTAP”, w repo jest 15

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md §4 (opis profilu i wiersz tabeli pgTAP)
- **Detail**: Paragraf §4 przepisany w tej zmianie nadal mówi o 11 plikach; `supabase/tests/database/` ma 15 (`npm run test:db`: 15 plików).
- **Fix**: Zmienić 11 → 15 w opisie i w wierszu tabeli.
- **Decision**: FIXED — §4: 11 → 15 plików pgTAP (opis i wiersz tabeli)

### F5 — test-stack.md pomija `E2E_PORT=4322` w CI i fakt, że `today-flow` omija `user.json`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-stack.md (`## E2E`)
- **Detail**: Opis nie wspomina o porcie 4322 w CI (jest w §5/§6.6) ani o tym, że `playwright/.auth/user.json` używa tylko seed, a `today-flow` rejestruje własnego użytkownika. Nieujawnione drobiazgi: wpisy w `.gitignore` i `.env.example` oraz korekta ścieżki fazy 3 w §3.
- **Fix**: Dopisać dwa zdania do test-stack.md (po rozstrzygnięciu F1, bo F1 może zmienić opis portu w CI).
- **Decision**: FIXED — test-stack.md: storageState tylko dla seeda, użytkownik per test w today-flow, port CI 4321 po zatrzymaniu preview smoke

### F6 — Lokatory etykiet „Nazwa”, „Data”, „Termin” dopasowują podciąg

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/today-flow.spec.ts:48-49, 57-58, 66
- **Detail**: Dziś w każdym dialogu jest po jednym dopasowaniu, ale pole typu „Data zakończenia” albo „Nazwa skrócona” wywołałoby błąd strict mode. `auth.ts` już używa `exact: true` dla „Hasło”.
- **Fix**: Dodać `{ exact: true }` w tych lokatorach (dla „Termin” w dialogu zadania uważać na „Termin (opcjonalny)”).
- **Decision**: FIXED — `{ exact: true }` w lokatorach Nazwa, Termin, Data, Tytuł; `npx playwright test today-flow` zielone

### F7 — Znane źródło niestabilności: przejście północy Europe/Warsaw między kliknięciem a przeładowaniem

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/today-flow.spec.ts:100-101
- **Detail**: „Na jutro” przesuwa zadanie B na „jutro” liczone serwerowo; gdyby północ w Warszawie wypadła między kliknięciem a asercją po przeładowaniu, „Przeniesione na później: 1” zniknęłoby. Okno to kilka sekund na dobę (22:00-00:00 UTC w CI).
- **Fix**: Zaakceptować i dopisać zdanie do §6.6 lub komentarz przy teście; bez zmiany kodu.
- **Decision**: ACCEPTED — znane źródło flaky opisane w §6.6, bez zmiany kodu

### F8 — Utwardzenie hooków: separator `--` dla eslint oraz zaufanie do wpisów rejestru w katalogu tymczasowym

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/lib.mjs:66-69, .claude/hooks/lint-edited-file.mjs:25-36, .claude/hooks/end-of-turn.mjs:19-24, 46-48
- **Detail**: (1) Nazwy plików z `git diff`/`ls-files` trafiają do eslint bez `--`, więc plik `--foo.ts` byłby opcją. (2) Hook Stop ufa ścieżkom z `<tmpdir>/claude-hooks/<sid>.roots` bez ponownego sprawdzenia `repoId`, a katalog powstaje z domyślnymi uprawnieniami; na maszynie wieloużytkownikowej Linux lokalny atakujący mógłby podłożyć katalog, którego `node_modules/eslint` zostałby uruchomiony. Na jednoosobowym Windows ryzyko pomijalne. (3) Skopiowana konfiguracja hooków w repo uruchamia kod repozytorium przy każdej edycji (cecha zacommitowanych hooków; ochroną jest prompt zaufania projektu).
- **Fix**: Dodać `"--"` przed listą plików, sprawdzać `repoId` dla wpisów rejestru i tworzyć katalog z `mode: 0o700`; do przeglądu PR dopisać, by zmiany pod `.claude/` czytać uważnie.
- **Decision**: FIXED (część 1) — `--` przed listą plików w `lint-edited-file.mjs` i `end-of-turn.mjs`, test hooków zaktualizowany (oczekiwane argumenty), 22/22 zielone; rejestr w katalogu tymczasowym (część 2) świadomie pominięty: praca jednoosobowa lokalnie na Windowsie, ryzyko pomijalne

### F9 — Reporter `html` może zawiesić terminal po błędzie, a `trace: on-first-retry` nie daje śladu lokalnie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: playwright.config.ts:19, 22
- **Detail**: `reporter: "html"` po nieudanym teście serwuje raport lokalnie i czeka; w CI (zmienna `CI`) się nie otwiera. Lokalnie `retries: 0`, więc `on-first-retry` nigdy nie tworzy śladu, a ręczny wiersz 2.8 zakładał oglądanie trace.
- **Fix**: `reporter: [["html", { open: "never" }]]` i `trace: "retain-on-failure"` (lub dokumentacja `--trace on`).
- **Decision**: FIXED — `reporter: [["html", { open: "never" }]]` i `trace: "retain-on-failure"`; e2e 3/3 zielone

### F10 — Job `smoke` bez `permissions:` i `timeout-minutes`, z `supabase/setup-cli` w wersji `latest`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml (cały plik)
- **Detail**: Plik nie ma bloku `permissions` (domyślne uprawnienia GITHUB_TOKEN), a job `smoke` po tej zmianie buduje dwa razy, uruchamia Supabase i Playwright z `retries: 2`, bez `timeout-minutes`. `actions/checkout@v4`, `setup-node@v4` i `supabase/setup-cli@v1` (`version: latest`) są przypięte tagami; to sprzed tej zmiany. Nowy `upload-artifact` jest przypięty do pełnego SHA.
- **Fix**: Dodać `permissions: contents: read` i `timeout-minutes` dla joba `smoke`; przypięcie pozostałych akcji osobną zmianą.
- **Decision**: FIXED — `permissions: contents: read` (cały workflow) i `timeout-minutes: 20` w jobie `smoke`; przypięcie pozostałych akcji tagami zostaje osobną zmianą; CI niezweryfikowane (wiersz 3.5)
