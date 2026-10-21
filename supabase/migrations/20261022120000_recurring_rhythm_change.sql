-- Zmiana rytmu zadania powtarzalnego (S-10, FR-020): sprzatanie przeniesien po zmianie rytmu.
-- Decyzje:
-- - Zmiana rytmu dziala od dnia ustawionego w recurrence_start_date (aplikacja ustawia ja na dzis wg
--   Europe/Warsaw przy kazdej zmianie rytmu). Wyzwalacz usuwa z task_occurrences wiersze 'moved' tego
--   zadania, ktorych dzien zrodlowy (occurrence_date) albo dzien docelowy (moved_to) przypada od nowej
--   daty startu wzwyz. Inaczej przeniesienie czytane po moved_to (today_list) zostaloby "duchem" starego
--   rytmu, a jedno odhaczenie moglo zaspokajac dwa wystapienia w jednym wierszu listy.
-- - Wiersze 'done' zostaja (historia odhaczen), tak samo wiersze 'moved' calkowicie przed data startu.
-- - Granica to nowa recurrence_start_date, nie current_date (current_date liczy w UTC, a "dzis" jest wg
--   Europe/Warsaw). "Pominiete wczoraj" nie wymaga zmian: po ustawieniu daty startu na dzis wczoraj jest
--   przed startem rytmu i today_list go nie zwraca.
-- - Wyzwalacz AFTER ROW odpala sie tylko, gdy zmienil sie sam rytm (interwal albo dni tygodnia); zmiana
--   samej daty startu lub tytulu niczego nie usuwa. Gdy rytm jest zerowany (data startu NULL), nic nie robi:
--   sieroty po bezposrednim zerowaniu rytmu poza aplikacja nie sa sprzatane (nie sa czytane przez today_list).
-- - Funkcja jest security invoker: usuwa wiersze zadania w kontekscie roli wlasciciela (grant delete i
--   polityka task_occurrences_delete_own juz istnieja); nie zmienia istniejacych funkcji ani komunikatow.
-- Wycofanie: osobna migracja usuwajaca wyzwalacz tasks_rhythm_change_cleanup na public.tasks i funkcje
-- public.cleanup_moved_occurrences_on_rhythm_change().

create function public.cleanup_moved_occurrences_on_rhythm_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.recurrence_start_date is null then
    return null;
  end if;

  delete from public.task_occurrences o
  where o.task_id = new.id
    and o.state = 'moved'
    and (
      o.occurrence_date >= new.recurrence_start_date
      or o.moved_to >= new.recurrence_start_date
    );

  return null;
end;
$$;

create trigger tasks_rhythm_change_cleanup
  after update of recurrence_interval_days, recurrence_weekdays, recurrence_start_date
  on public.tasks
  for each row
  when (
    old.recurrence_interval_days is distinct from new.recurrence_interval_days
    or old.recurrence_weekdays is distinct from new.recurrence_weekdays
  )
  execute function public.cleanup_moved_occurrences_on_rhythm_change();
