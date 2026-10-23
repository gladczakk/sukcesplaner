<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Widoki auth (signin, signup, confirm-email) — przegląd UI

- **Plan**: context/changes/ui-auth-views/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL |

Automated gates re-run during review: `npm run lint` PASS, `npm run test:unit` PASS, `npm run check:values` PASS, `npm run build` PASS, `npx astro check` **FAIL (1 error, F1)**. `npm run smoke` was last run green at commit 0b33162; no code changed after that commit (only plan/screenshots/change.md). Manual rows 1.5–1.6, 2.8–2.11, 3.7–3.9, 4.7–4.9 are checked on the user's confirmation; 4.8 has 7 distinct PNG files in `screanshots/`.

## Findings

### F1 — Błąd typu w kitchen-sink łamie `astro check` (a więc job CI)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/dev/kitchen-sink.astro:305
- **Detail**: `<Button type="button" disabled class="w-full max-w-sm">` — komponent React `Button` przyjmuje `className`, nie `class` (`ts(2322)`). `npx astro check` zwraca 1 błąd; ten krok jest w `.github/workflows/ci.yml` (job `ci`), więc CI byłoby czerwone mimo zielonego buildu. Faza 4 nie miała `astro check` w kryteriach, więc bramka go nie złapała.
- **Fix**: Zmienić `class` na `className` w tym `Button`; potem `npx astro check` ma dać 0 błędów.
- **Decision**: FIXED — class → className w kitchen-sink.astro:305; astro check 0 błędów

### F2 — Etykieta „Logowanie…”/„Tworzenie konta…” i blokada przycisku nigdy się nie włączają

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/SubmitButton.tsx:12; src/components/auth/SignInForm.tsx:44; SignUpForm.tsx (form tag)
- **Detail**: `useFormStatus` zgłasza `pending` tylko dla React-owych akcji formularza (`<form action={fn}>`). Formularze używają natywnego `method="POST" action="/api/auth/..."` z `onSubmit` wołającym `preventDefault` tylko przy błędzie walidacji, więc `pending` zostaje `false`: użytkownik nie widzi stanu ładowania, a przycisk nie jest zablokowany (podwójne kliknięcie = podwójny POST). Tak samo było w kodzie sprzed zmiany (fb269b2), ale plan i macierz stanów (loading) zakładają, że ten stan istnieje, a kitchen-sink pokazuje go statycznym zamiennikiem. Do potwierdzenia na żywo przy ręcznej weryfikacji (nie uruchamiałam aplikacji w tym przeglądzie).
- **Fix A ⭐ Recommended**: Własny stan `submitting` w formularzach, ustawiany w `handleSubmit`, gdy walidacja przeszła; przekazywany jako `pending` do `SubmitButton` (bez `useFormStatus`).
  - Strength: Prawdziwy stan ładowania i blokada podwójnego wysłania, przy zachowaniu natywnego POST i `action=` (smoke).
  - Tradeoff: Zmiana w 3 plikach; po błędzie serwera strona i tak przeładowuje się, więc stan resetuje się sam.
  - Confidence: HIGH — mechanizm React-a jest dobrze znany, a natywny submit przeładowuje stronę.
  - Blind spot: Nie sprawdzone w przeglądarce (powrót przez „Wstecz” z bfcache może zostawić przycisk zablokowany).
- **Fix B**: Zostawić, a w notatce kitchen-sink i planie opisać, że pending jest tylko zamiennikiem wizualnym.
  - Strength: Zero zmian w kodzie.
  - Tradeoff: Brak informacji zwrotnej po kliknięciu i brak ochrony przed podwójnym POST.
  - Confidence: MEDIUM — zależy, jak szybko odpowiada Supabase.
  - Blind spot: Nie mierzono czasu odpowiedzi logowania.
- **Decision**: FIXED via Fix A — hook use-native-submit.ts, SubmitButton dostaje prop pending; lint, astro check, test:unit, check:values, build i smoke zielone

### F3 — Duplikaty `id` w sekcji Auth kitchen-sink

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dev/kitchen-sink.astro:270-315
- **Detail**: Trzy formularze × dwie kolumny (jasna/ciemna) renderują te same `id` (`email`, `password`, `confirmPassword`, `email-message`, `password-message`). `htmlFor` etykiety i `aria-describedby` rozwiązują się do pierwszego pola na stronie, więc kliknięcie etykiety i sprawdzenia a11y na kitchen-sink są nierzetelne. Tylko DEV, ale kitchen-sink jest bramką wizualną tej zmiany.
- **Fix A ⭐ Recommended**: Opcjonalny prop `idPrefix` w `SignInForm`/`SignUpForm` (domyślnie pusty), którego użyje kitchen-sink.
  - Strength: Unikalne `id` bez zmiany zachowania produkcyjnego.
  - Tradeoff: Dodatkowy prop tylko ze względu na kitchen-sink.
  - Confidence: MEDIUM — wymaga przeniesienia prefiksu do `Field`/`PasswordField` w 3 miejscach.
  - Blind spot: Nie sprawdzono, czy inne sekcje kitchen-sink mają ten sam problem.
- **Fix B**: Zostawić (DEV-only) i dopisać notatkę w kitchen-sink.
  - Strength: Zero kodu.
  - Tradeoff: Kitchen-sink zostaje zawodny jako bramka a11y.
  - Confidence: HIGH — problem dotyczy tylko DEV.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — prop idPrefix w SignInForm/SignUpForm, użyty w kitchen-sink; 14 unikalnych id, gates + smoke zielone

### F4 — Odrębne kody błędów ujawniają, że konto istnieje (enumeracja kont)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth-errors.ts:21-29; src/pages/api/auth/signin.ts:16
- **Detail**: `email_not_confirmed` przy logowaniu pokazuje, że adres ma niepotwierdzone konto, a `user_already_exists` przy rejestracji (przy włączonej auto-konfirmacji, np. lokalnie) że konto istnieje. Przy standardowym potwierdzaniu e-mail Supabase zwraca przy rejestracji udawany sukces, więc na produkcji realna ekspozycja to głównie `email_not_confirmed`. Przed zmianą ujawniany był surowy komunikat Supabase (gorzej), więc to nie regresja. Brak limitu prób po stronie aplikacji; chroni tylko limit Supabase (`rate_limited` jest zmapowany). To decyzja produktowa.
- **Fix A ⭐ Recommended**: Zaakceptować ryzyko i zapisać je (komunikat „Potwierdź adres e-mail…” jest pomocny użytkownikom), z notatką w planie/lekcjach.
  - Strength: Zachowuje czytelny komunikat dla zwykłego użytkownika; produkt jest aplikacją osobistą z ograniczoną liczbą kont.
  - Tradeoff: Atakujący może sprawdzać, czy adres ma niepotwierdzone konto.
  - Confidence: MEDIUM — zależy od ustawień Supabase dla projektu produkcyjnego.
  - Blind spot: Nie sprawdzono konfiguracji produkcyjnego projektu Supabase.
- **Fix B**: Zwijać `email_not_confirmed` do `invalid_credentials` i dodać podpowiedź na stronie `confirm-email`.
  - Strength: Brak rozróżnienia stanu konta.
  - Tradeoff: Użytkownik z niepotwierdzonym kontem dostaje mylący komunikat o błędnym haśle.
  - Confidence: MEDIUM — zmienia mapę kodów, testy i smoke.
  - Blind spot: Nie oceniono wpływu na UX.
- **Decision**: ACCEPTED — ryzyko enumeracji kont przez email_not_confirmed zaakceptowane (aplikacja osobista, czytelny komunikat dla użytkownika, limity prób po stronie Supabase); do ponownej oceny po sprawdzeniu ustawień potwierdzania e-mail w produkcyjnym Supabase

### F5 — Przełącznik hasła ma jednocześnie `aria-pressed` i zmienną etykietę

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/PasswordField.tsx:47-59
- **Detail**: Przy `aria-pressed` i zmieniającym się `aria-label` czytnik ekranu czyta „Ukryj hasło, wciśnięty” — sprzeczny komunikat.
- **Fix**: Usunąć `aria-pressed` i zostawić zmieniającą się etykietę „Pokaż hasło”/„Ukryj hasło”.
- **Decision**: FIXED — usunięto aria-pressed z PasswordField.tsx (zostaje zmienna etykieta „Pokaż/Ukryj hasło”)

### F6 — Asercja „brak echa” w smoke jest słabsza, niż wygląda

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:152-156
- **Detail**: `bodyExcludes: ["<script>x</script>", "script>x"]` złapie tylko echo surowego tekstu; odbicie zescapowane (`&lt;script&gt;x`) przeszłoby niezauważone, choć też byłoby odbiciem wejścia.
- **Fix**: Dodać do `bodyExcludes` fragment zescapowany, np. `"&lt;script"`.
- **Decision**: FIXED — dodano "&lt;script" do bodyExcludes w smoke.mjs; wzmocniona asercja wykryła, że surowa wartość ?error= trafiała do HTML w serializowanych propsach wyspy Astro (zescapowana, nie renderowana) — naprawione u źródła: parseAuthErrorCode w auth-errors.ts, strony signin/signup przekazują do wyspy tylko znany kod; test jednostkowy + smoke zielone

### F7 — Log błędu auth gubi kod błędu Supabase

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signin.ts:16; src/pages/api/auth/signup.ts:16; src/lib/log.ts
- **Detail**: `logError` zapisuje tylko `error.message`; `error.code` i `status` (potrzebne do diagnozy, np. nowy nieznany kod mapowany na `unknown`) nie trafiają do logu. Komunikat może też zawierać adres e-mail (drobne PII w logach Workers; bez hasła i tokenów).
- **Fix**: Dołączyć kod do nazwy zakresu lub komunikatu przy wywołaniu (np. `logError("auth-signin", ...)` z kodem), bez zmiany `logError`.
- **Decision**: FIXED — kod błędu w zakresie logu (`auth-signin:<code>`, `auth-signup:<code>`) w signin.ts i signup.ts

### F8 — Drobne: nieaktualny błąd serwera, `confirmPassword` w POST, kopia `confirm-email` zależna od DEV

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/SignInForm.tsx:73; SignUpForm.tsx:108; src/pages/auth/confirm-email.astro:18-24
- **Detail**: (a) Komunikat serwera zostaje widoczny po edycji pól i obok nowych błędów pól (do następnego POST). (b) Pole potwierdzenia hasła ma `name` i wysyła hasło drugi raz w POST (serwer je ignoruje). (c) Kopia „Konto utworzone” vs „Sprawdź skrzynkę” zależy od `import.meta.env.DEV`; na produkcji zakłada włączone potwierdzanie e-mail w Supabase.
- **Fix**: Pominąć; ewentualnie opuścić `name` na polu potwierdzenia i potwierdzić ustawienie potwierdzania e-mail w produkcyjnym Supabase.
- **Decision**: FIXED (częściowo) — (b) pole potwierdzenia hasła bez `name`, hasło ma jawne name="password"; (a) nieaktualny błąd serwera i (c) kopia confirm-email zależna od DEV pozostają bez zmian (do potwierdzenia ustawień potwierdzania e-mail w produkcyjnym Supabase)

### F9 — Trasy auth nie walidują wejścia przez zod (stan sprzed zmiany)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signin.ts:7-8; src/pages/api/auth/signup.ts:7-8
- **Detail**: `form.get("email") as string` bez zod — identyczne w fb269b2; `CLAUDE.md` mówi, że trasy API walidują wejście przez zod. Nieprawidłowe wejście kończy się błędem Supabase i kodem `unknown`, nie awarią.
- **Fix**: Osobna zmiana ze wspólnym schematem zod dla tras auth (poza zakresem tej zmiany, poza „What We're NOT Doing”).
- **Decision**: FIXED — src/lib/validation/auth.ts (authCredentialsSchema, zod), trasy signin/signup walidują wejście i przekierowują z ?error=invalid_input, nowy kod invalid_input + komunikat; testy jednostkowe schematu i dwa kroki smoke (poza pierwotnym zakresem planu, na decyzję użytkownika)

## Triage summary

- **Fixed**: F1, F2 (Fix A), F3 (Fix A), F5, F6, F7, F8 (częściowo: b), F9
- **Accepted**: F4 (Fix A, ryzyko zaakceptowane)
- **Skipped**: —
- Bramki po poprawkach: `npm run lint`, `npx astro check` (0 błędów), `npm run test:unit` (33/33), `npm run check:values`, `npm run build`, `npm run smoke` — zielone.
- Poprawki F2–F9 wykraczają poza pierwotny plan (nowe pliki: `src/components/hooks/use-native-submit.ts`, `src/lib/validation/auth.ts`); są świadomym wynikiem triage.
