-- Reguly zadan (S-03): baza pilnuje niezmiennikow zadan niezaleznie od tego, kto zapisuje
-- (aplikacja, S-05, psql).
-- 1) Termin zadania nie jest pozniejszy niz data milestona (rownosc dozwolona).
-- 2) Zamkniety milestone (completed_at nie jest NULL) nie przyjmuje niezrobionych zadan:
--    wstawienie zadania todo/partial i cofniecie zadania na todo/partial sa odrzucane.
--    Zadanie done w zamknietym milestonie mozna edytowac (tytul, termin).
-- 3) Data milestona nie moze zostac przesunieta przed termin istniejacego zadania.
-- Ta migracja domyka ograniczenie opisane w 20261014120000_milestone_close_rule.sql (F2 z przegladu
-- S-02): dodanie niezrobionego zadania do zamknietego milestona i cofniecie zadania na todo.
-- Trigger na zadaniu czyta milestone z FOR SHARE, wiec zapis zadania szereguje sie z rownoleglym
-- zamykaniem i zmiana daty milestona (trigger zamykania blokuje wiersz milestona na UPDATE).
-- Teksty komunikatow sa kontraktem z serwisami w src/lib/services (dopasowanie po tekscie);
-- komunikat o dacie milestona celowo nie zawiera frazy "Data milestona" (to regula daty projektu).

create function public.check_task_rules()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  milestone_due_date date;
  milestone_completed_at timestamptz;
begin
  select m.due_date, m.completed_at
  into milestone_due_date, milestone_completed_at
  from public.milestones m
  where m.id = new.milestone_id
  for share;

  -- Brak milestona (nie istnieje albo niewidoczny dla roli przez RLS): bez bledu tutaj;
  -- wlasciwy blad zglosza WITH CHECK (42501) albo klucz obcy (23503).
  if not found then
    return new;
  end if;

  if new.due_date is not null and new.due_date > milestone_due_date then
    raise exception 'Termin zadania (%) nie moze byc pozniejszy niz data milestona (%)',
      new.due_date, milestone_due_date
      using errcode = 'check_violation';
  end if;

  if milestone_completed_at is not null and new.status <> 'done' then
    raise exception 'Zamkniety milestone nie moze miec niezrobionych zadan'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger tasks_check_rules
  before insert or update of due_date, milestone_id, status on public.tasks
  for each row execute function public.check_task_rules();

create function public.check_milestone_date_covers_tasks()
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
    and t.due_date > new.due_date;

  if later_tasks > 0 then
    raise exception 'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (%)',
      later_tasks
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger milestones_check_task_dates
  before update of due_date on public.milestones
  for each row
  when (new.due_date < old.due_date)
  execute function public.check_milestone_date_covers_tasks();
