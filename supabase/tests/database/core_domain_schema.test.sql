-- Testy schematu domenowego (projects / milestones / tasks).
-- Uruchamiane jako rola postgres (bez JWT), wiec user_id podajemy jawnie.
begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

-- Uzytkownicy testowi
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'b@example.test');

-- Struktura
select has_table('public', 'projects', 'tabela projects istnieje');
select has_table('public', 'milestones', 'tabela milestones istnieje');
select has_table('public', 'tasks', 'tabela tasks istnieje');

select has_column('public', 'projects', 'life_area', 'projects.life_area istnieje');
select has_column('public', 'milestones', 'seq', 'milestones.seq istnieje');
select has_column('public', 'milestones', 'completed_at', 'milestones.completed_at istnieje');
select has_column('public', 'tasks', 'status', 'tasks.status istnieje');
select has_column('public', 'tasks', 'deferred_until', 'tasks.deferred_until istnieje');

-- CHECK-i
select throws_ok(
  $$insert into public.projects (user_id, name, life_area, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', '', 'dom', '2026-12-31')$$,
  '23514', null, 'pusta nazwa projektu odrzucona');

select throws_ok(
  $$insert into public.projects (user_id, name, life_area, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', '   ', 'dom', '2026-12-31')$$,
  '23514', null, 'nazwa z samych spacji odrzucona');

select throws_ok(
  $$insert into public.projects (user_id, name, life_area, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', repeat('x', 201), 'dom', '2026-12-31')$$,
  '23514', null, 'nazwa dluzsza niz 200 znakow odrzucona');

select throws_ok(
  $$insert into public.projects (user_id, name, life_area, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', 'Projekt', 'hobby', '2026-12-31')$$,
  '23514', null, 'life_area spoza listy odrzucone');

-- Dane bazowe
select lives_ok(
  $$insert into public.projects (id, user_id, name, life_area, due_date)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Projekt A', 'praca', '2026-12-31')$$,
  'projekt uzytkownika A wstawiony');

select lives_ok(
  $$insert into public.projects (id, user_id, name, life_area, due_date)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'Projekt B', 'sport', '2026-12-31')$$,
  'projekt uzytkownika B wstawiony');

-- Duplikat daty dozwolony; seq rosnie w kolejnosci wstawienia (jedno zapytanie)
select lives_ok(
  $$insert into public.milestones (id, user_id, project_id, name, due_date)
    values
      ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'dup1', '2026-11-01'),
      ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'dup2', '2026-11-01')$$,
  'dwa milestony z ta sama data w jednym projekcie dozwolone');

select results_eq(
  $$select name from public.milestones
    where project_id = '10000000-0000-0000-0000-000000000001'
    order by due_date, seq$$,
  $$values ('dup1'::text), ('dup2'::text)$$,
  'seq zachowuje kolejnosc wstawienia przy remisie dat');

-- Status zadania
select throws_ok(
  $$insert into public.tasks (user_id, milestone_id, title, status)
    values ('00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'Zadanie', 'blocked')$$,
  '23514', null, 'status spoza listy odrzucony');

select lives_ok(
  $$insert into public.tasks (id, user_id, milestone_id, title)
    values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'Zadanie 1')$$,
  'zadanie wstawione z domyslnym statusem');

-- Trigger dat
select throws_ok(
  $$insert into public.milestones (user_id, project_id, name, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'po terminie', '2027-01-01')$$,
  '23514', null, 'milestone po terminie projektu odrzucony');

select lives_ok(
  $$insert into public.milestones (id, user_id, project_id, name, due_date)
    values ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'rowny', '2026-12-31')$$,
  'milestone rowny terminowi projektu przyjety');

select throws_ok(
  $$update public.milestones set due_date = '2027-01-01'
    where id = '20000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'przesuniecie milestona poza termin projektu odrzucone');

select throws_ok(
  $$update public.projects set due_date = '2026-11-15'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'skrocenie terminu projektu ponizej milestona odrzucone');

select lives_ok(
  $$update public.projects set due_date = '2026-12-31'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  'termin projektu rowny najpozniejszemu milestonowi dozwolony');

-- Zlozony FK: milestone z innym user_id niz wlasciciel projektu
select throws_ok(
  $$insert into public.milestones (user_id, project_id, name, due_date)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'cudzy', '2026-11-01')$$,
  '23503', null, 'milestone innego wlasciciela niz projekt odrzucony przez FK');

-- Kaskady
select lives_ok(
  $$insert into public.tasks (id, user_id, milestone_id, title)
    values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'Zadanie 2')$$,
  'drugie zadanie wstawione');

select lives_ok(
  $$delete from public.milestones where id = '20000000-0000-0000-0000-000000000001'$$,
  'milestone usuniety');

select is(
  (select count(*) from public.tasks where milestone_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'usuniecie milestona kasuje jego zadania');

select lives_ok(
  $$delete from public.projects where id = '10000000-0000-0000-0000-000000000001'$$,
  'projekt usuniety');

select is(
  (select count(*) from public.milestones where project_id = '10000000-0000-0000-0000-000000000001'),
  0::bigint,
  'usuniecie projektu kasuje jego milestony');

select is(
  (select count(*) from public.tasks where id = '30000000-0000-0000-0000-000000000002'),
  0::bigint,
  'usuniecie projektu kasuje zadania jego milestonow');

select * from finish();
rollback;
