---
project: SukcesPlaner
version: 1
status: locked
created: 2026-09-19
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
---

## Vision & Problem Statement

Osoby żonglujące kilkoma równoległymi, długoterminowymi projektami z różnych obszarów życia (np. edukacja domowa, trening do zawodów, projekty w pracy) rozpraszają śledzenie zadań i terminów pomiędzy wieloma kalendarzami i listami. Każdego dnia ręcznie odtwarzają te same rutynowe zadania, a terminy kluczowych kamieni milowych (np. konsultacja przed egzaminem) bywają przeoczone, bo nie ma jednego miejsca łączącego wszystkie wątki.

Istniejące narzędzia do zarządzania projektami wymagają ręcznego planowania dnia i są budowane z myślą o kontekście firmowym, a kalendarze osobiste żyją osobno od projektów. Brakuje narzędzia, które łączy różne obszary życia w jednym miejscu i samo wylicza, co należy zrobić danego dnia dla każdego projektu, na podstawie milestonów, deadline'ów i zadań.

## User & Persona

Osoba prowadząca kilka równoległych, długoterminowych projektów obejmujących różne obszary życia — zarówno prywatne (np. edukacja domowa, przygotowania do zawodów sportowych), jak i zawodowe. Sięga po narzędzie codziennie, planując dzień, oraz przy definiowaniu nowego projektu z milestonami i zadaniami.

## Success Criteria

### Primary
- Użytkownik może: zalogować się → dodać projekt (nazwa, termin, opis, obszar życia) → dodać milestony z datami → dodać zadania (opcjonalnie z własnym deadline'em) potrzebne do dotarcia do milestona → wejść na listę zadań na dziś i zobaczyć wszystko, co trzeba zrobić przed najbliższymi deadline'ami → przenieść zadanie na jutro, oznaczyć jako zrobione/częściowo zrobione, oraz ręcznie dodać zadanie z poziomu listy.

### Secondary
- Filtrowanie listy zadań/projektów wg obszaru życia (dom/sport/praca).

### Guardrails
- Żadne dodane zadanie ani milestone nie może zniknąć lub zostać pominięte na liście na dziś bez wiedzy użytkownika.
- Zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem, zanim minie.

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

## Functional Requirements

### Uwierzytelnianie
- FR-001: Użytkownik może zalogować się (email+hasło), aby uzyskać dostęp do swojego konta. W MVP obsługiwany jest wyłącznie mechanizm email+hasło; OAuth odłożony poza MVP. Priority: must-have
  > Socrates: Kontrargument rozważony: "dla jednoosobowego użytku wystarczyłoby coś prostszego niż logowanie/OAuth". Rozstrzygnięcie: FR zostaje bez zmian — logowanie zabezpiecza projekty przed dostępem osób trzecich i przygotowuje grunt pod docelowe udostępnienie narzędzia szerszemu gronu odbiorców.
  > Resolved (Open Question 1, 2026-09-21): mechanizm logowania doprecyzowany po doborze stacku (Supabase Auth w wybranym starterze) — email+hasło wystarcza na MVP i najlepiej mieści się w 3-tygodniowym budżecie after-hours; OAuth można dodać później bez zmiany modelu danych.

### Projekty
- FR-002: Użytkownik może utworzyć projekt z nazwą, terminem, opcjonalnym opisem i obszarem życia. Priority: must-have
  > Socrates: Kontrargument rozważony: "cel projektu jako wolny tekst jest zbyt nieprecyzyjny, by cokolwiek z nim automatycznie zrobić". Rozstrzygnięcie: pole "cel" usunięte z FR; obszar życia zostaje.
- FR-003: Użytkownik może edytować i usuwać projekt. Usunięcie projektu, który ma milestony lub zadania, wymaga potwierdzenia i usuwa razem z nim wszystkie jego milestony i zadania. Data żadnego milestona w projekcie nie może wykraczać poza termin projektu — walidacja przy tworzeniu/edycji. Priority: must-have
  > Socrates: Kontrargument rozważony: "usunięcie projektu może przypadkowo skasować wszystkie milestony i zadania bez ostrzeżenia" oraz "edycja terminu projektu może rozjechać się z już ustawionymi milestonami". Rozstrzygnięcie: oba uznane za zasadne — dodano wymóg potwierdzenia przed usunięciem oraz walidację dat milestonów względem terminu projektu.

### Milestony
- FR-004: Użytkownik może dodać do projektu milestony z obowiązkową datą (nie opcjonalną). Milestony w projekcie są uporządkowane wg dat; dopuszczalne są duplikaty dat — przy remisie kolejność ustala kolejność utworzenia. Milestone jest samodzielnym elementem — nie musi zawierać żadnych zadań, by być widoczny/liczony. Priority: must-have
  > Socrates: Kontrargument rozważony: "niejasne czy milestone może istnieć bez zadań" oraz "kolejność milestonów nie jest określona". Rozstrzygnięcie: data milestona jest obowiązkowa i determinuje kolejność; milestone bez zadań jest poprawnym stanem (milestone traktowany jako zadanie sam w sobie).
  > Resolved (Open Question 3, 2026-09-21): daty milestonów w ramach jednego projektu nie muszą być unikalne — brak dodatkowej walidacji, najmniej pracy w budżecie MVP.
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
- FR-009: Użytkownik może zobaczyć listę zadań na dziś, zbierającą zadania ze wszystkich projektów spełniające regułę kwalifikacji (dokładna reguła zdefiniowana w sekcji Business Logic). Priority: must-have
  > Socrates: Kontrargument rozważony: "brak jasnej reguły co kwalifikuje zadanie do listy na dziś". Rozstrzygnięcie: reguła kwalifikacji zdefiniowana jako jedno zdanie w sekcji Business Logic — FR-009 odwołuje się do niej.
- FR-010: Zadania na liście są uporządkowane od najbliższego terminu do najdalszego; zadania bez własnego deadline'u trafiają na koniec listy, ale pozostają widoczne. Priority: must-have
  > Socrates: Kontrargument rozważony: "sortowanie tylko wg bliskości deadline'u zepchnie w dół pilne zadania bez deadline'u". Rozstrzygnięcie: zaakceptowane jako znane ograniczenie MVP; obsługa pilnych zadań bez deadline'u przez dodanie ich bezpośrednio jako zadanie na dziś jest funkcją poza MVP.
- FR-011: Użytkownik może oznaczyć zadanie jako zrobione lub częściowo zrobione. Priority: must-have
  > Socrates: Kontrargument rozważony: "'częściowo zrobione' bez opisu postępu jest zbyt niejednoznaczne". Rozstrzygnięcie: wystarczające na MVP; subtaski i ich odznaczanie w ramach częściowego wykonania to rozszerzenie poza MVP.
- FR-012: Użytkownik może przenieść niedokończone/częściowo zrobione zadanie na jutro. Priority: must-have
  > Socrates: Kontrargument rozważony: "ciągłe przenoszenie na jutro może maskować zaległości i nie sygnalizować zagrożenia milestona". Rozstrzygnięcie: ryzyko pokryte przez istniejący guardrail — zbliżający się deadline milestona jest sygnalizowany z wyprzedzeniem niezależnie od historii przenoszenia zadań.
- FR-013: Użytkownik może przefiltrować listę zadań na dziś wg obszaru życia projektu. Priority: nice-to-have
- FR-014: Zadania na liście są wizualnie oznaczone kolorem przypisanym do ich projektu. Priority: nice-to-have

### Przeterminowane elementy
- FR-015: Projekt, którego termin minął bez ukończenia wszystkich jego milestonów, oraz milestone, którego data minęła bez ukończenia wszystkich jego zadań, są oznaczone wizualnie jako przeterminowane (np. etykieta "po terminie") na liście projektów i w widoku projektu. Priority: nice-to-have
  > Resolved (Open Question 2, 2026-09-21): brak dodatkowej logiki blokującej ani zmiany reguły kwalifikacji do listy na dziś — wyłącznie wizualne oznaczenie; zadania po terminie nadal pojawiają się na liście na dziś jak dotychczas (patrz Business Logic).

## Non-Functional Requirements

- Lista zadań na dziś ładuje się odczuwalnie natychmiast (poniżej 1 sekundy w typowych warunkach) — użytkownik nie czeka, żeby zobaczyć plan na dziś.
- Produkt pozostaje w pełni używalny zarówno na ekranie telefonu, jak i komputera, bez utraty dostępu do żadnej funkcji.
- Interfejs zachowuje spójny, staranny wygląd wizualny na wszystkich widokach.

## Business Logic

Lista zadań na dziś pokazuje wszystkie niedokończone zadania należące do najbliższego, jeszcze niezamkniętego milestona każdego projektu, uporządkowane od najbliższego terminu do najdalszego (zadania bez terminu na końcu), a gdy wszystkie zadania danego milestona zostaną ukończone, na liście pojawia się sam milestone jako ostatni krok do zamknięcia.

Reguła korzysta z: listy projektów użytkownika, milestonów każdego projektu wraz z ich datami, zadań przypisanych do każdego milestona wraz z opcjonalnymi własnymi deadline'ami oraz ich stanem ukończenia (zrobione / częściowo zrobione / niezrobione).

Wynikiem jest jedna, codzienna lista pozycji do zrobienia obejmująca jednocześnie wszystkie projekty użytkownika, posortowana wg pilności.

Użytkownik widzi tę listę od razu po wejściu na widok "dziś"; w miarę odznaczania zadań i zbliżania się terminów lista aktualizuje się automatycznie każdego dnia, bez ręcznego planowania.

## Access Control

Logowanie (email + hasło lub OAuth). W MVP model płaski — każde konto widzi i zarządza wyłącznie swoimi projektami, milestonami i zadaniami; brak ról i udostępniania.

## Non-Goals

- Zadania powtarzalne i projekty typu "rutyna" — MVP nie obsługuje powtarzalności; każde zadanie ma jednorazowy deadline (bez osobnej daty startu).
- Udostępnianie lub delegowanie projektów albo zadań innym osobom — MVP zostaje przy płaskim modelu jednego konta = jeden prywatny zestaw danych.
- Zadania wolnostojące (bez przypisania do milestona) — każde zadanie musi należeć do milestona.
- Natywna aplikacja mobilna — MVP to aplikacja webowa używalna z przeglądarki na telefonie i komputerze, nie osobna apka ze sklepu.
- Statystyki i raporty postępu — brak wykresów/podsumowań progresu projektów w MVP.
- Podgląd list zadań dla kolejnych dni — MVP pokazuje wyłącznie listę na dziś.
- Subtaski w ramach zadania — zadanie ma tylko stany zrobione/częściowo zrobione, bez rozbicia na subtaski.

## Open Questions

Brak otwartych pytań. Wszystkie trzy pierwotne pytania zostały rozstrzygnięte 2026-09-21:

1. ~~Jaki dokładnie mechanizm logowania obowiązuje w MVP?~~ — rozstrzygnięte: email+hasło (patrz FR-001).
2. ~~Co się dzieje, gdy termin projektu minie, a nie wszystkie jego milestony/zadania są ukończone?~~ — rozstrzygnięte: wizualne oznaczenie jako przeterminowane, bez zmiany logiki (patrz FR-015).
3. ~~Czy milestony w ramach jednego projektu mogą mieć tę samą datę?~~ — rozstrzygnięte: tak, duplikaty dopuszczalne (patrz FR-004).
