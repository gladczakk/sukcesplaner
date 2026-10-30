# Jeden przepływ e2e i bramki jakości (Faza 4) Implementation Plan

## Overview

Dowodzimy w przeglądarce jednego krytycznego przepływu (rejestracja → projekt → milestone → zadania z dialogu na `/today` → akcje „Częściowo", „Na jutro", „Zrobione") i utrwalamy bramki: krok e2e w CI oraz hook po edycji i na koniec tury. To zamyka ryzyka #1 i #4 w tej części, której pgTAP i vitest nie widzą: sesja cookie, hydracja wysp React, kliknięcie → zapis → przeładowanie renderu serwerowego. Zmiana jest czysto testowa i konfiguracyjna: zero zmian w `src/` i w schemacie.

## Current State Analysis

- Reguły listy i akcji (#1, #4) są dowiedzione w pgTAP i vitest (Fazy 1–3). Warstwa przeglądarkowa nie istnieje: Playwright nie jest w `package.json` ani `node_modules`, brak `playwright.config.*`.
- `scripts/smoke.mjs` to precedens wyłącznie HTTP (`fetch` i ręczny cookie jar), więc nie dowodzi hydracji wysp ani sesji w przeglądarce.
- Środowisko pod e2e istnieje tylko w jobie CI `smoke`: lokalny Supabase, `build`, `preview` na 4321 z `.dev.vars` (`.github/workflows/ci.yml:29-58`).
- Hook agenta po edycji nie istnieje (brak `.claude/settings*.json`); husky uruchamia tylko `lint-staged`, bez typechecku (test-plan §5 mówi inaczej).
- Wyrocznia: PRD nie definiuje komunikatu po akcji ani widoku listy następnego dnia; jedyną wyrocznią jest „wiersz znika lub pojawia się na liście" (`prd.md:49-52, 106`).

## Desired End State

`npm run test:e2e` przechodzi lokalnie (przy lokalnym Supabase i buildzie) i w jobie `smoke` w CI; test dowodzi przepływu z oczekiwaniami wpisanymi z PRD, a każda jego kluczowa asercja przeszła break-check. Hook po edycji i na koniec tury działa i jest udowodniony na celowo zepsutym pliku. `test-plan.md` §6.6 mówi, jak dodać kolejny test e2e, a §4, §5, §2 #4 i §3 odzwierciedlają stan faktyczny.

### Key Discoveries:

- Przyciski akcji mają `aria-label` nadpisujący tekst: `Zrobione: <tytuł>`, `Częściowo: <tytuł>` (z `aria-pressed`), `Na jutro: <tytuł>` (`src/components/today/TodayTaskActions.tsx:71, 89, 104-105, 120`); brak `data-testid`.
- Po akcji strona robi `window.location.reload()`, bez stanu optymistycznego (`TodayTaskActions.tsx:45`); przeniesione zadania trafiają do `<details>` „Przeniesione na później: N" (`src/pages/today.astro:190`) z przyciskiem `Przywróć na dziś: <tytuł>` (`RestoreDeferredButton.tsx:55`).
- Zadanie wymaga projektu i otwartego milestona; na `/today` jest tylko z najbliższego otwartego milestona (`AddTaskFromTodayDialog.tsx:488-506`), więc w teście ma być dokładnie jeden milestone.
- „Dziś" liczy serwer w Europe/Warsaw (`src/lib/today.ts:653`, `src/pages/today.astro:27`); `page.clock` go nie przesunie. Zadanie bez terminu nie zależy od daty.
- Lokalnie `enable_confirmations = false` (`supabase/config.toml:209`); unikalny e-mail na przebieg wzorem `scripts/smoke.mjs:5-6`.
- Przełącznik hasła ma `aria-label` „Pokaż hasło"/„Ukryj hasło" (`src/components/auth/PasswordField.tsx:52`), więc `getByLabel("Hasło")` może trafić w dwa elementy; lokator ma być zawężony.
- Lekcja nr 1 (`context/foundation/lessons.md`): asercja na treść renderowaną przez wyspę i break-check przez `throw` w komponencie.

## What We're NOT Doing

- Drugiego testu e2e ani e2e z dwoma kontami (test-plan §7; izolacja zostaje w pgTAP).
- Listy następnego dnia i „Pominięte wczoraj" w przeglądarce: PRD nie ma widoku, a serwerowego „dziś" nie da się przesunąć. Zostają w pgTAP.
- Asercji na daty, chipy terminów, nagłówek dnia ani na komunikaty spoza PRD (decyzje S-05 nie są wymaganiem).
- Zmian w `src/` (np. dodawania `data-testid`) i w schemacie bazy.
- Testów wizualnych, multimodalnych i dostępności (test-plan §7).
- Zmiany CI poza jednym blokiem kroków e2e w istniejącym jobie `smoke`; osobnego joba nie tworzymy.
- Hooków pre-commit/pre-push (tylko rekomendacja, wg lekcji M3L3).

## Implementation Approach

Cztery fazy, jedna po drugiej, każda jako osobny commit. Najpierw infrastruktura z zielonym seedem (`/10x-e2e-setup`), bo test przepływu bez działającego środowiska nie ma sensu. Potem test przepływu (`/10x-e2e`) z break-checkami, następnie bramki (CI i hook), na końcu cookbook i korekty planu testów. Oracle: oczekiwania wpisane ręcznie z PRD („zrobione znika z listy", „częściowo zostaje", „przeniesione jest widoczne pod Przeniesione na później"), nigdy z kodu aplikacji. Najtańsza warstwa dla każdego z tych faktów to pgTAP, więc e2e dowodzi wyłącznie wiring przeglądarkowego (cost × signal).

## Critical Implementation Details

- **Timing:** wyspy `client:load` nie reagują przed hydracją, a każda akcja kończy się przeładowaniem; asercje mają czekać na stan (`expect(...).toBeVisible()`/`toHaveCount`, `waitForURL`), nigdy `waitForTimeout`. Przed kliknięciem w dialog lub przycisk upewnić się, że wyspa jest interaktywna (retry przez auto-wait `expect`).
- **Stabilność danych:** zadania bez terminu, projekt i milestone z odległą datą (np. `2099-12-31`), dokładnie jeden milestone, unikalny użytkownik na przebieg; brak czyszczenia (izolacja przez RLS i unikalny e-mail).
- **Środowisko:** preview wymaga `.dev.vars` z `SUPABASE_URL`/`SUPABASE_KEY` lokalnego Supabase i świeżego `npm run build`; nie odczytywać ani nie commitować wartości sekretów.

## Phase 1: Infrastruktura Playwright i seed

### Overview

Instalujemy Playwright i dostarczamy działające środowisko: konfigurację z uruchamianiem aplikacji, setup z zalogowanym użytkownikiem i zielony test seed. Wykonuje to `/10x-e2e-setup` (wykrywa stos, uzupełnia tylko luki).

### Changes Required:

#### 1. Zależność i skrypt

**File**: `package.json` (+ `package-lock.json`)

**Intent**: Dodać `@playwright/test` do devDependencies i skrypt `test:e2e`, bez wpływu na `vitest` (obejmuje tylko `src/**/*.test.ts`) ani `test:unit`.

**Contract**: skrypt `test:e2e` uruchamia `playwright test`; specyfikacje poza `src/`.

#### 2. Konfiguracja Playwright

**File**: `playwright.config.ts`

**Intent**: Skonfigurować `webServer` (build + preview), bazowy URL `http://localhost:4321`, projekt `setup` z `storageState`, trace i zrzut ekranu przy błędzie.

**Contract**: wpis `webServer` aplikacji z `reuseExistingServer` i jawnym portem; projekt testowy zależny od `setup`.

#### 3. Setup uwierzytelnienia i seed

**File**: `tests/e2e/auth.setup.ts`, `tests/e2e/seed.spec.ts`

**Intent**: Setup rejestruje unikalnego użytkownika (e-mail z sufiksem czasu), loguje go przez formularz i zapisuje `storageState`. Seed (ryzyko #1, najprostszy wariant) wchodzi na `/today` jako zalogowany i asertuje treść renderowaną przez wyspę (lekcja nr 1), np. stan pusty „Na dziś nic do zrobienia." i aktywny przycisk „Dodaj zadanie" w stanie wyłączonym z podpowiedzią.

**Contract**: lokatory `getByRole`/`getByLabel`/`getByText`; zawężony lokator hasła (przełącznik „Pokaż hasło"); bez `waitForTimeout`.

#### 4. Zapis stosu

**File**: `context/foundation/test-stack.md`

**Intent**: Zarejestrować polecenie uruchomienia, wymagania lokalne (Docker, `.dev.vars`, lokalny Supabase) i decyzje konfiguracji.

**Contract**: sekcja `## E2E` zgodna ze szablonem skilla `/10x-e2e-setup`.

### Success Criteria:

#### Automated Verification:

- Zależność i skrypt istnieją: `grep -n "playwright" package.json` pokazuje `@playwright/test` i `test:e2e`
- Seed jest zielony na lokalnym stosie: `npm run test:e2e`
- Break-check seeda: `throw` w komponencie wyspy logowania (`src/components/auth/SignInForm.tsx`) powoduje czerwony seed; po przywróceniu zielony
- Zestawy aplikacji nie psują się: `npm run lint` i `npm run test:app`

#### Manual Verification:

- `context/foundation/test-stack.md` opisuje uruchomienie tak, że osoba nowa w repo uruchomi `npm run test:e2e` bez pytań (Docker, `.dev.vars`, build)

**Note (implementacja Fazy 1)**: Odstępstwa od szablonu skilla `/10x-e2e-setup` i od planu: (1) port lokalny z `E2E_PORT=4322` w `.env` (na 4321 działał `astro dev`; w CI zostaje 4321), a `webServer` uruchamia `npm run build && npm run preview -- --port ${PORT}` z `ASTRO_PREVIEW_BACKGROUND=1`; (2) `auth.setup.ts` rejestruje świeżego użytkownika (`e2e-<timestamp>@example.com`), a potem loguje się jawnie, bez `E2E_USERNAME`/`E2E_PASSWORD`; hydrację wyspy czeka przez zniknięcie `astro-island[ssr]`, bez `toPass`, bo rejestracja nie jest idempotentna; (3) „Dodaj zadanie" ma `aria-disabled="true"` (nie `disabled`), więc seed asertuje ten atrybut i podpowiedź renderowane przez wyspę, a „Na dziś nic do zrobienia." renderuje Astro; (4) lokator hasła `getByLabel("Hasło", { exact: true })`; (5) globalny `@playwright/cli` i skill `playwright-cli` w `.claude/skills/` (za zgodą użytkownika). Break-check 1.3: `throw` w `SignInForm` zaczerwienia projekt `setup`, więc seed się nie wykonuje (jest od niego zależny).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Test przepływu krytycznego

### Overview

Jeden test e2e (`/10x-e2e`), który prowadzi przepływ z oczekiwaniami z PRD i dowodzi ryzyk #1 i #4 w przeglądarce. Zachowanie asertowane: po akcji i przeładowaniu stan zadania i lista zgadzają się z PRD (zrobione znika, częściowo zostaje, przeniesione jest widoczne).

### Changes Required:

#### 1. Test przepływu

**File**: `tests/e2e/today-flow.spec.ts`

**Intent**: Zalogowany użytkownik (z `storageState`) tworzy projekt i jeden milestone przez `/projects`, dodaje dwa zadania bez terminu przez dialog „Dodaj zadanie" na `/today`, a następnie: zadanie A „Częściowo" (zostaje, `aria-pressed`, dopisek „częściowo"), zadanie B „Na jutro" (znika z głównej listy, widoczne w „Przeniesione na później: 1"), zadanie A „Zrobione" (znika z listy). Każdy krok po przeładowaniu asertuje stan, nie odpowiedź sieciową.

**Contract**: lokatory `getByRole("button", { name: "Zrobione: <tytuł>" })` itd.; tytuły z sufiksem czasu; brak asercji na daty, chipy, nagłówek i teksty spoza PRD; oczekiwania wpisane ręcznie z PRD (`prd.md:49-52, 106`), nie wyliczane z kodu.

### Success Criteria:

#### Automated Verification:

- Test przechodzi: `npm run test:e2e`
- Stabilność: `npx playwright test today-flow --repeat-each=3` zielone (unikalny użytkownik na przebieg)
- Break-check wyspy: `throw` w `src/components/today/TodayTaskActions.tsx` powoduje czerwony test; po przywróceniu zielony
- Break-check „Zrobione": wariant psujący zapis statusu `done` (np. zadanie zostaje na liście po akcji) powoduje czerwoną asercję „wiersz znika"; po przywróceniu zielony
- Break-check „Na jutro": wariant, w którym przeniesione zadanie nie jest widoczne w „Przeniesione na później", powoduje czerwoną asercję; po przywróceniu zielony
- Brak regresji: `npm run lint`, `npm run test:app`, `npm run test:db`

#### Manual Verification:

- Każda asercja nazywa ryzyko (#1 lub #4) i oczekiwanie z PRD; brak oczekiwań liczonych z kodu, brak `waitForTimeout`, lokatory to role/label/tekst
- Przebieg testu (trace) wygląda jak realny przepływ użytkownika i zgadza się z AC US-01

**Note (implementacja Fazy 2)**: Odstępstwa: (1) test nie używa współdzielonego `storageState` użytkownika: z jednym kontem `--repeat-each=3` padało 3 z 3 (równoległe przebiegi widziały nawzajem milestony i przeniesione zadania), a seed asertuje pusty `/today` dla swojego użytkownika. Każdy test rejestruje więc własnego świeżego użytkownika przez helper `tests/e2e/helpers/auth.ts` (wspólny z `auth.setup.ts`); to świadomy wyjątek od „bez logowania przez UI w teście", opisany w nagłówku specyfikacji. (2) Brak osobnego cleanupu: dane należą do świeżego użytkownika (RLS), a adnotacja `test-data` niesie tytuły. (3) Blok „Przeniesione na później" jest domyślnie zwinięty, więc test asertuje podsumowanie „…: 1", rozwija je i asertuje `Przywróć na dziś: <B>`. Break-checki: 2.3 `throw` w ciele `TodayTaskActions` (pierwsza próba z `throw` w sygnaturze dała błąd builda, nie czerwoną asercję, więc ją odrzuciłem), 2.4 zapis `done` zamieniony na `todo` w `TodayTaskActions` (czerwone `Zrobione: A` toHaveCount(0)), 2.5 ukryty blok `view.deferred` w `today.astro` (czerwone „Przeniesione na później: 1"); każdy przywrócony `git checkout --`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Bramki jakości (CI i hook)

### Overview

Wpinamy e2e w CI na PR i instalujemy hook po edycji i na koniec tury. CI nie da się uruchomić lokalnie (brak zdalnego repozytorium), więc jego weryfikacja jest odroczona do pierwszego pushu, tak jak wiersz 3.6 z Fazy 1.

### Changes Required:

#### 1. Krok e2e w jobie `smoke`

**File**: `.github/workflows/ci.yml`

**Intent**: Po kroku smoke (Supabase, build i preview już działają na 4321) dodać instalację chromium, `playwright test` i upload raportu przy błędzie; bez nowego joba.

**Contract**: kroki w jobie `smoke` po linii uruchamiającej `npm run smoke`; `BASE_URL`/konfiguracja zgodna z `playwright.config.ts`; artefakt `playwright-report` z `if: failure()`; akcje zewnętrzne przypięte do pełnego SHA z tagiem w komentarzu (jak w istniejących krokach).

#### 2. Hook agenta

**File**: konfiguracja hooka i skrypty wygenerowane przez `/10x-configure-hook` (położenie zależne od wykrytego harnessu)

**Intent**: Hook po każdej edycji sprawdza lint tylko edytowanego pliku; hook na koniec tury uruchamia typecheck i lint dla plików zmienionych w turze, zatrzymując się po jednej próbie ponowienia. Sygnał dociera do agenta właściwym kanałem harnessu.

**Contract**: bramki z test-plan §5; limity czasu w sekundach; bez `--fix` całego projektu przy każdej edycji; istniejąca konfiguracja hooków nie jest po cichu nadpisywana.

### Success Criteria:

#### Automated Verification:

- Workflow zawiera kroki e2e i jest poprawnie sformatowany: `grep -n "playwright" .github/workflows/ci.yml` oraz `npx prettier --check .github/workflows/ci.yml`
- Hook udowodniony na celowo zepsutym pliku: skrypt z przykładowym ładunkiem zwraca sygnał dla błędu i milczy dla czystego pliku (kontrola z `/10x-configure-hook`)
- Brak regresji: `npm run lint`

#### Manual Verification:

- Agent w prawdziwej sesji widzi błąd z hooka na celowym błędzie i go naprawia, a hook końca tury nie zapętla się
- Krok e2e przechodzi na CI przy pierwszym pushu na zdalne repozytorium (odroczone: brak zdalnego repozytorium)

**Note (implementacja Fazy 3)**: Odstępstwa: (1) w CI krok e2e ma `E2E_PORT: 4322`, a krok smoke zostaje bez zmian na 4321: w CI `reuseExistingServer` jest `false`, a smoke zostawia preview w tle na 4321, więc Playwright startuje własny build + preview na 4322 (`.env`/`.dev.vars` z lokalnym Supabase już są zapisane wcześniejszym krokiem); (2) `actions/upload-artifact` przypięty do SHA `ea165f8…` z komentarzem `# v4` (SHA z `git ls-remote`, tag lekki odpowiada v4.6.2); (3) hooki napisane w Node (`.claude/hooks/*.mjs`, bez `jq`, którego na tej maszynie nie ma), rejestrowane w `.claude/settings.json` z `shell: "bash"` (Git Bash): PostToolUse `Write|Edit` (ESLint tylko edytowanego pliku, 30 s) i Stop (ESLint zmienionych plików + `astro check` + `vitest run`, 120 s, jedna próba ponowienia przez `stop_hook_active`); sygnał to exit 2 + stderr; (4) dowód to zacommitowany `scripts/agent-hooks.test.mjs` (22 przypadki, `node --test`, dopisany do `test:unit`, więc działa w CI), a nie jednorazowe uruchomienie; (5) `test:unit` nie jest w hooku Stop, bo uruchamia te hooki (rekurencja). Break-checki hooków wykonane po stronie implementacji: usunięcie zabezpieczenia `stop_hook_active` zaczerwieniło „retry flag set…”, a zmiana `exit 2`→`exit 0` w hooku po edycji zaczerwieniła 3 przypadki (broken file, relative path, missing linter); oba przywrócone `git checkout --`. Niezapisane zalecenie: typecheck w husky pre-commit (§5 twierdzi, że jest) albo poprawić §5 (Faza 4).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Cookbook i synchronizacja planu testów

### Overview

Utrwalamy wzorzec e2e w cookbooku i synchronizujemy stan rolloutu oraz korekty ujawnione przez badanie, żeby następna osoba (i `/10x-e2e`) wiedziała, jak dodać test przeglądarkowy.

### Changes Required:

#### 1. Cookbook i stan rolloutu

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić §6.6 (zamiast `TBD — see §3 Phase 4`), zaktualizować §4 (wiersz e2e: narzędzie i wersja z datą `checked:`), §5 (e2e i hook po edycji jako podłączone), §7 (świadome wykluczenia e2e) i oznaczyć fazę 4 w §3 jako `complete` po zamknięciu planu; odświeżyć `Last updated` i §8.

**Contract**:
- §6.6: lokalizacja (`tests/e2e/`), nazewnictwo, test referencyjny (`today-flow.spec.ts`), polecenie `npm run test:e2e`, wymagania lokalne (Docker, `.dev.vars`, build); reguły: lokatory role/label/tekst, brak `waitForTimeout`, unikalny użytkownik i dane na przebieg, oczekiwania z PRD, asercja na treść wyspy (lekcja nr 1), break-check przez `throw` w komponencie.
- Korekta §2 (wskazówka #4, backport z badania): „domknięcie" = stan po przeładowaniu tego samego dnia; lista następnego dnia zostaje w pgTAP, bo PRD nie ma widoku, a serwerowego „dziś" nie przesunąć.
- Korekta §5: wpis o typechecku w husky pre-commit zgodny ze stanem faktycznym (typecheck jest w CI i w hooku końca tury, nie w husky).
- Wyniki z fazy 2 i 3 (np. co okazało się kruche) jako 2–3 linie w §6.7.

### Success Criteria:

#### Automated Verification:

- Cookbook nie zawiera już `TBD` dla e2e: `grep -c "TBD — see §3 Phase 4" context/foundation/test-plan.md` zwraca 0
- Wiersz e2e w §4 nie mówi już „none yet": `grep -c "e2e | none yet" context/foundation/test-plan.md` zwraca 0
- Pliki wskazane w §6.6 istnieją: `ls tests/e2e/today-flow.spec.ts playwright.config.ts`
- Format nie psuje pre-commit: `npx prettier --check context/foundation/test-plan.md` (ten plik nie przechodził już przed zmianą; kryterium to brak pogorszenia, nie naprawa cudzych różnic)

#### Manual Verification:

- Osoba nieznająca zmiany potrafi z §6.6 dodać nowy test e2e bez czytania research
- Korekty §2 #4 i §5 zgadzają się z wynikiem badania i faktycznym stanem hooków oraz CI

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak nowych (zmiana nie dotyka `src`); `npm run test:app` i `npm run test:unit` pozostają kontrolą braku regresji.

### Integration Tests:

- pgTAP z Faz 1–3 pozostaje bez zmian (`npm run test:db` jako kontrola braku regresji); nowa warstwa to jeden test e2e Playwright. Przypadki brzegowe: hydracja wyspy przed kliknięciem, przeładowanie po akcji, przeniesienie zadania i jego widoczność, jeden milestone (zadanie z innego milestona nie byłoby na liście).

### Manual Testing Steps:

1. `npx supabase start`, `.dev.vars` ze zmiennymi lokalnego stosu, `npm run build`, `npm run test:e2e` — wszystko zielone.
2. Break-check każdej kluczowej asercji (wariant → czerwone → przywrócenie → zielone) i odnotowanie wyniku w notce fazy w `plan.md`.

## Performance Considerations

Jeden test przeglądarkowy z buildem i preview dodaje do jobu `smoke` rzędu minut (instalacja chromium, start serwera). Utrzymujemy dokładnie jeden test, żeby nie rozrastać czasu PR.

## Migration Notes

Brak migracji i brak zmian schematu. Wycofanie: usunięcie `tests/e2e/`, `playwright.config.ts`, kroków e2e z `ci.yml`, konfiguracji hooka oraz przywrócenie §4–§6.6 w `test-plan.md`.

## References

- Related research: `context/changes/testing-e2e-flow-and-gates/research.md`
- Precedens HTTP: `scripts/smoke.mjs`; miejsce w CI: `.github/workflows/ci.yml:29-58`
- Akcje na liście: `src/components/today/TodayTaskActions.tsx`, `src/pages/today.astro`
- Wyrocznia: `context/foundation/prd.md:31, 37, 49-52, 75, 79, 106`
- Cookbook: `context/foundation/test-plan.md` §6.4, §6.6; lekcje: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Infrastruktura Playwright i seed

#### Automated

- [x] 1.1 Zależność i skrypt istnieją: `grep -n "playwright" package.json` pokazuje `@playwright/test` i `test:e2e` — da957ee
- [x] 1.2 Seed jest zielony na lokalnym stosie: `npm run test:e2e` — da957ee
- [x] 1.3 Break-check seeda: `throw` w komponencie wyspy logowania powoduje czerwony seed; po przywróceniu zielony — da957ee
- [x] 1.4 Zestawy aplikacji nie psują się: `npm run lint` i `npm run test:app` — da957ee

#### Manual

- [x] 1.5 `context/foundation/test-stack.md` opisuje uruchomienie tak, że osoba nowa w repo uruchomi `npm run test:e2e` bez pytań — da957ee

### Phase 2: Test przepływu krytycznego

#### Automated

- [x] 2.1 Test przechodzi: `npm run test:e2e` — 85c7a77
- [x] 2.2 Stabilność: `npx playwright test today-flow --repeat-each=3` zielone — 85c7a77
- [x] 2.3 Break-check wyspy: `throw` w `TodayTaskActions.tsx` powoduje czerwony test; po przywróceniu zielony — 85c7a77
- [x] 2.4 Break-check „Zrobione": wariant psujący zapis statusu `done` powoduje czerwoną asercję „wiersz znika"; po przywróceniu zielony — 85c7a77
- [x] 2.5 Break-check „Na jutro": wariant, w którym przeniesione zadanie nie jest widoczne w „Przeniesione na później", powoduje czerwoną asercję; po przywróceniu zielony — 85c7a77
- [x] 2.6 Brak regresji: `npm run lint`, `npm run test:app`, `npm run test:db` — 85c7a77

#### Manual

- [x] 2.7 Każda asercja nazywa ryzyko (#1 lub #4) i oczekiwanie z PRD; brak oczekiwań liczonych z kodu, brak `waitForTimeout` — 85c7a77
- [x] 2.8 Przebieg testu (trace) wygląda jak realny przepływ użytkownika i zgadza się z AC US-01 — 85c7a77

### Phase 3: Bramki jakości (CI i hook)

#### Automated

- [x] 3.1 Workflow zawiera kroki e2e i jest poprawnie sformatowany: `grep -n "playwright" .github/workflows/ci.yml` oraz `npx prettier --check .github/workflows/ci.yml` — b8bc944
- [x] 3.2 Hook udowodniony na celowo zepsutym pliku: sygnał dla błędu, cisza dla czystego pliku — b8bc944
- [x] 3.3 Brak regresji: `npm run lint` — b8bc944

#### Manual

- [x] 3.4 Agent w prawdziwej sesji widzi błąd z hooka na celowym błędzie i go naprawia, a hook końca tury nie zapętla się — b8bc944
- [ ] 3.5 Krok e2e przechodzi na CI przy pierwszym pushu na zdalne repozytorium (odroczone: brak zdalnego repozytorium)

### Phase 4: Cookbook i synchronizacja planu testów

#### Automated

- [x] 4.1 Cookbook nie zawiera już `TBD` dla e2e: `grep -c "TBD — see §3 Phase 4" context/foundation/test-plan.md` zwraca 0
- [x] 4.2 Wiersz e2e w §4 nie mówi już „none yet": `grep -c "e2e | none yet" context/foundation/test-plan.md` zwraca 0
- [x] 4.3 Pliki wskazane w §6.6 istnieją: `ls tests/e2e/today-flow.spec.ts playwright.config.ts`
- [x] 4.4 `npx prettier --check context/foundation/test-plan.md` nie pogarsza stanu bazowego

#### Manual

- [x] 4.5 Osoba nieznająca zmiany potrafi z §6.6 dodać nowy test e2e bez czytania research
- [x] 4.6 Korekty §2 #4 i §5 zgadzają się z wynikiem badania i faktycznym stanem hooków oraz CI
