---
date: 2026-10-22T19:04:41+02:00
researcher: Karolina Jurowicz
git_commit: a7131aca536aff41213de0764169b037a2fb34b1
branch: master
repository: xDevs
topic: "Audyt UI widoku /today (today.astro + components/today/*) względem kontraktu systemu projektowego"
tags: [research, codebase, ui, design-system, today, TaskRow, DueChip]
status: complete
last_updated: 2026-10-22
last_updated_by: Karolina Jurowicz
---

# Research: Audyt UI widoku /today

**Date**: 2026-10-22T19:04:41+02:00
**Researcher**: Karolina Jurowicz
**Git Commit**: a7131aca536aff41213de0764169b037a2fb34b1
**Branch**: master
**Repository**: xDevs

## Research Question

Które elementy widoku `/today` (`src/pages/today.astro` oraz `src/components/today/*`) łamią kontrakt systemu projektowego (`context/foundation/design-system/design-system.md`), i jakie 3–5 zarzutów (z plikiem, linią i wpływem na użytkownika) powinien zaadresować plan zmiany `ui-today-view`? Zakres z `change.md`: ten jeden widok, tokeny z `src/styles/global.css`, wariant „istniejący system projektowy”, plus dwa punkty do rozważenia (follow-up `outline-hidden` z `ui-app-shell`, FR-018).

## Summary

Zakres sprawdzony: `today.astro` (275 linii, w całości), pięć plików `src/components/today/*` (przeczytane: `DueChip.astro`, `TodayTaskActions.tsx`, `CloseMilestoneButton.tsx`, `RestoreDeferredButton.tsx`; `AddTaskFromTodayDialog.tsx` tylko fragmenty: importy z `ui/`, liczba `outline-none` i blok błędu l. 345–351), `src/components/ui/{button,field}.tsx`, spec DS wraz z `reference/components/{TaskRow,Chip,TaskCheck,ProjectDot,MilestoneCard,Button}.md` i `reference/screens/day-view.md`, `src/lib/today.ts` (`dueChip`), plany archiwalne `2026-10-15-today-list-view` i `2026-10-16-today-list-actions` (fragmenty „What We're NOT Doing”). Nie uruchamiano aplikacji ani nie robiono zrzutów ekranu.

- **Literałów nie ma.** Skan wartości zakodowanych na sztywno na `today.astro` i `components/today/*` daje 0 trafień. W tym widoku występują wyłącznie klasy tokenów (m.in. `text-muted-foreground` 15×, `text-foreground` 14×, `text-destructive-ink` 6×, `bg-card` 3×), więc zarzuty nie dotyczą kategorii „brakujące tokeny”, poza jedną drobną niezgodnością typograficzną (C1).
- **Dług jest w powielaniu markupu i w stanach.** `today.astro` składa wiersze listy z czterech niemal identycznych bloków `<li>` (C1), a styl linku z fokusem jest wklejony 7× (C2); chip „Pominięte wczoraj” jest zbudowany ręcznie obok komponentu `DueChip` (C3); komunikat błędu jest skopiowany w czterech komponentach widoku, a błąd ładowania strony nie ma ikony ani słowa (C4).
- **Elementy ze specyfikacji, których nie ma, są w większości poza zakresem zmian wizualnych**: rail „Najbliższe milestony”, Banner guardrail, filtr obszarów, `ProjectDot`, `TaskCheck`. Plan archiwalny wprost je wyłączył (`context/archive/2026-10-15-today-list-view/plan.md:44-45`), a `ProjectDot` nie ma nawet danych: w `src/types.ts` i `supabase/migrations/` nie ma żadnego trafienia na „color” (C5, deferred).
- **Follow-up z `ui-app-shell` dotyczy tego widoku bezpośrednio:** `outline-none` występuje w `today.astro` 7× (l. 92, 124, 160, 191, 211, 223, 234), a `outline-hidden` jest poprawką dla trybu wysokiego kontrastu Windows (`context/archive/2026-10-22-ui-app-shell/follow-ups/review-fixes.md`).

## Charges

Format: plik:linia — co jest nie tak — wpływ na użytkownika — kategoria — propozycja dla planu.

### C1. Wiersz listy skopiowany 4× w `today.astro` (brakujący współdzielony komponent)

- **Dowód:** identyczny kontener `<li class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">` w `today.astro:86` (rutyna), `:118` (pominięte), `:154` (zadanie) i `:228` (przeniesione na później); piąty wariant z `bg-accent` w `:185` (milestone do zamknięcia). Wewnątrz powtarza się ten sam układ: lewa kolumna `type-task` + linia `type-meta` z linkiem do projektu, prawa kolumna `flex min-w-0 shrink-0 flex-col items-start gap-2 sm:items-end` (l. 104, 133, 169).
- **Spec (źródło → widok):** `reference/components/TaskRow.md` opisuje jeden komponent `TaskRow` (check, tytuł + linia projekt · milestone, chip terminu, akcje) z wariantami `--partial`, `--done`, `--milestone`. W repo nie ma komponentu `TaskRow` ani w `src/components/ui/`, ani w `src/components/today/` (`ls src/components/today`, `src/components/ui`).
- **Dryf już się zaczął:** wiersz milestona używa surowych utility typograficznych `font-serif text-xl font-medium` (`today.astro:187`) zamiast tokenu `type-section` (serif 20/26, 600 w `global.css`), więc ma inną grubość niż nagłówki sekcji; wiersz rutyny nie ma w ogóle chipa terminu, a wiersz „pominięte” ma własny, ręcznie zbudowany (C3).
- **Wpływ na użytkownika:** każda zmiana układu wiersza (np. checkbox ze spec, akcje widoczne przy hover) musi zostać naniesiona w pięciu miejscach; w praktyce wiersze różnych typów zaczną wyglądać nierówno.
- **Propozycja dla planu:** komponent `src/components/today/TaskRow.astro` (lub współdzielony w `src/components/`, bo widok projektu ma własne wiersze w zmianie #3) z prop `tone`/wariantem i slotami: tytuł, meta, końcówka (chip + akcje). Użyć go dla czterech `<li>` i wiersza milestona; typografię milestona przenieść na `type-section`.

### C2. Link z fokusem wklejony 7× i bez `outline-hidden`; link bez fokusu w stanie pustym (brakujący współdzielony komponent + follow-up)

- **Dowód:** klasa `rounded-sm underline outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` występuje w `today.astro:92, 124, 160, 191, 234` (linki do projektu); wariant dla „Otwórz projekt” w `:211` i dla `<summary>` w `:223`. Razem 7 wystąpień wzorca `ring-offset-background` i 7 wystąpień `outline-none` w tym pliku (grep). Poza widokiem ten sam wzorzec jest w `src/pages/projects/[id].astro`, `src/pages/projects/index.astro` i `AddTaskFromTodayDialog.tsx` (po 1×).
- **Link bez fokusu na tokenie:** w stanie pustym `<a href="/projects" class="type-button text-foreground underline">` (`today.astro:76-78`) nie ma żadnych klas fokusu; zostaje tylko globalny `outline-ring/50` z reguły bazowej (`src/styles/global.css`, `@layer base`).
- **Cel dotykowy:** „Otwórz projekt” ma `h-8` (32 px, `today.astro:211`); spec wymaga ≥40 px (`design-system.md`, „Interaction rules”: touch targets ≥40px).
- **Wpływ na użytkownika:** użytkownik klawiatury w trybie wysokiego kontrastu Windows nie widzi fokusu na żadnym z tych linków (`outline-none` + pierścień z `box-shadow`, ustalenie F3 z przeglądu `ui-app-shell`), a w stanie pustym „Projekty” ma tylko półprzezroczysty obrys. Na telefonie „Otwórz projekt” jest trudny do trafienia.
- **Propozycja dla planu:** mały komponent `TextLink.astro` (rounded-sm, underline, `outline-hidden` + pierścień `ring`, opcjonalny wariant z `min-h-10` dla linków samodzielnych); użyć go w 5 linkach do projektu, w „Otwórz projekt”, w stanie pustym i w `<summary>`. `outline-hidden` w `ui/button.tsx` pozostaje w follow-upie (poza zakresem „jeden widok”): przyciski wiersza (`Button`) dziedziczą nadal `outline-none` z `button.tsx:8`. To trzeba zapisać jako świadome odroczenie albo włączyć do planu jako jedyny wyjątek od zasady „jeden widok” (decyzja do `/10x-plan`).

### C3. Chip „Pominięte wczoraj” zbudowany ręcznie obok `DueChip`; trzy inline SVG w komponencie chipa (brakujący współdzielony komponent)

- **Dowód:** `DueChip.astro:22` definiuje pigułkę (`type-meta inline-flex shrink-0 items-center gap-1 self-start rounded-pill px-2 tabular-nums`) i trzy ikony inline SVG (`:27-40` ostrzeżenie, `:43-62` słońce, `:65-77` strzałka). W `today.astro:134-148` ta sama pigułka jest zapisana od nowa z ręcznie wklejonym SVG zegara. Trzecia kopia: `src/pages/projects/[id].astro:138` (`rounded-pill bg-success-soft`, poza tym widokiem). `DueChip` ma jedynego importera: `today.astro:4`.
- **Spec:** `reference/components/Chip.md` opisuje jeden `Chip` z wariantami (overdue, today, tomorrow, date, none, done) i regułą „ikona + słowo, kolor nigdy sam”. W repo ikony Lucide są już używane statycznie w `.astro` (`Banner.astro`, zmiana `ui-app-shell`), więc inline SVG nie jest potrzebne.
- **Wpływ na użytkownika:** zmiana wyglądu lub ikony chipa wymaga edycji w kilku plikach; „Pominięte wczoraj” nie wyglądałoby spójnie po zmianie `DueChip`. Chip „Pominięte” nie zawiera słowa „Termin:” dla czytnika ekranu, w odróżnieniu od `DueChip` (`:79`) — nie zmierzono, czy to problem dla użytkownika.
- **Propozycja dla planu:** uogólnić `DueChip.astro` do `Chip.astro` (prop `tone` z dodatkową wartością `skipped`; ikony `TriangleAlert`, `Sun`, `ArrowRight`, `Clock` z `lucide-react`), użyć go w „Pominięte wczoraj”; dopuszczalne zostawienie `[id].astro:138` do zmiany #3.

### C4. Komunikat błędu skopiowany w 4 komponentach widoku; błąd ładowania strony tylko kolorem (brakujący współdzielony komponent + stan błędu)

- **Dowód (powielenie):** blok `<p role="alert" className="type-meta text-destructive-ink flex items-center gap-1"><CircleAlert className="size-4 shrink-0" aria-hidden="true" /><span>…</span></p>` występuje w `TodayTaskActions.tsx:136-141`, `CloseMilestoneButton.tsx:62-67`, `RestoreDeferredButton.tsx:63-68` i `AddTaskFromTodayDialog.tsx:345-351`; w repo ten wzorzec jest też w 5 komponentach widoków projektów (grep `CircleAlert` w `src/components/projects/*`) i w `ui/field.tsx:34-39`.
- **Niespójność:** `Field` dopisuje słowo „Błąd:” przed treścią (`field.tsx:36-38`, `AddTaskFromTodayDialog.tsx:349`), błędy akcji w wierszu nie (`TodayTaskActions.tsx:137-140`). Reguła DS: pilność to kolor + słowo + ikona (`design-system.md`, „Rules”).
- **Błąd ładowania strony:** `unavailable` jest renderowane jako `<p role="alert" class="type-quote mt-8 text-destructive-ink">` (`today.astro:67-70`) — sam kolor i kursywa serif, bez ikony i bez słowa „Błąd:”. Pozostałe stany (pusty: `:73-79`, tylko pominięte: `:83`) mają osobne, ale poprawne komunikaty tekstowe.
- **Wpływ na użytkownika:** awaria wczytania listy wygląda jak zwykły cytat, a nie komunikat o błędzie; błędy przy akcjach (Zrobione, Na jutro, Zamknij milestone) nie mówią „Błąd:”, w odróżnieniu od błędów pól formularza.
- **Propozycja dla planu:** wydzielić `InlineError` w `src/components/ui/` (ikona + „Błąd:” + treść, `role="alert"`), użyć w czterech komponentach widoku i dla `unavailable` (wersja Astro lub React renderowana statycznie). Pięć kopii w widokach projektów zostaje do zmiany #3; `Field` może później korzystać z tego samego komponentu.

### C5. Elementy ze specyfikacji widoku dnia, których nie ma — wymagają decyzji produktowej lub danych (deferred)

- **Dowód (czego brakuje):** spec `reference/screens/day-view.md` przewiduje m.in. filtr obszarów życia, `TaskCheck`, `ProjectDot` przy nazwie projektu, rail „Najbliższe milestony” i Banner o zbliżającym się milestonie; w `today.astro` nie ma żadnego z nich (sprawdzony plik w całości). Milestone do zamknięcia jest zwykłym wierszem z tłem `bg-accent` (`today.astro:185`), bez rombu i bez licznika.
- **Dlaczego deferred:** plan `2026-10-15-today-list-view` wprost wyłącza filtr (FR-013), kolor projektu / ProjectDot (FR-014), rail i sidebar (`context/archive/2026-10-15-today-list-view/plan.md:44`) oraz sygnalizację zbliżającego się milestona („żaden FR ani slice jej dziś nie pokrywa”, `:45`). W roadmapie FR-013 i FR-014 są zaparkowane (`context/foundation/roadmap.md`, sekcja Parked). `ProjectDot` wymaga ponadto danych: w `src/types.ts` ani w `supabase/migrations/` nie ma żadnego trafienia na „color”, więc kolor projektu nie istnieje w modelu danych.
- **FR-018 (oznaczenie powtarzalnego zadania):** wiersz rutyny pokazuje już rytm tekstem w linii meta (`today.astro:98`, `formatRecurrence`), ale nie ma osobnego znacznika (np. ikony). Roadmapa trzyma FR-018 w Parked jako „czysto wizualne oznaczenie”; to jedyny element z listy „do rozważenia”, który mieści się w jednej zmianie wizualnej.
- **Wpływ na użytkownika:** lista działa i jest czytelna, ale odbiega od zaprojektowanego ekranu; brak rozróżnienia kolorem projektu i brak ostrzeżenia o zbliżającym się milestonie to decyzje produktowe, nie poprawki stylu.
- **Propozycja dla planu:** zostawić C5 w `## Charges` jako **deferred** z tym powodem; z FR-018 zdecydować w `/10x-plan`, czy dodać mały znacznik rytmu w `TaskRow` (ikona Lucide `Repeat` + słowo już jest w meta) w ramach tej zmiany.

### Poza zarzutami (sprawdzone, bez ustalenia)

- **Literały:** 0 trafień na `today.astro` i `components/today/*` (skan z `/10x-ui`); żadnych klas palety ani wartości arbitralnych `-[…px]`.
- **Komponenty `ui/`:** pięć plików `today/*` importuje `Button`, `Dialog`, `Field`, `Input`, `Select`, `WeekdayPicker` z `@/components/ui/*`; drugiego `Button` w widoku nie ma.
- **Stan disabled akcji:** przyciski wiersza używają `aria-disabled` + `aria-busy` + `aria-disabled:opacity-50` (`TodayTaskActions.tsx:63, 72-73`), co jest widoczne i blokuje klik. Stanu `loading` jako szkieletu nie ma i nie jest potrzebny: strona jest renderowana serwerowo, a po akcji następuje `window.location.reload()` (np. `TodayTaskActions.tsx:45`) — brak przeskoku layoutu nie został zmierzony.
- **Dark mode:** widok używa wyłącznie tokenów z `:root`/`.dark`, więc nie ma osobnego ryzyka; nie zweryfikowano wizualnie.
- **Reguły agenta:** `CLAUDE.md` nie zawiera instrukcji zachęcającej do wartości jednorazowych.

## Code References

- `src/pages/today.astro:86, 118, 154, 185, 228` — pięć wariantów wiersza listy (4× ten sam kontener `<li>`)
- `src/pages/today.astro:92, 124, 160, 191, 211, 223, 234` — wklejony styl linku z `outline-none`
- `src/pages/today.astro:76-78` — link „Projekty” w stanie pustym bez klas fokusu
- `src/pages/today.astro:134-148` — ręcznie zbudowany chip „Pominięte wczoraj”
- `src/pages/today.astro:67-70` — błąd ładowania listy (`unavailable`) bez ikony i słowa
- `src/pages/today.astro:187` — typografia milestona `font-serif text-xl font-medium`
- `src/components/today/DueChip.astro:22, 27-77` — pigułka chipa i trzy inline SVG
- `src/components/today/TodayTaskActions.tsx:136-141`, `CloseMilestoneButton.tsx:62-67`, `RestoreDeferredButton.tsx:63-68`, `AddTaskFromTodayDialog.tsx:345-351` — skopiowany komunikat błędu
- `src/components/ui/field.tsx:34-39` — wariant błędu ze słowem „Błąd:”
- `src/components/ui/button.tsx:8` — `outline-none` we współdzielonym `Button` (follow-up poza zakresem)
- `context/foundation/design-system/reference/components/{TaskRow,Chip,TaskCheck,ProjectDot}.md` — komponenty spec, których brakuje w repo
- `context/archive/2026-10-15-today-list-view/plan.md:44-45` — wyłączone elementy widoku dnia

## Architecture Insights

- Widok `/today` jest czysty pod względem tokenów, ale zbudowany „na płasko”: markup wiersza, chipa, linku i błędu jest powielany zamiast wydzielony do komponentów, które spec nazywa wprost (`TaskRow`, `Chip`). To ta sama klasa problemu, którą w `ui-app-shell` rozwiązał `NavLink`/`Banner`.
- Komponenty tej zmiany będą współdzielone z kolejnym widokiem (projekty, zmiana #3), który ma własne kopie wiersza zadania, chipa sukcesu i błędu; umieszczenie ich w `src/components/` (a `InlineError` w `ui/`) pozwala nie powielać pracy.
- Granica „jeden widok plus globalne tokeny na zmianę” (`/10x-ui`) koliduje z follow-upem `outline-hidden` w `ui/button.tsx`: ten plik jest współdzielony przez wszystkie widoki, więc jego zmiana nie jest „jednym widokiem”.

## Historical Context (from prior changes)

- `context/archive/2026-10-15-today-list-view/plan.md:44-45` — wyłączone: filtr (FR-013), ProjectDot (FR-014), rail, sidebar, tabbar, kalendarz; guardrail „zbliżającego się milestona” bez pokrycia w FR (werdykt: poparte).
- `context/archive/2026-10-16-today-list-actions/plan.md:38` — wyłączone: dodawanie zadań z listy (S-06), filtr, kolor projektu (werdykt: poparte jako lista wyłączeń; S-06 dostarczono później).
- `context/archive/2026-10-22-ui-app-shell/follow-ups/review-fixes.md` — `outline-none` w `ui/button.tsx` i innych `ui/` zostawione na kolejną zmianę dotykającą wspólnych komponentów (werdykt: poparte, dotyczy `today.astro` bezpośrednio).

## Related Research

- `context/archive/2026-10-22-ui-app-shell/research.md` — poprzedni audyt tego samego rodzaju (szkielet); jego zarzuty C3 (NavLink) i C1 (Banner) są wzorcem dla C2–C3 tutaj.

## Open Questions

1. **FR-018:** czy dodajemy osobny znacznik powtarzalnego zadania (np. ikona `Repeat`) w `TaskRow`, czy zostaje samo tekstowe „Co 2 dni” w linii meta? Rytm jest już widoczny słowami (`today.astro:98`).
2. **Granica „jeden widok”:** czy `outline-hidden` w `ui/button.tsx` (follow-up) wchodzi do tej zmiany jako wyjątek, czy zostaje w follow-upie? Przyciski wiersza dziedziczą `outline-none` z `button.tsx:8`, więc bez tego fokus na „Zrobione”/„Na jutro” nie zmieni się.
3. **TaskCheck:** spec przewiduje 22-pikselowy checkbox zamiast przycisku „Zrobione”; obecny przepływ (trzy przyciski w wierszu) działa, a API akcji jest objęte krokami smoke (nie sprawdzano, czy smoke klika same przyciski). Zmiana to decyzja UX, nie poprawka stylu — czy ją podejmujemy?
4. **Rail i guardrail milestona:** wymagają osobnej decyzji produktowej (zapisanej w planie archiwalnym jako brak pokrycia w FR). Czy otwieramy osobny temat poza serią zmian wizualnych?
5. **Brak zrzutu:** wpływ C2/C3/C4 na szerokości 390 px i w trybie ciemnym nie został zmierzony na uruchomionej aplikacji; bramka wizualna w planie ma to pokryć (kitchen-sink dla wierszy, chipów, błędu).
