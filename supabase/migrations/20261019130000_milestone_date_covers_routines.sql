-- Poprawka z przegladu implementacji S-07 (F1): data milestona nie moze byc przesunieta na wczesniejsza
-- niz poczatek powtarzania zadania powtarzalnego (recurrence_start_date).
-- Dotad trigger milestones_check_task_dates sprawdzal tylko tasks.due_date, a zadanie powtarzalne ma
-- due_date NULL, wiec po takim przesunieciu rutyna po cichu znikala z listy na dzis (warunek
-- p_today between recurrence_start_date and data milestona byl na stale falszywy).
-- Zmieniamy tylko cialo funkcji (create or replace); trigger i tekst komunikatu zostaja bez zmian,
-- wiec src/lib/services/milestones.ts mapuje blad jak dla zadan z terminem (dopasowanie po tekscie).
-- Wycofanie: nowa migracja przywracajaca cialo funkcji z 20261015120000_task_rules.sql.

create or replace function public.check_milestone_date_covers_tasks()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  later_tasks bigint;
begin
  select count(*) into later_tasks
  from public.tasks t
  where t.milestone_id = new.id
    and (t.due_date > new.due_date or t.recurrence_start_date > new.due_date);

  if later_tasks > 0 then
    raise exception 'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (%)',
      later_tasks
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
