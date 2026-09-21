---
project: SukcesPlaner
context_type: greenfield
created: 2026-09-19
updated: 2026-09-19
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria bólu"
      decision: "obciążenie koordynacyjne + rozproszenie narzędzi"
    - topic: "insight"
      decision: "jedno miejsce dla różnych obszarów życia + automatyczne generowanie listy na dziś"
    - topic: "zasięg głównej persony"
      decision: "szersza nisza — osoby żonglujące wieloma długoterminowymi projektami życiowymi, nie tylko sama uczestniczka"
    - topic: "mechanizm dostępu"
      decision: "logowanie (email+hasło / OAuth), model płaski w MVP — bez ról"
    - topic: "timeline MVP"
      decision: "3 tygodnie (~30h przy 10h/tydzień) na przepływ 1-9; potwierdzone jako wykonalne przez uczestniczkę"
    - topic: "zakres CRUD"
      decision: "pełny CRUD (create/edit/delete) dla projektów, milestonów i zadań w MVP"
    - topic: "data startu zadania"
      decision: "poza MVP — zadanie widoczne codziennie od razu, gdy należy do najbliższego nieskończonego milestona"
    - topic: "sortowanie zadań bez deadline'u"
      decision: "na końcu listy, po zadaniach z deadline'em, ale nadal widoczne"
    - topic: "NFR"
      decision: "szybkość ładowania listy na dziś, dostępność na telefonie i komputerze, spójny/staranny wygląd wizualny"
    - topic: "ramowanie produktu"
      decision: "web-app, mała skala użytkowników, hard deadline 2026-11-04, praca po godzinach"
    - topic: "non-goals"
      decision: "brak powtarzalności/rutyn, brak udostępniania, brak zadań wolnostojących, brak natywnej apki mobilnej, brak statystyk/raportów"
  frs_drafted: 14
  quality_check_status: accepted
---

# Shape Notes

## Seed idea

Aplikacja do zarządzania długimi projektami: podział na milestony z deadline'ami, wewnątrz milestonów mniejsze zadania (w tym zadania powtarzalne), na tej podstawie generowana jest lista zadań na konkretny dzień.

## Participant context (informational, not PRD content)

- Doświadczenie: analityczka biznesowa w IT; programowała ostatnio ok. 10 lat temu (studia); korzysta z Claude Code w VS Code dotychczas do wymagań/poprawek bugów, nie do budowania funkcji od zera.
- Dostępność: ok. 10h/tydzień, jeden tydzień urlopu w okresie do pierwszego terminu (4.11.2026) — łączna pojemność ok. 55h.
- Sugestia z /10x-idea-check (do potwierdzenia/odrzucenia w trakcie shapingu): przyciąć pierwszy przepływ do projekt → milestone z deadline'em → zadania (bez powtarzalności na start) → lista zadań na dziś; powtarzalność i bardziej złożona priorytetyzacja jako rozszerzenie.

## Vision & Problem Statement

Osoby żonglujące kilkoma równoległymi, długoterminowymi projektami z różnych obszarów życia (np. edukacja domowa, trening do zawodów, projekty w pracy) rozpraszają śledzenie zadań i terminów pomiędzy wieloma kalendarzami i listami. Każdego dnia ręcznie odtwarzają te same rutynowe zadania, a terminy kluczowych kamieni milowych (np. konsultacja przed egzaminem) bywają przeoczone, bo nie ma jednego miejsca łączącego wszystkie wątki.

Istniejące narzędzia do zarządzania projektami wymagają ręcznego planowania dnia i są budowane z myślą o kontekście firmowym, a kalendarze osobiste żyją osobno od projektów. Brakuje narzędzia, które łączy różne obszary życia w jednym miejscu i samo wylicza, co należy zrobić danego dnia dla każdego projektu, na podstawie milestonów, deadline'ów i zadań (w tym powtarzalnych).

## User & Persona

Osoba prowadząca kilka równoległych, długoterminowych projektów obejmujących różne obszary życia — zarówno prywatne (np. edukacja domowa, przygotowania do zawodów sportowych), jak i zawodowe. Sięga po narzędzie codziennie, planując dzień, oraz przy definiowaniu nowego projektu z milestonami i zadaniami.

## Access Control

Logowanie (email + hasło lub OAuth). W MVP model płaski — każde konto widzi i zarządza wyłącznie swoimi projektami, milestonami i zadaniami; brak ról i udostępniania.

> Forward (poza MVP, nie zamykać drogi architekturze): możliwość delegowania/udostępniania zadań lub projektów innej osobie w przyszłości.

## Success Criteria

### Primary
- Użytkownik może: zalogować się → dodać projekt (nazwa, termin, opis, obszar życia) → dodać milestony z datami → dodać zadania (opcjonalnie z własnym deadline'em) potrzebne do dotarcia do milestona → wejść na listę zadań na dziś i zobaczyć wszystko, co trzeba zrobić przed najbliższymi deadline'ami → przenieść zadanie na jutro, oznaczyć jako zrobione/częściowo zrobione, oraz ręcznie dodać zadanie z poziomu listy.

### Secondary
- Filtrowanie listy zadań/projektów wg obszaru życia (dom/sport/praca).

### Guardrails
- Żadne dodane zadanie ani milestone nie może zniknąć lub zostać pominięte na liście na dziś bez wiedzy użytkownika.
- Zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem, zanim minie.

> Forward (poza MVP): podgląd list zadań dla kolejnych dni; projekty typu "rutyna" z codziennymi, zawsze gotowymi do odhaczenia krokami (alternatywna droga do zadań powtarzalnych); zadania wolnostojące (bez przypisania do milestona); subtaski w ramach zadania do oznaczania częściowego wykonania.

## Functional Requirements

### Uwierzytelnianie
- FR-001: Użytkownik może zalogować się (email+hasło lub OAuth), aby uzyskać dostęp do swojego konta. Priority: must-have
  > Socrates: Kontrargument rozważony: "dla jednoosobowego użytku wystarczyłoby coś prostszego niż logowanie/OAuth". Rozstrzygnięcie: FR zostaje bez zmian — logowanie zabezpiecza projekty przed dostępem osób trzecich i przygotowuje grunt pod docelowe udostępnienie narzędzia szerszemu gronu odbiorców.

### Projekty
- FR-002: Użytkownik może utworzyć projekt z nazwą, terminem, opcjonalnym opisem i obszarem życia. Priority: must-have
  > Socrates: Kontrargument rozważony: "cel projektu jako wolny tekst jest zbyt nieprecyzyjny, by cokolwiek z nim automatycznie zrobić". Rozstrzygnięcie: pole "cel" usunięte z FR; obszar życia zostaje.
- FR-003: Użytkownik może edytować i usuwać projekt. Usunięcie projektu, który ma milestony lub zadania, wymaga potwierdzenia i usuwa razem z nim wszystkie jego milestony i zadania. Data żadnego milestona w projekcie nie może wykraczać poza termin projektu — walidacja przy tworzeniu/edycji. Priority: must-have
  > Socrates: Kontrargument rozważony: "usunięcie projektu może przypadkowo skasować wszystkie milestony i zadania bez ostrzeżenia" oraz "edycja terminu projektu może rozjechać się z już ustawionymi milestonami". Rozstrzygnięcie: oba uznane za zasadne — dodano wymóg potwierdzenia przed usunięciem oraz walidację dat milestonów względem terminu projektu.

### Milestony
- FR-004: Użytkownik może dodać do projektu milestony z obowiązkową datą (nie opcjonalną). Milestony w projekcie są uporządkowane wg dat. Milestone jest samodzielnym elementem — nie musi zawierać żadnych zadań, by być widoczny/liczony. Priority: must-have
  > Socrates: Kontrargument rozważony: "niejasne czy milestone może istnieć bez zadań" oraz "kolejność milestonów nie jest określona". Rozstrzygnięcie: data milestona jest obowiązkowa i determinuje kolejność; milestone bez zadań jest poprawnym stanem (milestone traktowany jako zadanie sam w sobie).
- FR-005: Użytkownik może edytować i usuwać milestony. Usunięcie milestona, który ma przypisane zadania, wymaga potwierdzenia i usuwa razem z nim te zadania. Priority: must-have
  > Socrates: Kontrargument rozważony: "usunięcie milestona osieraca jego zadania". Rozstrzygnięcie: usunięcie milestona usuwa razem z nim jego zadania, po potwierdzeniu — spójne z FR-003.

### Zadania
- FR-006: Użytkownik może dodać do milestona zadania niezbędne do jego osiągnięcia, opcjonalnie z własnym deadline'em. W MVP każde zadanie musi należeć do milestona — zadania wolnostojące (bez milestona) nie są wspierane. Priority: must-have
  > Socrates: Kontrargument rozważony: "wymuszanie przypisania zadania do milestona jest zbyt sztywne dla drobnych zadań niezwiązanych z żadnym kamieniem milowym". Rozstrzygnięcie: sztywność zaakceptowana na MVP; zadania wolnostojące odłożone poza MVP (patrz FR-008).
- FR-007: Użytkownik może edytować i usuwać zadania. Priority: must-have
  > Socrates: Brak kontrargumentu; FR zostaje bez zmian.
- FR-008: Użytkownik może ręcznie dodać zadanie z poziomu listy zadań na dziś, wybierając projekt i milestone, do którego zadanie należy. Priority: must-have
  > Socrates: Kontrargument rozważony: "niejasne czy ręcznie dodane zadanie musi należeć do projektu/milestona". Rozstrzygnięcie: musi — zadania wolnostojące (bez milestona/projektu) odłożone poza MVP.

### Lista zadań na dziś
- FR-009: Użytkownik może zobaczyć listę zadań na dziś, zbierającą zadania ze wszystkich projektów spełniające regułę kwalifikacji (dokładna reguła zdefiniowana w Business Logic). Priority: must-have
  > Socrates: Kontrargument rozważony: "brak jasnej reguły co kwalifikuje zadanie do listy na dziś". Rozstrzygnięcie: reguła kwalifikacji zostaje zdefiniowana jako jedno zdanie w sekcji Business Logic (faza 5) — FR-009 odwołuje się do niej.
- FR-010: Zadania na liście są uporządkowane od najbliższego terminu do najdalszego; zadania bez własnego deadline'u trafiają na koniec listy, ale pozostają widoczne. Priority: must-have
  > Socrates: Kontrargument rozważony: "sortowanie tylko wg bliskości deadline'u zepchnie w dół pilne zadania bez deadline'u". Rozstrzygnięcie: zaakceptowane jako znane ograniczenie MVP; obsługa pilnych zadań bez deadline'u przez dodanie ich bezpośrednio jako zadanie na dziś jest funkcją poza MVP (patrz FR-008 / wolnostojące zadania).
- FR-013: Użytkownik może przefiltrować listę zadań na dziś wg obszaru życia projektu. Priority: nice-to-have
- FR-014: Zadania na liście są wizualnie oznaczone kolorem przypisanym do ich projektu. Priority: nice-to-have
- FR-011: Użytkownik może oznaczyć zadanie jako zrobione lub częściowo zrobione. Priority: must-have
  > Socrates: Kontrargument rozważony: "'częściowo zrobione' bez opisu postępu jest zbyt niejednoznaczne". Rozstrzygnięcie: wystarczające na MVP; subtaski i ich odznaczanie w ramach częściowego wykonania to rozszerzenie poza MVP.
- FR-012: Użytkownik może przenieść niedokończone/częściowo zrobione zadanie na jutro. Priority: must-have
  > Socrates: Kontrargument rozważony: "ciągłe przenoszenie na jutro może maskować zaległości i nie sygnalizować zagrożenia milestona". Rozstrzygnięcie: ryzyko pokryte przez istniejący guardrail — zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem niezależnie od historii przenoszenia zadań.

## User Stories

### US-01: Użytkownik widzi listę zadań na dziś posortowaną wg pilności

- **Given** zalogowany użytkownik ma co najmniej jeden projekt z milestonami i zadaniami
- **When** wchodzi na listę zadań na dziś
- **Then** widzi zadania ze wszystkich swoich projektów wymagające uwagi dzisiaj, posortowane tak, że zadania z bliższym deadline'em (własnym lub milestona) są wyżej

#### Acceptance Criteria
- Zadanie bez ukończenia i z minionym lub dzisiejszym deadline'em pojawia się na liście
- Kolejność listy odzwierciedla bliskość deadline'u — najbliższy termin na górze
- Oznaczenie zadania jako zrobione usuwa je z listy na dziś
- Oznaczenie jako częściowo zrobione i przeniesienie na jutro przenosi pozostałą część na listę następnego dnia

## Business Logic

Lista zadań na dziś pokazuje wszystkie niedokończone zadania należące do najbliższego, jeszcze niezamkniętego milestona każdego projektu, uporządkowane od najbliższego terminu do najdalszego (zadania bez terminu na końcu), a gdy wszystkie zadania danego milestona zostaną ukończone, na liście pojawia się sam milestone jako ostatni krok do zamknięcia.

Reguła korzysta z: listy projektów użytkownika, milestonów każdego projektu wraz z ich datami, zadań przypisanych do każdego milestona wraz z opcjonalnymi własnymi deadline'ami oraz ich stanem ukończenia (zrobione / częściowo zrobione / niezrobione).

Wynikiem jest jedna, codzienna lista pozycji do zrobienia obejmująca jednocześnie wszystkie projekty użytkownika, posortowana wg pilności.

Użytkownik widzi tę listę od razu po wejściu na widok "dziś"; w miarę odznaczania zadań i zbliżania się terminów lista aktualizuje się automatycznie każdego dnia, bez ręcznego planowania.

## Non-Functional Requirements

- Lista zadań na dziś ładuje się odczuwalnie natychmiast (poniżej 1 sekundy w typowych warunkach) — użytkownik nie czeka, żeby zobaczyć plan na dziś.
- Produkt pozostaje w pełni używalny zarówno na ekranie telefonu, jak i komputera, bez utraty dostępu do żadnej funkcji.
- Interfejs zachowuje spójny, staranny wygląd wizualny na wszystkich widokach.

## Non-Goals

- Zadania powtarzalne i projekty typu "rutyna" — MVP nie obsługuje powtarzalności; każde zadanie ma jednorazowy deadline (bez osobnej daty startu).
- Udostępnianie lub delegowanie projektów innym osobom — MVP zostaje przy płaskim modelu jednego konta = jeden prywatny zestaw danych.
- Zadania wolnostojące (bez przypisania do milestona) — każde zadanie musi należeć do milestona.
- Natywna aplikacja mobilna — MVP to aplikacja webowa używalna z przeglądarki na telefonie i komputerze, nie osobna apka ze sklepu.
- Statystyki i raporty postępu — brak wykresów/podsumowań progresu projektów w MVP.

## Quality cross-check

All elements present — no gaps recorded. quality_check_status: accepted.
