-- Zadania powtarzalne (S-07, FR-016/FR-017): rytm "codziennie / co X dni" zapisany na zadaniu,
-- odhaczenia pojedynczych wystapien w osobnej tabeli, lista na dzis z nowym rodzajem wiersza.
-- Decyzje:
-- - Wystapienia sa WYLICZANE (nie sa wierszami): zadanie powtarzalne ma recurrence_interval_days
--   (1 = codziennie, 2..30 = co X dni) i recurrence_start_date (dzien dodania wg Europe/Warsaw,
--   ustawiany przez aplikacje). Wystapienie to dzien d, dla ktorego d miesci sie w przedziale
--   recurrence_start_date .. data milestona (wlacznie) i (d - start) % interwal = 0.
-- - W bazie zapisuje sie tylko odhaczenie dnia: task_occurrences (task_id, occurrence_date, state).
-- - Zadanie powtarzalne nie ma wlasnego terminu, jego status to zawsze 'todo' i nie jest
--   przenoszone (deferred_until IS NULL) - istniejace akcje "Zrobione/Czesciowo/Na jutro" nie moga
--   go wiec zakonczyc (ograniczenie tasks_recurrence_shape).
-- - Zadania powtarzalne nie blokuja zamkniecia milestona i moga istniec jako niezrobione w
--   zamknietym milestonie (zamkniecie ukrywa rutyne, ponowne otwarcie ja przywraca).
-- - Teksty komunikatow (zawierajace 'Wystapienie' i 'Powtarzanie zadania') sa kontraktem z
--   serwisami w src/lib/services (dopasowanie po tekscie); komunikat o dacie startu celowo nie
--   zawiera frazy "Data milestona" (to regula daty projektu).
-- Wycofanie: osobna migracja usuwajaca task_occurrences, kolumny i ograniczenia rytmu oraz
-- przywracajaca funkcje check_milestone_closable, check_task_rules i today_list ze stanu sprzed zmiany.

-- ---------------------------------------------------------------------------
-- Kolumny rytmu i ograniczenia na tasks
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column recurrence_interval_days smallint null,
  add column recurrence_start_date date null;

alter table public.tasks
  add constraint tasks_recurrence_interval_check
    check (recurrence_interval_days between 1 and 30),
  add constraint tasks_recurrence_pair_check
    check ((recurrence_interval_days is null) = (recurrence_start_date is null)),
  add constraint tasks_recurrence_shape
    check (
      recurrence_interval_days is null
      or (due_date is null and status = 'todo' and deferred_until is null)
    );

-- Klucz dla zlozonego klucza obcego z task_occurrences (jak milestones_id_user_id_key).
alter table public.tasks
  add constraint tasks_id_user_id_key unique (id, user_id);

-- ---------------------------------------------------------------------------
-- Odhaczenia wystapien
-- ---------------------------------------------------------------------------

create table public.task_occurrences (
  task_id uuid not null,
  user_id uuid not null default auth.uid(),
  occurrence_date date not null,
  state text not null default 'done' constraint task_occurrences_state_check check (state in ('done')),
  created_at timestamptz not null default now(),
  primary key (task_id, occurrence_date),
  constraint task_occurrences_task_owner_fkey foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete cascade
);

create index task_occurrences_user_id_idx on public.task_occurrences (user_id);

alter table public.task_occurrences enable row level security;

revoke all on public.task_occurrences from public, anon, authenticated;

-- Bez update: odhaczenie sie dodaje albo usuwa.
grant select, insert, delete on public.task_occurrences to authenticated;

create policy "task_occurrences_select_own" on public.task_occurrences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "task_occurrences_insert_own" on public.task_occurrences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "task_occurrences_delete_own" on public.task_occurrences
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Walidacja odhaczenia: tylko dla zadania powtarzalnego w niezamknietym milestonie i tylko dla dnia,
-- ktory jest wystapieniem wg rytmu (w przedziale start .. data milestona, zgodny z interwalem).
-- Milestone czytany z FOR SHARE, wiec odhaczenie szereguje sie z rownoleglym zamknieciem.
create function public.check_task_occurrence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  task_interval smallint;
  task_start date;
  milestone_due_date date;
  milestone_completed_at timestamptz;
begin
  select t.recurrence_interval_days, t.recurrence_start_date, m.due_date, m.completed_at
  into task_interval, task_start, milestone_due_date, milestone_completed_at
  from public.tasks t
  join public.milestones m on m.id = t.milestone_id
  where t.id = new.task_id
  for share of m;

  -- Brak zadania (nie istnieje albo niewidoczne dla roli przez RLS): bez bledu tutaj;
  -- wlasciwy blad zglosza klucz obcy (23503) albo WITH CHECK (42501).
  if not found then
    return new;
  end if;

  if task_interval is null then
    raise exception 'Wystapienie dotyczy zadania, ktore nie jest powtarzalne'
      using errcode = 'check_violation';
  end if;

  if milestone_completed_at is not null then
    raise exception 'Wystapienie nie moze dotyczyc zamknietego milestona'
      using errcode = 'check_violation';
  end if;

  if new.occurrence_date < task_start or new.occurrence_date > milestone_due_date then
    raise exception 'Wystapienie (%) wykracza poza zakres powtarzania zadania (% - %)',
      new.occurrence_date, task_start, milestone_due_date
      using errcode = 'check_violation';
  end if;

  if (new.occurrence_date - task_start) % task_interval <> 0 then
    raise exception 'Wystapienie (%) nie pasuje do rytmu zadania',
      new.occurrence_date
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger task_occurrences_check_occurrence
  before insert on public.task_occurrences
  for each row execute function public.check_task_occurrence();

-- ---------------------------------------------------------------------------
-- Regula zamykania milestona: zadania powtarzalne nie blokuja zamkniecia
-- ---------------------------------------------------------------------------

create or replace function public.check_milestone_closable()
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
    and t.status <> 'done'
    and t.recurrence_interval_days is null;

  if open_tasks > 0 then
    raise exception 'Milestone nie moze zostac zamkniety: niezrobione zadania (%)',
      open_tasks
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reguly zadan: wyjatek dla rutyny w zamknietym milestonie i data startu rytmu
-- ---------------------------------------------------------------------------

create or replace function public.check_task_rules()
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

  -- Zamkniety milestone przyjmuje tylko zadania done. Wyjatek: rutyna (zawsze todo), ktora juz w nim
  -- jest (UPDATE bez zmiany milestone_id); wstawienie i przeniesienie rutyny do zamknietego
  -- milestona sa nadal odrzucane.
  if milestone_completed_at is not null and new.status <> 'done'
    and not (
      new.recurrence_interval_days is not null
      and tg_op = 'UPDATE'
      and new.milestone_id = old.milestone_id
    )
  then
    raise exception 'Zamkniety milestone nie moze miec niezrobionych zadan'
      using errcode = 'check_violation';
  end if;

  if new.recurrence_start_date is not null and new.recurrence_start_date > milestone_due_date then
    raise exception 'Powtarzanie zadania nie moze zaczac sie (%) po dacie milestona (%)',
      new.recurrence_start_date, milestone_due_date
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger tasks_check_rules on public.tasks;

create trigger tasks_check_rules
  before insert or update of due_date, milestone_id, status, recurrence_start_date, recurrence_interval_days
  on public.tasks
  for each row execute function public.check_task_rules();

-- ---------------------------------------------------------------------------
-- Lista na dzis: nowy rodzaj wiersza 'routine'
-- ---------------------------------------------------------------------------
-- Zmiana kolumn wyniku wymaga drop + create (ta sama sygnatura (date)). Rodzaje:
-- 'routine'   - zadanie powtarzalne dowolnego niezamknietego milestona (nie tylko najblizszego),
--               dla ktorego p_today jest wystapieniem wg rytmu i nie ma odhaczenia dla p_today;
--               na szczycie listy (przed 'task'); task_recurrence_interval_days niesie rytm;
-- 'task', 'milestone', 'deferred' - bez zmian; zadania powtarzalne nie sa 'otwartymi zadaniami',
-- wiec milestone z samymi rutynami jest "do zamkniecia".
-- Pozostale zasady (strict, stable, invoker, RLS, uprawnienia) bez zmian - patrz 20261016120000_today_list.sql.

drop function public.today_list(date);

create function public.today_list(p_today date)
returns table (
  kind text,
  project_id uuid,
  project_name text,
  life_area text,
  milestone_id uuid,
  milestone_name text,
  milestone_due_date date,
  task_id uuid,
  task_title text,
  task_due_date date,
  task_status text,
  task_deferred_until date,
  task_recurrence_interval_days smallint
)
language sql
stable
strict
security invoker
set search_path = ''
as $$
  with nearest as (
    -- jeden najblizszy niezamkniety milestone na projekt (indeks project_id, due_date, seq)
    select distinct on (m.project_id) m.*
    from public.milestones m
    where m.completed_at is null
    order by m.project_id, m.due_date, m.seq
  ),
  open_tasks as (
    select t.*
    from public.tasks t
    join nearest n on n.id = t.milestone_id
    where t.status <> 'done'
      and t.recurrence_interval_days is null
  ),
  rows_all as (
    select
      case
        when t.deferred_until is not null and t.deferred_until > p_today then 'deferred'
        else 'task'
      end as kind,
      n.project_id,
      n.id as milestone_id,
      n.name as milestone_name,
      n.due_date as milestone_due_date,
      n.seq as milestone_seq,
      t.id as task_id,
      t.title as task_title,
      t.due_date as task_due_date,
      t.status as task_status,
      t.deferred_until as task_deferred_until,
      t.created_at as task_created_at,
      null::smallint as task_recurrence_interval_days
    from open_tasks t
    join nearest n on n.id = t.milestone_id
    union all
    select
      'milestone',
      n.project_id,
      n.id,
      n.name,
      n.due_date,
      n.seq,
      null::uuid,
      null::text,
      null::date,
      null::text,
      null::date,
      null::timestamptz,
      null::smallint
    from nearest n
    where not exists (select 1 from open_tasks t where t.milestone_id = n.id)
    union all
    select
      'routine',
      m.project_id,
      m.id,
      m.name,
      m.due_date,
      m.seq,
      t.id,
      t.title,
      t.due_date,
      t.status,
      t.deferred_until,
      t.created_at,
      t.recurrence_interval_days
    from public.tasks t
    join public.milestones m on m.id = t.milestone_id
    where m.completed_at is null
      and t.recurrence_interval_days is not null
      and p_today between t.recurrence_start_date and m.due_date
      and (p_today - t.recurrence_start_date) % t.recurrence_interval_days = 0
      and not exists (
        select 1
        from public.task_occurrences o
        where o.task_id = t.id
          and o.occurrence_date = p_today
      )
  )
  select
    r.kind,
    r.project_id,
    p.name,
    p.life_area,
    r.milestone_id,
    r.milestone_name,
    r.milestone_due_date,
    r.task_id,
    r.task_title,
    r.task_due_date,
    r.task_status,
    r.task_deferred_until,
    r.task_recurrence_interval_days
  from rows_all r
  join public.projects p on p.id = r.project_id
  order by
    case r.kind when 'routine' then 0 when 'task' then 1 when 'milestone' then 2 else 3 end,
    r.task_due_date asc nulls last,
    r.milestone_due_date asc,
    r.milestone_seq asc,
    r.task_created_at asc,
    r.task_id asc
$$;

revoke all on function public.today_list(date) from public, anon;
grant execute on function public.today_list(date) to authenticated;
