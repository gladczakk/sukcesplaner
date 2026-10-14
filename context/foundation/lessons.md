# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Smoke musi sprawdzać treść stron z wyspami React, nie tylko status

- **Context**: Strony Astro SSR z wyspami React (`client:load`) oraz skrypt `scripts/smoke.mjs`.
- **Problem**: Astro połyka błąd SSR wyspy: strona nadal zwraca HTTP 200, ale wyspy (formularz, przycisk) brakuje w HTML. Test zepsucia z `throw` w komponencie Button nie wywalił kroków smoke, które sprawdzały tylko status 200.
- **Rule**: Każdy krok smoke dla strony z wyspą React musi asercją na treść (np. `action="/api/auth/signin"` albo tekst przycisku renderowanego przez wyspę) sprawdzać, że wyspa się wyrenderowała; sam status 200 nie wystarcza. Po dodaniu takiego kroku zrób test zepsucia (`throw` w komponencie) i potwierdź, że krok robi się czerwony.
- **Applies to**: plan, implement, impl-review

## Przed `shadcn add` sprawdź zależności rejestru i nie pozwól nadpisać dostosowanych komponentów

- **Context**: Dodawanie komponentów przez `npx shadcn@latest add` do repo z już dostosowanymi plikami w `src/components/ui/` (zwłaszcza `button.tsx`).
- **Problem**: `alert-dialog` deklaruje w rejestrze zależność `button`, więc CLI proponuje nadpisanie dostosowanego `button.tsx` wersją stockową; wygenerowany kod łamie konwencje repo (`"use client"`, wartości arbitralne, literały kolorów) i potrafi dodać błędny pakiet `cn`.
- **Rule**: Przed `shadcn add` uruchom `npx shadcn@latest view <komponent>` i sprawdź `registryDependencies`; dodawaj komponenty zanim dostosujesz współdzielone pliki, odmawiaj nadpisania istniejących i potwierdź `git diff` na nich po komendzie, a wygenerowane pliki doprowadź do konwencji repo (bez `"use client"`, tokeny zamiast literałów, `cn` z `@/lib/utils`).
- **Applies to**: plan, plan-review, implement
