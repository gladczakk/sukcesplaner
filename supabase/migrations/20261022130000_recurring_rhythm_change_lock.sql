-- Zmiana rytmu zadania powtarzalnego (S-10, przeglad F2): sprzatanie przeniesien czeka na rownolegle wstawienia.
-- Problem: wstawienie wiersza 'moved' (check_task_occurrence blokuje tylko milestone, a klucz obcy bierze na
-- zadaniu blokade key-share) nie konfliktuje z UPDATE zmieniajacym rytm (no-key update), wiec wyzwalacz
-- sprzatajacy mogl nie zobaczyc niezatwierdzonego wiersza i zostawic "ducha" starego rytmu.
-- Poprawka: funkcja sprzatajaca najpierw bierze blokade FOR UPDATE na wierszu zadania. Ta blokada konfliktuje
-- z key-share, wiec czeka na zatwierdzenie rownoleglego wstawienia i dopiero potem usuwa wiersze (widzi je),
-- a wstawienie rozpoczete po niej czeka na koniec zmiany rytmu i jest walidowane juz wzgledem nowego rytmu.
-- Tresc sprzatania i warunek wyzwalacza bez zmian (patrz 20261022120000_recurring_rhythm_change.sql).
-- Wycofanie: osobna migracja przywracajaca funkcje bez blokady (z 20261022120000_recurring_rhythm_change.sql).

create or replace function public.cleanup_moved_occurrences_on_rhythm_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.recurrence_start_date is null then
    return null;
  end if;

  perform 1
  from public.tasks t
  where t.id = new.id
  for update;

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
