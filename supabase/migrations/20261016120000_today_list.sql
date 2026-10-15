-- Lista zadan na dzis (S-04, FR-009/FR-010): regula kwalifikacji "gwiazdy przewodniej" w jednym,
-- testowalnym miejscu w bazie. Funkcja public.today_list(p_today) zwraca plaska liste wierszy
-- trzech rodzajow (kolumna kind):
-- 1) 'task'      - niedokonczone zadanie (status todo/partial) NAJBLIZSZEGO niezamknietego milestona
--                  projektu, ktore nie jest przeniesione na pozniej (deferred_until jest NULL albo
--                  <= p_today);
-- 2) 'milestone' - najblizszy niezamkniety milestone, ktory nie ma zadnego niedokonczonego zadania
--                  (same zadania done albo brak zadan): "milestone do zamkniecia"; kolumny zadania
--                  sa NULL;
-- 3) 'deferred'  - niedokonczone zadanie najblizszego milestona przeniesione na pozniej
--                  (deferred_until > p_today); UI tylko je liczy, nie wypisuje.
-- Decyzje z wywiadu:
-- - Najblizszy milestone projektu = niezamkniety (completed_at IS NULL) o najmniejszym (due_date, seq),
--   takze po terminie; seq rozstrzyga remis dat, wiec dla kazdego projektu jest dokladnie jeden.
--   Projekt bez niezamknietych milestonow nie ma wierszy.
-- - Zadanie przeniesione na pozniej jest nadal niedokonczone, wiec milestone z samymi przeniesionymi
--   zadaniami NIE jest "do zamkniecia".
-- - Sortowanie wg FR-010 doslownie, bez dziedziczenia terminu milestona: wiersze 'task' po terminie
--   zadania rosnaco (NULL na koncu), potem data milestona, kolejnosc utworzenia i id; po zadaniach
--   wiersze 'milestone' (data milestona, seq); na koncu wiersze 'deferred'.
-- - Data "dzis" jest parametrem (aplikacja liczy ja raz na zapytanie w Europe/Warsaw), a nie
--   current_date (UTC): lista i oznaczenia terminow nie rozjada sie o polnocy, a testy sa
--   deterministyczne.
-- Funkcja dziala jako invoker: widocznosc danych ogranicza RLS (user_id = auth.uid()), wiec zwraca
-- wylacznie rekordy wywolujacego. Wykonanie tylko dla authenticated (anon dostaje 42501).
-- Wycofanie: nowa migracja z drop function public.today_list(date).

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
  task_deferred_until date
)
language sql
stable
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
      t.created_at as task_created_at
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
      null::timestamptz
    from nearest n
    where not exists (select 1 from open_tasks t where t.milestone_id = n.id)
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
    r.task_deferred_until
  from rows_all r
  join public.projects p on p.id = r.project_id
  order by
    case r.kind when 'task' then 0 when 'milestone' then 1 else 2 end,
    r.task_due_date asc nulls last,
    r.milestone_due_date asc,
    r.milestone_seq asc,
    r.task_created_at asc,
    r.task_id asc
$$;

revoke all on function public.today_list(date) from public, anon;
grant execute on function public.today_list(date) to authenticated;
