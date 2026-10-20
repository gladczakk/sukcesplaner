-- Akcje na wystapieniu zadania powtarzalnego (S-09, FR-011/FR-019): przeniesienie wystapienia na inny dzien
-- i widoczne "pominiete wczoraj".
-- Decyzje:
-- - Jedynym miejscem zapisu stanu wystapien zostaje task_occurrences. Nowy stan 'moved': occurrence_date to
--   dzien zrodlowy, moved_to to dzien docelowy (zawsze pozniejszy). Ten sam dzien nie moze byc jednoczesnie
--   'done' i 'moved' (klucz glowny), a jeden dzien docelowy przyjmuje jedno przeniesienie na zadanie
--   (czesciowy indeks unikalny).
-- - "Pominiete" nie jest zapisywane: today_list wylicza je dla wczoraj (dzien rytmu albo dzien docelowy
--   przeniesienia, bez wiersza w task_occurrences) i zwraca jako rodzaj wiersza 'skipped'. Stan 'skipped'
--   w task_occurrences nadal jest odrzucany.
-- - Przeniesienie jest jednorazowe: zrodlem moze byc tylko dzien rytmu, a dzien docelowy przeniesienia
--   nie jest dniem rytmu, wiec przeniesionego wystapienia nie da sie przeniesc dalej. Dzien docelowy nie moze
--   byc dniem rytmu (wlasne wystapienie zadania) ani wypadac po dacie milestona.
-- - Odhaczyc ('done') mozna dzien rytmu albo dzien docelowy przeniesienia.
-- - Definicja "czy dzien jest dniem rytmu" siedzi w jednej funkcji is_rhythm_day (immutable) i zastepuje
--   kopie warunku w wyzwalaczu odhaczenia i w today_list. Wyzwalacz uzywa jawnych kolumn rytmu, nie
--   is_recurring (kolumna wyliczana nie jest widoczna w BEFORE ROW).
-- - Teksty komunikatow sa kontraktem z serwisami w src/lib/services (dopasowanie po tekscie): galaz 'done'
--   zachowuje fraze 'Wystapienie', komunikaty galezi 'moved' zaczynaja sie od 'Przeniesienie wystapienia'
--   i nie zawieraja frazy 'Wystapienie'.
-- - today_list dostaje dwie kolumny na koncu: task_moved_from (dzien zrodlowy przeniesienia, tylko wiersze
--   'routine' z przeniesionego wystapienia) i task_can_move (czy dzis mozna przeniesc wystapienie na jutro;
--   tylko wiersze 'routine'), zeby UI nie powielalo logiki rytmu.
-- Wycofanie: osobna migracja przywracajaca today_list i check_task_occurrence ze stanu z
-- 20261020120000_recurring_weekdays.sql, usuwajaca indeks task_occurrences_moved_to_key, ograniczenia
-- task_occurrences_moved_shape i task_occurrences_moved_to_check, kolumne moved_to, funkcje is_rhythm_day
-- oraz zawezajaca task_occurrences_state_check do ('done') (po usunieciu wierszy 'moved').

-- ---------------------------------------------------------------------------
-- Wspolna definicja dnia rytmu
-- ---------------------------------------------------------------------------
-- Interwal: (d - start) % interwal = 0; dni tygodnia: isodow d nalezy do dni. Nie sprawdza zakresu
-- start .. data milestona (to robia wolajacy). NULL-bezpieczna: brak rytmu daje false.

create function public.is_rhythm_day(
  p_interval smallint,
  p_weekdays smallint[],
  p_start date,
  p_day date
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    case
      when p_interval is not null then (p_day - p_start) % p_interval = 0
      when p_weekdays is not null then extract(isodow from p_day)::smallint = any (p_weekdays)
    end,
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- task_occurrences: stan 'moved' i dzien docelowy
-- ---------------------------------------------------------------------------

alter table public.task_occurrences
  drop constraint task_occurrences_state_check;

alter table public.task_occurrences
  add column moved_to date null;

alter table public.task_occurrences
  add constraint task_occurrences_state_check check (state in ('done', 'moved')),
  add constraint task_occurrences_moved_shape check ((state = 'moved') = (moved_to is not null)),
  add constraint task_occurrences_moved_to_check check (moved_to > occurrence_date);

-- Jedno przeniesienie na dzien docelowy dla zadania.
create unique index task_occurrences_moved_to_key
  on public.task_occurrences (task_id, moved_to)
  where moved_to is not null;

-- ---------------------------------------------------------------------------
-- Walidacja zapisu wystapienia: odhaczenie ('done') i przeniesienie ('moved')
-- ---------------------------------------------------------------------------

create or replace function public.check_task_occurrence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  task_interval smallint;
  task_weekdays smallint[];
  task_start date;
  milestone_due_date date;
  milestone_completed_at timestamptz;
begin
  select t.recurrence_interval_days, t.recurrence_weekdays, t.recurrence_start_date, m.due_date, m.completed_at
  into task_interval, task_weekdays, task_start, milestone_due_date, milestone_completed_at
  from public.tasks t
  join public.milestones m on m.id = t.milestone_id
  where t.id = new.task_id
  for share of m;

  -- Brak zadania (nie istnieje albo niewidoczne dla roli przez RLS): bez bledu tutaj;
  -- wlasciwy blad zglosza klucz obcy (23503) albo WITH CHECK (42501).
  if not found then
    return new;
  end if;

  if task_interval is null and task_weekdays is null then
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

  if new.state = 'moved' then
    -- Zrodlo przeniesienia musi byc dniem rytmu (przeniesione wystapienie nie przejdzie dalej).
    if not public.is_rhythm_day(task_interval, task_weekdays, task_start, new.occurrence_date) then
      raise exception 'Przeniesienie wystapienia (%) dotyczy dnia spoza rytmu zadania',
        new.occurrence_date
        using errcode = 'check_violation';
    end if;

    -- Brak dnia docelowego zglasza ograniczenie task_occurrences_moved_shape.
    if new.moved_to is not null then
      if new.moved_to > milestone_due_date then
        raise exception 'Przeniesienie wystapienia (%) na dzien (%) wykracza poza date milestona (%)',
          new.occurrence_date, new.moved_to, milestone_due_date
          using errcode = 'check_violation';
      end if;

      if public.is_rhythm_day(task_interval, task_weekdays, task_start, new.moved_to) then
        raise exception 'Przeniesienie wystapienia (%) na dzien (%) nie jest mozliwe: to dzien rytmu zadania',
          new.occurrence_date, new.moved_to
          using errcode = 'check_violation';
      end if;
    end if;
  else
    -- Odhaczenie: dzien rytmu albo dzien docelowy przeniesienia tego zadania.
    if not public.is_rhythm_day(task_interval, task_weekdays, task_start, new.occurrence_date)
      and not exists (
        select 1
        from public.task_occurrences o
        where o.task_id = new.task_id
          and o.moved_to = new.occurrence_date
      )
    then
      raise exception 'Wystapienie (%) nie pasuje do rytmu zadania',
        new.occurrence_date
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lista na dzis: wiersze 'skipped', przeniesione wystapienia, task_can_move
-- ---------------------------------------------------------------------------
-- Zmiana kolumn wyniku wymaga drop + create (ta sama sygnatura (date)). Rodzaje:
-- 'routine' - zadanie powtarzalne (is_recurring) dowolnego niezamknietego milestona, dla ktorego p_today
--             miesci sie w przedziale start .. data milestona, jest dniem rytmu ALBO dniem docelowym
--             przeniesienia i nie ma wiersza task_occurrences dla p_today (odhaczone ani przeniesione
--             dalej); task_moved_from to dzien zrodlowy przeniesienia (albo NULL); task_can_move jest
--             prawda tylko dla wystapienia z rytmu, gdy jutro nie jest dniem rytmu, miesci sie w dacie
--             milestona i nie jest juz dniem docelowym innego przeniesienia;
-- 'skipped' - to samo dla wczoraj (p_today - 1): bylo wystapieniem (rytm albo dzien docelowy przeniesienia)
--             i nie ma dla wczoraj wiersza task_occurrences (nie zrobione i nie przeniesione dalej);
--             bez akcji, task_moved_from i task_can_move to NULL;
-- kolejnosc: routine, skipped, task, milestone, deferred; pozostale rodzaje bez zmian.
-- Pozostale zasady (strict, stable, invoker, uprawnienia) bez zmian - patrz 20261016120000_today_list.sql.

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
  task_recurrence_interval_days smallint,
  task_recurrence_weekdays smallint[],
  task_moved_from date,
  task_can_move boolean
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
      and not t.is_recurring
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
      null::smallint as task_recurrence_interval_days,
      null::smallint[] as task_recurrence_weekdays,
      null::date as task_moved_from,
      null::boolean as task_can_move
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
      null::smallint,
      null::smallint[],
      null::date,
      null::boolean
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
      t.recurrence_interval_days,
      t.recurrence_weekdays,
      mv.moved_from,
      mv.moved_from is null
        and not public.is_rhythm_day(
          t.recurrence_interval_days, t.recurrence_weekdays, t.recurrence_start_date, p_today + 1)
        and p_today + 1 <= m.due_date
        and not exists (
          select 1
          from public.task_occurrences o
          where o.task_id = t.id
            and o.moved_to = p_today + 1
        )
    from public.tasks t
    join public.milestones m on m.id = t.milestone_id
    left join lateral (
      select o.occurrence_date as moved_from
      from public.task_occurrences o
      where o.task_id = t.id
        and o.moved_to = p_today
    ) mv on true
    where m.completed_at is null
      and t.is_recurring
      and p_today between t.recurrence_start_date and m.due_date
      and (
        public.is_rhythm_day(
          t.recurrence_interval_days, t.recurrence_weekdays, t.recurrence_start_date, p_today)
        or mv.moved_from is not null
      )
      and not exists (
        select 1
        from public.task_occurrences o
        where o.task_id = t.id
          and o.occurrence_date = p_today
      )
    union all
    select
      'skipped',
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
      t.recurrence_interval_days,
      t.recurrence_weekdays,
      null::date,
      null::boolean
    from public.tasks t
    join public.milestones m on m.id = t.milestone_id
    where m.completed_at is null
      and t.is_recurring
      and p_today - 1 between t.recurrence_start_date and m.due_date
      and (
        public.is_rhythm_day(
          t.recurrence_interval_days, t.recurrence_weekdays, t.recurrence_start_date, p_today - 1)
        or exists (
          select 1
          from public.task_occurrences o
          where o.task_id = t.id
            and o.moved_to = p_today - 1
        )
      )
      and not exists (
        select 1
        from public.task_occurrences o
        where o.task_id = t.id
          and o.occurrence_date = p_today - 1
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
    r.task_recurrence_interval_days,
    r.task_recurrence_weekdays,
    r.task_moved_from,
    r.task_can_move
  from rows_all r
  join public.projects p on p.id = r.project_id
  order by
    case r.kind
      when 'routine' then 0
      when 'skipped' then 1
      when 'task' then 2
      when 'milestone' then 3
      else 4
    end,
    r.task_due_date asc nulls last,
    r.milestone_due_date asc,
    r.milestone_seq asc,
    r.task_created_at asc,
    r.task_id asc
$$;

revoke all on function public.today_list(date) from public, anon;
grant execute on function public.today_list(date) to authenticated;
