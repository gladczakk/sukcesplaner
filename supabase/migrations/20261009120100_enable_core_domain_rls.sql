-- RLS i uprawnienia dla domenowego schematu SukcesPlaner.
-- Konto widzi i zmienia wylacznie wlasne rekordy (user_id = auth.uid()); anon nie ma dostepu.
-- auth.uid() opakowane w (select ...), zeby planista liczyl tozsamosc raz na zapytanie (initPlan).

alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;

-- ---------------------------------------------------------------------------
-- Uprawnienia tabelaryczne (jawnie, bez polegania na domyslnych uprawnieniach Supabase)
-- ---------------------------------------------------------------------------

revoke all on public.projects, public.milestones, public.tasks from anon;

grant select, insert, update, delete on public.projects, public.milestones, public.tasks to authenticated;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create policy "projects_select_own" on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "projects_insert_own" on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "projects_update_own" on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "projects_delete_own" on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------

create policy "milestones_select_own" on public.milestones
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "milestones_insert_own" on public.milestones
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "milestones_update_own" on public.milestones
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "milestones_delete_own" on public.milestones
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create policy "tasks_select_own" on public.tasks
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "tasks_insert_own" on public.tasks
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "tasks_delete_own" on public.tasks
  for delete to authenticated
  using (user_id = (select auth.uid()));
