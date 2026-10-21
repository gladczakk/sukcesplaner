---
project: SukcesPlaner
version: 2
status: draft
created: 2026-10-16
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# PRD v2: Zadania powtarzalne

> Delta względem PRD v1 (`prd.md`). Ten dokument opisuje wyłącznie zmianę; pozostałe wymagania z v1 obowiązują bez zmian. Punkt „Zadania powtarzalne i projekty typu rutyna” z Non-Goals v1 jest tym dokumentem zastąpiony dla zadań w milestonie.

## Current System Overview

SukcesPlaner to aplikacja webowa do zarządzania długimi projektami: projekty z milestonami (z obowiązkowymi datami) i zadaniami. Aplikacja wylicza listę zadań na dziś z najbliższego niezamkniętego milestona każdego projektu. Na liście użytkownik może oznaczyć zadanie jako zrobione lub częściowo zrobione oraz przenieść je na jutro. Każde zadanie należy do milestona. Ręczne dodanie zadania z poziomu listy na dziś jest zaimplementowane (S-06).

Architektura i stack (stan faktyczny): aplikacja renderowana po stronie serwera (Astro, komponenty React), uwierzytelnianie i dane w Supabase, wdrożenie na Cloudflare Workers. Użytkownicy: pojedyncze osoby, mała skala, każde konto widzi wyłącznie swoje dane.

## Problem Statement & Motivation

Rutynowe zadania (np. pranie codziennie, retinol co drugi dzień, trening, bieganie i mobility w wybrane dni tygodnia) trzeba dziś dodawać ręcznie za każdym razem. Aplikacja nie potrafi sama przypominać zadania w ustalonym rytmie, więc użytkownik odtwarza je ręcznie albo trzyma poza narzędziem. Zmiana pozwala, by zadanie wracało na listę na dziś według zadanego rytmu. Gdy milestone zakłada regularność (np. regularne treningi), powtarzalne zadanie można z nim powiązać.

## User & Persona

Ta sama persona co w PRD v1: osoba prowadząca kilka równoległych, długoterminowych projektów z różnych obszarów życia (dom, pielęgnacja, sport, praca), planująca dzień codziennie. Istniejący użytkownicy zyskują możliwość ustawienia rytmu zadania; zadania bez rytmu zachowują się jak dotąd.

## Success Criteria

### Primary
- Użytkownik może dodać zadanie pod milestonem i włączyć powtarzanie (codziennie, co X dni albo w wybrane dni tygodnia); zadanie pojawia się na liście na dziś w dni zgodne z rytmem, a po odhaczeniu lub przeniesieniu kolejne wystąpienie wraca według rytmu.

### Secondary
- Zadanie powtarzalne jest na liście widocznie oznaczone jako powtarzalne.

### Guardrails
- Zadania niepowtarzalne działają jak dotąd: odhaczenie usuwa je z listy, przeniesienie na jutro działa jak w funkcji przenoszenia z PRD v1 (FR-012).
- Reguła listy na dziś (najbliższy niezamknięty milestone każdego projektu) pozostaje bez zmian dla zadań niepowtarzalnych; zadania powtarzalne mają własną regułę (patrz Business Logic Changes).
- Zadanie nie znika z listy na dziś bez wiedzy użytkownika; niezrobione wystąpienie zadania powtarzalnego wygasa wyłącznie widocznie oznaczone jako pominięte.
- Wystąpienia zadania powtarzalnego nie można przenieść na dzień, w którym to samo zadanie ma już własne wystąpienie (codzienne zadanie nie może iść na jutro; bieganie w środy i piątki, niezrobione w środę, można przenieść na czwartek, ale nie na piątek).
- Najbardziej narażone istniejące zachowanie: przenoszenie na jutro oraz oznaczanie zrobione / częściowo zrobione.

## User Stories

### US-02: Użytkownik widzi zadanie powtarzalne w dni zgodne z rytmem

Wcześniej każde zadanie było jednorazowe i trzeba je było dodawać ręcznie przy każdym wykonaniu.

- **Given** zalogowany użytkownik ma w milestonie zadanie „bieganie” powtarzane w środy i piątki
- **When** wchodzi na listę zadań na dziś w środę
- **Then** widzi na liście bieganie; gdy go nie wykona, może przenieść je na czwartek, ale nie na piątek, bo piątek ma własne wystąpienie

#### Acceptance Criteria
- Zadanie codzienne pojawia się każdego dnia od dnia dodania do końca milestona i nie można go przenieść na jutro
- Niezrobione wystąpienie wygasa i jest widocznie oznaczone jako pominięte
- Wyłączenie powtarzania usuwa zadanie razem z jego odhaczeniami (po potwierdzeniu); zmiana rytmu zachowuje wiersze „zrobione”

## Scope of Change

- [new] FR-016: Użytkownik może ustawić zadaniu powtarzanie: codziennie, co X dni (X od 2 do 30) albo w wybrane dni tygodnia — przy dodawaniu i edycji zadania, wszędzie gdzie je dodaje (z listy na dziś i w formularzu zadania pod milestonem); w edycji rytm można zmienić, a na niezrobionym zwykłym zadaniu włączyć (termin, przeniesienie i „częściowo” są wtedy zerowane). Priority: must-have
  > Socrates: Kontrargument rozważony: "'co X dni' liczone od czego?". Rozstrzygnięcie: od dnia dodania zadania; pierwsze wystąpienie jest tego dnia.
- [new] FR-017: Zadanie powtarzalne pojawia się na liście na dziś w dni zgodne z rytmem, od dnia wstawienia do daty milestona albo do jego zamknięcia (co nastąpi wcześniej), niezależnie od tego, czy milestone jest najbliższy; wystąpienie ma termin dzisiejszy i trafia na górę listy. Priority: must-have
  > Socrates: Kontrargument rozważony: rutyna z dalszego milestona nie pojawi się na liście. Rozstrzygnięcie: rutyna niezależnie od daty milestona pojawia się w wyznaczone dni od wstawienia zadania do końca milestona.
- [new] FR-018: Zadanie powtarzalne jest na liście widocznie oznaczone jako powtarzalne. Priority: nice-to-have
  > Socrates: Brak kontrargumentu; FR zostaje bez zmian.
- [modified] FR-019: Użytkownik może przenieść wystąpienie zadania powtarzalnego na inny dzień tylko wtedy, gdy tego dnia to zadanie nie ma własnego wystąpienia; przeniesienie dotyczy wyłącznie dnia „jutro”, jest jednorazowe (przeniesionego wystąpienia nie można przenieść ponownie), a przeniesione wystąpienie zachowuje się jak zwykłe: można je zrobić albo następnego dnia jest widoczne jako pominięte — było: przeniesienie niedokończonego zadania na jutro (FR-012). Priority: must-have
  > Socrates: Kontrargument rozważony: "co z oryginalnym wystąpieniem po przeniesieniu?". Rozstrzygnięcie: to samo wystąpienie zmienia dzień.
- [modified] FR-011: Oznaczenie wystąpienia zadania powtarzalnego jako zrobione nie kończy zadania, kolejne wystąpienie wraca według rytmu; niezrobione wystąpienie wygasa, jest wyliczane samoczynnie jako pominięte (bez przycisku „Pomiń”) i widoczne tylko następnego dnia, po czym znika; stan „częściowo zrobione” nie dotyczy wystąpień zadań powtarzalnych — było: zrobione zadanie znika z listy na stałe. Priority: must-have
  > Socrates: Kontrargument rozważony: niezrobione wystąpienie z wczoraj wygasa po cichu. Rozstrzygnięcie: wygasa, ale widocznie oznaczone jako pominięte.
- [modified] FR-020: Użytkownik może zmienić rytm zadania powtarzalnego albo wyłączyć powtarzanie (usuwa to zadanie razem z odhaczeniami, po potwierdzeniu) — wyłącznie w formularzu zadania, nie na liście na dziś; rozszerza edycję zadań (FR-007). Priority: must-have
  > Socrates: Kontrargument rozważony: wyłączenie nie powinno kasować historii zrobionych. Rozstrzygnięcie: osobnego stanu „nieaktywne” nie ma; wyłączenie to usunięcie zadania razem z odhaczeniami, dlatego wymaga potwierdzenia. Zmiana rytmu działa od dziś: data startu przesuwa się na dziś, przyszłe przeniesienia i liczone „pominięte” znikają, a wiersze „zrobione” zostają.
- [preserved] FR-009, FR-010: lista na dziś i jej sortowanie dla zadań niepowtarzalnych — bez zmian.
- [preserved] Zachowanie zadań niepowtarzalnych: odhaczenie, przeniesienie na jutro, każde zadanie należy do milestona.

## Constraints & Compatibility

- Istniejące zadania w systemie są niepowtarzalne i działają bez zmian; po stronie użytkownika nie jest wymagane żadne przepisywanie danych.
- Zachowane istniejące zachowanie: reguła listy na dziś dla zadań niepowtarzalnych, sortowanie (FR-010) dla zadań niepowtarzalnych, odhaczenie zadań niepowtarzalnych, przeniesienie na jutro jak w FR-012.
- Zmieniona reguła zamykania milestona: dziś milestone można zamknąć tylko wtedy, gdy wszystkie jego zadania są zrobione. Zadania powtarzalne nie blokują zamknięcia, a zamknięcie milestona kończy ich powtarzanie; niezrobione zadania niepowtarzalne blokują zamknięcie jak dotąd.
- Bez nowych wymagań jakościowych; obowiązują istniejące: lista na dziś ładuje się poniżej 1 sekundy, produkt jest w pełni używalny na telefonie i komputerze (w tym nowy formularz powtarzania), wygląd pozostaje spójny.

## Business Logic Changes

Zadanie powtarzalne pojawia się na liście na dziś w każdy dzień wynikający z jego rytmu, od dnia dodania do końca milestona (niezależnie od tego, czy to najbliższy milestone), a niezrobione wystąpienie wygasa jako widocznie pominięte.

Obecna reguła: lista na dziś pokazuje niedokończone zadania z najbliższego niezamkniętego milestona każdego projektu. Zmiana: zadania powtarzalne są wyjątkiem — pojawiają się w wyznaczone dni nawet wtedy, gdy ich milestone nie jest najbliższy; zadania niepowtarzalne podlegają obecnej regule bez zmian.

Rytm to jedno z: codziennie, co X dni (liczone od dnia dodania, pierwsze wystąpienie tego dnia) lub wybrane dni tygodnia. Dla dni tygodnia można wybrać od 1 do 7 dni (komplet siedmiu dni jest w etykiecie pokazywany jako „codziennie”), a wystąpienie jest też w dniu dodania zadania, jeśli ten dzień jest wśród wybranych. Wystąpienie można odhaczyć albo przenieść na jutro (tylko gdy jutro to zadanie nie ma własnego wystąpienia — codzienne zadanie nie może iść na jutro); przeniesienie jest jednorazowe, a przeniesione wystąpienie zachowuje się jak zwykłe (zrobione albo pominięte następnego dnia). Przycisku „Pomiń” nie ma: niezrobione wystąpienie jest wyliczane samoczynnie jako pominięte i widocznie oznaczone. Zmiana rytmu działa od dziś: data startu przesuwa się na dziś, przyszłe przeniesienia i liczone „pominięte” znikają, a wiersze „zrobione” zostają. Wyłączenie powtarzania to usunięcie zadania razem z odhaczeniami (po potwierdzeniu); rytm można też włączyć na niezrobionym zwykłym zadaniu. Zmiany robi się wyłącznie w formularzu zadania.

Powtarzanie kończy się w dniu daty milestona albo w chwili jego zamknięcia, co nastąpi wcześniej. Wystąpienie ma termin dzisiejszy, więc na liście trafia przed zadania z późniejszym terminem. Dla wystąpienia istnieją tylko stany „zrobione” i „pominięte”; pominięte wystąpienie jest wyliczane samoczynnie (nie zapisuje się go) i widoczne tylko następnego dnia, po czym znika z listy.

## Access Control Changes

No access control changes — current model preserved (logowanie, jedno konto widzi tylko swoje dane, bez ról).

## Non-Goals

- Osobna opcja rytmu „co tydzień” i „co miesiąc” — poza zakresem tej zmiany; dostępne rytmy: codziennie, co X dni, wybrane dni tygodnia. Wybór jednego dnia tygodnia jest dozwolony i daje efekt tygodniowy.
- Licznik realizacji i statystyki regularności (np. „trening 8/12 w miesiącu”) — statystyki pozostają poza zakresem.
- Wpływ cyklu na zamknięcie milestona — milestone zamyka się według obecnej reguły, niezależnie od tego, czy cykl jest „spełniony”.
- Zadania bez milestona (powtarzalne i niepowtarzalne) — każde zadanie musi należeć do milestona.

## Open Questions

Brak otwartych pytań. Pięć pytań z pierwszej wersji tego dokumentu rozstrzygnięto 2026-10-19:

1. Milestone zamknięty przed datą — zadania powtarzalne nie blokują zamknięcia, a zamknięcie kończy powtarzanie; po dacie milestona rutyna również się kończy.
2. Zakres X w „co X dni” — od 2 do 30.
3. „Częściowo zrobione” dla wystąpienia — nie dotyczy zadań powtarzalnych; tylko zrobione i pominięte.
4. Deadline i sortowanie — wystąpienie ma termin dzisiejszy i trafia na górę listy; zadanie powtarzalne nie ma osobnego własnego deadline'u.
5. Widoczność pominiętego wystąpienia — następnego dnia jako pominięte, potem znika.
