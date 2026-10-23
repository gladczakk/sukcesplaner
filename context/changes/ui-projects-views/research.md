---
date: 2026-10-23T10:24:17+02:00
researcher: Karolina Jurowicz
git_commit: efdaa295cbae1d1e68443050bd41482e78863d5d
branch: master
repository: xDevs
topic: "Audyt UI widoków /projects i /projects/[id] (strony + src/components/projects/*) względem kontraktu systemu projektowego"
tags: [research, codebase, ui, design-system, projects, InlineError, Chip, TextLink, TaskRow]
status: complete
last_updated: 2026-10-23
last_updated_by: Karolina Jurowicz
---

# Research: Audyt UI widoków /projects i /projects/[id]

**Date**: 2026-10-23T10:24:17+02:00
**Researcher**: Karolina Jurowicz
**Git Commit**: efdaa295cbae1d1e68443050bd41482e78863d5d
**Branch**: master
**Repository**: xDevs

## Research Question

Które elementy widoków `/projects` (`src/pages/projects/index.astro`) i `/projects/[id]` (`src/pages/projects/[id].astro`) wraz z komponentami `src/components/projects/*` łamią kontrakt systemu projektowego (`context/foundation/design-system/design-system.md`) lub powielają markup, który po zmianach `ui-app-shell` i `ui-today-view` ma już wspólne komponenty (`TaskRow`, `Chip`, `TextLink`, `InlineError`), i jakie 3–5 zarzutów (z plikiem, linią i wpływem na użytkownika) powinien zaadresować plan zmiany `ui-projects-views`? Zakres z `change.md`: dwie strony i 8 komponentów, tokeny z `src/styles/global.css`, wariant „istniejący system projektowy”.

## Summary

Zakres sprawdzony: obie strony przeczytane w całości; osiem komponentów w `src/components/projects/` (`DeleteMilestoneDialog`, `DeleteProjectDialog`, `DeleteTaskDialog`, `MilestoneFormDialog`, `MilestoneRowActions`, `ProjectFormDialog`, `TaskFormDialog`, `TaskRowActions`) przeczytane w całości przez pomocnika; porównane ze wspólnymi `ui/inline-error.tsx`, `ui/field.tsx`, `ui/confirm-dialog.tsx` i `today/TodayTaskActions.tsx`. Spec: `design-system.md`, `reference/components/{MilestoneSection,ConfirmDialog,TaskRow,Chip,…}.md`, `reference/screens/project-view*.md`. Historia: archiwalne plany i przeglądy `project-crud`, `milestone-crud`, `task-crud`, `manual-task-add-from-list`, `ui-app-shell`, `ui-today-view` (sekcje „What We're NOT Doing”, decyzje, follow-upy). Nie uruchamiano aplikacji ani nie robiono zrzutów ekranu; nie czytano hooków `use-*-api`.

- **Literałów nie ma.** Skan wartości zakodowanych na sztywno na 10 plikach (obie strony i 8 komponentów) daje 0 trafień; pomocnik osobno przeszukał `projects/*.tsx` pod kątem hex/rgb/oklch, klas palety i wartości arbitralnych i nie znalazł żadnych. Zarzuty dotyczą powielenia i stanów, nie kolorów.
- **Wspólnych komponentów z `ui-today-view` nikt tu jeszcze nie używa.** Żaden plik w `src/pages/projects/` ani `src/components/projects/` nie importuje `InlineError`, `Chip`, `TextLink` ani `TaskRow` (grep po tych nazwach daje tylko `TaskRowActions`, nazwę własnego komponentu).
- **Powielenia ze `ui-today-view` do zamknięcia tutaj** (jawnie przypisane „zmianie #3” w `context/archive/2026-10-22-ui-today-view/plan.md:29`): blok błędu w 5 komponentach `projects/*` i w `ui/confirm-dialog.tsx`, ręczny chip „zamknięty” (`[id].astro:138`), klasy linków z `outline-none` (`index.astro:53`, `[id].astro:66`) i linki bez fokusu (`[id].astro:58, 261`).
- **Elementy spec, których nie ma** (timeline `MilestoneSection` ze stanami, zwijanie zadań, pasek postępu, rail z licznikami, `ProjectDot`, chip „po terminie”) były jawnie wyłączone w planach archiwalnych albo są w PRD non-goals; widok listy projektów i formularze są w spec „not designed yet” (`design-system.md:141-142`).

## Charges

Format: plik:linia — co jest nie tak — wpływ na użytkownika — kategoria — propozycja dla planu.

### C1. Komunikat błędu skopiowany w 5 komponentach i w `ConfirmDialog`; błędy ładowania stron tylko kolorem (brakujący współdzielony komponent + stan błędu)

- **Dowód (powielenie):** blok `<p role="alert" className="type-meta text-destructive-ink flex items-center gap-1">` + `CircleAlert` jest dosłowną kopią `InlineError` w `MilestoneFormDialog.tsx:172-177`, `ProjectFormDialog.tsx:195-200`, `TaskFormDialog.tsx:374-379` oraz we współdzielonym `ui/confirm-dialog.tsx:53-58`. W `MilestoneRowActions.tsx:82-85` i `TaskRowActions.tsx:84-87` ten sam blok **nie ma** słowa „Błąd:” (ikona + sam komunikat). Wzorzec referencyjny: `ui/inline-error.tsx:16-21` (z propem `role`), użyty już w `today/TodayTaskActions.tsx:136`.
- **Dowód (strony):** `index.astro:39-41` (`unavailable`), `[id].astro:55-57` (`unavailable`) i `[id].astro:103-105` (`milestonesError`) renderują błąd jako `<p role="alert" class="type-quote text-destructive-ink">` — sam kolor i kursywa serif, bez ikony i słowa „Błąd:”. To ten sam defekt, który `ui-today-view` naprawił w `today.astro:73` (zarzut C4 tamtej zmiany).
- **Wpływ na użytkownika:** błąd zmiany statusu zadania lub zamknięcia milestona w wierszu nie mówi „Błąd:”, w odróżnieniu od błędów w dialogach, a awaria wczytania projektu lub listy wygląda jak zwykły cytat.
- **Propozycja dla planu:** zastąpić pięć kopii w `projects/*` oraz kopię w `ConfirmDialog` komponentem `InlineError` (w wyspach po akcji `role="alert"`); błędy ładowania na stronach przez `InlineError role="status"` (statyczna treść, zgodnie z F1 z przeglądu `ui-today-view`). `ui/field.tsx` ma ten sam markup z `id` i `aria-describedby`; jego ujednolicenie z `InlineError` było odroczone do osobnej decyzji (F7 tamtego przeglądu), więc zostaje poza zakresem.

### C2. Linki z `outline-none` i bez fokusu na tokenie; `outline-none` w komponentach `ui/` używanych przez dialogi tego widoku (brakujący współdzielony komponent + follow-up)

- **Dowód (strony):** `index.astro:53` (link-wiersz listy: `outline-none` + pierścień fokusu); `[id].astro:66` (link „Projekty”: `outline-none`, `h-8`, 32 px); `[id].astro:58` i `[id].astro:261` (linki „Projekty” / „Wróć do projektów” w stanach błędu i 404: `type-button text-foreground underline`, **bez żadnych klas fokusu**). Wspólny `TextLink.astro` (z `outline-hidden`, pierścieniem fokusu i wariantem `standalone` z `min-h-10`) istnieje i nie jest tu używany.
- **Dowód (`ui/`):** `outline-none` występuje w siedmiu miejscach w sześciu plikach `ui/` używanych w dialogach tych widoków: `alert-dialog.tsx:40`, `dialog.tsx:51` (kontener) i `dialog.tsx:60` (przycisk zamknięcia `size-8`), `input.tsx:11`, `select.tsx:21`, `textarea.tsx:10`, `weekday-picker.tsx:58` (grep po `ui/*.tsx`). `button.tsx:8` ma już `outline-hidden`. Odroczone wprost w `context/archive/2026-10-22-ui-today-view/plan.md:30` („zmiany #3 i #4”) i w `ui-app-shell/follow-ups/review-fixes.md`.
- **Wpływ na użytkownika:** w trybie wysokiego kontrastu Windows znika fokus z pól formularzy, selecta, dni tygodnia i przycisku zamknięcia w dialogach „Dodaj/Edytuj projekt / milestone / zadanie”; linki „Projekty” w stanach błędu i 404 mają tylko półprzezroczysty obrys z reguły bazowej; przycisk zamknięcia dialogu ma 32 px.
- **Propozycja dla planu:** linki tekstowe i „Projekty” przez `TextLink` (standalone tam, gdzie to osobna akcja); link-wiersz na liście zostaje własnym elementem, ale z `outline-hidden`. `outline-hidden` w sześciu plikach `ui/` jako wyjątek od zasady „jeden widok” (analogicznie do `button.tsx` w poprzedniej zmianie) — decyzja do `/10x-plan` (patrz Open Questions).

### C3. Chip „zamknięty” zbudowany ręcznie; `Chip` nie ma tonu `done` (brakujący współdzielony komponent)

- **Dowód:** `[id].astro:138-152` — `<span class="inline-flex items-center gap-1 rounded-pill bg-success-soft px-2 text-success-ink">` z inline SVG ptaszka (`:139-150`) i tekstem „zamknięty {formatTimestamp(...)}”. `Chip.astro` ma tony `overdue/today/tomorrow/soon/date/none/skipped`, bez `done`; spec `reference/components/Chip.md` (wiersz `done` → `sp-chip--done`, „confirmations, project view”). Tokeny `success-soft` / `success-ink` istnieją w `global.css`.
- **Wpływ na użytkownika:** kolejna kopia pigułki z własną ikoną: zmiana wyglądu chipów wymaga edycji w dwóch miejscach; chip „zamknięty” nie ma sr-only prefiksu ani spójnej ikony Lucide jak reszta chipów.
- **Propozycja dla planu:** dodać ton `done` do `Chip.astro` (kolory `bg-success-soft text-success-ink`, ikona Lucide `Check`, bez prefiksu „Termin: ”) i użyć go w `[id].astro`, usuwając inline SVG. Wcześniejszy komentarz o połkniętych błędach SSR dla lucide w `.astro` (`milestone-crud`, F5) został zastąpiony wzorcem `Banner`/`Chip`, który działa (smoke zielony od `ui-app-shell`).

### C4. Wiersz zadania i nagłówek listy projektów obok wspólnych elementów (brakujący komponent + typografia)

- **Dowód (wiersz zadania):** `[id].astro:176-211` — `<li class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">` z tytułem (`type-body`), linią meta (data lub „bez terminu” lub rytm) i `TaskRowActions` po prawej. Układ jest taki sam jak w `TaskRow.astro:12` (`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4`), ale bez `px-4 py-3` i z innym slotem meta; `ui-today-view/research.md:104` zapowiadał, że widok projektu „ma własny wiersz zadania, nie wspólny `TaskRow.astro`”.
- **Dowód (typografia):** `index.astro:55` nazwa projektu w liście ma `font-serif text-xl font-medium break-words` zamiast tokenu `type-section` (serif 20/26, 600 w `global.css`) — ten sam dryf, który `ui-today-view` poprawił w wierszu milestona (`today.astro`). Nazwy milestonów w `[id].astro:126` używają już `type-section`.
- **Wpływ na użytkownika:** niewielki: wiersze zadań w widoku projektu i na liście Dziś układają się tak samo, ale każda zmiana układu musi być nanoszona osobno; nazwy projektów na liście mają inną grubość niż nagłówki sekcji.
- **Propozycja dla planu:** dodać do `TaskRow.astro` wariant `compact` (bez wewnętrznych odstępów) i użyć go w `[id].astro`, albo świadomie zostawić własny `<li>` i zapisać to jako odroczone (decyzja do `/10x-plan`; patrz Open Questions); nazwę projektu na liście przenieść na `type-section`.

### C5. Stan „disabled / pending” akcji w wierszach: `aria-disabled` bez `aria-busy` i skopiowany łańcuch klas (brakujący współdzielony komponent + stan)

- **Dowód:** idiom `className="aria-disabled:pointer-events-none aria-disabled:opacity-50"` jest wklejony w `MilestoneRowActions.tsx:65`, `TaskFormDialog.tsx:268` i `today/TodayTaskActions.tsx:63`; `Button` stylizuje tylko `disabled:` (`button.tsx:8`), nie `aria-disabled:`. `MilestoneRowActions` i `TaskRowActions` ustawiają `aria-disabled` bez `aria-busy` (`TodayTaskActions` ma oba). `TaskRowActions.tsx:70` ma `Select` z `aria-disabled` (nie natywne `disabled`), więc w trakcie zapisu kontrolka nadal może zmienić wartość; `changeStatus` chroni to wczesnym `return`.
- **Wpływ na użytkownika:** czytnik ekranu nie dowiaduje się, że zmiana statusu lub zamknięcie milestona trwa (`aria-busy`), a wygląd stanu wyłączonego zależy od ręcznie powtórzonej klasy — łatwo ją pominąć w nowej akcji.
- **Propozycja dla planu:** dodać style `aria-disabled:` do bazy `Button` (jedno miejsce, usuwa trzy kopie) i `aria-busy` w obu komponentach wierszy; `Select` w `TaskRowActions` zostaje z `aria-disabled` (świadoma decyzja z `task-crud`, F1: zachowanie fokusu). Zmiana `button.tsx` dotyka wspólnego komponentu (patrz Open Questions).

### C6. Elementy spec widoku projektu, których nie ma — decyzje produktowe lub brak danych (deferred)

- **Dowód (czego brakuje):** spec `design-system.md:138-139`, `MilestoneSection.md` i `project-view.md` przewidują: oś czasu `MilestoneSection` ze stanami done/current/late/planned i zwijaniem zadań („Pokaż N zadań”), pasek postępu i licznik „2/6 zadań”, „1/5 milestonów zamkniętych” w nagłówku, panel „Szczegóły” z licznikami, postępem i kolorem projektu, `ProjectDot`, chip „po terminie” (FR-015), `TaskCheck`, wiersz „Dodaj zadanie do milestona…”. W `[id].astro` jest płaska lista milestonów (`ol`, `:111`) z zadaniami zawsze rozwiniętymi i panel „Szczegóły” z obszarem, terminem i datą utworzenia (`:236-253`).
- **Dlaczego deferred:** plany archiwalne wprost to wyłączyły — `project-crud/plan.md:36-37` (kolor, `ProjectDot`, FR-013, FR-015), `milestone-crud/plan.md:40` (chipy FR-015, pasek postępu, `MilestoneSection`, `MilestoneCard`), `task-crud/plan.md:40-41, 55-56` (zadania zawsze widoczne, status jako `Select`, nie `TaskCheck`). W roadmapie FR-013, FR-014 i FR-015 są zaparkowane (`roadmap.md`, sekcja Parked), a PRD v1 ma non-goal „statystyki i raporty postępu” (`prd.md:124`), który koliduje z paskiem postępu. `ProjectDot` wymaga ponadto danych (brak koloru w `src/types.ts` i migracjach, `ui-today-view/research.md`, C5).
- **Spec „not designed yet”:** lista projektów i formularze (projekt, milestone, zadanie) nie mają referencji (`design-system.md:141-142`: „Build them from the tokens and components above … Tell the user these screens have no reference yet”).
- **Wpływ na użytkownika:** widok działa i jest czytelny, ale odbiega od zaprojektowanego ekranu; brak oznaczenia projektu po terminie i brak postępu są decyzjami produktowymi, nie poprawkami stylu.
- **Propozycja dla planu:** zostawić C6 w `## Charges` jako **deferred** z powyższym uzasadnieniem.

### Poza zarzutami (sprawdzone, bez ustalenia)

- **Literały:** 0 trafień w 10 plikach (skan z `/10x-ui` oraz grep pomocnika po `projects/*.tsx`).
- **Komponenty `ui/`:** osiem komponentów używa `Button`, `Input`, `Select`, `Textarea`, `Field`, `WeekdayPicker`, `Dialog` i `ConfirmDialog`; własnych przycisków, pól i linków w nich nie ma, a klas fokusu (`ring-offset-background`) nie kopiują (pomocnik, 8 plików).
- **`Delete*Dialog`:** wszystkie trzy używają `ConfirmDialog` (`DeleteMilestoneDialog.tsx:70`, `DeleteProjectDialog.tsx:65`, `DeleteTaskDialog.tsx:59`); `ConfirmDialog` jest zbudowany na `AlertDialog`, więc fokus startuje na „Anuluj”, a przyciski są `disabled={pending}` (`confirm-dialog.tsx:61, 64`). Zgodne ze spec (`ConfirmDialog.md`).
- **Dostępne nazwy:** przyciski `size="sm"` mają `aria-label` z nazwą obiektu zaczynający się od widocznego słowa (label-in-name spełnione); ikony są dekoracyjne (`aria-hidden`).
- **Cele dotykowe:** siedem przycisków `size="sm"` (h-8, 32 px): `DeleteMilestoneDialog.tsx:84`, `DeleteTaskDialog.tsx:71`, `MilestoneFormDialog.tsx:134`, `MilestoneRowActions.tsx:64`, `TaskFormDialog.tsx:267, 282, 286`. To wybór całego repo (spec `Button.md` definiuje `--sm` jako 32 px, a `design-system.md:157` wymaga ≥40 px); widok Dziś zaakceptował ten sam rozmiar — nie jest zarzutem tej zmiany.
- **Zduplikowana maszyna stanów** pending/error/navigating/reload w `DeleteMilestoneDialog.tsx:31-67`, `DeleteProjectDialog.tsx:26-62`, `DeleteTaskDialog.tsx:20-56` i `TaskFormDialog.tsx:220-256` jest logiką, nie wyglądem; decyzja z przeglądu `manual-task-add-from-list` (F1): „ACCEPTED-AS-IS; wydzielić `use-reload-action` w osobnej zmianie”. Poza zakresem tej zmiany wizualnej.
- **Stany puste:** lista projektów (`index.astro:42-47`), brak milestonów (`[id].astro:106-109`), brak zadań (`:171-172`) mają osobne, poprawne komunikaty; stan ładowania nie dotyczy (strony SSR, przeładowanie po akcji).
- **Eyebrow:** `index.astro:32-33` ma eyebrow „Projekty” i `h1` „Projekty” z tym samym tekstem; lista nie ma specyfikacji, więc nie jest zarzutem (patrz Open Questions).

## Code References

- `src/pages/projects/index.astro:39-41, 53, 55` — błąd ładowania bez ikony; link-wiersz z `outline-none`; nazwa projektu w `font-serif text-xl font-medium`
- `src/pages/projects/[id].astro:55-57, 103-105` — błędy ładowania tylko kolorem; `:58, 261` linki bez fokusu; `:66` link „Projekty” z `outline-none` i `h-8`
- `src/pages/projects/[id].astro:138-152` — ręczny chip „zamknięty” z inline SVG
- `src/pages/projects/[id].astro:176-211` — własny wiersz zadania obok `TaskRow.astro:12`
- `src/components/projects/{MilestoneFormDialog:172-177, ProjectFormDialog:195-200, TaskFormDialog:374-379, MilestoneRowActions:82-85, TaskRowActions:84-87}.tsx` — kopie bloku błędu (dwie bez „Błąd:”)
- `src/components/ui/confirm-dialog.tsx:53-58` — kopia bloku błędu we współdzielonym komponencie
- `src/components/ui/{alert-dialog:40, dialog:51 i 60, input:11, select:21, textarea:10, weekday-picker:58}.tsx` — `outline-none`
- `src/components/ui/inline-error.tsx:16-21`, `src/components/TextLink.astro`, `src/components/Chip.astro`, `src/components/TaskRow.astro` — wspólne komponenty z `ui-today-view`
- `context/foundation/design-system/reference/components/{Chip,TaskRow,MilestoneSection,ConfirmDialog}.md`, `reference/screens/project-view.md` — spec

## Architecture Insights

- Widoki projektów to ostatnie miejsce w aplikacji, które buduje markup błędu, chipa i linku „na płasko”; po `ui-app-shell` i `ui-today-view` wspólne komponenty już istnieją, więc ta zmiana jest głównie przepięciem na nie (plus jeden nowy ton `done` w `Chip`).
- `ui/confirm-dialog.tsx` i `ui/field.tsx` same zawierają kopię markupu błędu; to jedyne miejsca poza widokami, które mogą zdryfować względem `InlineError`.
- Granica „jeden widok plus globalne tokeny na zmianę” koliduje z `outline-hidden` w sześciu plikach `ui/` oraz ze stylami `aria-disabled:` w `Button`: oba są współdzielone przez wszystkie widoki, więc nie są „jednym widokiem” (jak w `ui-today-view` dla `button.tsx`).

## Historical Context (from prior changes)

- `context/archive/2026-10-09-project-crud/plan.md:36-37` — wyłączone: kolor projektu / `ProjectDot` (brak kolumny, FR-014 zaparkowane), filtr obszarów (FR-013), chip „po terminie” (FR-015); `:240` widok projektu „minimalny” (werdykt: poparte, nadal obowiązuje).
- `context/archive/2026-10-14-milestone-crud/plan.md:40` — wyłączone: chipy FR-015, pasek postępu, `MilestoneSection`, `MilestoneCard` (poparte).
- `context/archive/2026-10-15-task-crud/plan.md:40-41, 55-56` — wyłączone: etykiety FR-015, pasek postępu milestona; zadania zawsze widoczne, status jako natywny `Select` zamiast `TaskCheck` (poparte).
- `context/archive/2026-10-16-manual-task-add-from-list/plan.md:38` — duplikacja dialogów celowa, wyodrębnienie „dopiero przy kolejnej wyspie” (poparte; dotyczy logiki, nie wyglądu).
- `context/archive/2026-10-22-ui-today-view/plan.md:29-30` — widoki projektów jawnie przypisane „zmianie #3”; `outline-hidden` w pozostałych `ui/*` i `auth/FormField.tsx` odroczone do zmian #3 i #4 (poparte).
- `context/archive/2026-10-22-ui-today-view/reviews/impl-review.md` (F1, F6, F7) — `InlineError` z propem `role`; test równości globu `lint-staged` i `DEFAULT_FILES`; `Field` zostaje bez zmian (częściowo poparte: `Field` nadal ma własną kopię markupu błędu).
- `context/foundation/lessons.md:19-24` — kryterium „zero X w katalogu” wymaga wypisania wszystkich plików z trafieniem w Changes Required; dotyczy planu tej zmiany (kryteria o `outline-none` w `ui/`).

## Related Research

- `context/archive/2026-10-22-ui-today-view/research.md` — audyt tego samego rodzaju dla `/today` (zarzuty C1–C4 są wzorcem dla C1–C4 tutaj).
- `context/archive/2026-10-22-ui-app-shell/research.md` — audyt szkieletu.

## Open Questions

1. **Granica „jeden widok” dla `ui/*`:** czy `outline-hidden` w sześciu plikach `ui/` (`alert-dialog`, `dialog`, `input`, `select`, `textarea`, `weekday-picker`) i style `aria-disabled:` w `Button` wchodzą do tej zmiany jako wyjątek (jak `button.tsx` w `ui-today-view`), czy zostają w follow-upie? Pola formularzy i dialogi są używane tylko w widokach projektów, `/today` (dialog „Dodaj zadanie”) i auth.
2. **`TaskRow` w widoku projektu:** czy dodajemy wariant `compact` (bez odstępów) i używamy go w `[id].astro`, czy zostaje własny `<li>` z notatką „odroczone”? Wiersz zadania w projekcie nie ma karty ani `divide-y`, więc wizualnie to inny wzorzec niż lista Dziś.
3. **`Field` i `InlineError`:** czy w tej zmianie ujednolicamy też `ui/field.tsx` (ma `id` i `aria-describedby`, których `InlineError` nie ma), czy tylko `ConfirmDialog` i komponenty `projects/*`? Odroczone wprost w F7 przeglądu `ui-today-view`.
4. **Lista projektów:** eyebrow „Projekty” duplikuje `h1`; strona nie ma specyfikacji. Czy zostaje tak jak jest?
5. **Zakres kontroli `check:values`:** `ui-today-view/plan.md:55` wprost zabronił dodawania widoków projektów do listy; czy teraz dodajemy `projects/*` i nowe/zmienione pliki `ui/*` do `DEFAULT_FILES` i globu `lint-staged`?
6. **Brak zrzutu:** wpływ C2 i C5 na szerokości 390 px i w trybie wysokiego kontrastu nie został zmierzony na uruchomionej aplikacji; bramka wizualna w planie ma to pokryć.
