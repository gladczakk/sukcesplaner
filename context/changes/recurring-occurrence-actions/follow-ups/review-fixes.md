# Follow-ups z przeglądu implementacji (fazy 1–2)

## F3 — wymaganie dla S-10 (`recurring-task-edit-disable`)

Wyzwalacz `check_task_occurrence` waliduje wiersze `task_occurrences` tylko przy INSERT. Gdy S-10 doda zmianę rytmu, trzeba rozstrzygnąć los zapisanych przeniesień (`state = 'moved'`):

- zmiana rytmu działa od dziś, a historia (zrobione, przeniesione) zostaje;
- przyszłe wiersze `moved` (dzień źródłowy lub docelowy od dziś wzwyż) mają być usuwane albo ignorowane w `today_list`, gdy ich źródło przestaje być dniem rytmu albo cel staje się dniem rytmu — inaczej jedno „zrobione” zaspokoi dwa wystąpienia w jednym wierszu;
- „pominięte wczoraj” jest wyliczane z aktualnego rytmu, więc zmiana rytmu dziś może zmienić wczorajszy wynik; trzeba zdecydować, czy to akceptujemy.

Źródło: `reviews/impl-review-phases-1-2.md`, F3.
