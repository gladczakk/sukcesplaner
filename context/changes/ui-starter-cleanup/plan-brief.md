# Usunięcie pozostałości startera (dashboard, strona główna, Topbar, bg-cosmic) — Plan Brief

> Full plan: `context/changes/ui-starter-cleanup/plan.md`
> Research: `context/changes/ui-starter-cleanup/research.md`

## What & Why

Aplikacja ma jeszcze trzy elementy z szablonu startera: placeholder `/dashboard`, angielską stronę główną „10x Astro Starter” (`Welcome` + `Topbar`) i utility `bg-cosmic` z surowym hexem. Zmiany #1–#4 przeniosły resztę widoków na tokeny, a po logowaniu użytkownik i tak trafia na `/today`. Usuwamy starter zamiast go restylować, a `/` zostaje trasą przekierowującą.

## Starting Point

`index.astro` renderuje `Welcome` także zalogowanemu; `Topbar` linkuje do `/dashboard`, a `/dashboard` duplikuje wylogowanie, które jest już w `AppLayout`. Skan literałów: 33 linie w czterech plikach. Odwołania poza widokami: `middleware.ts`, `signout.ts`, pięć kroków smoke, `CLAUDE.md:31` i `README.md:148`.

## Desired End State

Wpisanie adresu aplikacji prowadzi niezalogowanego na logowanie, a zalogowanego na `/today`. `/dashboard` zwraca 404. W repozytorium nie ma plików startera ani `bg-cosmic`, wylogowanie kończy na `/auth/signin` jednym skokiem, a smoke dowodzi nowego zachowania.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Co zrobić ze starterem | Usunąć, nie restylować | Nie ma funkcji produktu, której te strony by służyły (PRD ich nie wspomina). | Plan |
| `/` | Przekierowanie: zalogowany → `/today`, niezalogowany → `/auth/signin` | Link z e-maila potwierdzającego może lądować na korzeniu, więc trasa nie może zwracać 404. | Research |
| Miejsce przekierowania | `index.astro` (odczyt `Astro.locals.user`) | Middleware zostaje tylko od ochrony tras; dane użytkownika są już w `locals`. | Plan |
| `/dashboard` po usunięciu | Zwykły 404 | Zgodne z decyzją „usunąć”; brak użytkowników z takimi zakładkami. | Plan |
| Wylogowanie | `signout.ts` → `/auth/signin` | Unika dwóch skoków (`/` → `/auth/signin`). | Plan |
| Domyślny tytuł `Layout` | Bez zmian | Martwy, ale nazwa produktu nie jest ustalona; poza zakresem. | Plan |
| README | Tylko wiersze tras (`/dashboard` usunięty, `/` dodany) | Reszta README opisuje starter jako całość — osobna zmiana. | Plan |
| Zabezpieczenie | Kryteria `grep` + krok smoke „`/dashboard` → 404” | Usunięte pliki nie mają czego skanować; nowa kontrola `check:values` byłaby martwa. | Plan |

## Scope

**In scope:** przekierowanie w `index.astro`, `signout.ts`, usunięcie `dashboard.astro`, `Welcome.astro`, `Topbar.astro` i `bg-cosmic`, `PROTECTED_ROUTES`, kroki smoke, `CLAUDE.md:31`, wiersze tras w README.

**Out of scope:** domyślny tytuł `Layout.astro`, przekierowanie `/dashboard`, nazwa `10x-astro-starter` w `package.json`/`wrangler.jsonc`, reszta README, `public/template.png`, nowa treść dla `/`, kitchen-sink i zrzuty.

## Architecture / Approach

Faza 1 dodaje przekierowanie i ścisłe kroki smoke, gdy dashboard jeszcze istnieje (łatwy rollback). Faza 2 kasuje pliki, zdejmuje `/dashboard` z `PROTECTED_ROUTES`, zamienia kroki smoke o dashboardzie na krok 404 i krok sesji po wylogowaniu oraz poprawia dokumentację.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Przekierowanie `/` i wylogowanie | `index.astro` jako redirect, `signout.ts` na `/auth/signin`, kroki smoke dla `/` | Pętla lub zły cel przekierowania; łapie smoke i test zepsucia |
| 2. Usunięcie startera i dokumentacja | Brak plików startera i `bg-cosmic`, smoke z krokiem 404, `CLAUDE.md` i README | Pominięte odwołanie do usuniętego elementu; łapie `grep` w kryteriach |

**Prerequisites:** Docker Desktop i lokalny Supabase dla smoke; zamknięte zakładki edytora z folderu zmiany przed archiwizacją.
**Estimated effort:** ok. 2 krótkie sesje (jedna na fazę).

## Open Risks & Assumptions

- Produkcyjny `site_url` Supabase nie jest znany z repozytorium; przekierowanie z `/` pokrywa lądowanie na korzeniu, ale ustawień produkcyjnych nie sprawdzono.
- `Astro.redirect` w stronie nie ma precedensu w repo; smoke z dokładną lokacją i test zepsucia mają to pokryć.
- Notatka w `change.md` o „wpisach bg-cosmic w CLAUDE.md” jest nieaktualna: `CLAUDE.md` nie wspomina `bg-cosmic`, zmienia się tylko linia 31.

## Success Criteria (Summary)

- `/` przekierowuje zgodnie z zalogowaniem, `/dashboard` zwraca 404, wylogowanie kończy na `/auth/signin`.
- Brak `Welcome`, `Topbar`, `dashboard.astro` i `bg-cosmic` w repozytorium; lint, `astro check`, testy, `check:values`, build i smoke zielone.
