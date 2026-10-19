---
project: SukcesPlaner
context_type: brownfield
product_type: web-app
created: 2026-10-16
updated: 2026-10-16
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "rytmy powtarzania"
      decision: "codziennie, co X dni oraz wybrane dni tygodnia; tydzień/miesiąc poza zakresem tej zmiany"
    - topic: "przypisanie zadania powtarzalnego"
      decision: "zadanie powtarzalne zawsze należy do milestona (jak każde zadanie); zadania bez milestona nadal poza zakresem — decyzja cofnięta przez użytkownika 2026-10-16"
    - topic: "powiązanie z milestonem regularnym"
      decision: "tylko powiązanie, bez wpływu na zamknięcie milestona"
    - topic: "dostęp"
      decision: "bez zmian — logowanie, jedno konto, bez ról"
    - topic: "zakres vs termin"
      decision: "zakres: zadanie powtarzalne w milestonie, rytmy co X dni i wybrane dni tygodnia; szacunek 2–3 tygodnie (mieści się w 3 tyg.)"
    - topic: "blast radius"
      decision: "przenoszenie na jutro oraz oznaczanie zrobione/częściowo zrobione"
    - topic: "gdzie ustawia się powtarzanie"
      decision: "wszędzie, gdzie dodaje/edytuje się zadanie (z listy na dziś i w formularzu zadania pod milestonem)"
    - topic: "edycja cyklu"
      decision: "można zmienić rytm i wyłączyć powtarzanie; historia i dzisiejsze wystąpienie zostają, zmiana działa od dziś"
    - topic: "start cyklu"
      decision: "od dnia dodania zadania; pierwsze wystąpienie jest tego dnia"
    - topic: "zasięg wystąpień"
      decision: "powtarzalne zadanie pojawia się w wyznaczone dni od wstawienia do końca milestona, niezależnie od tego, czy milestone jest najbliższy (wyjątek od reguły najbliższego milestona)"
    - topic: "niezrobione wystąpienie"
      decision: "wygasa, ale widocznie oznaczone jako pominięte"
    - topic: "przeniesienie wystąpienia"
      decision: "to samo wystąpienie zmienia dzień; dozwolone tylko na dzień, w którym to zadanie nie ma własnego wystąpienia"
  frs_drafted: 6
  quality_check_status: accepted
---

# Shape Notes

## Seed idea

Zadanie dodane ręcznie (z listy na dziś) ma mieć możliwość bycia powtarzalnym: codziennie albo co X dni.

## Current System

SukcesPlaner: projekty z milestonami (z datami) i zadaniami; aplikacja wylicza listę zadań na dziś z najbliższego niezamkniętego milestona każdego projektu. Na liście: oznaczenie zrobione / częściowo zrobione oraz przeniesienie na jutro. Ręczne dodanie zadania z listy (FR-008) jest zaplanowane, jeszcze niezaimplementowane. Każde zadanie musi dziś należeć do milestona.

## Vision & Problem Statement

Rutynowe zadania (np. pranie codziennie, retinol co drugi dzień, trening/bieganie/mobility w wybrane dni, sprzątanie łazienki co tydzień, uzupełnienie godzin w pracy co miesiąc) trzeba dziś odtwarzać ręcznie. Zmiana ma pozwolić, by zadanie wracało na listę na dziś według zadanego rytmu. Gdy milestone zakłada regularność (np. regularne treningi), powtarzalne zadania mają dać się z nim powiązać.

## User & Persona

Ta sama persona co dotąd: osoba prowadząca kilka równoległych, długoterminowych projektów z różnych obszarów życia (dom, pielęgnacja, sport, praca), planująca dzień codziennie.

## Access Control Changes

No access control changes — current model preserved (logowanie, jedno konto widzi tylko swoje dane, bez ról).

## Success Criteria

### Primary
- Użytkownik może dodać zadanie pod milestonem, włączyć powtarzanie (codziennie, co X dni albo w wybrane dni tygodnia), a zadanie pojawia się na liście na dziś w dni zgodne z rytmem; po odhaczeniu lub przeniesieniu na jutro kolejne wystąpienie wraca według rytmu.

### Secondary
- Zadanie powtarzalne jest na liście widocznie oznaczone jako powtarzalne.

### Guardrails
- Zadania niepowtarzalne działają jak dotąd (odhaczenie usuwa je z listy, przeniesienie na jutro jak w S-05).
- Reguła listy na dziś (najbliższy niezamknięty milestone każdego projektu) bez zmian dla zadań niepowtarzalnych; zadania powtarzalne mają własną regułę (wyjątek: pojawiają się niezależnie od tego, czy milestone jest najbliższy).
- Zadanie nie znika z listy na dziś bez wiedzy użytkownika (niezrobione wystąpienie powtarzalne wygasa tylko widocznie oznaczone jako pominięte).
- Wystąpienia zadania powtarzalnego nie można przenieść na dzień, w którym to samo zadanie ma już własne wystąpienie (codzienne zadanie nie może iść na jutro; bieganie w środy i piątki, niezrobione w środę, można przenieść na czwartek, ale nie na piątek).

## Blast radius

Przenoszenie na jutro oraz oznaczanie zrobione/częściowo zrobione (wskazane przez użytkownika jako najbardziej narażone).

## Scope of Change

- FR-016: Użytkownik może ustawić zadaniu powtarzanie: codziennie, co X dni albo w wybrane dni tygodnia — przy dodawaniu i edycji zadania, wszędzie gdzie je dodaje. Priority: must-have. Change: new
  > Socrates: Kontrargument rozważony: "'co X dni' liczone od czego?". Rozstrzygnięcie: od dnia dodania zadania; pierwsze wystąpienie jest tego dnia.
- FR-017: Zadanie powtarzalne pojawia się na liście na dziś w dni zgodne z rytmem, od dnia wstawienia do końca milestona, niezależnie od tego, czy milestone jest najbliższy. Priority: must-have. Change: new
  > Socrates: Kontrargument rozważony: rutyna z dalszego milestona nie pojawi się na liście. Rozstrzygnięcie: rutyna niezależnie od daty milestona pojawia się w wyznaczone dni od wstawienia zadania do końca milestona.
- FR-018: Zadanie powtarzalne jest na liście widocznie oznaczone jako powtarzalne. Priority: nice-to-have. Change: new
  > Socrates: Brak kontrargumentu; FR zostaje bez zmian.
- FR-019: Użytkownik może przenieść wystąpienie zadania powtarzalnego na inny dzień tylko wtedy, gdy tego dnia to zadanie nie ma własnego wystąpienia. Priority: must-have. Change: modified (FR-012)
  > Socrates: Kontrargument rozważony: "co z oryginalnym wystąpieniem po przeniesieniu?". Rozstrzygnięcie: to samo wystąpienie zmienia dzień.
- FR-011: Oznaczenie wystąpienia zadania powtarzalnego jako zrobione nie kończy zadania, kolejne wystąpienie wraca według rytmu; niezrobione wystąpienie wygasa, widocznie oznaczone jako pominięte. Priority: must-have. Change: modified
  > Socrates: Kontrargument rozważony: niezrobione wystąpienie z wczoraj wygasa po cichu. Rozstrzygnięcie: wygasa, ale widocznie oznaczone jako pominięte.
- FR-020: Użytkownik może zmienić rytm albo wyłączyć powtarzanie zadania. Priority: must-have. Change: modified (FR-007)
  > Socrates: Kontrargument rozważony: wyłączenie nie może kasować historii zrobionych. Rozstrzygnięcie: historia i dzisiejsze wystąpienie zostają; zmiana działa od dziś (wyłączenie usuwa tylko przyszłe wystąpienia).
- FR-009, FR-010: Lista na dziś i jej sortowanie dla zadań niepowtarzalnych. Change: preserved
- Zachowanie zadań niepowtarzalnych (odhaczenie, przeniesienie na jutro jak w S-05). Change: preserved

## User Stories

### US-02: Użytkownik widzi zadanie powtarzalne w dni zgodne z rytmem

- **Given** zalogowany użytkownik ma w milestonie zadanie „bieganie" powtarzane w środy i piątki
- **When** wchodzi na listę zadań na dziś w środę
- **Then** widzi na liście bieganie; gdy go nie wykona, może przenieść je na czwartek, ale nie na piątek, bo piątek ma własne wystąpienie

#### Acceptance Criteria
- Zadanie codzienne pojawia się każdego dnia od dnia dodania do końca milestona i nie można go przenieść na jutro
- Niezrobione wystąpienie wygasa i jest widocznie oznaczone jako pominięte
- Wyłączenie powtarzania zachowuje historię i dzisiejsze wystąpienie

## Business Logic Changes

Zadanie powtarzalne pojawia się na liście na dziś w każdy dzień wynikający z jego rytmu, od dnia dodania do końca milestona (niezależnie od tego, czy to najbliższy milestone), a niezrobione wystąpienie wygasa jako widocznie pominięte.

Obecna reguła: lista na dziś pokazuje niedokończone zadania z najbliższego niezamkniętego milestona każdego projektu. Zmiana: zadania powtarzalne są wyjątkiem — pojawiają się w wyznaczone dni nawet wtedy, gdy ich milestone nie jest najbliższy; zadania niepowtarzalne podlegają obecnej regule bez zmian.

Rytm to jedno z: codziennie, co X dni (liczone od dnia dodania, pierwsze wystąpienie tego dnia) lub wybrane dni tygodnia. Wystąpienie można odhaczyć, przenieść na inny dzień (tylko na dzień, w którym to zadanie nie ma własnego wystąpienia — codzienne zadanie nie może iść na jutro) albo pominąć; pominięte wystąpienie jest widocznie oznaczone, po czym znika z listy. Zmiana rytmu i wyłączenie powtarzania działają od dziś; historia i dzisiejsze wystąpienie zostają.

## Constraints & Compatibility

- Istniejące zadania w systemie są niepowtarzalne i działają bez zmian; brak migracji danych po stronie użytkownika.
- Istniejące zachowanie, które musi zostać: lista na dziś dla zadań niepowtarzalnych (reguła najbliższego milestona), sortowanie (FR-010), odhaczenie zadań niepowtarzalnych, przeniesienie na jutro jak w S-05.

## Non-Functional Requirements

Bez nowych NFR; obowiązują istniejące (lista na dziś ładuje się poniżej 1 sekundy, używalność na telefonie i komputerze, spójny wygląd).

## Non-Goals

- Rytm tygodniowy i miesięczny (co tydzień, co miesiąc) — poza zakresem tej zmiany; dostępne rytmy: codziennie, co X dni, wybrane dni tygodnia.
- Licznik realizacji i statystyki regularności (np. „trening 8/12 w miesiącu") — statystyki pozostają poza zakresem.
- Wpływ cyklu na zamknięcie milestona — milestone zamyka się według obecnej reguły, niezależnie od tego, czy cykl jest „spełniony".
- Zadania bez milestona (powtarzalne i niepowtarzalne) — każde zadanie musi należeć do milestona.

## Forward: technical-roadmap

- Rytmy tygodniowe i miesięczne (sprzątanie łazienki co tydzień, uzupełnianie godzin w pracy co miesiąc) oraz powiązanie powtarzalnych treningów z licznikiem realizacji milestona — kandydaci na kolejną transzę.

## Quality cross-check

All elements present — no gaps recorded. quality_check_status: accepted.
