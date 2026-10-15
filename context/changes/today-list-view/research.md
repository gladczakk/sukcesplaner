---
date: 2026-10-15T15:36:37+02:00
researcher: Claude (Sonnet 5.5)
git_commit: d6750bf
branch: master
repository: xDevs
topic: "Lista zadań na dziś (S-04): istniejąca powierzchnia UI, dostęp do danych i niejednoznaczności specyfikacji"
tags: [research, codebase, today-list-view, routing, postgrest, prd, design-system]
status: complete
last_updated: 2026-10-15
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Lista zadań na dziś (S-04)

**Date**: 2026-10-15T15:36:37+02:00
**Researcher**: Claude (Sonnet 5.5)
**Git Commit**: d6750bf
**Branch**: master
**Repository**: xDevs

## Research Question

Slice S-04 `today-list-view` (roadmapa: `context/foundation/roadmap.md:117-127`): użytkownik widzi automatycznie wygenerowaną listę zadań na dziś ze wszystkich projektów. Co repo już dostarcza (powierzchnia UI i routing, dostęp do danych, konwencje i testy), jak PRD definiuje regułę kwalifikacji i które pojęcia pozostają niezdefiniowane, tak aby `/10x-plan` mógł zbudować plan bez ponownego odkrywania?

## Summary

- **Dane są kompletne w schemacie.** Reguła z PRD używa kolumn, które już istnieją: `tasks.status`, `tasks.due_date`, `milestones.completed_at`, `milestones.due_date`, `milestones.seq` (`supabase/migrations/20261009120000_create_core_domain_schema.sql:22-53`). Nie ma żadnej funkcji SQL ani widoku do odczytu danych (w repo są wyłącznie funkcje triggerowe), a żaden serwis nie pobiera danych ze wszystkich projektów jednocześnie.
- **Widoku „dziś" nie ma w kodzie.** Nie istnieje trasa `/today`, a `/dashboard` to angielski placeholder starteru w stylu „cosmic" (`src/pages/dashboard.astro:7-26`), poza `AppLayout`. Po zalogowaniu użytkownik trafia na `/projects` (`src/pages/api/auth/signin.ts:19`), a `AppLayout` ma jedno łącze „Projekty" (`src/layouts/AppLayout.astro:20`). Nowa trasa wymaga dopisania do `PROTECTED_ROUTES` (`src/middleware.ts:4`).
- **Design system opisuje ekran „Dziś"**, ale bez implementacji (`context/foundation/design-system/design-system.md:132-133`, `reference/screens/day-view.md`), a opisane komponenty (Chip, TaskCheck, ProjectDot, MilestoneCard) nie istnieją w `src/components/ui/`. Kolumny „kolor projektu" w bazie też nie ma.
- **Specyfikacja nie jest jednoznaczna.** Business Logic i roadmapa opisują ten sam zbiór („wszystkie niedokończone zadania najbliższego niezamkniętego milestona każdego projektu"), a kryterium akceptacji US-01 opisuje inny („niedokończone z minionym lub dzisiejszym deadline'em"). Pozostają niezdefiniowane: pojęcie „najbliższy" (po terminie, remis), dziedziczenie terminu przy sortowaniu, miejsce pozycji „milestone do zamknięcia", rola `deferred_until` w S-04, definicja „dziś" (strefa) i status `partial`. Szczegóły i minimalne przypadki w sekcji „Specyfikacja" — to decyzje użytkownika, nie fakty.
- **Najważniejszy wniosek dla planu:** zakres „czystego odczytu" nie jest zapisany ani w PRD, ani w roadmapie, a część akcji z listy (zmiana statusu) już istnieje w widoku projektu (S-03), więc granica S-04/S-05 wymaga decyzji.

## Detailed Findings

### Powierzchnia UI, routing i nawigacja

- `src/pages/dashboard.astro:2,7-26` — używa `Layout` (nie `AppLayout`), pokazuje „Dashboard", „Welcome, {user?.email}" i przycisk Sign out; angielski, paleta „cosmic" (`bg-cosmic`, `bg-white/10`), bez `prerender = false` i bez ładowania danych. Nie jest celem żadnego przekierowania po logowaniu; prowadzi do niego tylko link w `src/components/Topbar.astro:10`.
- `src/pages/index.astro:1-8` — renderuje publiczny landing (`Welcome.astro`) także dla zalogowanego (nie sprawdza `locals.user`).
- `src/pages/api/auth/signin.ts:19` — po udanym logowaniu `redirect("/projects")`; `signout.ts:9` — przekierowanie na `/`.
- `src/layouts/AppLayout.astro:14-36` — powłoka aplikacji z tokenami: nagłówek z `nav aria-label="Główna nawigacja"` (logo i „Projekty" → `/projects`, brak `aria-current`), e-mail i „Wyloguj", `main` z `max-w-5xl`; jedyny prop to `title`. Brak sidebara i dolnego tabbara opisanych w design systemie.
- `src/middleware.ts:4-5,26-34` — `PROTECTED_ROUTES = ["/dashboard", "/projects"]`, `PROTECTED_API_ROUTES = ["/api/projects"]`; niezalogowany dostaje 302 na `/auth/signin` (strona) lub 401 JSON (API). Trasa spoza tablicy jest publiczna, więc `/today` i ewentualne `/api/today` wymagają dopisania.
- Wzorzec SSR strony z danymi (`src/pages/projects/index.astro:11-63`, `[id].astro:21-49`): `prerender = false`, `createClient(...)`, `try/catch` z `logError(scope, error)` (`src/lib/log.ts:5`) i trzema gałęziami renderu (błąd `role="alert"`, stan pusty `type-quote`, lista). Brak serwisu „wszystkie projekty użytkownika" — istniejące serwisy działają per `projectId`.

### Design system i komponenty

- `context/foundation/design-system/design-system.md:31` — rdzeń produktu to Lista na dziś; Screen 1 (`:132-133`): eyebrow „Dziś", data jako `display`, podsumowanie „N pozycji · M po terminie · K milestone do zamknięcia", chipy filtra po obszarze życia (FR-013, zaparkowane w roadmapie), lista, rail „Najbliższe milestony"; układ ≥1100 px to trzy kolumny `240px | 1fr | 300px` (`:122-126`).
- Wiersz zadania opisany w `reference/components/TaskRow.md` (check, tytuł `type-task`, linia „projekt · milestone" `type-meta`, chip terminu, akcje „Częściowo"/„Na jutro", warianty `--partial`, `--done`, `--milestone`); chip terminu: „dziś" = `warning-soft`/`warning-ink`, „jutro" = `info-soft`/`info-ink`, „po terminie" = `destructive-soft`/`destructive-ink` (`design-system.md:60-64`); pilność zawsze jako kolor + słowo + ikona (`:73`).
- Opisy komponentów używają klas `sp-*` ze starego presetu, których aplikacja nie używa (`design-system.md:102`) — trzeba je przełożyć na tokeny.
- W `src/components/ui/` istnieją tylko `alert-dialog`, `button`, `confirm-dialog`, `dialog`, `field`, `input`, `select`, `textarea` i `LibBadge.astro`; Chip, TaskCheck, ProjectDot, MilestoneCard nie istnieją. Kolumny „kolor projektu" (ProjectDot, FR-014) nie ma w tabeli `projects`.
- `src/components/projects/TaskRowActions.tsx:10-14,64-75` — wyspa z `Select` statusu, edycją i usuwaniem; przyjmuje `projectId`, `milestone {id, name, due_date}` i `task`, nie zależy od widoku projektu, ale po sukcesie robi `window.location.reload()` (`:43`), co różni się od opisanej w design systemie interakcji „zrobione znika po chwili".
- `src/lib/format.ts` — `formatDate`, `formatTimestamp` (Warszawa), `plural`; nie ma helpera „dziś" ani względnych dat („dziś/jutro/po terminie"); w `src` nie znaleziono żadnej funkcji zwracającej bieżący dzień (grep `new Date|timeZone|UTC`: tylko `format.ts` i `milestones.ts:134`).

### Dostęp do danych

- Schemat: `projects` (`due_date`, `life_area`), `milestones` (`due_date`, `completed_at`, `seq`), `tasks` (`due_date null`, `status` w `todo|partial|done`, `deferred_until date null`); indeks `milestones_project_due_seq_idx (project_id, due_date, seq)` odpowiada kolejności „najbliższy niezamknięty milestone projektu" (nie jest częściowy); `tasks` ma tylko indeksy po `milestone_id` i `user_id` (`...create_core_domain_schema.sql:20,38-39,55-56`). Plan F-01 zostawił indeks pod listę na dziś dla S-04 (`context/archive/2026-10-09-core-domain-schema/plan.md:66`).
- RLS: `select` na trzech tabelach to `user_id = (select auth.uid())`; `user_id` jest zdenormalizowane w każdej tabeli, więc zapytania zbiorcze nie wymagają dodatkowych polityk (`...enable_core_domain_rls.sql:5-7,22-24,43-45,64-66`).
- Niezmienniki w bazie: zamknięty milestone nie ma zadań `todo`/`partial` (`20261014120000_milestone_close_rule.sql:12-40`; `20261015120000_task_rules.sql:20-59`), termin zadania ≤ data milestona ≤ termin projektu. Wynik: w stanie spójnym „zadania niedokończone" należą wyłącznie do milestonów niezamkniętych, a otwarty milestone z samymi zadaniami `done` (lub bez zadań) jest dopuszczalny — to stan, który opisuje „sam milestone jako ostatni krok".
- Precedens zapytania zagnieżdżonego: `listMilestones` (`src/lib/services/milestones.ts:69-83`) — `select("*, tasks(*)")`, sort milestonów po `due_date`, `seq`, zadań po `due_date` (`nullsFirst: false`) i `created_at`. Tej samej składni wymaga lista „wszystkie projekty". `getProjectCounts` (`src/lib/services/projects.ts:70-85`) to jedyny w repo przykład `!inner` z filtrem na osadzonej tabeli.
- PostgREST/supabase-js: `limit(rows, {referencedTable})` i `order(col, {referencedTable})` istnieją (`node_modules/@supabase/postgrest-js/src/PostgrestTransformBuilder.ts:380,392-496`), a komentarz mówi, że dotyczą tabeli osadzonej, nie rodzica. **Niezweryfikowane na bazie:** że limit na osadzonej tabeli działa per rodzic (wiedza o PostgREST, nie z repo). Filtr na osadzonej tabeli bez `!inner` nie usuwa rodzica, tylko zostawia pustą tablicę. Globalnie posortowanej, spłaszczonej listy ze wszystkich projektów jednym zapytaniem nie da się uzyskać — scalenie i sort wymagają TS albo funkcji SQL.
- Funkcji SQL/widoków/RPC w repo brak (grep `create function|create view|.rpc(` w repo bez `node_modules`: tylko funkcje triggerowe w 3 migracjach; potwierdza to `context/archive/2026-10-09-project-crud/research.md:88`); wprowadzenie RPC byłoby pierwszym takim przypadkiem (konwencja `security invoker`, typy w `src/db/database.types.ts`).
- Skala: PRD deklaruje `users: small`, `qps: low`, `data_volume: small` (`context/foundation/prd.md:8-12`), NFR „lista na dziś poniżej 1 sekundy w typowych warunkach" (`prd.md:100`); `max_rows = 1000` w `supabase/config.toml:18`. Nie mierzono niczego.
- Testy: pgTAP dla reguł w DB (`supabase/tests/database/*.test.sql`, `npx supabase test db`, nie w CI), brak runnera testów TS; reguła zapisana w TS byłaby testowana wyłącznie smoke'iem (`scripts/smoke.mjs`: `bodyIncludes`, `bodyOrder`, asercje na treść wysp — lekcja z `context/foundation/lessons.md:5-10`), na danych z datami 2099 (nie są po terminie ani „na dziś"); smoke nie kontroluje czasu „dziś".

### Specyfikacja: reguła, sprzeczności i luki

**Cytaty wiążące** (`context/foundation/prd.md`):
- Business Logic (`:106`): „wszystkie niedokończone zadania należące do najbliższego, jeszcze niezamkniętego milestona każdego projektu, uporządkowane od najbliższego terminu do najdalszego (zadania bez terminu na końcu), a gdy wszystkie zadania danego milestona zostaną ukończone, na liście pojawia się sam milestone jako ostatni krok do zamknięcia". Roadmapa S-04 (`roadmap.md:119`) powtarza ten zbiór.
- US-01 (`:46`): „zadania … wymagające uwagi dzisiaj, posortowane tak, że zadania z bliższym deadline'em (własnym lub milestona) są wyżej"; AC1 (`:49`): „Zadanie bez ukończenia i z minionym lub dzisiejszym deadline'em pojawia się na liście"; AC3 (`:51`): zrobione usuwa z listy; AC4 (`:52`): przeniesienie na jutro przenosi pozostałą część na listę następnego dnia.
- FR-010 (`:85`): zadania bez własnego deadline'u na końcu, ale widoczne. Guardrail (`:37`): żadne dodane zadanie ani milestone nie może zniknąć z listy bez wiedzy użytkownika; (`:38`): zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem. Non-Goals (`:125`): brak podglądu kolejnych dni. FR-015/FR-013/FR-014 są nice-to-have i zaparkowane (`roadmap.md:171-172`).

**Luki i sprzeczności** (każda: warunek → dwa odczytania; źródła j.w.):
1. *AC1 a Business Logic.* Zadanie `todo` z terminem wczoraj w milestonie, który nie jest najbliższy niezamkniętym: wg Business Logic nie ma go na liście, wg AC1 jest; zadanie z terminem za 25 dni w najbliższym milestonie: wg Business Logic jest, wg AC1 nie; zadanie bez terminu w najbliższym milestonie: Business Logic i FR-010 — na liście na końcu, AC1 — nie spełnia warunku. W PRD nie jest zapisany priorytet między tymi fragmentami (założenie, że Business Logic jest nadrzędna, wynika z FR-009, nie z AC).
2. *„Najbliższy niezamknięty milestone".* Nie jest zdefiniowane, czy to najmniejsza `due_date` wśród niezamkniętych (także po terminie), czy najmniejsza `due_date ≥ dziś`; Resolved OQ2 w FR-015 (`:96`) mówi, że zadania po terminie „nadal pojawiają się na liście", co sugeruje pierwszą wersję, ale nie mówi tego wprost. Remis dat milestonów: FR-004 (`:68`) każe rozstrzygać kolejnością utworzenia, a baza ma `seq`; nie jest powiedziane, czy „najbliższy" to jeden milestone (pierwszy po `seq`), czy wszystkie z tą datą. Projekt bez niezamkniętych milestonów (zero lub wszystkie zamknięte): reguła milczy.
3. *Sortowanie.* US-01 („własnym lub milestona") sugeruje dziedziczenie terminu milestona, FR-010 i Business Logic — zadania bez terminu na końcu; przypadek: zadanie A bez terminu w milestonie z datą jutro i zadanie B z terminem za 10 dni — przy dziedziczeniu A przed B, wg FR-010 A po B. Brak reguły tie-break dla równych terminów i dla zadań bez terminu z różnych projektów (w S-03 ustalono tylko lokalną kolejność w milestonie: termin rosnąco, NULL na końcu, `created_at` — `context/archive/2026-10-15-task-crud/plan.md:55`).
4. *Pozycja „milestone do zamknięcia".* Nie określono, czy to koniec listy globalnie, pozycja wg daty milestona, czy w grupie projektu; milestone bez zadań spełnia warunek „wszystkie zadania ukończone" trywialnie (FR-004, `:69`: milestone bez zadań jest poprawny) — nieopisane, czy trafia na listę od razu; nie określono, czy akcja zamknięcia należy do S-04 (odczyt) czy S-05 — roadmapa S-05 (`roadmap.md:129-139`) jej nie wymienia, a przeglądy S-02 odnotowały to jako lukę (`context/archive/2026-10-14-milestone-crud/reviews/impl-review.md:58`).
5. *`deferred_until` (S-05) w S-04.* Kolumna istnieje i nic w kodzie jej nie czyta ani nie zapisuje; plan F-01 zostawił jej semantykę („czy przeniesione zadanie wraca na listę dokładnie w dniu `deferred_until`") do S-04/S-05 (`context/archive/2026-10-09-core-domain-schema/plan-brief.md:68`), a Business Logic o niej nie mówi. Pozostaje otwarte, czy S-04 już filtruje po niej (wtedy zapytanie nie trzeba będzie zmieniać w S-05), jak współgra z `due_date` przy sortowaniu i gdzie użytkownik widzi zadanie przeniesione na jutro (guardrail `:37` przy Non-Goals `:125`).
6. *„Dziś" i strefa.* PRD nie definiuje strefy ani momentu przełączenia dnia (`:112`); daty `YYYY-MM-DD` formatowane są w UTC (`src/lib/format.ts:5-8`), znaczniki czasu w `Europe/Warsaw` (`:17`), a `completed_at` zapisywane jest z `new Date().toISOString()` (`src/lib/services/milestones.ts:134`). Przypadek: o 00:30 czasu warszawskiego „dziś" wg UTC to jeszcze wczoraj (dotyczy porównań z terminem i z `deferred_until`). Kwalifikacja z samej Business Logic nie wymaga daty, ale kolejność i oznaczenia terminów (dziś/jutro/po terminie) tak.
7. *`partial`.* Business Logic traktuje `partial` jako niedokończone (`:108`), więc wchodzi na listę; AC4 mówi o „pozostałej części", której model nie opisuje (brak subtasków, `:126`); oznaczenie wizualne wg design systemu to wariant wiersza `--partial`.
8. *„Po terminie".* Oznaczenie wizualne to FR-015 (zaparkowane), a design system opisuje chip „po terminie" i licznik w podsumowaniu; nie jest rozstrzygnięte, czy S-04 pokazuje minione terminy bez FR-015.
9. *Guardrail „zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem" (`prd.md:38`).* Żaden FR ani slice go nie realizuje; próg „z wyprzedzeniem" nie jest zdefiniowany.
10. *Granica S-04/S-05.* Roadmapa S-04 mówi „user widzi"; S-05 nadal wymienia „zrobione/częściowo zrobione" (`roadmap.md:131`), choć UI zmiany statusu już istnieje w widoku projektu (S-03: `context/archive/2026-10-15-task-crud/plan-brief.md:21`). `Unknowns: —` w S-04 (`roadmap.md:123`) nie dowodzi jednoznaczności reguły.
11. *Poboczne:* Access Control (`prd.md:116`) wspomina „email+hasło lub OAuth", a FR-001 tylko email+hasło.

## Code References

- `src/pages/dashboard.astro:2,7-26` — placeholder dashboardu (Layout, angielski, paleta „cosmic")
- `src/pages/api/auth/signin.ts:19` — redirect po logowaniu na `/projects`
- `src/middleware.ts:4-5,26-34` — `PROTECTED_ROUTES`, `PROTECTED_API_ROUTES`, przekierowanie/401
- `src/layouts/AppLayout.astro:14-36` — nagłówek, nawigacja i `main` aplikacji
- `src/pages/projects/index.astro:11-63` — wzorzec strony SSR z danymi i stanami
- `src/pages/projects/[id].astro:21-49,170-213` — zagnieżdżone sekcje, lista zadań w milestonie
- `src/lib/services/milestones.ts:69-83` — `listMilestones` z osadzonymi zadaniami (precedens składni)
- `src/lib/services/projects.ts:70-85` — `getProjectCounts` (`!inner` na osadzonej tabeli)
- `src/components/projects/TaskRowActions.tsx:10-75` — wyspa akcji zadania (status, edycja, usunięcie)
- `src/lib/format.ts:1-40` — `formatDate`, `formatTimestamp`, `plural`
- `supabase/migrations/20261009120000_create_core_domain_schema.sql:20-56` — tabele, kolumny i indeksy
- `supabase/migrations/20261015120000_task_rules.sql:20-89` — reguły zadań (termin ≤ milestone, zamknięty milestone)
- `context/foundation/prd.md:46-52,85,106,108,112,125` — User Story, FR-010, Business Logic, Non-Goals
- `context/foundation/design-system/design-system.md:31,60-73,122-133` — Lista na dziś, chipy, układ, Screen 1
- `scripts/smoke.mjs` — smoke (asercje na treść wysp, `bodyOrder`)

## Architecture Insights

- Konwencja repo: odczyt w serwisie `src/lib/services/*` (`Client = SupabaseClient<Database>`, rzuca `readFailure`), strona SSR w Astro z `try/catch` i osobnymi komunikatami dla sekcji, wyspy React tylko dla interakcji.
- Reguły niezmienne trzymane są w bazie (triggery + pgTAP), a reguły prezentacji w TS; reguła kwalifikacji listy dziś jest czystym odczytem, więc jej poprawność mogą chronić tylko test pgTAP (jeśli trafi do SQL) albo smoke (jeśli zostanie w TS).
- Komunikaty triggerów są kontraktem z serwisami (dopasowanie po tekście); S-04 jest odczytem, więc tego mechanizmu nie dotyka.
- Design system jest specyfikacją, nie kodem: komponenty „dnia" trzeba dopiero zbudować z tokenów (`/10x-ui` po S-04 zaplanowano dla poprawek wizualnych, nie dla pierwszej budowy widoku).

## Historical Context (from prior changes)

- `context/archive/2026-10-09-core-domain-schema/plan.md:29,38,66` — F-01 zostawił S-04 logikę zapytania listy i indeks pod nią; `plan-brief.md:68` — semantyka `deferred_until` „zostanie sfinalizowana" w S-04/S-05.
- `context/archive/2026-10-14-milestone-crud/plan.md:12,24,54` — S-02 dodał stan „zamknięty milestone" i regułę zamykania na potrzeby „najbliższego niezamkniętego milestona"; lista milestonów sortowana `due_date`, `seq`.
- `context/archive/2026-10-14-milestone-crud/reviews/impl-review.md:48,58` — luka dwustronnego niezmiennika (domknięta w S-03) i wskazanie wpływu na S-05 (zamykanie z listy na dziś).
- `context/archive/2026-10-15-task-crud/plan.md:30-36,55` i `plan-brief.md:21,27` — S-03 dodał status zadania i termin ≤ milestone; kolejność zadań w milestonie zgodna z FR-010; S-05 ma zająć się „już tylko listą na dziś i przenoszeniem".
- `context/foundation/lessons.md:5-17` — dwie lekcje (smoke z asercją na treść wysp; ostrożność przy `shadcn add`), żadna o regule listy na dziś ani datach.

## Related Research

- `context/archive/2026-10-09-project-crud/research.md` — brak widoku ani RPC do zliczania (`:88`), wzorzec zapytań zbiorczych per projekt.

## Open Questions

Pytania do rozstrzygnięcia w planie (decyzje produktowe, nie fakty):

1. Która reguła jest wiążąca: Business Logic („najbliższy niezamknięty milestone, wszystkie niedokończone zadania") czy AC1 („niedokończone z terminem ≤ dziś"), czy ich połączenie?
2. „Najbliższy niezamknięty milestone": najmniejsza `due_date` czy `≥ dziś`; remis dat — jeden (`seq`) czy wszystkie; co z projektem bez niezamkniętych milestonów.
3. Czy zadanie bez terminu dziedziczy termin milestona przy sortowaniu; tie-break dla równych terminów i dla zadań z różnych projektów.
4. Gdzie jest pozycja „milestone do zamknięcia", czy milestone bez zadań pojawia się od razu i czy akcja zamknięcia należy do S-04 czy S-05.
5. Czy S-04 filtruje po `deferred_until`, jak wpływa na sortowanie i gdzie użytkownik widzi zadania przeniesione.
6. Definicja „dziś" (strefa, moment przełączenia) i jej spójność z `deferred_until` i `completed_at`.
7. Oznaczenie `partial` i pozycji „po terminie" na liście bez FR-015.
8. Gdzie zbudować widok (osobna trasa `/today`, zmiana dashboardu, przekierowanie po logowaniu, wpis w nawigacji) i jak daleko iść z design systemem (sidebar, rail, chipy, filtr) wobec kosztu MVP.
9. Gdzie żyje reguła: zapytanie PostgREST + TS (zgodne z precedensem, test przez smoke) czy funkcja SQL (test pgTAP, pierwszy RPC w repo); do sprawdzenia na bazie, czy `limit` na osadzonej tabeli działa per rodzic.
10. Który slice realizuje guardrail „zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem" i jaki jest próg.
