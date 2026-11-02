# SukcesPlaner

Planer dla osób, które prowadzą kilka długoterminowych projektów naraz (dom, sport, praca). Zamiast ręcznie układać dzień, aplikacja sama wylicza **listę zadań na dziś** na podstawie projektów, milestone'ów, terminów i zadań powtarzalnych.

**Działająca aplikacja:** https://sukcesplaner.sukcesplaner-kj.workers.dev

Projekt powstał w ramach certyfikacji 10xDevs 4.0 (blok 10xBuilder), według łańcucha: PRD → roadmapa → plan testów → zmiany (research → plan → implementacja → przegląd → archiwum).

## Co potrafi

- **Logowanie i rejestracja** (e-mail + hasło, Supabase Auth). Każdy użytkownik widzi wyłącznie swoje dane (RLS w bazie).
- **Projekty, milestone'y i zadania** z pełnym CRUD (dodaj, wylistuj, edytuj, usuń).
- **Lista „Na dziś”** posortowana wg pilności: zadania z własnym terminem lub z terminem milestona, w tym zaległe i odroczone.
- **Zadania powtarzalne** (co N dni lub w wybrane dni tygodnia) z akcjami na pojedynczym wystąpieniu: zrobione, przenieś na jutro.
- **Reguły biznesowe** wymuszane w bazie (triggery i funkcje): zamykanie milestona, spójność terminów zadań i rytmów powtarzania.
- **Diagnozowalne błędy**: logi w jednej linii JSON, bez danych osobowych, z `requestId`; awaria Supabase Auth zwraca 503 zamiast cichego wylogowania.

## Stack

Astro 7 (SSR) · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Supabase (Postgres, Auth, RLS) · Cloudflare Workers · Vitest · Playwright · pgTAP.

## Uruchomienie lokalne

Wymagania: Node.js 22.14.0 (`.nvmrc`), Docker (lokalny Supabase).

```bash
npm install
npx supabase start          # lokalny Supabase; wypisze API URL i klucz anon
cp .env.example .env        # uzupełnij SUPABASE_URL i SUPABASE_KEY wartościami z powyższego
cp .env .dev.vars           # sekrety dla lokalnego runtime Cloudflare
npm run dev                 # http://localhost:4321
```

## Testy i jakość

| Polecenie | Co sprawdza |
| --- | --- |
| `npm run lint` | ESLint (typowane reguły) |
| `npx astro check` | Typy |
| `npm run test:unit` | Testy skryptów (`scripts/`) |
| `npm run test:app` | Vitest: usługi, logger, middleware |
| `npm run test:db` | pgTAP: RLS, triggery, reguły danych (wymaga `supabase start`) |
| `npm run test:e2e` | Playwright: krytyczny przepływ w przeglądarce |
| `npm run smoke` | Test dymny przepływu auth i API na działającym serwerze (`BASE_URL`) |

CI (GitHub Actions, `.github/workflows/ci.yml`) uruchamia całość na każdym pushu i PR do `master`. Testy są dobrane do ryzyk z planu testów, a nie do pokrycia kodu: [context/foundation/test-plan.md](context/foundation/test-plan.md).

## Wdrożenie

Cloudflare Workers + Supabase w chmurze.

```bash
npx supabase link --project-ref <ref> && npx supabase db push    # migracje
npx wrangler secret put SUPABASE_URL                              # sekrety workera
npx wrangler secret put SUPABASE_KEY                              # klucz anon/publishable
npm run build && npx wrangler deploy
```

## Dokumentacja projektu

Cały proces jest zapisany w repozytorium, w `context/`:

- [PRD](context/foundation/prd.md) i [notatki z kształtowania](context/foundation/shape-notes.md): problem, persona, wymagania.
- [Roadmapa](context/foundation/roadmap.md): milestone'y i slice'y pracy.
- [Stack](context/foundation/tech-stack.md) i [infrastruktura](context/foundation/infrastructure.md): wybór technologii i platformy.
- [Plan testów](context/foundation/test-plan.md): ryzyka, etapy wdrożenia testów, cookbook.
- [System projektowy](context/foundation/design-system/design-system.md) i [lekcje](context/foundation/lessons.md).
- `context/archive/`: zamknięte zmiany z planami, badaniami i przeglądami; `context/audits/`: audyty obserwowalności.
- [CLAUDE.md](CLAUDE.md): zasady pracy agenta w tym repozytorium.
