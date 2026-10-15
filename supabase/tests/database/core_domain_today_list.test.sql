-- Testy funkcji public.today_list(p_today) (S-04): regula kwalifikacji listy na dzis.
-- Dane bazowe wstawiamy jako postgres (RLS omijane); zapytania do funkcji wykonujemy w roli
-- authenticated z kontekstem JWT (auth.uid()), a odrzucenie anon w roli anon.
-- Data "dzis" jest stala (2026-10-15) i przekazywana do funkcji. Kazdy przypadek ma wlasny projekt,
-- a asercje filtruja po project_id. created_at zadan ustawiamy jawnie tam, gdzie liczy sie kolejnosc
-- (now() jest stale w obrebie transakcji).
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- Uzytkownicy: a1 (wlasciciel danych), b1 (dane do testu RLS), c1 (bez danych)
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'c@example.test');

-- Projekty (termin 2026-12-31 dla wszystkich)
-- 01 kolejnosc i partial/done; 02-06 wiele projektow (zadania i wiersze milestone);
-- 07 remis dat milestonow; 08 milestone po terminie; 09 zamkniety milestone pomijany;
-- 10 wszystkie milestony zamkniete; 11 bez milestonow; 12 same zadania done;
-- 13 milestone bez zadan; 14 deferred_until; 15 wszystkie zadania przeniesione; 16 uzytkownik b1
insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'P01 kolejnosc', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'P02 wiele', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'P03 wiele', 'sport', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'P04 pusty milestone', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'P05 pusty milestone', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', 'P06 pusty milestone', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', 'P07 remis', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a1', 'P08 po terminie', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000a1', 'P09 zamkniety', 'sport', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000a1', 'P10 wszystko zamkniete', 'sport', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', 'P11 bez milestonow', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000a1', 'P12 same done', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000a1', 'P13 bez zadan', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000a1', 'P14 przeniesione', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-0000000000a1', 'P15 wszystko przeniesione', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-0000000000b1', 'P16 uzytkownik B', 'sport', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-0000000000a1', 'P17 remis seq', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-0000000000a1', 'P18 remis seq', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-0000000000a1', 'P19 done i odlozone', 'praca', '2026-12-31');

-- Milestony (kolejnosc wstawiania wyznacza seq, wiec m04 < m06 oraz m07 < m08)
insert into public.milestones (id, user_id, project_id, name, due_date, completed_at)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm01', '2026-10-20', null),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', 'm02', '2026-10-25', null),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000003', 'm03', '2026-10-22', null),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000004', 'm04', '2026-10-21', null),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000005', 'm05', '2026-10-18', null),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000006', 'm06', '2026-10-21', null),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000007', 'm07 pierwszy', '2026-10-30', null),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000007', 'm08 drugi', '2026-10-30', null),
  ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000008', 'm09 po terminie', '2026-10-01', null),
  ('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000008', 'm10 pozniejszy', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000009', 'm11 zamkniety', '2026-10-05', '2026-10-05 10:00:00+00'),
  ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000009', 'm12 otwarty', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000010', 'm13 zamkniety', '2026-10-05', '2026-10-05 10:00:00+00'),
  ('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000012', 'm14 same done', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000013', 'm15 bez zadan', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000014', 'm16 przeniesione', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000015', 'm17 wszystko przeniesione', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000016', 'm18 uzytkownik B', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000017', 'm19 remis seq', '2026-10-26', null),
  ('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000018', 'm20 remis seq', '2026-10-26', null),
  ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000019', 'm21 done i odlozone', '2026-11-01', null);

-- Zadania (termin zadania <= data milestona; zamkniete milestony maja tylko zadania done)
insert into public.tasks (id, user_id, milestone_id, title, due_date, status, deferred_until, created_at)
values
  -- P01 (m01, 2026-10-20): kolejnosc termin rosnaco, NULL na koncu (remis NULL wg created_at), partial, done
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't-bez-terminu-pozno', null, 'todo', null, '2026-10-01 10:00:00+00'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't-18', '2026-10-18', 'todo', null, default),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't-10', '2026-10-10', 'todo', null, default),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't-partial', '2026-10-15', 'partial', null, default),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't-done', '2026-10-12', 'done', null, default),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't-bez-terminu-wczesnie', null, 'todo', null, '2026-10-01 09:00:00+00'),
  -- P02 (m02, 2026-10-25) i P03 (m03, 2026-10-22): remis terminu zadan 2026-10-20 rozstrzyga data milestona,
  -- a przy tej samej dacie milestona created_at (p3-a2 ma mniejsze id, ale pozniejsze created_at niz p3-a)
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 'p2-a', '2026-10-20', 'todo', null, '2026-10-01 10:00:00+00'),
  ('30000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 'p2-b', null, 'todo', null, default),
  ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'p3-a2', '2026-10-20', 'todo', null, '2026-10-01 11:30:00+00'),
  ('30000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'p3-a', '2026-10-20', 'todo', null, '2026-10-01 11:00:00+00'),
  ('30000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'p3-b', '2026-10-19', 'todo', null, default),
  -- P07: remis dat milestonow (m07 pierwszy po seq, m08 drugi)
  ('30000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000007', 'p7-pierwszy', null, 'todo', null, default),
  ('30000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000008', 'p7-drugi', null, 'todo', null, default),
  -- P08: milestone po terminie (m09, data < dzis) jest nadal najblizszy; m10 pomijany
  ('30000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000009', 'p8-po-terminie', '2026-09-30', 'todo', null, default),
  ('30000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000010', 'p8-pozniejszy', null, 'todo', null, default),
  -- P09: zamkniety m11 (tylko done) pomijany, najblizszy to m12
  ('30000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000011', 'p9-zamkniete-done', '2026-10-04', 'done', null, default),
  ('30000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000012', 'p9-otwarte', null, 'todo', null, default),
  -- P12: milestone m14 ze wszystkimi zadaniami done
  ('30000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000014', 'p12-done-1', null, 'done', null, default),
  ('30000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000014', 'p12-done-2', '2026-10-10', 'done', null, default),
  -- P14: deferred_until po / rowne / przed p_today (2026-10-15)
  ('30000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000016', 'dz-jutro', null, 'todo', '2026-10-16', '2026-10-01 08:00:00+00'),
  ('30000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000016', 'dz-dzis', null, 'todo', '2026-10-15', '2026-10-01 10:00:00+00'),
  ('30000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000016', 'dz-wczoraj', null, 'todo', '2026-10-14', '2026-10-01 09:00:00+00'),
  -- P15: wszystkie zadania przeniesione
  ('30000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000017', 'all-1', null, 'todo', '2026-10-16', '2026-10-01 09:00:00+00'),
  ('30000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000017', 'all-2', null, 'partial', '2026-10-20', '2026-10-01 10:00:00+00'),
  -- P16: zadanie uzytkownika B
  ('30000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000018', 'b-zadanie', null, 'todo', null, default),
  -- P17, P18: ten sam termin zadania i ta sama data milestona; seq milestona (m19 < m20) rozstrzyga przed created_at
  ('30000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000019', 'p17-task', '2026-10-24', 'todo', null, '2026-10-01 12:00:00+00'),
  ('30000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000020', 'p18-task', '2026-10-24', 'todo', null, '2026-10-01 09:00:00+00'),
  -- P19: jedyne zadanie jest done (z deferred_until po p_today) - nie jest ani task, ani deferred
  ('30000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000021', 'p19-done-odlozone', null, 'done', '2026-10-20', default);

-- Struktura i uprawnienia
select has_function('public', 'today_list', array['date'], 'funkcja today_list(date) istnieje');

select ok(
  not has_function_privilege('anon', 'public.today_list(date)', 'execute')
    and has_function_privilege('authenticated', 'public.today_list(date)', 'execute'),
  'execute na today_list: authenticated tak, anon nie');

-- ---------------------------------------------------------------------------
-- Uzytkownik bez danych (c1)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select is(
  (select count(*) from public.today_list('2026-10-15')),
  0::bigint,
  'uzytkownik bez danych dostaje 0 wierszy');

-- ---------------------------------------------------------------------------
-- Uzytkownik b1: tylko wlasne dane
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select results_eq(
  $$select kind, task_title from public.today_list('2026-10-15')$$,
  $$values ('task', 'b-zadanie')$$,
  'b1 dostaje tylko wlasne zadanie');

-- ---------------------------------------------------------------------------
-- Uzytkownik a1
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

-- P01: termin rosnaco (minione przed dzisiejszym), NULL na koncu, remis NULL wg created_at; done poza lista
select results_eq(
  $$select kind, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000001'$$,
  $$values
    ('task', 't-10'),
    ('task', 't-partial'),
    ('task', 't-18'),
    ('task', 't-bez-terminu-wczesnie'),
    ('task', 't-bez-terminu-pozno')$$,
  'P01: zadania wg terminu rosnaco, NULL na koncu, done poza lista');

select is(
  (select task_status from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000001' and task_title = 't-partial'),
  'partial',
  'P01: zadanie partial jest na liscie ze statusem partial');

select is(
  (select count(*) from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000001' and kind = 'milestone'),
  0::bigint,
  'P01: milestone z niedokonczonym zadaniem nie ma wiersza milestone');

-- P02-P06: zadania posortowane globalnie (remis terminu: data milestona, potem created_at),
-- wiersze milestone (P05 2026-10-18, P04 2026-10-21, P06 2026-10-21 po seq) po zadaniach
select results_eq(
  $$select kind, coalesce(task_title, milestone_name) from public.today_list('2026-10-15')
    where project_id in (
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000005',
      '10000000-0000-0000-0000-000000000006')$$,
  $$values
    ('task', 'p3-b'),
    ('task', 'p3-a'),
    ('task', 'p3-a2'),
    ('task', 'p2-a'),
    ('task', 'p2-b'),
    ('milestone', 'm05'),
    ('milestone', 'm04'),
    ('milestone', 'm06')$$,
  'P02-P06: zadania posortowane globalnie, wiersze milestone po zadaniach');

-- P07: remis dat milestonow w projekcie - tylko pierwszy po seq
select results_eq(
  $$select kind, milestone_name, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000007'$$,
  $$values ('task', 'm07 pierwszy', 'p7-pierwszy')$$,
  'P07: remis dat milestonow - zadania tylko pierwszego po seq');

-- P08: niezamkniety milestone po terminie jest nadal najblizszy
select results_eq(
  $$select kind, milestone_name, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000008'$$,
  $$values ('task', 'm09 po terminie', 'p8-po-terminie')$$,
  'P08: niezamkniety milestone po terminie jest najblizszy');

-- P09: zamkniety milestone pomijany, najblizszy to nastepny niezamkniety
select results_eq(
  $$select kind, milestone_name, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000009'$$,
  $$values ('task', 'm12 otwarty', 'p9-otwarte')$$,
  'P09: zamkniety milestone pomijany, najblizszy to nastepny niezamkniety');

-- P10, P11: brak niezamknietych milestonow
select is_empty(
  $$select 1 from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000010'$$,
  'P10: projekt ze wszystkimi milestonami zamknietymi nie ma wierszy');

select is_empty(
  $$select 1 from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000011'$$,
  'P11: projekt bez milestonow nie ma wierszy');

-- P12, P13: milestone do zamkniecia (same zadania done / brak zadan)
select results_eq(
  $$select kind, milestone_name, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000012'$$,
  $$values ('milestone', 'm14 same done', null::text)$$,
  'P12: milestone ze wszystkimi zadaniami done daje jeden wiersz milestone');

select results_eq(
  $$select kind, milestone_name, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000013'$$,
  $$values ('milestone', 'm15 bez zadan', null::text)$$,
  'P13: milestone bez zadan daje jeden wiersz milestone');

-- P14: deferred_until > p_today -> deferred, = p_today lub wczesniejsze -> task; brak wiersza milestone
select results_eq(
  $$select kind, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000014'$$,
  $$values
    ('task', 'dz-wczoraj'),
    ('task', 'dz-dzis'),
    ('deferred', 'dz-jutro')$$,
  'P14: deferred_until po p_today to deferred, rowne lub wczesniejsze to task');

-- P15: wszystkie zadania przeniesione -> tylko deferred, brak wiersza milestone
select results_eq(
  $$select kind, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000015'$$,
  $$values
    ('deferred', 'all-1'),
    ('deferred', 'all-2')$$,
  'P15: wszystkie zadania przeniesione - wiersze deferred, brak wiersza milestone');

-- P17, P18: remis terminu zadania i daty milestona w roznych projektach - rozstrzyga seq milestona
select results_eq(
  $$select kind, task_title from public.today_list('2026-10-15')
    where project_id in (
      '10000000-0000-0000-0000-000000000017',
      '10000000-0000-0000-0000-000000000018')$$,
  $$values
    ('task', 'p17-task'),
    ('task', 'p18-task')$$,
  'P17-P18: remis terminu i daty milestona rozstrzyga seq milestona przed created_at');

-- P19: zadanie done z deferred_until po p_today nie jest ani task, ani deferred; milestone do zamkniecia
select results_eq(
  $$select kind, milestone_name, task_title from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000019'$$,
  $$values ('milestone', 'm21 done i odlozone', null::text)$$,
  'P19: zadanie done z deferred_until nie daje wiersza task ani deferred');

-- Pelny wiersz milestone: projekt, obszar zycia, data milestona i NULL w kolumnach zadania
select results_eq(
  $$select kind, project_name, life_area, milestone_name, milestone_due_date, task_id, task_title,
           task_due_date, task_status, task_deferred_until
    from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000013'$$,
  $$values (
    'milestone', 'P13 bez zadan', 'praca', 'm15 bez zadan', '2026-11-01'::date, null::uuid, null::text,
    null::date, null::text, null::date)$$,
  'P13: wiersz milestone ma projekt, obszar, date milestona i NULL w kolumnach zadania');

-- Kolejnosc calego wyniku: task, potem milestone, na koncu deferred (w jednym wyniku wielu projektow)
select results_eq(
  $$select kind, coalesce(task_title, milestone_name) from public.today_list('2026-10-15')
    where project_id in (
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000005',
      '10000000-0000-0000-0000-000000000006',
      '10000000-0000-0000-0000-000000000014')$$,
  $$values
    ('task', 'p3-b'),
    ('task', 'p3-a'),
    ('task', 'p3-a2'),
    ('task', 'p2-a'),
    ('task', 'p2-b'),
    ('task', 'dz-wczoraj'),
    ('task', 'dz-dzis'),
    ('milestone', 'm05'),
    ('milestone', 'm04'),
    ('milestone', 'm06'),
    ('deferred', 'dz-jutro')$$,
  'kolejnosc wyniku: task, potem milestone, na koncu deferred');

-- strict: p_today = NULL daje 0 wierszy (a nie odlozone zadania jako zwykle)
select is_empty(
  $$select 1 from public.today_list(null)$$,
  'today_list(NULL) zwraca 0 wierszy');

-- RLS: dane b1 niewidoczne dla a1
select is_empty(
  $$select 1 from public.today_list('2026-10-15')
    where project_id = '10000000-0000-0000-0000-000000000016'$$,
  'a1 nie widzi danych b1');

-- ---------------------------------------------------------------------------
-- Rola anon: brak uprawnienia do wykonania
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '';

select throws_ok(
  $$select * from public.today_list('2026-10-15')$$,
  '42501', null, 'anon nie wywola today_list');

reset role;

select * from finish();
rollback;
