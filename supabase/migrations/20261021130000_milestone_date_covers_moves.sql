-- Data milestona obejmuje tez dzien docelowy przeniesienia wystapienia (S-09, przeglad F2).
-- Wczesniej wyzwalacz pilnowal tylko due_date i recurrence_start_date zadan, wiec przesuniecie milestona
-- przed moved_to ukrywalo przeniesione wystapienie w today_list (p_today <= data milestona) bez sladu.
-- Komunikat bez zmian (kontrakt z serwisem milestonow); liczba w nawiasie to zadania i przeniesienia razem.
-- Wycofanie: osobna migracja przywracajaca funkcje z 20261019130000_milestone_date_covers_routines.sql.

create or replace function public.check_milestone_date_covers_tasks()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  later_items bigint;
begin
  select
    (
      select count(*)
      from public.tasks t
      where t.milestone_id = new.id
        and (t.due_date > new.due_date or t.recurrence_start_date > new.due_date)
    )
    + (
      select count(*)
      from public.task_occurrences o
      join public.tasks t on t.id = o.task_id
      where t.milestone_id = new.id
        and o.moved_to > new.due_date
    )
  into later_items;

  if later_items > 0 then
    raise exception 'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (%)',
      later_items
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
