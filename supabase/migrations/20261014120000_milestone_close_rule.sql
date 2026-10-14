-- Regula zamykania milestona (S-02): milestone mozna zamknac (completed_at z NULL na wartosc)
-- tylko wtedy, gdy nie ma zadan o statusie innym niz 'done'.
-- Baza pilnuje niezmiennika niezaleznie od tego, kto zapisuje (aplikacja, inna funkcja, psql).
-- Nie sprawdzamy ponownego otwarcia (completed_at -> NULL), zmiany innych kolumn zamknietego
-- milestona ani ponownego zapisu completed_at juz zamknietego (to odpowiedzialnosc serwisu).

create function public.check_milestone_closable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  open_tasks bigint;
begin
  select count(*) into open_tasks
  from public.tasks t
  where t.milestone_id = new.id
    and t.status <> 'done';

  if open_tasks > 0 then
    raise exception 'Milestone nie moze zostac zamkniety: niezrobione zadania (%)',
      open_tasks
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger milestones_check_closable
  before update of completed_at on public.milestones
  for each row
  when (old.completed_at is null and new.completed_at is not null)
  execute function public.check_milestone_closable();
