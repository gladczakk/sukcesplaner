-- Data milestona obejmuje dzien docelowy przeniesienia wystapienia (S-09, przeglad F2).
-- Dane: rutyna sr+pt od 2026-10-21 (sroda), milestone do 2026-10-30; sroda 21 przeniesiona na czwartek 22.
-- Wstawiamy jako postgres (RLS omijane); wyzwalacze dzialaja.
begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test');

insert into public.projects (id, user_id, name, life_area, due_date)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'P1', 'praca', '2026-12-31');

insert into public.milestones (id, user_id, project_id, name, due_date)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm1', '2026-10-30');

insert into public.tasks (id, user_id, milestone_id, title, due_date, recurrence_interval_days, recurrence_weekdays, recurrence_start_date)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'rutyna', null, null, '{3,5}', '2026-10-21');

insert into public.task_occurrences (task_id, user_id, occurrence_date, state, moved_to)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '2026-10-21', 'moved', '2026-10-22');

select throws_ok(
  $$update public.milestones set due_date = '2026-10-21' where id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (1)',
  'milestone nie moze konczyc sie przed dniem docelowym przeniesienia');

select lives_ok(
  $$update public.milestones set due_date = '2026-10-22' where id = '20000000-0000-0000-0000-000000000001'$$,
  'milestone moze konczyc sie dokladnie w dniu docelowym przeniesienia');

select is(
  (select due_date from public.milestones where id = '20000000-0000-0000-0000-000000000001'),
  '2026-10-22'::date,
  'data milestona zostala przesunieta do dnia docelowego');

select * from finish();
rollback;
