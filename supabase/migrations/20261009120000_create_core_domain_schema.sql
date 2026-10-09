-- Domenowy schemat SukcesPlaner: projects -> milestones -> tasks.
-- RLS i uprawnienia dodaje osobna migracja (20261009120100_enable_core_domain_rls.sql).

-- ---------------------------------------------------------------------------
-- Tabele
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null constraint projects_name_length check (char_length(btrim(name)) between 1 and 200),
  description text null,
  life_area text not null constraint projects_life_area_check check (life_area in ('dom', 'sport', 'praca')),
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_id_user_id_key unique (id, user_id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null,
  name text not null constraint milestones_name_length check (char_length(btrim(name)) between 1 and 200),
  due_date date not null,
  completed_at timestamptz null,
  -- seq rozstrzyga remis dat deterministycznie (now() jest stale w obrebie transakcji)
  seq bigint generated always as identity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestones_id_user_id_key unique (id, user_id),
  constraint milestones_project_owner_fkey foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create index milestones_project_due_seq_idx on public.milestones (project_id, due_date, seq);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  milestone_id uuid not null,
  title text not null constraint tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  due_date date null,
  status text not null default 'todo' constraint tasks_status_check check (status in ('todo', 'partial', 'done')),
  deferred_until date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_milestone_owner_fkey foreign key (milestone_id, user_id)
    references public.milestones (id, user_id) on delete cascade
);

create index tasks_milestone_id_idx on public.tasks (milestone_id);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Regula dat (FR-003): data milestona nie wykracza poza termin projektu.
-- Rownosc jest dozwolona; sprawdzamy oba kierunki.
-- ---------------------------------------------------------------------------

create function public.check_milestone_within_project_due_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  project_due_date date;
begin
  select p.due_date into project_due_date
  from public.projects p
  where p.id = new.project_id;

  -- Brak projektu zglosi klucz obcy.
  if project_due_date is not null and new.due_date > project_due_date then
    raise exception 'Data milestona (%) nie moze byc pozniejsza niz termin projektu (%)',
      new.due_date, project_due_date
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger milestones_check_due_date
  before insert or update of due_date, project_id on public.milestones
  for each row execute function public.check_milestone_within_project_due_date();

create function public.check_project_due_date_covers_milestones()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.milestones m
    where m.project_id = new.id
      and m.due_date > new.due_date
  ) then
    raise exception 'Termin projektu (%) nie moze byc wczesniejszy niz data istniejacego milestona',
      new.due_date
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger projects_check_due_date
  before update of due_date on public.projects
  for each row execute function public.check_project_due_date_covers_milestones();
