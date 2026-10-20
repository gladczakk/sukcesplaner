# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`). Run after dependency upgrades; CI runs it against the production preview with a local Supabase.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.

## UI and design system

- **Spec**: `context/foundation/design-system/design-system.md` — read it before any UI work. References and screenshots are in the same folder. UI copy is Polish (`<html lang="pl">`).
- **Token source**: `src/styles/global.css` — `:root` / `.dark` hold the values, `@theme inline` publishes them. Add a missing value to both blocks (and to `tokens/tokens.json` in the design-system folder); never put raw colours inside `@theme inline`.
- **Components**: `src/components/ui/`. Check it before creating a component; add shadcn ones with `npx shadcn@latest add <name>`. No second `Button`, no second `shadcn init`.
- **No literals in views**: no hex/rgb/oklch colours, Tailwind palette classes (`bg-green-700`) or arbitrary values (`p-[13px]`). Use token classes (`bg-card`, `text-muted-foreground`, `rounded-pill`, `type-display`).
- **Dark mode** is the `.dark` class on `<html>` (set in `src/layouts/Layout.astro`). Change it at the token layer only, not in component classes.
- **Visual changes** go through `/10x-ui` (one view plus global tokens per change).

<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 3

Przejrzyj kod wygenerowany przez AI przed scaleniem, korzystając z **łańcucha przeglądu implementacji**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` jest głównym tematem lekcji. Przegląd jest bramką jakości, a nie poleceniem naprawienia każdego znaleziska.

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| **Przegląd kodu (główny temat lekcji)** | |
| `/10x-impl-review <change-id>` | Zaimplementowano kod i chcesz przeprowadzić ustrukturyzowany przegląd przed scaleniem. Umiejętność sprawdza zgodność z planem, dyscyplinę zakresu, bezpieczeństwo i jakość, architekturę, spójność wzorców oraz kryteria sukcesu, a następnie przedstawia ustalenia do selekcji. |
| **Wynik powtarzającej się lekcji** | |
| `/10x-lesson` | Ustalenie ujawnia powtarzającą się regułę projektu lub wzorzec błędów agenta. Zapisz je w `context/foundation/lessons.md` zamiast traktować je jako jednorazową notatkę. |

### Dyscyplina selekcji

- Dotkliwość określa, jak poważne jest ustalenie. Wpływ określa, jak duże znaczenie ma teraz decyzja.
- Prawidłowe wyniki: napraw teraz, napraw inaczej, pomiń, zaakceptuj jako ryzyko, zapisz jako powtarzającą się regułę (`/10x-lesson`), nie zgódź się.
- Naprawiaj krytyczne ustalenia. Nie poświęcaj godzin na obserwacje o niskim wpływie tylko dlatego, że agent je znalazł.
- Świadome pomijanie ustaleń o niskim wpływie jest prawidłowym wynikiem przeglądu, a nie zaniedbaniem.
- Jeśli nie zgadzasz się z ustaleniem, zapisz dlaczego. Błędne rozumowanie agenta również jest sygnałem.

### Granice przeglądu

- Ta lekcja dotyczy przeglądu zaimplementowanego kodu. Nie tworzy planu, nie wykonuje nowych faz ani nie uczy przeglądu CI.
- Strategia testowania i bramki jakości zostaną wprowadzone w Module 3.
- Nie używaj `/10x-contract` jako wyniku selekcji w tej lekcji.

### Ścieżki używane przez tę lekcję

- `context/changes/<change-id>/plan.md` — oczekiwany kontrakt implementacji
- `context/changes/<change-id>/reviews/` — wynik przeglądu
- `context/foundation/lessons.md` — powtarzające się lekcje

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozwiązana ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: "Ta zmiana jest zarchiwizowana. Zamiast tego otwórz nową zmianę za pomocą `/10x-new`."

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 4

Przygotuj się na trudniejszy strumień implementacji z **łańcuchem planowania opartym na badaniach**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

Lekcja koncentruje się na rozróżnianiu badań wewnętrznych od zewnętrznych oraz wykorzystywaniu dowodów do uzasadniania decyzji planistycznych.

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| **Badania wewnętrzne (temat lekcji)** | |
| `/10x-research <change-id>` | Potrzebujesz dowodów z istniejącej bazy kodu — wzorców, konwencji, punktów integracji lub istniejących implementacji. Uruchamia równoległe subagentów w repozytorium i zapisuje ustrukturyzowane ustalenia w `research.md`. |
| **Badania zewnętrzne (temat lekcji)** | |
| exa.ai | Potrzebujesz natywnego dla AI wyszukiwania w sieci do porównywania bibliotek, sprawdzonych praktyk lub kontekstu ekosystemu, na które baza kodu nie może odpowiedzieć. |
| Context7 (`resolve-library-id` → `get-library-docs`) | Potrzebujesz aktualnej, bieżącej dokumentacji dla konkretnej biblioteki lub frameworka. Najpierw rozwiązuje identyfikator biblioteki, a następnie pobiera odpowiednie strony dokumentacji. |
| **Koło zapasowe do ramowania problemu** | |
| `/10x-frame <change-id>` | Plan nie może się ustabilizować, plan nie przynosi oczekiwanych rezultatów lub utrzymujący się dryf ciągle psuje implementację. Użyj jako wyjścia awaryjnego dla osobnego problemu (zademonstrowanego na przykładzie Space Explorers), a nie jako rytuału przed badaniami. |
| **Planowanie i wykonanie** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Użyj tego samego łańcucha planowania i wykonania co w Lekcji 2, teraz z dowodami z wcześniejszych badań zasilającymi plan. |

### Dyscyplina badawcza

- Badania wewnętrzne (`/10x-research`) odpowiadają na pytanie „co nasza baza kodu już robi?” — wzorce, schematy, konwencje, punkty integracji.
- Badania zewnętrzne (exa.ai, Context7) odpowiadają na pytanie „co powinniśmy zrobić?” — możliwości bibliotek, dokumentacja API, sprawdzone praktyki ekosystemu.
- Połącz oba rodzaje jako dane wejściowe do `/10x-plan` poparte dowodami. Plan bez dowodów badawczych dla nietrywialnego strumienia to zgadywanie.
- Dokumentacja przyjazna agentom (`llms.txt`, markdown-for-agents, endpointy `/md`) jest sygnałem jakości przy wyborze biblioteki — biblioteki publikujące dokumentację czytelną dla agentów integrują się szybciej.

### `/10x-frame` jako koło zapasowe

Trzy sygnały, że należy sięgnąć po `/10x-frame`:
1. Plan nie może się ustabilizować — badania otwierają coraz więcej pytań zamiast zawężać je do kontraktu.
2. Plan nie przynosi rezultatów — implementacja wielokrotnie nie spełnia kryteriów sukcesu.
3. Utrzymujący się dryf — implementacja ciągle odbiega od planu w sposób sugerujący, że problem został błędnie ujęty.

Zademonstrowano na przykładzie Space Explorers, a nie na ścieżce SRS. Jest to wyjście awaryjne, a nie obowiązkowy krok.

### Ścieżki używane w tej lekcji

- `context/changes/<change-id>/research.md` - wynik badań wewnętrznych
- `context/changes/<change-id>/frame.md` - wynik ramowania problemu, gdy jest potrzebny
- `context/changes/<change-id>/plan.md` - kontrakt implementacyjny poparty dowodami
- `context/foundation/lessons.md` - powtarzające się reguły i pułapki

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozwiązana ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: „This change is archived. Open a new change with `/10x-new` instead.”

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 5 (10xDevs 4.0 UI)

**W przypadku pracy nad UI w widoku, który już się renderuje, użyj `/10x-ui`.** Przeprowadza ono zmianę wizualną przez ten sam łańcuch co każdą inną zmianę (`/10x-new` → `/10x-research` →
`/10x-plan` → `/10x-implement` → `/10x-impl-review`) i obejmuje zasady:
kiedy rozpocząć pracę i którego widoku dotyczy, audyt pod kątem opłat, kontrakt systemu projektowego w formie, w jakiej realizuje go to repozytorium, stany komponentów, bramkę zrzutu ekranu oraz regułę, która utrzymuje kolejnego agenta przy kontrakcie. W jego `references/` znajduje się lista kontrolna jakości.

Tworzenie widoku po raz pierwszy nie jest zadaniem dla `/10x-ui` — zbuduj go poprzez
zwykły łańcuch, a następnie wróć do niego z `/10x-ui`.

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 6

Rozszerz cykl pojedynczej zmiany na pracę równoległą za pomocą **worktrees, delegowania ukierunkowanego na cel i orkiestracji wielu sesji**:

```
worktree per change -> /goal or claude -p -> PR -> review -> merge
```

Lekcja koncentruje się na bezpiecznej przepustowości: izolowanych kontekstach, wyborze właściwego trybu wykonania oraz ograniczaniu równoległości do możliwości przeglądu.

### Router zadań — od czego zacząć

| Umiejętność | Użyj, gdy |
| --- | --- |
| **Izolacja kodu** | |
| `git worktree add` | Potrzebujesz osobnego katalogu roboczego dla równoległej zmiany. Jedna zmiana na worktree, jeden świeży kontekst agenta na worktree. |
| **Złożone zmiany** | |
| `/10x-implement <change-id> phase <n>` | Zmiana ma wiele faz, wymaga ręcznych bramek lub korzysta z interaktywnego podejmowania decyzji podczas wykonania. |
| **Proste zmiany** | |
| `/goal` | Masz jasne, ograniczone zadanie i chcesz delegowania ukierunkowanego na cel. Agent pracuje autonomicznie w kierunku określonego celu z warunkiem zatrzymania. |
| `claude -p` | Chcesz bezobsługowego wykonania dobrze zdefiniowanego zadania. Pętla Ralph Wiggum (uruchom, sprawdź, ponów próbę) jest uniwersalnym autonomicznym wzorcem. |
| **Orkiestracja wielu sesji** | |
| Superset / Conductor / Antigravity / VS Code Agent View | Uruchamiasz równolegle wiele sesji agentów i potrzebujesz wglądu, koordynacji lub zarządzania sesjami między nimi. |

### Zasady pracy równoległej

- Jedna zmiana na worktree lub izolowaną przestrzeń roboczą. Jeden świeży kontekst agenta na zmianę.
- Wybieraj interaktywne `/10x-implement` dla złożonych zmian, a `/goal` lub `claude -p` dla prostych.
- Równoległość jest ograniczona przez możliwości przeglądu. Więcej agentów bez przeglądu oznacza więcej nieprzejrzanego kodu, a nie większą przepustowość.
- Problem z jakością wynikający z szybszego dostarczania jest celowy — stanowi przejście do bramek testowych w Module 3.

### Granice lekcji

- Nie omawiaj ponownie interaktywnych `/10x-implement` ani `/10x-impl-review`; to Lekcje 2 i 3.
- Nie wprowadzaj tutaj strategii testowania. Problem z jakością jest motywacją dla Modułu 3.
- Worktrees są mechanizmem izolacji, a nie tematem pełnego samouczka git.

### Ścieżki używane przez tę lekcję

- `context/changes/<change-id>/` - folder aktywnej zmiany
- `context/changes/<change-id>/plan.md` - dane wejściowe implementacji dla dowolnego trybu wykonania

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozstrzygnięta ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: „This change is archived. Open a new change with `/10x-new` instead.”

<!-- END @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 3, Lekcja 1

Rozpocznij Moduł 3 od stworzenia **trwałego, ukierunkowanego na ryzyko kontraktu jakości** przed napisaniem jakiegokolwiek testu — następnie prowadź każdą fazę wdrożenia przez standardowy łańcuch zmian.

```
PRD + roadmap + archive
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategia §1–§5 zamrożona + cookbook §6 się rozwija)
        │
        ▼  (jedna faza wdrożenia naraz, /clear między przekazaniami)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` to **stanowy orkiestrator**, a nie generator jednorazowy. Przy pierwszym uruchomieniu zapisuje etapowe wdrożenie do `context/foundation/test-plan.md`. Przy każdym kolejnym uruchomieniu ponownie wyprowadza stan z artefaktów na dysku i prezentuje następne przekazanie. Lekcja skupia się na **strategii i sekwencjonowaniu wdrożenia, a nie konfiguracji**. Hooki, serwery MCP i CI YAML są konfigurowane w późniejszych lekcjach tego modułu.

### Router zadań — od czego zacząć

| Umiejętność | Użyj, gdy |
| --- | --- |
| **Strategia jakości jako plik reguł (temat lekcji)** | |
| `/10x-test-plan` | Masz PRD (a najlepiej także roadmapę i kilka zarchiwizowanych fragmentów) i zaraz napiszesz pierwsze testy projektu albo zauważyłeś, że testy generowane przez AI trafiają w helpery, podczas gdy krytyczne przepływy pozostają niepokryte. Pierwsze wywołanie uruchamia discovery (PRD + roadmap + archive + skan hot spotów), 5-pytaniowy wywiad z użytkownikiem oraz etap syntezy z obowiązkową kontrolą challengera, a następnie zapisuje `test-plan.md` w `context/foundation/` z mapą ryzyk (5–7 scenariuszy awarii), tabelą etapowego wdrożenia, tabelą stosu, tabelą bramek jakości, sekcją cookbook (`§6`, uzupełnianą w miarę dostarczania faz) oraz sekcją negatywnej przestrzeni (czego celowo nie testujemy). Kolejne wywołania przesuwają wdrożenie o jedno przekazanie naraz. |
| `/10x-test-plan --status` | `test-plan.md` już istnieje i chcesz uzyskać zwięzły obraz stanu wdrożenia — które fazy mają status `not started`, `change opened`, `researched`, `planned`, `implementing` lub `complete`, oraz jaka jest następna akcja. Nie wykonuje pracy; można bezpiecznie uruchomić w dowolnym momencie. |
| `/10x-test-plan --refresh` | `test-plan.md` już istnieje i wystąpiło jedno z następujących: nowe ryzyko z top 3 pojawiło się w roadmapie lub archive, data `checked:` narzędzia jest starsza niż trzy miesiące, stos technologiczny projektu się zmienił albo negatywna przestrzeń §7 nie odpowiada już temu, co uważa zespół. Otwiera nowy folder zmiany `test-plan-refresh-<YYYY-MM-DD>` zamiast edytować przewodnik w miejscu. |

### Łańcuch wdrożenia — co dzieje się po zapisaniu przewodnika

Tabela §3 *Phased Rollout* przewodnika jest stanem orkiestratora. Dla każdego wiersza, który nie ma statusu `complete`, orkiestrator wybiera następne przekazanie na podstawie istniejących artefaktów w `context/changes/<change-id>/`:

| Stan na dysku | Następne przekazanie | Status przechodzi na |
| --- | --- | --- |
| brak folderu zmiany | `/10x-new <change-id>` | `change opened` |
| tylko `change.md` | `/10x-research` (z opisem ryzyk do zweryfikowania) | `researched` |
| `+ research.md` | `/10x-plan` (z ograniczeniami cost × signal + aktualizacji cookbooka) | `planned` |
| `+ plan.md` z oczekującymi elementami `## Progress` | `/10x-implement <change-id> phase <N>` | `implementing` / `complete` |
| `+ plan.md` w pełni `[x]` | Oznacz wiersz §3 jako `complete`; przejdź w pętli do następnego oczekującego wiersza | — |

Każde przekazanie jest punktem **STOP**. Orkiestrator kopiuje następne polecenie do schowka, prosi użytkownika o wykonanie `/clear` i uruchomienie go, a następnie kończy działanie. Ponownie wywołaj `/10x-test-plan` (bez argumentów), aby przejść dalej.

### Reguły priorytetyzacji zorientowanej na ryzyko

- Ryzyka to **scenariusze awarii w kategoriach użytkownika / biznesu**, a nie nazwy testów. „Wylogowany użytkownik uzyskuje dostęp do płatnej treści przez nieaktualny token” to ryzyko; „przetestuj formularz logowania” nim nie jest.
- Od 5 do 7 ryzyk. Mniej jest zbyt ogólne; więcej czyni priorytetyzację bezużyteczną.
- Wpływ i prawdopodobieństwo są ocenami użytkownika/biznesu, a nie złożoności technicznej.
- Każde ryzyko ma źródło: sekcję PRD, zarchiwizowany fragment, wpis roadmapy, pytanie z wywiadu Fazie 2, katalog hot spotu z liczbą zmian lub ograniczenie stosu technologicznego. Żadnych wymyślonych ryzyk.
- **Sygnał, nie wiedza.** §2 cytuje *dowody, które podniosły ryzyko*, nigdy plik jako „miejsce, gdzie występuje awaria”. Kotwice file:line, nazwy funkcji, nazwy schematów i nazwy modułów są zabronione w §2 — należą do wyniku `/10x-research`, tworzonego dla każdej fazy wdrożenia względem aktualnego kodu. Plan jest specyfikacją QA; nie jest audytem kodu.
- Pokrycie nie jest metryką. Metryką jest **pokrycie ryzyka**.

### Reguły mapowania dwuwarstwowego

- Najpierw warstwa klasyczna: wygrywa najtańszy test dający rzeczywisty sygnał. Awansuj do e2e tylko wtedy, gdy żadna tańsza warstwa nie pokrywa ryzyka.
- Następnie warstwa AI-native i tylko tam, gdzie dodaje sygnał, którego klasyczne testy nie dostarczają tanio.
- Każdy wiersz AI-native ma linię **„When NOT to use”**. Jeśli nie potrafisz jej napisać, usuń wiersz.
- Każda nazwa narzędzia zawiera datę `checked: <YYYY-MM-DD>`. Nazwy narzędzi są przykładami kategorii, a nie rekomendacjami.
- Obie warstwy muszą być niepuste w końcowym przewodniku, jeśli projekt ich wymaga. Tylko klasyczna warstwa to plan z 2020 roku; tylko AI-native to hype. Fazy AI-native nie są obowiązkowe — uwzględniaj je tylko wtedy, gdy brief uzasadnił je w ramach cost × signal.

### Reguły bramek jakości

- Wymagane bramki (lint, typecheck, unit+integration, e2e dla krytycznych przepływów) muszą mapować się na rzeczywiste kroki CI. Jeśli wymagana bramka nie jest jeszcze podłączona, oznacz ją jako `required after §3 Phase <N>` i pozwól wskazanej fazie wdrożenia ją podłączyć.
- Hook po edycji jest **zalecany lokalnie**, a nie substytutem CI.
- Multimodalny przegląd wizualny jest **selektywny**, stosowany do 1–3 krytycznych ekranów, a nie do każdej strony.
- Zapasowe rozwiązanie oparte na wizji (Anthropic Computer Use lub OpenAI CUA) jest zarezerwowane dla powierzchni niedostępnych przez DOM; kosztowne na akcję.

### Wzorce cookbooka (§6) — uzupełniane z czasem

`test-plan.md` jest zarówno etapową strategią, jak i **rosnącym cookbookiem**. §6 zaczyna się od placeholderów (`TBD — see §3 Phase <N>`) i jest uzupełniany stopniowo — plan każdej fazy wdrożenia kończy się podfazą aktualizującą odpowiedni wpis §6 (lokalizacja, nazewnictwo, test referencyjny, polecenie uruchomienia). Po ukończeniu Modułu 3 §6 staje się kanoniczną odpowiedzią na pytanie „jak dodać test dla X w tym projekcie?” — i jest tym, co `/10x-tdd` odczytuje w Lekcji 2.

### Granice lekcji

- Nie pisz kodu testów. To temat Lekcji 2 (`/10x-tdd` i tworzenie testów jednostkowych).
- Nie konfiguruj hooków, cyklu życia hooków ani hooków debugowania. To temat Lekcji 3.
- Nie konfiguruj serwerów MCP, Playwright API, kodu e2e ani kodu scenariuszy multimodalnych. To temat Lekcji 4.
- Nie uruchamiaj przepływu bug-to-fix-to-regression-test. To temat Lekcji 5.
- Nie twórz od podstaw potoków CI/CD ani nie pisz GitHub Actions YAML. Przewodnik wskazuje bramki; konfiguracja należy do Modułu 1 Lekcji 5 i Modułu 2 Lekcji 5.
- Nie porównuj modeli multimodalnych. Cytuj kryteria (cost, latency, agent-friendliness), nigdy ranking.
- Nie czytaj codebase w celu zdobywania wiedzy (grafy wywołań, schematy, „który plik odpowiada za tę awarię”). To zadanie `/10x-research`, wykonywane dla każdej fazy wdrożenia.

### Ścieżki używane przez tę lekcję

- `context/foundation/test-plan.md` — kontrakt jakości tworzony i utrzymywany przez `/10x-test-plan`
- `context/foundation/prd.md` — główne źródło ryzyk
- `context/foundation/roadmap.md` — ważenie prawdopodobieństwa
- `context/foundation/tech-stack.md` — dane wejściowe stosu (gdy obecne)
- `context/archive/<change-id>/plan.md` — zaimplementowana powierzchnia ryzyka
- `context/changes/<change-id>/` — folder zmiany dla każdej fazy wdrożenia (po jednym na wiersz w §3)

## Zestaw narzędzi AI 10xDevs — Moduł 3, Lekcja 2

Lekcja 2 dotyczy **pisania testów, które faktycznie chronią kod** — a nie tylko maksymalizowania pokrycia. Problem wyroczni oraz antywzorce vibe-testingu wyjaśniają, dlaczego testy generowane przez LLM zawodzą na rzeczywistym kodzie; rozwiązaniem jest kontrakt jakości oparty na ryzyku z Lekcji 1.

```
context/foundation/test-plan.md (§3 Phased Rollout)
        │
        ▼  (one rollout phase at a time)
   /10x-research  ──►  research.md  (oracle source: what code should do, not what it does)
        │
        ▼
   /10x-plan  ──►  plan.md  (cost × signal, two-layer strategy, ordered phases)
        │
        ▼
   /10x-implement  or  /10x-tdd   ──►  working tests + §6 cookbook update
```

`/10x-tdd` jest **opcjonalnym trybem test-first**, a nie zamiennikiem dla łańcucha. Odczytuje ten sam `plan.md`, zapisuje do tej samej sekcji `## Progress` i obejmuje te same fazy co `/10x-implement`. Używaj go tylko wtedy, gdy potrafisz nazwać pierwszą nieudaną asercję przed napisaniem jakiegokolwiek kodu.

### Router zadań — od czego zacząć

| Umiejętność / Prompt | Użyj, gdy |
| --- | --- |
| `/10x-research` | Przed napisaniem jakiegokolwiek testu dla ryzyka. Research tworzy wyrocznię — jakie zachowanie test musi udowodnić — na podstawie źródeł (PRD, tech-stack, dokumentacja), a nie kształtu implementacji. Ujawnia również, czy ryzyko jest już pokryte albo ma dwa odrębne oblicza (jedno bezpieczne, drugie rzeczywiste). |
| `/10x-plan` | Research jest ukończony. Plan rozkłada ryzyko na uporządkowane fazy: najpierw konfiguracja środowiska, następnie reguły od niej zależne, potem hermetyczne stuby dla błędów, których rzeczywista infrastruktura nie potrafi wywołać, a na końcu aktualizacja cookbooka. Każda faza nazywa zachowanie, które potwierdza, oraz regresję, którą wykrywa. |
| `/10x-implement` | Domyślny wykonawca faz planu. Używaj do konfiguracji środowiska, istniejącego kodu, scaffolding oraz każdej fazy, w której nie możesz zdefiniować czerwonego testu przed napisaniem kodu. |
| `/10x-tdd` | Opcjonalne. Użyj zamiast `/10x-implement` dla fazy, w której potrafisz nazwać pierwszy czerwony test jednym zdaniem. Agent najpierw pisze nieudany test, potem minimalny kod, aby go zazielenić, a następnie refaktoryzuje. Zatrzymuje się na asercji przed dotknięciem implementacji — ta pauza jest sednem. |
| Prompt `m3l2-ad-hoc-testing` | Masz pojedynczy plik i chcesz testów teraz, bez pełnego cyklu research→plan→implement. Prompt wymusza wyrocznię-ze-źródeł (odczytuje PRD + TECH_STACK przed asercjami), asercje behawioralne, przypadki brzegowe wynikające z ryzyka oraz tabelę regresji. Używaj go ze świadomością, że wymieniasz głębię na szybkość. |

### Kiedy używać `/10x-tdd` vs `/10x-implement`

Decydujące pytanie: *Czy potrafisz nazwać pierwszy czerwony test jednym zdaniem?*

Dobre warunki dla `/10x-tdd`:
- "promuje wyłącznie drafty w stanie `accepted`, a `pending`/`rejected` nigdy nie trafiają do talii"
- "zwraca `ok: true` i loguje `orphan_review_state`, gdy upsert stanu powtórek padnie w trakcie zapisu"
- "zwraca 401, gdy użytkownik nie ma dostępu do kursu"
- "resetuje interwał powtórki do jednego dnia, gdy ocena wynosi 0"

Każdy z nich nazywa obserwowalny wynik, a nie wewnętrzny szczegół. Jeśli nie potrafisz stworzyć zdania takiego jak to, pozostań przy `/10x-implement` albo wróć do `/10x-research`.

`/10x-tdd` **nie nadaje się** do: konfiguracji środowiska, konfiguracji CI/CD, dokumentacji, prostego łączenia elementów, gdzie test jedynie przepisywałby implementację, ani spike'a, podczas którego nadal odkrywasz kontrakt.

Możesz łączyć oba tryby w jednym planie:

```
/10x-implement <change-id> phase 1   # environment
/10x-tdd       <change-id> phase 2   # contract (new code)
/10x-tdd       <change-id> phase 3   # contract (API endpoint)
/10x-implement <change-id> phase 4   # cookbook + plan sync
```

Oba zapisują postęp do tej samej sekcji `## Progress` w `plan.md`.

### Dwuwarstwowa strategia testów (koszt × sygnał)

Dla każdego ryzyka wybierz **najtańszy test, który daje rzeczywisty sygnał**. Nie wybieraj domyślnie e2e „bo jest najbezpieczniej” i nie ścigaj się za procentem pokrycia.

| Warstwa | Kiedy używać | Kiedy NIE używać |
| --- | --- | --- |
| Integracja (prawdziwa DB / prawdziwa infrastruktura) | Reguła obejmuje ograniczenia DB, kaskady, rzeczywisty SQL lub ograniczenia unikalności, co do których mock by kłamał. | Przepływy auth kontrolowane przez RLS, które należą do odrębnej fazy; wszystko, gdzie koszt konfiguracji przekracza wartość sygnału. |
| Hermetyczna (stub klienta) | Częściowe błędy, których rzeczywista infrastruktura nie potrafi łatwo wywołać (np. druga operacja w sekwencji kończy się błędem). | Reguły zależne od faktycznego stanu DB — stub będzie kłamał w kwestii naruszeń ograniczeń i kaskad. |

Nieatomowa sekwencja zapisu (wiele niezależnych operacji bez transakcji) oznacza: pisz hermetyczne testy dla gałęzi częściowych błędów, a nie testy integracyjne wymuszające błąd w środku sekwencji.

### Reguły wyroczni

- Wyrocznia — co kod *powinien* robić — musi pochodzić ze źródeł: PRD, dokumentacji, ograniczeń tech-stacku, wiedzy domenowej. **Nie może** pochodzić z odczytywania implementacji.
- Jeśli implementacja zawiera błąd, skopiowanie jej wyniku jako oczekiwanej wartości tworzy test lustrzany, który przechodzi mimo błędu.
- Gdy źródła nie rozstrzygają oczekiwanego zachowania jednoznacznie, **zatrzymaj się i zapytaj**, zamiast zgadywać.
- Zadaniem researchu jest ujawnienie wyroczni, zanim zostanie napisany jakikolwiek test.

### Antywzorce vibe-testingu, których należy unikać

| Antywzorzec | Jak wygląda | Co zrobić zamiast tego |
| --- | --- | --- |
| Implementacja lustrzana | Asercja oblicza oczekiwaną wartość tą samą logiką co testowany kod. | Asercja wobec wartości wyprowadzonej z wyroczni (PRD / reguła domenowa), a nie z implementacji. |
| Tylko happy paths | Testy przepuszczają tylko prawidłowe dane wejściowe; brak przypadków brzegowych. | Dodaj co najmniej jeden przypadek brzegowy dla każdego ryzyka: `null`, pusty, błąd zależności, nieprawidłowe dane wejściowe. |
| Nadmiarowe kopie | Sześć niemal identycznych testów sprawdzających ten sam brak sentinela. | Jeden sparametryzowany test (`it.each`) na właściwość; każdy test wykrywa inną regresję. |

### Testowanie mutacyjne (Stryker) — selektywna bramka jakości

Pokrycie mówi „ta linia została wykonana”. Wynik mutacji mówi „czy test by nie przeszedł, gdybym zepsuł tę linię?”. Używaj Stryker jako **selektywnej bramki** po fazie ryzyka, a nie jako bramki CI przy każdym commicie.

Przebieg pracy:
1. Testy przechodzą dla fazy ryzyka.
2. Uruchom `npx stryker run --mutate "path/to/file.ts"` (zawęź zakres do zmienionego modułu).
3. Otwórz raport HTML; znajdź mutacje, które przetrwały.
4. Dla każdej przetrwałej mutacji zapytaj: „Czy ta zmiana zaszkodziłaby użytkownikowi lub firmie?”
   - Tak → dodaj asercję, która zabija mutację.
   - Nie (równoważna mutacja lub kosmetyczna zmiana) → świadomie ją zignoruj.
5. Nie ścigaj 100% wyniku mutacji. Test, który przytwierdza szczegóły implementacji, aby zabić kosmetyczną mutację, sam jest testem vibe.

Bramka integracyjna może pozostać **ad hoc** (nie przy każdym commicie), gdy uruchamianie lokalnej infrastruktury jest kosztowne. Oznacz to odpowiednio w `test-plan.md §4`.

### Granice lekcji

- Nie konfiguruj hooków, cyklu życia hooków ani debugowania hooków. To Lekcja 3.
- Nie konfiguruj serwerów MCP, Playwright API, kodu e2e ani kodu scenariuszy multimodalnych. To Lekcja 4.
- Nie uruchamiaj workflow bug-to-fix-to-regression-test. To Lekcja 5.
- Nie twórz od zera pipeline'ów CI/CD. To Moduł 1 Lekcja 5 / Moduł 2 Lekcja 5.
- Nie uruchamiaj `/10x-test-plan`, aby zmienić strategię ryzyka. To Lekcja 1. Użyj `/10x-test-plan --status`, aby odczytać bieżący stan.
- Nie pisz testów bez kroku researchu, chyba że używasz promptu ad-hoc z pełną świadomością jego kompromisów.

### Ścieżki używane w tej lekcji

- `context/foundation/test-plan.md` — stan wdrożenia §3; cookbook §6 (uzupełniany w miarę dostarczania faz)
- `context/changes/<change-id>/research.md` — źródło wyroczni dla każdej fazy wdrożenia
- `context/changes/<change-id>/plan.md` — uporządkowane fazy z `## Progress` jako stanem wykonania
- `.claude/prompts/m3l2-ad-hoc-testing.md` — prompt do testowania ad-hoc na poziomie pliku

## Zestaw narzędzi AI 10xDevs - Moduł 3, Lekcja 3 (10xDevs 4.0 Hooks)

Traktuj hook jako **bramkę jakości uruchamianą przez harness dla agenta**, a nie skrypt, który według ciebie agent zauważy. Hooki działają poza modelem, więc przetrwają kompresję kontekstu i zapomniane instrukcje — ale tylko hook, którego sygnał faktycznie dociera do agenta, zamyka pętlę:

```
test-plan.md "Quality Gates" -> pick the moment per gate -> /10x-configure-hook -> prove with sample JSON -> watch the agent fix a deliberate error
```

### Router zadań - Od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-configure-hook` | Przekształcasz bramki z `context/foundation/test-plan.md` w hooki agenta, naprawiasz hooki, które się uruchamiają, ale agent nigdy nie reaguje, albo audytujesz istniejącą konfigurację hooków. Wykrywa harness na podstawie repozytorium i zawiera datowane referencje dla każdego harness. |
| `/10x-test-plan --status` | Odczytujesz aktualne bramki i stan wdrożenia. Zmiana tego, które bramki istnieją, należy do Lekcji 1, nie tutaj. |
| `/10x-new` -> `/10x-research` -> `/10x-plan` -> `/10x-implement` | Hook ujawnił awarię, której agent nie może naprawić trywialną korektą (błędna logika biznesowa, niestabilna integracja). Otwórz zmianę zamiast zapętlać hook. |

### Cykl życia hooka

1. **Wyzwalacz** — zdarzenie w harness: narzędzie zakończyło edycję pliku, agent zaraz zakończy swoją turę.
2. **Matcher** — zawęża, na które wywołania narzędzi lub pliki reaguje hook. Nie każdy harness obsługuje matchery w ten sam sposób.
3. **Handler** — zwykle polecenie powłoki lub skrypt, który odczytuje ładunek zdarzenia jako JSON ze standardowego wejścia.
4. **Sygnał** — co zwraca hook. Kod wyjścia, stderr, stdout i pola JSON oznaczają różne rzeczy w różnych harness, a tylko jeden kanał na zdarzenie faktycznie dociera do agenta. **Kanał sygnału różni się zależnie od harness — przed napisaniem lub przeglądem hooka sprawdź referencje umiejętności.**

Hook, który się uruchamia, ale wysyła komunikat niewłaściwym kanałem, jest najczęstszą awarią: użytkownik widzi „hook error”, agent nie widzi niczego i kontynuuje.

### Momenty i warstwy

Im wolniejsza kontrola, tym rzadszy moment:

| Moment | Typowe kontrole | Dociera do agenta? |
| --- | --- | --- |
| Przy każdej edycji | Lint/formatowanie **tylko edytowanego pliku**; powiązane testy, jeśli są szybkie | Tak, w trakcie pracy |
| Koniec tury (Stop lub odpowiednik) | Lint + testy dla każdego pliku zmienionego w tej turze, typecheck całego projektu | Tak, zanim agent przekaże wynik |
| Pre-commit (git) | Lint + testy dla plików w stagingu; wyłapuje edycje wykonane bez agenta | Nie — blokuje commit |
| Pre-push (git) | Cięższe zestawy, e2e uruchamiane lokalnie | Nie — blokuje push |
| CI | Integracja, współdzielony stan, infrastruktura niedostępna lokalnie | Nie — feedback dla PR |

Lokalne warstwy nie zastępują CI; każda z nich oszczędza jeden cykl zwrotny CI. Zacznij od jednego hooka lint przy każdej edycji i jednego typechecka na koniec tury, a następnie dodawaj warstwy, gdy zobaczysz, co się przedostaje.

### Kontrakt

- Odczytaj bramki z sekcji „Quality Gates” w `context/foundation/test-plan.md` (według tytułu, nie numeru sekcji). Bramka, którą plan wyraźnie odkłada, pozostaje odłożona, chyba że użytkownik to zmieni — cytuj odroczenie, gdy pytasz.
- Hooki przy każdej edycji sprawdzają tylko edytowany plik. Nigdy nie uruchamiaj `--fix` ani lintera dla całego projektu przy każdej edycji.
- Hooki końca tury, które mogą odesłać agenta z powrotem, muszą zatrzymać się po jednej próbie ponowienia (flaga harness „already continued” lub odpowiednik), aby nienaprawialny błąd nie tworzył pętli.
- Hooki przy każdej edycji widzą tylko narzędzia edycji harness; plik nadpisany za pomocą polecenia powłoki je omija. Hook końca tury ponownie sprawdza każdy plik zmieniony w tej turze (`git diff`), więc stanowi zabezpieczenie dla tych edycji.
- Limity czasu są zwykle podawane w **sekundach**. Sprawdź jednostkę przed skopiowaniem liczby.
- Udowodnij działanie każdego hooka, zanim mu zaufasz: uruchom skrypt z przykładowym ładunkiem na celowo uszkodzonym pliku i na czystym, a następnie cofnij błąd.
- Nigdy nie nadpisuj po cichu istniejącej konfiguracji hooków. Przeprowadź audyt, nazwij defekty, scal i pokaż diff.

### Granice lekcji

- Nie zmieniaj strategii ryzyka ani definicji bramek — to Lekcja 1 (`/10x-test-plan`).
- Nie pisz tutaj nowych testów — hooki uruchamiają tylko testy utworzone w Lekcji 2.
- Nie pisz scenariuszy E2E ani weryfikacji w przeglądarce — to Lekcja 4.
- Nie twórz potoków CI ani nie instaluj bez pytania menedżerów git-hooków; rekomenduj bramki pre-commit/pre-push i pozwól użytkownikowi zdecydować.

## Zestaw narzędzi AI 10xDevs — Moduł 3, Lekcja 4 (testy E2E)

**W przypadku testów E2E używaj dwóch umiejętności M3L4 w tej kolejności:**

1. **`/10x-e2e-setup`** — jednorazowa konfiguracja: konfiguracja Playwright (`webServer`,
   projekt uwierzytelniania `setup`, `storageState`), zielony test seed oraz `context/foundation/test-stack.md`.
2. **`/10x-e2e`** — pętla dla każdego ryzyka: ryzyko → eksploracja uruchomionej aplikacji za pomocą
   `playwright-cli` → generowanie → przegląd względem pięciu antywzorców → ponowne zapytanie po nazwie → weryfikacja poprzez celowe wprowadzenie błędu.

Katalogi `references/` umiejętności zawierają pełne reguły, antywzorce, wzorzec seed oraz
szablon promptu.

Kilka twardych zasad obowiązujących jeszcze przed wywołaniem umiejętności:

- **Lokatory:** najpierw `getByRole` / `getByLabel` / `getByText`; `getByTestId`
  tylko wtedy, gdy atrybuty dostępności są niejednoznaczne. Nigdy selektory CSS, XPath
  ani struktura DOM.
- **Nigdy `page.waitForTimeout()`.** Czekaj na stan: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Niezależność testów + czyszczenie.** Każdy test uruchamia się samodzielnie — własna konfiguracja,
  akcja, asercja i czyszczenie; unikalne identyfikatory (sufiks timestamp), aby równoległe uruchomienia
  i ponowne uruchomienia nie kolidowały.

Dwie granice, które należy jasno rozróżniać:

- **DOM (snapshot) jest domyślny.** Vision (`--caps=vision`) stanowi uzupełnienie dla
  ryzyk wyłącznie wizualnych (układ, z-index, animacja); do regresji pikselowych preferuj
  deterministyczne narzędzia (`toHaveScreenshot`, Argos, Lost Pixel). Wybór/koszt modelu VLM
  to temat debugowania (Lekcja 5), a nie testowania.
- **Czerwony test jest sygnałem, a nie obowiązkiem.** Zmieniony selektor → zaktualizuj
  lokator w sprawdzonym diffie. Zmienione zachowanie biznesowe → test wykrył
  błąd; nigdy nie edytuj asercji, aby je dopasować. Naprawianie nieudanych testów to Lekcja 5.

## Zestaw narzędzi AI 10xDevs — moduł 3, lekcja 5 (debugowanie)

Zamień awarię w poprawkę, której agent może bronić: najpierw dowody, potem nieprzechodzący test, a następnie poprawka.

```
signal (monitoring | log | flaky E2E | stack trace) -> gather evidence -> reproduce -> failing test -> fix -> verify
```

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-frame` | Zgłoszenie przychodzi jako „bug + proponowana poprawka”. Sprawdź, czy zaobserwowany objaw i podana przyczyna rzeczywiście do siebie pasują, zanim ktokolwiek cokolwiek naprawi. |
| `/10x-new` -> `/10x-research` -> `/10x-plan` -> `/10x-implement` | Poprawka to coś więcej niż jednolinijkowa zmiana. Research zbiera dowody; plan zaczyna się od nieprzechodzącego testu regresji. |
| `/10x-tdd` | Pisanie testu regresji, który odtwarza błąd przed wprowadzeniem poprawki. |
| `/10x-e2e` | Błąd pojawia się tylko w uruchomionej aplikacji. Odtwórz go w przeglądarce i zachowaj ten test. |
| `/10x-observability-audit` | Błędy są nieobecne, zaszumione lub niemożliwe do zdiagnozowania na produkcji. Audytuje krytyczne przepływy pod kątem kodu ukrywającego awarie i zapisuje raport z datą w `context/audits/observability/`. Użyj `--verify <report>`, aby ponownie sprawdzić wcześniejszy raport po poprawkach. |

### Twarde zasady

- **Dowody przed hipotezą.** Korzystaj z tego, co pokazują tracker błędów, logi, odtworzenie problemu i kod. Nigdy nie zgaduj przyczyny wyłącznie na podstawie stack trace.
- **Błąd najpierw staje się nieprzechodzącym testem.** Poprawka jest gotowa, gdy ten test przechodzi z czerwonego na zielony i pozostaje w zestawie testów.
- **Nigdy nie ukrywaj dowodów.** Żadnych pustych `catch`, żadnych ignorowanych odrzuceń promise'ów, żadnego zamieniania awarii w przekierowania lub `200`, żadnego porzucania przyczyn błędów. Jeśli poprawka wymaga `catch`, loguje lub raportuje błąd wraz z jego przyczyną.
- **Napraw przyczynę, nie test.** Nie edytuj asercji, aby pasowała do nowego zachowania, chyba że zmieniło się samo wymaganie.

### Granice lekcji

- `/10x-observability-audit` czyta kod i zapisuje raport. Nigdy nie zmienia audytowanego kodu. Naprawianie tego, co znajdzie, przechodzi przez łańcuch zmian.
- Wybór dostawcy monitoringu należy do `/10x-infra-research`, a nie do tej lekcji.

## Zestaw narzędzi AI 10xDevs — moduł 4, lekcja 1 (Kontekst na dużą skalę)

Utrzymuj ten plik reguł w zwięzłej formie i kieruj z niego do kontekstu, który znajduje się gdzie indziej. Duża baza kodu nie potrzebuje większego pliku głównego.

```
lean root rules file -> context/ (system of record) -> per-module rules only when a trigger signal appears
```

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-agents-md` -> `/10x-rule-review` | Odchudzasz rozbudowany główny plik reguł: przenieś szczegóły do `context/` i pozostaw odnośnik. |
| `/10x-ray <skill> [args]` | Chcesz zobaczyć, jak działa umiejętność: mapuje jej kroki, rozgałęzienia i punkty kontroli człowieka, następnie ją uruchamia i wyjaśnia każdy krok w trakcie jego wykonywania. Dodaj `--mode html`, aby obserwować ją w przeglądarce. |
| `/10x-lesson` | Błąd agenta, który ciągle powraca, powinien stać się zapisaną lekcją, a nie kolejną linią w tym pliku. |

### Twarde reguły

- **Pliki instrukcji się sumują; nie nadpisują się.** Narzędzia scalają pliki główne, zagnieżdżone i na poziomie użytkownika. Nie powtarzaj tej samej reguły na kilku poziomach.
- **Test włączenia.** Linia należy tutaj tylko wtedy, gdy agent popełniłby bez niej błąd. Fakty, które agent może odczytać z kodu lub z `context/`, pozostają tam i otrzymują odnośnik.
- **Dodawaj strukturę dla poszczególnych modułów tylko wtedy, gdy pojawi się sygnał.** Przykłady: agent ciągle myli dwa obszary albo konwencje jednego modułu wypierają wszystko inne. Sam rozmiar repozytorium nie jest sygnałem.

## Zestaw narzędzi AI 10xDevs — Moduł 4, Lekcja 2 (Mapa projektu)

Zapoznaj się z nieznanym lub starszym repozytorium na podstawie dowodów, a nie drzew katalogów: **najpierw szerokie skanowanie, później głębokie skupienie.**

```
git history + dependency graph + contributors -> context/map/repo-map.md -> focused /10x-research
```

### Router zadań — od czego zacząć

| Umiejętność / prompt | Użyj, gdy |
| --- | --- |
| `/10x-repo-map` | Mapa projektu w jednym przebiegu. Klasyfikuje możliwości biznesowe według krytyczności × rozgłosu, przechowuje dowody w `context/map/evidence/` i zapisuje `context/map/repo-map.md` ze strefami ryzyka, listą lektur na pierwszy dzień oraz wyraźnie wskazanymi niewiadomymi. Użyj `--replace`, aby odświeżyć; poprzedni przebieg zostanie przeniesiony do `context/archive/`. |
| `m4l2-1-territory-git-history` -> `m4l2-2-structure-dependency-cruiser` -> `m4l2-3-contributors-git` -> `m4l2-repo-map-synthesis` | Ta sama mapa budowana krok po kroku, po jednym artefakcie naraz, aby zobaczyć, co dodaje każde źródło dowodów. |
| `/10x-research` | Pytanie dotyczące jednej funkcji lub obszaru. Mapa obejmuje szerokość i nie przyjmuje celu; głębia należy do badań. |

### Twarde zasady

- **Pozwól narzędziom zbierać dowody poza oknem kontekstu.** Używaj narzędzi git, forge i grafowych do gromadzenia danych, a następnie interpretuj wyłącznie ich skondensowane wyniki. Nigdy nie czytaj repozytorium plik po pliku.
- **Wyklucz szum.** Podczas klasyfikowania aktywności pomijaj lockfile'y, wygenerowany kod, commity masowego formatowania, commity botów oraz commity utworzone przez agentów.
- **Niewiadome są częścią mapy.** Oznaczaj jako niewiadome to, czego dowody nie mogą pokazać, zamiast wypełniać lukę zgadywaniem.

## 10xDevs AI Toolkit - Moduł 4, Lekcja 3 (Analiza funkcji)

Przekształć Mapę Projektu w ugruntowaną analizę jednej funkcji: co działa, co jest słabe, co należy zmodernizować.

```
context/map/repo-map.md -> /10x-research (trace + test gaps + blast radius) -> ast-grep verification -> research.md
```

### Router zadań — od czego zacząć

| Umiejętność / prompt | Użyj, gdy |
| --- | --- |
| `m4l3-1-research-with-map` | Uruchamiasz `/10x-research` dla jednej funkcji z `repo-map.md` jako danymi wejściowymi. Trzech równoległych podagentów śledzi przepływ od początku do końca, znajduje luki w pokryciu testami i mierzy promień rażenia. Raport kończy się sekcjami Przegląd funkcji i Dług techniczny. Dostosuj nazwę funkcji w prompcie do swojego repozytorium. |
| `m4l3-2-ast-grep-verification` | Potwierdzasz lub obalasz każde twierdzenie strukturalne w tym raporcie (liczby miejsc wywołania, „tylko tutaj”, „zawsze przez X”) za pomocą ast-grep, a następnie poprawiasz raport. |
| `/10x-repo-map` | Nie ma jeszcze `context/map/repo-map.md` lub jest nieaktualny. |

### Twarde zasady

- **To jest badanie, nie refaktoryzacja.** W tej lekcji nie zmieniaj kodu produkcyjnego.
- **Sprawdź każde twierdzenie strukturalne narzędziem.** ast-grep precyzyjnie dopasowuje składnię; grep dopasowuje dosłowny tekst. Zweryfikuj każde zero z ast-grep za pomocą grep, aby błędny wzorzec nie został uznany za „brak wystąpień”.
- **Cytuj `file:line`** dla każdego kroku śledzenia i każdej pozycji długu.

## Zestaw narzędzi AI 10xDevs — Moduł 4, Lekcja 4 (Refaktoryzacja)

Przejdź od zarejestrowanych problemów do decyzji o refaktoryzacji, której możesz bronić, a następnie wprowadzaj zmianę małymi krokami, które możesz cofnąć.

```
/10x-new (research-only intention) -> /10x-research (options, no decision) -> ast-grep verification -> /10x-plan (decide) -> /10x-implement
```

### Router zadań — od czego zacząć

| Umiejętność / prompt | Użyj, gdy |
| --- | --- |
| `m4l4-1-new-change-intention` | Rozpoczynasz zmianę za pomocą `/10x-new` i jawnej intencji: zbadać i uszeregować, bez refaktoryzacji, bez decyzji na tym etapie. |
| `m4l4-2-refactor-opportunities-research` | Uruchamiasz `/10x-research` dla każdego zarejestrowanego problemu z trzech perspektyw tylko do odczytu: obecny kształt, historia decyzji (czy było to celowe?), wykonalność migracji. Kończy się uszeregowanymi opcjami i ich kompromisami. |
| `m4l4-3-ranking-ast-grep-verification` | Sprawdzasz strukturalne twierdzenia stojące za rankingiem za pomocą ast-grep i poprawiasz raport tak, aby wcześniejsza liczba pozostała widoczna. |
| `/10x-plan` -> `/10x-plan-review` -> `/10x-implement` | Bronisz wybranej opcji podczas wywiadu dotyczącego planu, a następnie realizujesz plan. |

### Twarde zasady

- **Badanie szereguje; plan decyduje.** Bez refaktoryzacji i bez ostatecznego wyboru w ramach badania.
- **Najpierw zabezpieczenie.** Testy charakteryzujące, które utrwalają obecne zachowanie, poprzedzają pierwszą zmianę strukturalną.
- **Każdą fazę można cofnąć niezależnie.** Preferuj Strangler Fig, Branch by Abstraction oraz kolejność w stylu Mikado zamiast przepisywania typu big-bang.
- **Zachowaj niezmienione zachowanie.** Faza refaktoryzacji, która zmienia obserwowalne zachowanie, jest odrębną zmianą.

## Zestaw narzędzi AI 10xDevs - Moduł 4, Lekcja 5 (Modernizacja DDD)

Ujawnij domenę, której kod legacy nigdy nie nazwał, a następnie użyj jej jako danych wejściowych do kolejnego cyklu.

```
domain distillation -> invariant aggregate / anti-corruption layer -> /10x-shape -> /10x-roadmap -> /10x-research -> /10x-plan
```

### Router zadań - Od czego zacząć

| Umiejętność / prompt | Użyj, gdy |
| --- | --- |
| `/10x-domain-distillation` | Jednorazowa mapa domeny. Zapisuje wszechobecny język wraz z jego źródłami, poddomenami Core/Supporting/Generic, niezmiennikami oraz informacją, czy kod je egzekwuje, rozbieżnościami między modelem a kodem i rankingiem „napraw najpierw” do `context/domain/domain-distillation.md`, a także `context/domain/glossary.md`. Użyj `--replace`, aby odświeżyć; poprzednie uruchomienie trafia do `context/archive/`. |
| `m4l5-1-domain-distillation` | Ta sama destylacja jako pojedynczy prompt, wykonywana krok po kroku. |
| `m4l5-2-invariant-aggregate-refactor` | Kluczowa reguła biznesowa jest egzekwowana w wielu miejscach albo wcale. Planuje agregat strażniczy, który jest jej właścicielem. |
| `m4l5-3-anti-corruption-layer` | Zewnętrzna zależność przenika do domeny. Planuje wokół niej warstwę Anti-Corruption Layer. |
| `/10x-shape` -> `/10x-roadmap` -> `/10x-research` -> `/10x-plan` | Przekazywanie artefaktów `context/domain/` do kolejnego cyklu. |

### Twarde zasady

- **Odkrywaj domenę; nie zakładaj jej.** Zacznij bez nazw encji, agregatów ani ścieżek i wskaż, skąd pochodzi każdy termin (z dokumentu lub kodu).
- **Twórz mapę albo plan, nie kod.** Te artefakty nie modyfikują kodu produkcyjnego; zmiana następuje później przez `/10x-plan` -> `/10x-implement`.
- **Używaj terminów ze słownika.** Gdy istnieje `context/domain/glossary.md`, używaj jego terminów w kodzie, planach i rozmowach oraz unikaj nazw oznaczonych przez niego jako „don't call it”.

## Zestaw narzędzi AI 10xDevs — moduł 5, lekcja 1 (wewnętrzni twórcy AI)

Klasyfikuj powtarzające się tarcia w zespole, zanim cokolwiek dla nich zbudujesz. Domyślną odpowiedzią jest istniejące narzędzie; buduj tylko cienką nakładkę pomocniczą tam, gdzie uzasadnia to lokalny problem obejmujący wiele systemów.

```
/10x-opportunity-map -> /10x-mom-test -> /10x-shape -> /10x-prd -> /10x-roadmap
```

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-opportunity-map` | Zespół stale napotyka to samo tarcie albo ktoś mówi „zbudujmy dashboard / agenta / automatyzację”. Tworzy mapę build / buy / complement / wait z pierwszą użyteczną wersją i zastrzeżeniem dotyczącym ryzyka danych w `context/team/opportunity-map.md`. |
| `/10x-mom-test` | Masz kandydata i chcesz wiedzieć, czy problem jest realny. Tworzy nienaprowadzającą krytykę, pytania do wywiadu, ankietę oraz kryteria go/no-go; zapisuje do `context/team/mom-test-validation.md`. |
| `/10x-shape` -> `/10x-prd` -> `/10x-roadmap` | Zweryfikowany kandydat jest wart zbudowania. Kontynuuj zgodnie ze standardowym 10xWorkflow. |

### Twarde zasady

- **Kupuj, zanim zbudujesz.** Najpierw wskaż istniejącą lub domyślną odpowiedź; nakładka pomocnicza ją uzupełnia, a nie zastępuje.
- **Dowody pochodzą z przeszłych zachowań.** Pytaj, co ludzie zrobili ostatnim razem, a nie czy korzystaliby z narzędzia.
- **Określ ryzyko danych.** Każdy kandydat wskazuje, jakie dane odczytuje oraz co może wyciec lub pójść nie tak.

## Zestaw narzędzi AI 10xDevs — Moduł 5, Lekcja 2 (Agent zespołowy z SDK)

Zbuduj minimalnego agenta do przeglądu kodu: diff na wejściu, ustrukturyzowany werdykt JSON na wyjściu. Schemat i prompt systemowy są kontraktem, od którego zależy wszystko później (bramka CI, ewaluacje).

```
review schema + system prompt -> review.ts (ready-made agent SDK or AI SDK ToolLoopAgent) -> git diff | npx tsx review.ts
```

### Router zadań — od czego zacząć

| Umiejętność / prompt / szablon | Użyj, gdy |
| --- | --- |
| `m5l2-review-schema.ts.template` (config templates) | Rozpoczynasz tworzenie recenzenta. Skopiuj go do pakietu recenzenta: sześć ocenianych kryteriów (1–10), werdykt i podsumowanie jako schemat zod oraz prompt systemowy. |
| `m5l2-agent` (prompts) | Konfigurujesz punkt wejścia AI SDK, a następnie planujesz modułowego recenzenta `ToolLoopAgent` za pomocą `/10x-plan`. |
| `/10x-plan` -> `/10x-implement` | Przekształcasz jednoplikowego recenzenta w moduły wielokrotnego użytku. |

### Twarde zasady

- **Schemat jest kontraktem.** Najpierw zmień kryteria, wartości werdyktu lub nazwy pól w schemacie, a następnie w promptach, bramkach i ewaluacjach.
- **Przypinaj główne wersje.** Kod lekcji jest przeznaczony dla AI SDK 7 (`ai@7`, `@openrouter/ai-sdk-provider@3`) oraz Node 22+.
- **Śledź koszt każdego uruchomienia.** Loguj użycie z każdego przeglądu i ustaw twardy limit budżetu, zanim agent zacznie działać bez nadzoru.

## Zestaw narzędzi AI 10xDevs — Moduł 5, Lekcja 3 (Przegląd kodu w CI)

Przenieś agenta przeglądu do GitHub Actions i zamień jego werdykt w bramkę merge. Oceń zmiany promptów i modeli na stałym zestawie przypadków przed ich wdrożeniem.

```
m5l3-requirements -> /10x-new -> /10x-research -> /10x-plan -> review.yml + composite action -> promptfoo evals
```

### Router zadań — od czego zacząć

| Umiejętność / prompt / szablon | Użyj, gdy |
| --- | --- |
| `m5l3-requirements` + `m5l3-cicd` (prompty) | Prowadzisz badania i planujesz przepływ pracy przeglądu CI na podstawie pisemnych wymagań. |
| `m5l3-review.yml.template`, `m5l3-action.yml.template` (szablony konfiguracji) | Podłączasz recenzenta do przepływu PR: akcja kompozytowa z wejściami tytułu, treści i diffu, etykietami `ai-cr:passed` / `ai-cr:failed` oraz nieudaną kontrolą przy werdykcie `fail`. |
| `m5l3-promptfoo` (prompt) + `m5l3-promptfooconfig.yaml.template` | Porównujesz modele lub zmiany promptów na tych samych diffach za pomocą asercji is-json, llm-rubric i javascript. |
| `/10x-impl-review-ci` | Przeglądasz PR względem jego `context/changes/<id>/plan.md` w CI za pomocą Claude Code Action; szablon jego workflow znajduje się w katalogu `references/` umiejętności. |

### Twarde zasady

- **Przypinaj akcje zewnętrzne do pełnego SHA commita** z tagiem w komentarzu.
- **Bramkuj na polu werdyktu**, nigdy na swobodnym tekście wyjściowym.
- **Przekazuj wielowierszowe wartości (diffy) przez pliki lub ograniczniki heredoc**, a nie przez jednowierszowe zapisy `$GITHUB_OUTPUT`.
- **Uruchom zestaw ewaluacyjny przed zmianą promptu lub modelu przeglądu.**

## Zestaw narzędzi AI 10xDevs — Moduł 5, Lekcja 4 (Wspólny rejestr AI)

Dystrybuuj umiejętności zespołu, prompty i reguły jako wersjonowany pakiet w rejestrze, który Twoja organizacja już posiada. GitHub Packages to domyślna ścieżka; AWS CodeArtifact z Terraform to opcjonalna ścieżka zarządzanej infrastruktury.

```
m5l4-shared-* -> m5l4-github-packages-spec-* + config templates -> publish -> npm install in consumer repos
```

### Router zadań — od czego zacząć

| Umiejętność / prompt / szablon | Użyj, gdy |
| --- | --- |
| `m5l4-shared-conventions`, `m5l4-shared-spec-skill` (prompty) | Definiujesz pierwszą wspólną umiejętność zespołu i jej konwencje. |
| `m5l4-github-packages-spec-pack`, `m5l4-github-packages-spec-cicd` (prompty) + `m5l4-github-packages-*.template` | Tworzysz domyślny pakiet: package.json, instalator i deinstalator, konsumencki `.npmrc`, początkowy `rules/CLAUDE.md` oraz workflow publikowania. |
| `/pack-init` -> `/tf-registry` -> `/setup-cicd` | Opcjonalna ścieżka CodeArtifact: utwórz szkielet pakietu, skonfiguruj rejestr za pomocą Terraform, a następnie dodaj CI/CD. Odczytują specyfikacje `m5l4-*` z katalogu promptów Twojego narzędzia. |

### Twarde reguły

- **Nigdy nie nadpisuj tego, co napisał konsument.** Instalatory modyfikują tylko pliki, które śledzą w swoim manifeście, i wyłącznie tekst między ich znacznikami sentinelowymi.
- **Deinstalacja usuwa dokładnie to, co dodała instalacja**, używając manifestu.
- **Publikuj wyłącznie nową wersję.** Zwiększ wersję przed publikacją; rejestr odrzuca wersję, która już istnieje.
- **Tokeny pozostają w sekretach CI lub lokalnym env**, nigdy w zatwierdzonym `.npmrc`.

## Zestaw narzędzi AI 10xDevs — moduł 5, lekcja 5 (agenci asynchroniczni i zdalni)

Deleguj ograniczoną, zaplanowaną zmianę i wróć, aby ją przejrzeć. Kontrola nie znika; przenosi się do kontraktu zadania, konfiguracji sandboxa i końcowego przeglądu.

```
/10x-plan -> /goal + /10x-goal-implement (interactive or claude -p) -> review the commits and the manual checklist
```

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-goal-implement <change-id>` | Zatwierdzony `context/changes/<id>/plan.md` powinien zostać wykonany bez nadzoru. Połącz go z `/goal <condition>`; zapisuje commit po każdej zielonej fazie i kończy się oczekującymi ręcznymi kontrolami. |
| `/10x-implement` | Chcesz samodzielnie kierować każdą fazą. |

### Twarde zasady

- **Deleguj wyłącznie zaplanowaną pracę.** Brak zatwierdzonego `plan.md` oznacza brak działania bez nadzoru.
- **Ogranicz każde uruchomienie.** Warunek `/goal` określa stan końcowy i limit tur.
- **Zielone uruchomienie nie oznacza ukończonej zmiany.** Przejrzyj commity i wykonaj ręczną checklistę przed mergowaniem.
- **Przyznaj sandboxowi tylko te sekrety i dostęp do sieci, których zadanie potrzebuje.**
- **Monitoruj równoległe i zdalne uruchomienia w jednym miejscu.** Uruchamiaj każdą sesję bez nadzoru w osobnym obszarze roboczym herdr, aby widzieć, którzy agenci pracują, są zablokowani lub skończyli, oraz interweniować z przeglądarki (konfiguracja w M2L6 Deep Dive).
