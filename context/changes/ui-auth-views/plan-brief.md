# Widoki auth (signin, signup, confirm-email) — Plan Brief

> Full plan: `context/changes/ui-auth-views/plan.md`
> Research: `context/changes/ui-auth-views/research.md`

## What & Why

Trzy widoki auth to ostatni fragment aplikacji w starterowym stylu „cosmic”: paleta Tailwinda, szkło na ciemnym gradiencie, angielski tekst i własne komponenty formularza. Przenosimy je na tokeny i wspólne komponenty, po polsku i w obu motywach. Przy okazji zamykamy dziurę: komunikat błędu logowania jest dziś odbijany z adresu URL (wstrzyknięcie treści).

## Starting Point

Dziewięć plików (3 strony, 6 komponentów w `src/components/auth/`) ma 22 literały kolorów. `FormField`, `ServerError`, `SubmitButton` i `PasswordToggle` powielają `Field`/`Input`/`InlineError`/`Button`, a używają ich tylko dwie strony auth. Trasy API przekierowują z surowym `error.message` Supabase.

## Desired End State

Karta na `bg-background` (`max-w-sm`, `<main>`), cała po polsku, czytelna w jasnym i ciemnym motywie. Formularze mają poprawne powiązanie błędów z polami, przełącznik hasła o celu 40 px z widocznym fokusem. W URL jest tylko kod błędu z zamkniętego zbioru. Skan literałów daje 0 trafień, a zabezpieczenie (`check:values`, `CLAUDE.md`, kitchen-sink) pilnuje, by kolejny agent tego nie cofnął.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Błędy z serwera | Kody w API + mapa na polski w `src/lib/auth-errors.ts` | Zamyka wstrzyknięcie treści z URL i daje różne komunikaty dla różnych przyczyn. | Plan |
| Ikony i przełącznik hasła | Bez ikon w polach; przycisk „Pokaż hasło” (ghost, icon, 40 px) obok pola | `Field` przyjmuje jedno dziecko, a zmiana wspólnych komponentów dotknęłaby dialogów projektów. | Plan |
| Układ ekranów | Karta `max-w-sm` na `bg-background` w `<main>`, bez logo | Design system nie ma ekranu logowania; same tokeny, oba motywy. | Plan |
| Polskie teksty | Pisze agent według reguł „Copy”, lista w planie do oceny | Szybko i spójnie z `design-system.md`. | Plan |
| `bg-cosmic` | Zdejmowany ze stron auth, utility zostaje w `global.css` | Używają go jeszcze `dashboard` i `Welcome` (zmiana #5). | Research |
| Zabezpieczenie | Pliki auth do `check:values`, lint-staged i `CLAUDE.md`; smoke z asercją na treść wyspy | Zgodnie z poprzednimi zmianami i lekcją o smoke dla wysp. | Research |

## Scope

**In scope:** nowa mapa kodów błędów i zmiana 2 tras API; przepisanie `SignInForm`, `SignUpForm`, `SubmitButton`; nowy `PasswordField` i `AuthShell`; usunięcie `FormField`, `ServerError`, `PasswordToggle`; trzy strony po polsku; sekcja w kitchen-sink; `check:values`; reguła w `CLAUDE.md`; smoke.

**Out of scope:** usunięcie `bg-cosmic` z `global.css`; zmiany `ui/field.tsx` i `ui/input.tsx`; ikony w polach; zmiana walidacji i przekierowań sukcesu; `dashboard`/`Welcome`/`Topbar`; logo; reset hasła i OAuth.

## Architecture / Approach

Najpierw kontrakt kodów błędów (API + lib + test), potem komponenty formularzy z mapą kodów, potem strony w jednej wspólnej otoczce, na końcu bramka wizualna i zabezpieczenie. Każda faza daje się cofnąć niezależnie.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Kody błędów auth | `auth-errors.ts`, trasy API z `?error=<kod>`, test jednostkowy | Zepsucie logowania; smoke i test ręczny to łapią |
| 2. Formularze React | `Field`+`Input`+`Button`+`InlineError`, `PasswordField`, polskie teksty, usunięte duplikaty | Układ przełącznika hasła obok pola bez wartości arbitralnych |
| 3. Strony auth | `AuthShell`, trzy strony po polsku, Lucide zamiast emoji | Brak referencji w DS; ocena na zrzutach |
| 4. Stany i zabezpieczenie | kitchen-sink, `check:values`, `CLAUDE.md`, smoke, zrzuty | Smoke wymaga Dockera i lokalnego Supabase |

**Prerequisites:** Docker Desktop i lokalny Supabase dla smoke; otwarte zakładki edytora zamknięte przed archiwizacją.
**Estimated effort:** ok. 4 sesje (jedna na fazę).

## Open Risks & Assumptions

- Układ przełącznika hasła obok `Field` (z błędem pod polem) może wymagać iteracji po zrzucie.
- Kontrast i tryb wysokiego kontrastu nie były mierzone przed zmianą; bramka wizualna to pokrywa.
- Nowe kody Supabase spoza mapy dadzą komunikat ogólny (świadomie, bez echa).

## Success Criteria (Summary)

- Trzy strony auth wyglądają jak reszta aplikacji w obu motywach i są po polsku.
- Błąd logowania pokazuje polski komunikat z kodu; `?error=<dowolny tekst>` nie jest wyświetlany.
- `check:values`, lint, testy, build i smoke są zielone, a test zepsucia wyspy czerwieni smoke.
