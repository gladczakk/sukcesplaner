-- Testy regul zadan (triggery tasks_check_rules i milestones_check_task_dates).
-- Dane bazowe wstawiamy jako postgres (RLS omijane); przypadki RLS przelaczaja role
-- (set local role) i ustawiaja kontekst JWT, z ktorego czyta auth.uid().
-- Komunikaty sa kontraktem z serwisami aplikacji (dopasowanie po tekscie).
begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- Uzytkownik testowy
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test');

insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Projekt A', 'praca', '2026-12-31');

-- m1: otwarty (wstawianie i zmiany zadan); m2: otwarty z zadaniami o terminach 10-20 i 10-25
-- (przesuwanie daty); m3: zamkniety (insert nie uruchamia triggera zamykania);
-- m4: otwarty z zadaniem bez terminu; m5: otwarty (przypadki RLS)
insert into public.milestones (id, user_id, project_id, name, due_date, completed_at)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm1', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm2', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm3', '2026-11-01', '2026-10-01 10:00:00+00'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm4', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm5', '2026-11-01', null);

insert into public.tasks (id, user_id, milestone_id, title, due_date)
values
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 't4', '2026-10-20'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 't5', '2026-10-25'),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000004', 't6', null);

-- Struktura
select has_trigger('public', 'tasks', 'tasks_check_rules', 'trigger tasks_check_rules istnieje');
select has_trigger('public', 'milestones', 'milestones_check_task_dates', 'trigger milestones_check_task_dates istnieje');

-- Termin zadania wzgledem daty milestona
select lives_ok(
  $$insert into public.tasks (id, user_id, milestone_id, title)
    values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't1')$$,
  'zadanie bez terminu w otwartym milestonie przechodzi');

select lives_ok(
  $$insert into public.tasks (id, user_id, milestone_id, title, due_date)
    values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't2', '2026-11-01')$$,
  'termin zadania rowny dacie milestona przechodzi');

select throws_ok(
  $$insert into public.tasks (user_id, milestone_id, title, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'za pozno', '2026-11-02')$$,
  '23514',
  'Termin zadania (2026-11-02) nie moze byc pozniejszy niz data milestona (2026-11-01)',
  'termin zadania pozniejszy niz data milestona odrzucony');

select throws_ok(
  $$update public.tasks set due_date = '2026-11-02'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  '23514',
  'Termin zadania (2026-11-02) nie moze byc pozniejszy niz data milestona (2026-11-01)',
  'zmiana terminu zadania na pozniejszy niz data milestona odrzucona');

-- Zamkniety milestone (m3)
select throws_ok(
  $$insert into public.tasks (user_id, milestone_id, title, status)
    values ('00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'todo w zamknietym', 'todo')$$,
  '23514',
  'Zamkniety milestone nie moze miec niezrobionych zadan',
  'zadanie todo w zamknietym milestonie odrzucone');

select throws_ok(
  $$insert into public.tasks (user_id, milestone_id, title, status)
    values ('00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'partial w zamknietym', 'partial')$$,
  '23514',
  'Zamkniety milestone nie moze miec niezrobionych zadan',
  'zadanie partial w zamknietym milestonie odrzucone');

select lives_ok(
  $$insert into public.tasks (id, user_id, milestone_id, title, status)
    values ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 't3', 'done')$$,
  'zadanie done w zamknietym milestonie przechodzi');

select throws_ok(
  $$update public.tasks set status = 'todo'
    where id = '30000000-0000-0000-0000-000000000003'$$,
  '23514',
  'Zamkniety milestone nie moze miec niezrobionych zadan',
  'cofniecie zadania done na todo w zamknietym milestonie odrzucone');

select lives_ok(
  $$update public.tasks set title = 't3 zmieniony'
    where id = '30000000-0000-0000-0000-000000000003'$$,
  'zmiana tytulu zadania done w zamknietym milestonie przechodzi');

-- Zmiana statusu w otwartym milestonie
select lives_ok(
  $$update public.tasks set status = 'done'
    where id = '30000000-0000-0000-0000-000000000002'$$,
  'zadanie w otwartym milestonie ustawione na done');

select lives_ok(
  $$update public.tasks set status = 'todo'
    where id = '30000000-0000-0000-0000-000000000002'$$,
  'cofniecie zadania done na todo w otwartym milestonie przechodzi');

-- Przesuwanie daty milestona (m2: zadania z terminami 2026-10-20 i 2026-10-25)
select throws_ok(
  $$update public.milestones set due_date = '2026-10-22'
    where id = '20000000-0000-0000-0000-000000000002'$$,
  '23514',
  'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (1)',
  'przesuniecie daty milestona przed termin jednego zadania odrzucone (1)');

select throws_ok(
  $$update public.milestones set due_date = '2026-10-10'
    where id = '20000000-0000-0000-0000-000000000002'$$,
  '23514',
  'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (2)',
  'przesuniecie daty milestona przed terminy dwoch zadan odrzucone (2)');

select lives_ok(
  $$update public.milestones set due_date = '2026-10-25'
    where id = '20000000-0000-0000-0000-000000000002'$$,
  'przesuniecie daty milestona na date rowna najpozniejszemu terminowi przechodzi');

select lives_ok(
  $$update public.milestones set due_date = '2026-11-05'
    where id = '20000000-0000-0000-0000-000000000002'$$,
  'przesuniecie daty milestona w przod przechodzi');

select lives_ok(
  $$update public.milestones set due_date = '2026-10-01'
    where id = '20000000-0000-0000-0000-000000000004'$$,
  'przesuniecie daty milestona wstecz bez zadan z terminem przechodzi');

-- ---------------------------------------------------------------------------
-- Reguly dzialaja takze w kontekscie roli authenticated (z RLS)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$insert into public.tasks (milestone_id, title, due_date)
    values ('20000000-0000-0000-0000-000000000005', 'za pozno (RLS)', '2026-11-02')$$,
  '23514',
  'Termin zadania (2026-11-02) nie moze byc pozniejszy niz data milestona (2026-11-01)',
  'authenticated: zadanie z pozniejszym terminem odrzucone');

select lives_ok(
  $$insert into public.tasks (milestone_id, title, due_date)
    values ('20000000-0000-0000-0000-000000000005', 'poprawne (RLS)', '2026-11-01')$$,
  'authenticated: poprawne zadanie przechodzi');

reset role;

select * from finish();
rollback;
