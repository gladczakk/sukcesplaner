---
date: 2026-10-23T15:58:32+02:00
researcher: Karolina Jurowicz
git_commit: fb269b2cc2c76f9af1b021832f9e8bc77fbbc3b8
branch: master
repository: xDevs
topic: "Audyt UI widoków auth (/auth/signin, /auth/signup, /auth/confirm-email + src/components/auth/*) względem kontraktu systemu projektowego"
tags: [research, codebase, ui, design-system, auth, FormField, ServerError, SubmitButton]
status: complete
last_updated: 2026-10-23
last_updated_by: Karolina Jurowicz
---

# Research: Audyt UI widoków auth

**Date**: 2026-10-23T15:58:32+02:00
**Researcher**: Karolina Jurowicz
**Git Commit**: fb269b2cc2c76f9af1b021832f9e8bc77fbbc3b8
**Branch**: master
**Repository**: xDevs

## Research Question

Które elementy widoków auth (`src/pages/auth/{signin,signup,confirm-email}.astro` i sześć plików w `src/components/auth/`) łamią kontrakt systemu projektowego (`context/foundation/design-system/design-system.md`) lub powielają markup, który po zmianach `ui-app-shell`, `ui-today-view` i `ui-projects-views` ma już wspólne komponenty (`Field`, `Input`, `Button`, `InlineError`, `TextLink`), i jakie 3–5 zarzutów (z plikiem, linią i wpływem na użytkownika) powinien zaadresować plan zmiany `ui-auth-views`? Zakres z `change.md`: trzy strony i komponenty `auth/*`, tokeny z `src/styles/global.css`, wariant „istniejący system projektowy”.

## Summary

Zakres sprawdzony: trzy strony i sześć komponentów `src/components/auth/` przeczytane w całości (dziewięć plików, 437 linii); `ui/field.tsx`, `ui/input.tsx`, `ui/inline-error.tsx` i `ui/button.tsx` (rozmiary wariantów) jako wzorce; trasy `src/pages/api/auth/signin.ts` i `signup.ts`; `scripts/smoke.mjs` (kroki auth); spec DS (`design-system.md`, „Not designed yet”, „Copy”, „Icons”); `CLAUDE.md`; wyniki wcześniejszych badań w archiwum dotyczące zakresu zmian #4 (`ui-today-view/plan.md`, `project-crud/plan.md`). Nie uruchamiano aplikacji ani nie robiono zrzutów ekranu.

- **To są jedyne widoki w aplikacji w stylu startera „cosmic”.** Skan wartości zakodowanych na sztywno na dziewięciu plikach daje 22 trafienia w ośmiu z nich (`SignInForm.tsx` ma 0): strony po 4 (`confirm-email.astro:23, 25, 28, 29`; `signin.astro:10, 11, 15, 17`; `signup.astro:10, 11, 15, 17`), `FormField.tsx` 5 (`:6, 37, 41, 53, 59`), `SubmitButton.tsx` 2 (`:18, 22`), `PasswordToggle.tsx:13`, `ServerError.tsx:11`, `SignUpForm.tsx:59`. Paleta to biel, błękit i fiolet na ciemnym gradiencie `bg-cosmic`, niezwiązana z tokenami szałwiowymi aplikacji.
- **Komponenty auth są używane tylko przez dwie strony auth.** Grep po `src/` (`*.astro`, `*.tsx`, `*.ts`) na `components/auth`, `FormField`, `ServerError`, `PasswordToggle` i `SubmitButton` poza katalogiem `src/components/auth/` daje jedynie importy `SignInForm` i `SignUpForm` w `signin.astro` i `signup.astro`; ich przepisanie nie wpływa na inne widoki.
- **Całe UI jest po angielsku, a aplikacja ma polskie UI** (`CLAUDE.md`: „UI copy is Polish (`<html lang="pl">`)”; `design-system.md`, sekcja „Copy (UI is Polish)”). Dotyczy tytułów stron, nagłówków, etykiet, placeholderów, komunikatów walidacji, przycisków, `aria-label` i treści `confirm-email`.
- **Komunikat błędu serwera jest odbijany z adresu URL.** Strona czyta `error` z query (`signin.astro:5`, `signup.astro:5`) i przekazuje do formularza; trasy API przekierowują z surowym `error.message` Supabase (`signin.ts:16`, `signup.ts:16`). To otwiera wstrzyknięcie treści (patrz C4), a komunikaty są angielskie.
- **Smoke dla auth jest wąski i nie przeszkodzi w przepisaniu:** `/auth/signin` i `/auth/signup` sprawdzają tylko `action="/api/auth/signin"` / `signup` w HTML (`smoke.mjs:143-144`); kroki API sprawdzają przekierowania (`location: "/auth/signin?error="`, `:161`), a nie treść komunikatów.
- **Spec nie ma ekranu logowania** (`design-system.md:141-142`, „Not designed yet: Login, …”): układ trzeba zbudować z tokenów i komponentów, a użytkownikowi powiedzieć, że nie ma referencji.

## Charges

Format: plik:linia — co jest nie tak — wpływ na użytkownika — kategoria — propozycja dla planu.

### C1. Starterowa estetyka „cosmic”: 22 literały, wymuszone ciemne tło, gradientowy nagłówek (brakujące tokeny)

- **Dowód (widok → źródło):** karta szklana `border-white/10 bg-white/10 backdrop-blur-xl text-white` w `signin.astro:10`, `signup.astro:10`, `confirm-email.astro:23`; nagłówek `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent` w `signin.astro:11`, `signup.astro:11`, `confirm-email.astro:25`; opis `text-blue-100/60` i `/80` (`signin.astro:15`, `confirm-email.astro:28`); linki `text-purple-300` (`signin.astro:17`, `signup.astro:17`, `confirm-email.astro:29`); w komponentach: `FormField.tsx:6, 37, 41, 53, 59` (etykiety `text-blue-100/80`, pole `bg-white/10 border-white/20`, błąd `text-red-300`, pierścień `focus:ring-purple-400`), `PasswordToggle.tsx:13`, `ServerError.tsx:11` (`border-red-500/30 bg-red-900/30 text-red-300`), `SignUpForm.tsx:59` (`text-blue-100/50`), `SubmitButton.tsx:18, 22` (`bg-purple-600 hover:bg-purple-500`, spinner `border-white/30`).
- **Źródło → widoki:** wszystkie trzy strony stoją na `bg-cosmic` (`signin.astro:9`, `signup.astro:9`, `confirm-email.astro:22`), a utility `bg-cosmic` w `global.css:268-270` ma surowe hex (`#0a0e1a`, `#0f1529`) poza blokami tokenów. Poza stronami auth używają go `dashboard.astro:8` i `Welcome.astro:5` (zmiana #5).
- **Wpływ na użytkownika:** pierwszy ekran po otwarciu aplikacji jest zawsze ciemnym granatowo-fioletowym szkłem, niezależnie od motywu systemu i niepodobny do reszty aplikacji (papier, szałwia); gradientowy nagłówek z `text-transparent` w trybie wysokiego kontrastu może zniknąć (tekst przezroczysty, tło wycinane do tekstu) — nie zmierzono na uruchomionej aplikacji; kontrasty `text-blue-100/60` i `/50` na gradiencie nie zostały policzone.
- **Propozycja dla planu:** karta `bg-card border-border shadow-card rounded-md` na tle `bg-background` (tokeny, oba motywy), nagłówek `type-title text-foreground`, opisy `text-muted-foreground`, linki przez `TextLink`; klasę `bg-cosmic` usunąć z trzech stron auth, a samego utility w `global.css` nie ruszać (**deferred → zmiana #5**, bo używają go `dashboard` i `Welcome`).

### C2. `FormField`, `ServerError`, `SubmitButton` i `PasswordToggle` powielają wspólne komponenty i ich zachowania a11y (brakujący współdzielony komponent)

- **`FormField.tsx` kontra `ui/Field` + `ui/Input`:** własny `<label>`/`<input>`/błąd (`FormField.tsx:37-65`) zamiast `Field` (`ui/field.tsx`: `aria-invalid`, `aria-describedby`, `id` komunikatu, „Błąd:”) i `Input` (`ui/input.tsx`: 40 px, tokeny, `focus-visible` z pierścieniem `ring`). W `FormField` błąd to `<p class="text-xs text-red-300">` bez `role`, bez powiązania z polem (brak `aria-describedby`/`aria-invalid` na `<input>`, `:42-55`), bez słowa „Błąd:”, ikona `CircleAlert` bez `aria-hidden` (`:60`); fokus to `focus:outline-none focus:ring-2 focus:ring-purple-400` (`:6, 53`).
- **`ServerError.tsx` kontra `InlineError`:** `ServerError.tsx:11` renderuje `<p>` z ikoną i komunikatem, ale **bez `role`** (ani `alert`, ani `status`), więc błąd logowania wracający z serwera przy przeładowaniu strony nie jest zapowiadany; brak słowa „Błąd:”. `InlineError` (`ui/inline-error.tsx`) ma oba i `role` jako prop.
- **`SubmitButton.tsx` kontra `Button`:** importuje `Button`, ale nadpisuje go klasami palety (`bg-purple-600 … rounded-lg px-4 py-2`, `:18`) zamiast wariantu `default` (pigułka, `bg-primary`), a stan pending ma własny spinner `animate-spin border-white/30` zamiast ikony Lucide (`:22`); natywne `disabled={pending}` zostaje.
- **`PasswordToggle.tsx`:** ręczny `<button>` (`:10-17`) z ikoną 16 px, bez klas fokusu (`text-white/40 hover:text-white/70`), z angielskim `aria-label` („Show password” / „Hide password”, `:14`); `Button` ma wariant `ghost` i rozmiar `icon` (40 px, `button.tsx`).
- **Wpływ na użytkownika:** użytkownik czytnika ekranu nie dowiaduje się, które pole jest błędne ani że logowanie się nie powiodło; przycisk „pokaż hasło” ma cel dotykowy ok. 16 px i nie ma widocznego fokusu; przycisk wysyłania wygląda inaczej niż każdy inny przycisk w aplikacji.
- **Uwaga projektowa (wybór do planu):** `Field` wymaga pojedynczego elementu-dziecka (`cloneElement` ustawia `aria-*` na tym dziecku, `field.tsx`), a `FormField` otacza `<input>` wrapperem z ikoną po lewej i przyciskiem po prawej (`:40-57`); drop-in zamiana nie jest możliwa bez decyzji o ikonach i przełączniku hasła (patrz Open Questions).
- **Propozycja dla planu:** `Field` + `Input` zamiast `FormField` (z rozstrzygnięciem ikon i przełącznika), `InlineError role="alert"` zamiast `ServerError`, `Button` bez nadpisań koloru i spinner z Lucide w `SubmitButton`, `Button variant="ghost" size="icon"` w przełączniku hasła, `TextLink` w stopkach stron; pliki `FormField.tsx`, `ServerError.tsx` mogą zniknąć, gdy nic ich już nie używa.

### C3. Cały tekst interfejsu po angielsku w polskiej aplikacji (przypadkowa architektura / treść ze startera)

- **Dowód:** tytuły i nagłówki „Sign in” / „Sign up” (`signin.astro:8, 12`, `signup.astro:8, 12`); stopki „Don't have an account? Sign up” / „Already have an account? Sign in” (`signin.astro:16-18`, `signup.astro:16-18`); `confirm-email.astro:9-17` („Registration successful”, „Check your email”, opisy, „Go to sign in”, „Back to sign in”); etykiety i placeholdery „Email”, „Password”, „Confirm password”, „you@example.com”, „Your password”, „Min. 6 characters”, „Re-enter your password” (`SignInForm.tsx:47, 53, 60, 67`, `SignUpForm.tsx:70, 76, 83, 90, 107, 114`); komunikaty walidacji „Email is required”, „Enter a valid email address”, „Password is required” (`SignInForm.tsx:21, 23, 26`), „Password must be at least 6 characters”, „Please confirm your password”, „Passwords do not match” (`SignUpForm.tsx:26-40`); licznik „N more character(s) needed” (`SignUpForm.tsx:59-61`); przyciski „Sign in”, „Signing in...”, „Create account”, „Creating account...” (`SignInForm.tsx:82-84`, `SignUpForm.tsx:129-131`); `PasswordToggle.tsx:14`.
- **Spec:** `CLAUDE.md` („UI copy is Polish, `<html lang="pl">`”) i `design-system.md` („Copy (UI is Polish)”: krótkie zdania, rzeczownik „konto”, komunikaty z nazwą rzeczy i faktem, bez wykrzykników i emoji).
- **Wpływ na użytkownika:** pierwszy kontakt z aplikacją jest po angielsku, a po zalogowaniu wszystko po polsku; czytnik ekranu z polskim głosem czyta angielskie etykiety z polską fonetyką.
- **Propozycja dla planu:** przetłumaczyć wszystkie teksty stron i formularzy (lista wyżej) na polski, zgodnie z regułami „Copy”; atrybuty `type="email"`, `name` i `action` bez zmian (smoke sprawdza `action`).

### C4. Komunikat błędu serwera pochodzi z adresu URL i jest surowym angielskim tekstem Supabase (przypadkowa architektura + bezpieczeństwo treści)

- **Dowód:** `signin.astro:5` i `signup.astro:5` czytają `Astro.url.searchParams.get("error")` i przekazują do `SignInForm` / `SignUpForm` (`serverError={error}`, `signin.astro:14`, `signup.astro:14`), które renderują go w `ServerError` (`SignInForm.tsx:80`). Trasy API przekierowują z `encodeURIComponent(error.message)` (`signin.ts:16`, `signup.ts:16`) i z literałem „Supabase is not configured” (`signin.ts:11`, `signup.ts:11`).
- **Wpływ na użytkownika:** każdy, kto zna adres aplikacji, może przygotować link `…/auth/signin?error=<dowolny tekst>` i pokazać użytkownikowi w czerwonej ramce błędu dowolną treść (np. polecenie zadzwonienia pod numer); React escapuje HTML, więc to nie jest XSS, ale jest to wstrzyknięcie treści na stronie logowania. Zwykłe komunikaty są dosłownym tekstem biblioteki (angielskim, np. po błędnym haśle), niezależnym od polskiego UI.
- **Propozycja dla planu (do decyzji):** (a) wariant tylko-UI: strony pokazują stały polski komunikat, gdy parametr `error` jest obecny, bez wyświetlania jego treści; (b) wariant z kodami: trasy API przekierowują z krótkim kodem (np. `?error=invalid_credentials`), a strona mapuje kod na polski tekst i ignoruje nieznane kody. Wariant (b) zmienia `signin.ts` i `signup.ts` oraz wymaga zaktualizowania kroków smoke tylko wtedy, gdy zmieni się prefiks `?error=` (prefiks `location: "/auth/signin?error="` zostaje).

### C5. Emoji jako ikona statusu i brak landmarku `main` na stronach auth (stany + semantyka)

- **Dowód:** `confirm-email.astro:8, 14` ustawia `emoji: "✅"` / `"📧"`, renderowane w `<div class="mb-4 text-5xl">` (`:24`); spec ikon mówi wprost „No emoji” (`design-system.md`, sekcja „Icons”, linia 120). Trzy strony auth używają `Layout` bez `AppLayout` i zawijają treść w `<div>` (`signin.astro:9-22`, `signup.astro:9-22`, `confirm-email.astro:22-33`); dokument nie ma landmarku `<main>` (w `AppLayout` jest, w tych stronach nie).
- **Wpływ na użytkownika:** emoji renderuje się inaczej na każdym systemie (kolor, rozmiar, brak spójności z ikonami Lucide) i nie ma tekstu zastępczego; użytkownik nawigujący landmarkami nie ma „treści głównej” do przeskoczenia na stronach logowania.
- **Propozycja dla planu:** ikona Lucide (np. `CircleCheck` / `MailCheck`, `aria-hidden`) w tokenowym kółku zamiast emoji; kontener treści jako `<main>`; nagłówek `h1` zostaje.

### Poza zarzutami (sprawdzone, bez ustalenia)

- **`SignInForm.tsx`:** 0 literałów (skan); klasy tylko układowe (`space-y-4`). Logika walidacji i `noValidate` są poprawne i nie zmieniają się.
- **Smoke:** kroki auth (`smoke.mjs:143-144, 154-166, 1396-1397`) sprawdzają `action=` w HTML i przekierowania; nie zależą od tekstu angielskiego ani klas. Wyspy `SignInForm`/`SignUpForm` renderują `<form … action=…>` w HTML, więc lekcja o połkniętym błędzie SSR wyspy jest spełniona.
- **`Layout.astro`:** `lang="pl"` i skrypt motywu są poprawne; strony auth dziedziczą motyw `.dark`, więc po przejściu na tokeny zaczną go respektować bez dodatkowej pracy.
- **Zewnętrzni konsumenci komponentów auth:** brak (grep, patrz Summary), więc zmiana nazw i usunięcie plików jest bezpieczne.
- **`outline-none`:** w widokach auth występuje tylko w `FormField.tsx:6` (`focus:outline-none`); wcześniejsze zmiany odroczyły ten plik do „zmiany #4” (`context/archive/2026-10-22-ui-today-view/plan.md:30`), więc zamyka go ta zmiana.

## Code References

- `src/pages/auth/signin.astro:5, 9-22` — odczyt `?error`, `bg-cosmic`, karta szklana, gradientowy nagłówek, stopka z ręcznym linkiem
- `src/pages/auth/signup.astro:5, 9-22` — to samo dla rejestracji
- `src/pages/auth/confirm-email.astro:8-17, 22-33` — emoji w treści, karta szklana, link
- `src/components/auth/FormField.tsx:5-66` — własny `label`/`input`/błąd; `:6, 53` `focus:outline-none` + pierścień palety
- `src/components/auth/ServerError.tsx:10-15` — błąd bez `role`
- `src/components/auth/SubmitButton.tsx:15-31` — `Button` z nadpisaniem koloru i własny spinner
- `src/components/auth/PasswordToggle.tsx:10-17` — ręczny przycisk bez fokusu, `aria-label` po angielsku
- `src/components/auth/SignInForm.tsx:21-26, 44-84`, `SignUpForm.tsx:26-61, 67-131` — angielskie teksty walidacji, etykiety, placeholdery, przyciski
- `src/pages/api/auth/signin.ts:11, 16`, `signup.ts:11, 16` — przekierowania z surowym komunikatem w query
- `src/styles/global.css:268-270` — `@utility bg-cosmic` z surowymi hex
- `src/components/ui/{field,input,button,inline-error}.tsx`, `src/components/TextLink.astro` — wspólne komponenty do użycia
- `context/foundation/design-system/design-system.md:120, 141-142` — „No emoji”; „Login … not designed yet”

## Architecture Insights

- Widoki auth to ostatnia pozostałość startera 10x-astro w aplikacji (obok `dashboard`, `Welcome`, `Topbar` w zmianie #5): osobny świat wizualny na paletach Tailwinda, angielska treść i własne komponenty formularza, które nic poza dwoma stronami nie używa.
- Wspólne komponenty `Field`/`Input`/`Button`/`InlineError`/`TextLink` istnieją dzięki poprzednim zmianom; ta zmiana jest przede wszystkim przepięciem plus tłumaczeniem, z jednym nowym wyborem projektowym (ikony i przełącznik hasła wewnątrz `Field`).
- Granica „jeden widok plus globalne tokeny na zmianę” nie koliduje tu z żadnym współdzielonym plikiem: wszystkie dotknięte pliki leżą w `pages/auth/` i `components/auth/`, a `bg-cosmic` w `global.css` zostaje do zmiany #5.

## Historical Context (from prior changes)

- `context/archive/2026-10-09-project-crud/plan.md:39` — restyling auth, `Topbar`, `Welcome`, `dashboard` i `Banner` wyłączony z `project-crud`, oznaczony jako zakres `/10x-ui` (werdykt: poparte, wykonane dla `Banner`/`Topbar` etapami; auth jeszcze nie).
- `context/archive/2026-10-22-ui-app-shell/plan.md:29` — `Topbar` i `bg-cosmic` odroczone (poparte; `bg-cosmic` nadal używany).
- `context/archive/2026-10-22-ui-today-view/plan.md:30` — `outline-hidden` w `auth/FormField.tsx` odroczone do zmian #3 i #4 (poparte; ta zmiana jest #4).
- `context/foundation/prd.md:57` (FR-001) — logowanie email+hasło, bez OAuth w MVP (werdykt: poparte; ta zmiana nie dodaje mechanizmów, tylko zmienia wygląd).
- `context/foundation/lessons.md:5-10` — smoke dla stron z wyspami musi sprawdzać treść; spełnione przez `action=` w HTML.

## Related Research

- `context/archive/2026-10-23-ui-projects-views/research.md`, `context/archive/2026-10-22-ui-today-view/research.md`, `context/archive/2026-10-22-ui-app-shell/research.md` — poprzednie audyty tego samego rodzaju; zarzuty C1–C2 tutaj korzystają z komponentów, które tamte zmiany wprowadziły.

## Open Questions

1. **C4: skąd bierze się komunikat błędu?** Wariant (a) stały polski tekst bez odbijania `?error`, czy (b) kody błędów w API (`signin.ts`, `signup.ts`) mapowane na polskie teksty? (b) jest czystsze, ale dotyka tras API i smoke (poza „samym widokiem”).
2. **C2: ikony w polach i przełącznik hasła.** `Field` przyjmuje jedno dziecko; czy rezygnujemy z ikon `Mail`/`Lock` w polach i robimy przełącznik hasła jako osobny element (np. checkbox „Pokaż hasło” lub przycisk obok pola), czy rozszerzamy `Field`/`Input` o `startContent`/`endContent` (wspólny komponent, dotyka też dialogów projektów)?
3. **Układ ekranu logowania:** spec nie ma referencji (`design-system.md:141-142`). Proponowany układ: wyśrodkowana karta `max-w-sm` na `bg-background`, bez sidebaru i nagłówka aplikacji. Do potwierdzenia.
4. **Treść po polsku:** czy teksty przygotowuje agent według reguł „Copy”, czy dostarczasz własne (np. „Zaloguj się” / „Utwórz konto” / „Sprawdź skrzynkę”)? `confirm-email` ma dwa warianty (DEV: konto utworzone, produkcja: sprawdź e-mail).
5. **Zakres `check:values`:** czy dodajemy do `DEFAULT_FILES` i globu `lint-staged` trzy strony auth i sześć komponentów (lub te, które zostaną po przepięciu)? Zgodnie z poprzednimi zmianami domyślnie tak.
6. **Brak zrzutu:** kontrast, wygląd w trybie wysokiego kontrastu (gradientowy nagłówek z `text-transparent`) i układ na 390 px nie zostały zmierzone na uruchomionej aplikacji; bramka wizualna w planie ma to pokryć.
