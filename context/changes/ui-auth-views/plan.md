# Widoki auth (signin, signup, confirm-email) — przegląd UI Implementation Plan

## Overview

Trzy widoki auth (`/auth/signin`, `/auth/signup`, `/auth/confirm-email`) przechodzą ze starterowego stylu „cosmic” (paleta Tailwinda, szkło na gradiencie, angielski tekst) na kontrakt systemu projektowego: tokeny, wspólne komponenty `Field`/`Input`/`Button`/`InlineError`/`TextLink`, polski tekst i oba motywy. Błąd logowania/rejestracji przestaje być odbijanym z URL surowym tekstem Supabase: trasy API przekierowują z krótkim kodem, a strona mapuje kod na polski komunikat. Zmiana kończy się zabezpieczeniem (`check:values`, reguła w `CLAUDE.md`, kitchen-sink).

## Current State Analysis

- Dziewięć plików (3 strony, 6 komponentów w `src/components/auth/`) ma 22 trafienia skanu literałów w ośmiu plikach; `SignInForm.tsx` ma 0 (`research.md`, C1).
- Komponenty auth importują tylko `signin.astro` i `signup.astro`; po przepisaniu można je usuwać (`research.md`, Summary).
- `FormField.tsx` powiela `Field` + `Input` bez `aria-invalid`/`aria-describedby`/„Błąd:”, ma `focus:outline-none`. `ServerError.tsx` nie ma `role`. `SubmitButton.tsx` nadpisuje kolory `Button`. `PasswordToggle.tsx` ma ~16 px i brak fokusu (C2).
- Cały tekst jest po angielsku (C3). Strony czytają `?error=` z URL i renderują go dosłownie (C4).
- `confirm-email.astro` używa emoji, strony nie mają `<main>` (C5).
- Spec DS nie ma ekranu logowania (`design-system.md:141-142`).
- `Field` wymaga jednego dziecka (`ui/field.tsx:14`, `cloneElement` na `:22`).
- Smoke: `action="/api/auth/signin"` / `signup` w HTML (`smoke.mjs:143-144`), przekierowania z prefiksem `/auth/signin?error=` (`smoke.mjs:161`).

## Desired End State

Trzy strony stoją na `bg-background` w karcie `bg-card` (`max-w-sm`, `<main>`), działają w jasnym i ciemnym motywie, całość po polsku. Formularze używają `Field` + `Input` + `Button`; błędy pól są powiązane z polami (`aria-invalid`, `aria-describedby`, „Błąd:”), błąd serwera to `InlineError role="alert"`. Przełącznik hasła ma cel 40 px i widoczny fokus. `?error=` niesie wyłącznie kod z zamkniętego zbioru; nieznany kod daje komunikat ogólny. Skan `npm run check:values` na plikach auth daje 0 trafień. `npm run smoke`, `npm run lint`, `npm run test:unit` i `npm run build` przechodzą.

### Key Discoveries:

- `Field` ustawia `aria-*` na jedynym dziecku (`src/components/ui/field.tsx:22`), więc ikony i przełącznik hasła muszą być poza nim.
- Trasy API robią `redirect(.../?error=${encodeURIComponent(error.message)})` (`src/pages/api/auth/signin.ts:16`, `signup.ts:16`) i literał „Supabase is not configured” (`:11`).
- Smoke traktuje lokację kończącą się `=` jako prefiks (`scripts/smoke.mjs:1404`), więc kody w `?error=` nie wymagają zmiany asercji.
- `npm run test:unit` uruchamia `node --test` na `scripts/*.test.mjs` z `--experimental-strip-types` (`package.json:15`); plik biblioteki importowany z testu nie może używać aliasu `@/`.
- Lista `DEFAULT_FILES` musi równać się globowi lint-staged (test w `scripts/check-hardcoded-values.test.mjs`), a skrypt zgłasza błąd, gdy plik z listy nie istnieje.
- Lekcje: smoke ma sprawdzać treść wyspy (`lessons.md`, test zepsucia); kryterium „zero literałów” wymienia każdy plik z trafieniem; `shadcn add` niepotrzebne (wszystkie komponenty istnieją).

## What We're NOT Doing

- Usuwania utility `bg-cosmic` z `src/styles/global.css` (używają go `dashboard.astro:8` i `Welcome.astro:5`) — zmiana #5.
- Zmiany `ui/field.tsx` i `ui/input.tsx` (dotykają dialogów projektów); żadnych slotów `startContent`/`endContent`.
- Ikon `Mail`/`Lock` w polach.
- Zmiany logiki walidacji (reguły: wymagany e-mail, format, hasło ≥ 6, zgodność haseł) ani `noValidate`, `name`, `action`, metod ani przekierowań sukcesu (`/today`, `/auth/confirm-email`).
- Nowych tokenów ani nowych wariantów `Button`.
- `dashboard`, `index`, `Welcome`, `Topbar` (zmiana #5).
- Nowego mechanizmu auth (OAuth, reset hasła).
- Logo/znaku marki nad kartą.

## Implementation Approach

Kolejność z `/10x-ui`: biblioteka i API → komponenty formularzy → strony → stany i zabezpieczenie. Faza 1 jest niezależna od wyglądu i najpierw zamyka C4, żeby formularze od razu dostały gotowy kontrakt kodów. Faza 2 usuwa komponenty-duplikaty. Faza 3 zmienia strony i przekonuje się, że całość się renderuje w obu motywach. Faza 4 dodaje bramkę wizualną i zabezpieczenie, które utrzymają kolejnego agenta przy kontrakcie.

Teksty piszę według reguł „Copy” z `design-system.md` (krótkie zdania, rzeczownik „konto”, bez wykrzykników i emoji); lista tekstów jest w Fazie 2 i 3 do oceny w przeglądzie.

## Phase 1: Kody błędów auth (API + biblioteka)

### Overview

Zamyka C4: serwer przestaje wysyłać tekst, wysyła kod. Strona (Faza 2/3) pokaże polski komunikat z mapy.

### Changes Required:

#### 1. Mapa kodów błędów

**File**: `src/lib/auth-errors.ts` (nowy)

**Intent**: Jedno miejsce, które zamienia błąd Supabase na krótki kod (`?error=`) i kod na polski komunikat dla UI. Nieznany lub brakujący kod daje komunikat ogólny.

**Contract**: Eksporty: typ `AuthErrorCode` (zamknięty zbiór literałów, m.in. `invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password`, `rate_limited`, `unavailable`, `unknown`); `toAuthErrorCode(error: { code?: string } | null | undefined): AuthErrorCode` mapujące `error.code` Supabase (`invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password`, `over_request_rate_limit` i `over_email_send_rate_limit` → `rate_limited`); `authErrorMessage(code: string | null | undefined): string | undefined` zwracające polski tekst dla znanego kodu, tekst ogólny dla nieznanego niepustego kodu i `undefined` dla `null`. Bez importów z aliasu `@/` (plik jest ładowany przez test `node --test`).

#### 2. Trasy API

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: Przekierowywać z `?error=<kod>` zamiast z `error.message`; brak klienta Supabase → kod `unavailable`. Reszta (przekierowania sukcesu, `formData`) bez zmian.

**Contract**: `Location: /auth/signin?error=<AuthErrorCode>` i `/auth/signup?error=<AuthErrorCode>`; `error.message` nie trafia do URL. Przy błędzie wywołania zalogować przyczynę przez `logError` z `@/lib/log` (zgodnie z regułą „nie ukrywaj dowodów”; jeśli wzorzec w innych trasach jest inny, zachować wzorzec repo).

#### 3. Test jednostkowy mapy

**File**: `scripts/auth-errors.test.mjs` (nowy), `package.json` (`test:unit`)

**Intent**: Udowodnić, że znane kody Supabase dają oczekiwane kody, że nieznany kod i brak kodu dają bezpieczne wartości, oraz że `authErrorMessage` nie zwraca tekstu z wejścia.

**Contract**: `node:test` w stylu `scripts/weekdays.test.mjs`; importuje `../src/lib/auth-errors.ts`; przypadki: każdy znany kod, nieznany string, `undefined`, `authErrorMessage("<script>x</script>")` zwraca tekst ogólny (nie echo wejścia), `authErrorMessage(null)` → `undefined`. Dopisać plik do skryptu `test:unit`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm run test:unit`
- Lint przechodzi: `npm run lint`
- Typecheck przechodzi: `npx astro check`
- Żadna trasa auth nie przekazuje `error.message` do URL: `grep -n "error.message" src/pages/api/auth/signin.ts src/pages/api/auth/signup.ts` nie zwraca trafień

#### Manual Verification:

- Logowanie błędnym hasłem na uruchomionej aplikacji przekierowuje na `/auth/signin?error=invalid_credentials` (adres w pasku przeglądarki).
- Logowanie poprawnym hasłem nadal kończy na `/today`.

**Implementation Note**: Po tej fazie i zielonych bramkach zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Phase 2: Formularze React

### Overview

Zamyka C2 i C3 dla komponentów: `Field` + `Input` + `Button` + `InlineError`, polski tekst, nowy `PasswordField`; usunięcie komponentów-duplikatów.

### Changes Required:

#### 1. PasswordField

**File**: `src/components/auth/PasswordField.tsx` (nowy)

**Intent**: Pole hasła z przełącznikiem „Pokaż hasło” jako osobny element obok pola, bo `Field` przyjmuje jedno dziecko. Zastępuje `PasswordToggle` i `FormField` dla pól hasła.

**Contract**: Props zbliżone do `Field` (`id`, `name`, `label`, `value`, `onChange`, `placeholder`, `error`, `hint`, `autoComplete`). Renderuje `Field` z `Input` (`type` przełączane `password`/`text`) oraz `Button variant="ghost" size="icon"` (cel 40 px) z ikoną Lucide `Eye`/`EyeOff` (`aria-hidden`), `type="button"`, `aria-pressed`, `aria-label` „Pokaż hasło”/„Ukryj hasło”, widoczny fokus z tokenu `ring`. Przełącznik jest w tym samym wierszu co `Input`, wyrównany do pola, nie do komunikatu błędu; układ bez wartości arbitralnych, sprawdzany na zrzucie w Fazie 3/4.

#### 2. SignInForm i SignUpForm

**File**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: Przepisać pola na `Field` + `Input` (e-mail) i `PasswordField` (hasło, potwierdzenie), błąd serwera na `InlineError role="alert"` z tekstem z `authErrorMessage(serverError)`, teksty na polski. Logika walidacji, `noValidate`, `name`, `action` bez zmian.

**Contract**: Prop `serverError` to teraz kod (`string | null`) i jest zamieniany przez `authErrorMessage`. Teksty: e-mail „E-mail” / placeholder „jan@example.com”; hasło „Hasło”; potwierdzenie „Powtórz hasło”; walidacja: „Podaj adres e-mail.”, „Podaj poprawny adres e-mail.”, „Podaj hasło.”, „Hasło musi mieć co najmniej 6 znaków.”, „Powtórz hasło.”, „Hasła nie są takie same.”; licznik hasła: „Jeszcze N znaków” z odmianą przez `plural` z `@/lib/format`; przyciski: „Zaloguj się” / „Logowanie…”, „Utwórz konto” / „Tworzenie konta…”. Bez wykrzykników. `autoComplete`: `email`, `current-password` (logowanie), `new-password` (rejestracja).

#### 3. SubmitButton

**File**: `src/components/auth/SubmitButton.tsx`

**Intent**: Zostawić `useFormStatus`, usunąć nadpisania koloru i własny spinner: domyślny wariant `Button` (pigułka, `bg-primary`) i ikona Lucide `LoaderCircle` z `animate-spin` w stanie pending; `aria-disabled`/`disabled` zgodnie z konwencją `Button` w repo.

**Contract**: Props: `label`, `pendingLabel`; wygląd wyłącznie z `Button` bez `className` z kolorami.

#### 4. Usunięcie duplikatów

**File**: `src/components/auth/FormField.tsx`, `ServerError.tsx`, `PasswordToggle.tsx` (usuwane)

**Intent**: Po przepięciu nic ich nie importuje (grep potwierdza), więc znikają razem z `focus:outline-none` i literałami.

**Contract**: Przed usunięciem `grep -rn "FormField\|ServerError\|PasswordToggle" src` nie zwraca importów spoza usuwanych plików.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typecheck przechodzi: `npx astro check`
- Testy jednostkowe przechodzą: `npm run test:unit`
- Brak literałów w komponentach: `node scripts/check-hardcoded-values.mjs src/components/auth/SignInForm.tsx src/components/auth/SignUpForm.tsx src/components/auth/PasswordField.tsx src/components/auth/SubmitButton.tsx` zwraca 0 trafień
- Brak `outline-none` w `src/components/auth/`: `grep -rn "outline-none" src/components/auth` bez trafień
- Brak importów usuniętych plików: `grep -rn "FormField\|ServerError\|PasswordToggle" src` bez trafień
- Build przechodzi: `npm run build`

#### Manual Verification:

- Pusty formularz logowania pokazuje komunikaty „Błąd: …” przy polach; Tab przechodzi po polach, przełączniku hasła i przycisku z widocznym fokusem.
- „Pokaż hasło” odsłania i ukrywa hasło; czytnik/aria-label zmienia się zgodnie ze stanem.
- Rejestracja ze zbyt krótkim hasłem i z różnymi hasłami pokazuje właściwe komunikaty.
- Błąd serwera (`/auth/signin?error=invalid_credentials`) pokazuje polski komunikat w `InlineError`; `?error=cokolwiek` pokazuje komunikat ogólny, nie echo wejścia.

**Implementation Note**: Strony (Faza 3) nadal mają stare opakowanie; ręczna weryfikacja jest na formularzach w starym otoczeniu, wygląd karty sprawdza Faza 3.

---

## Phase 3: Strony auth

### Overview

Zamyka C1, C3 i C5 dla stron: tokenowa karta w `<main>`, polski tekst, ikony Lucide zamiast emoji, linki przez `TextLink`.

### Changes Required:

#### 1. Wspólna otoczka

**File**: `src/components/auth/AuthShell.astro` (nowy)

**Intent**: Jedna otoczka dla trzech stron: `<main>` wyśrodkowany na `bg-background`, karta `max-w-sm` (`bg-card`, `border-border`, `shadow-card`, `rounded-md`), nagłówek `h1` w `type-display text-foreground`, slot na treść i slot na stopkę. Brak sidebaru i nagłówka aplikacji.

**Contract**: Props: `title` (nagłówek `h1`), opcjonalnie `description`. Sloty: domyślny (treść), `footer`. Tylko klasy tokenowe (`bg-card`, `text-muted-foreground`, `type-*`, `shadow-card`, `rounded-md`).

#### 2. Strony

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Użyć `AuthShell`, zdjąć `bg-cosmic` i klasy palety, przekazać `error` z URL jako kod do formularza, linki stopki przez `TextLink`, polskie tytuły stron. `confirm-email`: ikona Lucide (`CircleCheck` w wariancie DEV „konto utworzone”, `MailCheck` w produkcji) w tokenowym kółku z `aria-hidden`, polski tekst obu wariantów, link „Przejdź do logowania”.

**Contract**: Tytuły `<Layout>`: „Logowanie”, „Rejestracja”, „Sprawdź skrzynkę”. Nagłówki h1 i stopki: „Zaloguj się” / „Nie masz konta? Utwórz konto”; „Utwórz konto” / „Masz już konto? Zaloguj się”. `confirm-email` DEV: „Konto utworzone” + „Możesz się zalogować.”; produkcja: „Sprawdź skrzynkę” + „Wysłaliśmy link potwierdzający. Kliknij go, aby aktywować konto.”. Zachowana logika `isAutoConfirmed = import.meta.env.DEV`. Wyspy nadal `client:load`, `action` bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typecheck przechodzi: `npx astro check`
- Brak literałów w widokach auth: `node scripts/check-hardcoded-values.mjs src/pages/auth/signin.astro src/pages/auth/signup.astro src/pages/auth/confirm-email.astro src/components/auth/AuthShell.astro` zwraca 0 trafień
- Brak `bg-cosmic` na stronach auth: `grep -rn "bg-cosmic" src/pages/auth src/components/auth` bez trafień, a `grep -rn "bg-cosmic" src` zwraca dokładnie `global.css`, `dashboard.astro`, `Welcome.astro`
- Brak emoji w stronach auth: `grep -nP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/pages/auth/*.astro` bez trafień
- Build przechodzi: `npm run build`

#### Manual Verification:

- Strony `/auth/signin`, `/auth/signup`, `/auth/confirm-email` w jasnym i ciemnym motywie są czytelne, karta jest wyśrodkowana i ma `<main>`; na 390 px nie ma poziomego przewijania.
- Układ przełącznika hasła jest wyrównany z polem także przy komunikacie błędu.
- Wygląd potwierdzony na zrzutach (desktop i mobile) w obu motywach.

**Implementation Note**: Po tej fazie pauza na ręczne potwierdzenie wyglądu na zrzutach.

---

## Phase 4: Stany, bramka i zabezpieczenie

### Overview

Zamyka definicję ukończenia `/10x-ui`: macierz stanów pokazana w kitchen-sink, zabezpieczenie dla kolejnego agenta, smoke dla wysp.

### Changes Required:

#### 1. Kitchen-sink

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Sekcja „Auth” renderująca formularze logowania i rejestracji oraz `AuthShell` w jasnym i ciemnym motywie, z błędem serwera (`serverError="invalid_credentials"`) i stanem pending/disabled przycisku; stan „error pola” jest N/A w kitchen-sink (powstaje po wysłaniu formularza) i sprawdzany ręcznie (Faza 2).

**Contract**: Używa istniejącej struktury dwóch kolumn (jasna/ciemna) z sekcji `/today` i `/projects`; tylko DEV.

#### 2. Zabezpieczenie: check:values

**File**: `scripts/check-hardcoded-values.mjs`, `package.json` (`lint-staged`)

**Intent**: Dodać pliki auth, które zostały po przepięciu, do `DEFAULT_FILES` i do globu lint-staged (lista i glob muszą być równe).

**Contract**: Pliki: `src/pages/auth/signin.astro`, `signup.astro`, `confirm-email.astro`, `src/components/auth/AuthShell.astro`, `SignInForm.tsx`, `SignUpForm.tsx`, `PasswordField.tsx`, `SubmitButton.tsx`. Jeśli test `scripts/check-hardcoded-values.test.mjs` wymaga aktualizacji oczekiwań, zaktualizować go razem z listą.

#### 3. Zabezpieczenie: reguła

**File**: `CLAUDE.md`

**Intent**: Rozszerzyć istniejące bullety („Hard-coded value check”, „Kitchen sink”) o widoki auth, poza blokiem `<!-- BEGIN @przeprogramowani/10x-cli -->`; dopisać jednozdaniową regułę „kody błędów auth, nie tekst w URL”.

**Contract**: Bez nowych sekcji; edycja bulletów w „UI and design system”.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Zachować asercje `action="/api/auth/signin"` / `signup`; dodać asercję, że po błędnym logowaniu lokacja to `/auth/signin?error=invalid_credentials`, a strona `/auth/signin?error=invalid_credentials` zawiera polski komunikat błędu (island render).

**Contract**: Nowy krok sprawdzający treść wyspy (`bodyIncludes` polskiego komunikatu z `authErrorMessage("invalid_credentials")`) oraz krok, że `?error=<script>` nie jest echem w HTML. Po dodaniu: test zepsucia (`throw` w komponencie wyspy) potwierdza, że krok robi się czerwony; cofnąć zepsucie.

### Success Criteria:

#### Automated Verification:

- Skan na plikach auth ma 0 trafień: `npm run check:values`
- Testy jednostkowe przechodzą (w tym lista = glob): `npm run test:unit`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke przechodzi (wymaga Dockera i lokalnego Supabase na `127.0.0.1:54321`): `npm run smoke`
- Test zepsucia (`throw` w `SignInForm`) czerwieni krok smoke; po cofnięciu zielony

#### Manual Verification:

- `/dev/kitchen-sink` pokazuje sekcję Auth w jasnym i ciemnym motywie ze stanami: default, hover, focus-visible, disabled, error (serwera), loading; pozostałe komórki macierzy mają notatkę N/A z powodem.
- Zrzuty desktop i mobile (jasny i ciemny) zapisane w folderze zmiany, bez duplikatów.
- Przepływ end-to-end: rejestracja → ekran „Sprawdź skrzynkę”/„Konto utworzone”, logowanie poprawne → `/today`, błędne → polski komunikat.

**Implementation Note**: Po tej fazie rytuał epilogu i `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

- `scripts/auth-errors.test.mjs`: mapowanie znanych kodów Supabase, nieznany/brakujący kod, brak echa wejścia w `authErrorMessage`.
- `scripts/check-hardcoded-values.test.mjs`: równość listy z globem lint-staged po dopisaniu plików.

### Integration Tests:

- `npm run smoke`: `action=` na stronach auth, kod w `?error=` po błędnym logowaniu, polski komunikat w HTML wyspy, brak echa `?error=<script>`.

### Manual Testing Steps:

1. Pusty formularz logowania i rejestracji: komunikaty „Błąd: …” przy polach, nawigacja klawiaturą.
2. „Pokaż/Ukryj hasło” w obu formularzach.
3. Błędne hasło → polski komunikat; poprawne → `/today`.
4. Obie wersje motywu i 390 px na trzech stronach.

## Performance Considerations

Brak: usuwamy komponenty i klasy; nie dodajemy zależności.

## Migration Notes

Adresy `?error=<tekst>` zapisane w zakładkach przestaną pokazywać tekst (pokażą komunikat ogólny); to zamierzone. Brak zmian w danych i migracjach.

## References

- Related research: `context/changes/ui-auth-views/research.md`
- Wzorzec formularza: `src/components/ui/field.tsx`, `src/components/ui/inline-error.tsx`, `src/components/ui/button.tsx`
- Poprzednie zmiany tego łańcucha: `context/archive/2026-10-23-ui-projects-views/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kody błędów auth (API + biblioteka)

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm run test:unit` — 3272ae7
- [x] 1.2 Lint przechodzi: `npm run lint` — 3272ae7
- [x] 1.3 Typecheck przechodzi: `npx astro check` — 3272ae7
- [x] 1.4 Żadna trasa auth nie przekazuje `error.message` do URL (grep bez trafień) — 3272ae7

#### Manual

- [x] 1.5 Błędne hasło przekierowuje na `/auth/signin?error=invalid_credentials` — 3272ae7
- [x] 1.6 Poprawne logowanie nadal kończy na `/today` — 3272ae7

### Phase 2: Formularze React

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — e01e724
- [x] 2.2 Typecheck przechodzi: `npx astro check` — e01e724
- [x] 2.3 Testy jednostkowe przechodzą: `npm run test:unit` — e01e724
- [x] 2.4 Skan literałów na komponentach formularzy ma 0 trafień — e01e724
- [x] 2.5 Brak `outline-none` w `src/components/auth/` — e01e724
- [x] 2.6 Brak importów `FormField`/`ServerError`/`PasswordToggle` w `src` — e01e724
- [x] 2.7 Build przechodzi: `npm run build` — e01e724

#### Manual

- [x] 2.8 Pusty formularz pokazuje „Błąd: …” przy polach, fokus klawiatury widoczny na każdej kontrolce — e01e724
- [x] 2.9 „Pokaż/Ukryj hasło” działa, `aria-label` zmienia się ze stanem — e01e724
- [x] 2.10 Walidacja rejestracji (krótkie hasło, różne hasła) pokazuje właściwe komunikaty — e01e724
- [x] 2.11 `?error=invalid_credentials` daje polski komunikat, `?error=cokolwiek` komunikat ogólny bez echa — e01e724

### Phase 3: Strony auth

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint`
- [x] 3.2 Typecheck przechodzi: `npx astro check`
- [x] 3.3 Skan literałów na stronach auth i `AuthShell` ma 0 trafień
- [x] 3.4 `bg-cosmic` zostaje tylko w `global.css`, `dashboard.astro`, `Welcome.astro`
- [x] 3.5 Brak emoji w `src/pages/auth/*.astro`
- [x] 3.6 Build przechodzi: `npm run build`

#### Manual

- [x] 3.7 Trzy strony czytelne w jasnym i ciemnym motywie, karta wyśrodkowana, `<main>`, brak poziomego przewijania na 390 px
- [x] 3.8 Przełącznik hasła wyrównany z polem także przy błędzie
- [x] 3.9 Zrzuty desktop i mobile potwierdzają wygląd

### Phase 4: Stany, bramka i zabezpieczenie

#### Automated

- [ ] 4.1 `npm run check:values` — 0 trafień
- [ ] 4.2 `npm run test:unit` przechodzi (lista = glob)
- [ ] 4.3 `npm run lint` przechodzi
- [ ] 4.4 `npm run build` przechodzi
- [ ] 4.5 `npm run smoke` przechodzi
- [ ] 4.6 Test zepsucia wyspy czerwieni krok smoke, po cofnięciu zielony

#### Manual

- [ ] 4.7 Kitchen-sink pokazuje sekcję Auth w obu motywach ze stanami z macierzy (reszta N/A z powodem)
- [ ] 4.8 Zrzuty desktop i mobile (jasny i ciemny) zapisane w folderze zmiany
- [ ] 4.9 Przepływ end-to-end: rejestracja, logowanie poprawne i błędne
