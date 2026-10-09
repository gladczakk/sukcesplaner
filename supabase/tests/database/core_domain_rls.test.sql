-- Testy RLS domenowego schematu (projects / milestones / tasks).
-- Dane bazowe wstawiamy jako postgres (RLS omijane), potem przelaczamy role
-- (set local role) i ustawiamy kontekst JWT, z ktorego czyta auth.uid().
begin;

create extension if not exists pgtap with schema extensions;

select plan(61);

-- Uzytkownicy testowi
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'b@example.test');

-- Dane bazowe (jako postgres): po jednym projekcie, milestonie i zadaniu na uzytkownika
insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Projekt A', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'Projekt B', 'sport', '2026-12-31');

insert into public.milestones (id, user_id, project_id, name, due_date)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'Milestone A', '2026-11-01'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'Milestone B', '2026-11-01');

insert into public.tasks (id, user_id, milestone_id, title)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'Zadanie A'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', 'Zadanie B');

-- ---------------------------------------------------------------------------
-- Struktura: RLS wlaczone, cztery polityki dla authenticated na tabele
-- ---------------------------------------------------------------------------

select is(
  (select relrowsecurity from pg_class where oid = 'public.projects'::regclass),
  true, 'RLS wlaczone na projects');
select is(
  (select relrowsecurity from pg_class where oid = 'public.milestones'::regclass),
  true, 'RLS wlaczone na milestones');
select is(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  true, 'RLS wlaczone na tasks');

select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'projects' and roles = '{authenticated}'),
  4::bigint, 'projects ma cztery polityki dla authenticated');
select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'milestones' and roles = '{authenticated}'),
  4::bigint, 'milestones ma cztery polityki dla authenticated');
select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and roles = '{authenticated}'),
  4::bigint, 'tasks ma cztery polityki dla authenticated');

-- ---------------------------------------------------------------------------
-- Uzytkownik A: izolacja od danych B
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(auth.uid(), '00000000-0000-0000-0000-0000000000a1'::uuid, 'auth.uid() zwraca id uzytkownika A');

-- A widzi wylacznie wlasne rekordy
select is((select count(*) from public.projects), 1::bigint, 'A widzi tylko wlasny projekt');
select is((select count(*) from public.milestones), 1::bigint, 'A widzi tylko wlasny milestone');
select is((select count(*) from public.tasks), 1::bigint, 'A widzi tylko wlasne zadanie');

-- A nie widzi rekordow B
select is_empty(
  $$select 1 from public.projects where id = '10000000-0000-0000-0000-000000000002'$$,
  'A nie widzi projektu B');
select is_empty(
  $$select 1 from public.milestones where id = '20000000-0000-0000-0000-000000000002'$$,
  'A nie widzi milestona B');
select is_empty(
  $$select 1 from public.tasks where id = '30000000-0000-0000-0000-000000000002'$$,
  'A nie widzi zadania B');

-- A nie edytuje rekordow B (0 wierszy dotknietych, brak bledu)
select lives_ok(
  $$update public.projects set name = 'przejety' where id = '10000000-0000-0000-0000-000000000002'$$,
  'update projektu B przez A nie zglasza bledu (0 wierszy)');
select lives_ok(
  $$update public.milestones set name = 'przejety' where id = '20000000-0000-0000-0000-000000000002'$$,
  'update milestona B przez A nie zglasza bledu (0 wierszy)');
select lives_ok(
  $$update public.tasks set title = 'przejete' where id = '30000000-0000-0000-0000-000000000002'$$,
  'update zadania B przez A nie zglasza bledu (0 wierszy)');

-- A nie usuwa rekordow B (0 wierszy dotknietych, brak bledu)
select lives_ok(
  $$delete from public.tasks where id = '30000000-0000-0000-0000-000000000002'$$,
  'delete zadania B przez A nie zglasza bledu (0 wierszy)');
select lives_ok(
  $$delete from public.milestones where id = '20000000-0000-0000-0000-000000000002'$$,
  'delete milestona B przez A nie zglasza bledu (0 wierszy)');
select lives_ok(
  $$delete from public.projects where id = '10000000-0000-0000-0000-000000000002'$$,
  'delete projektu B przez A nie zglasza bledu (0 wierszy)');

-- Weryfikacja jako wlasciciel danych (postgres): rekordy B nietkniete
reset role;

select is(
  (select name from public.projects where id = '10000000-0000-0000-0000-000000000002'),
  'Projekt B', 'projekt B nietkniety po probach A');
select is(
  (select name from public.milestones where id = '20000000-0000-0000-0000-000000000002'),
  'Milestone B', 'milestone B nietkniety po probach A');
select is(
  (select title from public.tasks where id = '30000000-0000-0000-0000-000000000002'),
  'Zadanie B', 'zadanie B nietkniete po probach A');

set local role authenticated;

-- A nie wstawi wiersza z user_id B (naruszenie polityki RLS)
select throws_ok(
  $$insert into public.projects (user_id, name, life_area, due_date)
    values ('00000000-0000-0000-0000-0000000000b1', 'podszywka', 'dom', '2026-12-31')$$,
  '42501', null, 'A nie wstawi projektu z user_id B');
select throws_ok(
  $$insert into public.milestones (user_id, project_id, name, due_date)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'podszywka', '2026-11-01')$$,
  '42501', null, 'A nie wstawi milestona z user_id B');
select throws_ok(
  $$insert into public.tasks (user_id, milestone_id, title)
    values ('00000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', 'podszywka')$$,
  '42501', null, 'A nie wstawi zadania z user_id B');

-- Pozytywna kontrola: A wstawia wlasne rekordy (user_id z domyslnego auth.uid())
select lives_ok(
  $$insert into public.projects (id, name, life_area, due_date)
    values ('10000000-0000-0000-0000-000000000003', 'Projekt A2', 'dom', '2026-12-31')$$,
  'A wstawia wlasny projekt');
select lives_ok(
  $$insert into public.milestones (id, project_id, name, due_date)
    values ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Milestone A2', '2026-11-02')$$,
  'A wstawia wlasny milestone');
select lives_ok(
  $$insert into public.tasks (id, milestone_id, title)
    values ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Zadanie A2')$$,
  'A wstawia wlasne zadanie');

-- Pozytywna kontrola: A edytuje wlasne rekordy i widzi zmiane
select lives_ok(
  $$update public.projects set name = 'Zmieniony A' where id = '10000000-0000-0000-0000-000000000001'$$,
  'A edytuje wlasny projekt');
select is(
  (select name from public.projects where id = '10000000-0000-0000-0000-000000000001'),
  'Zmieniony A', 'zmiana wlasnego projektu widoczna dla A');
select lives_ok(
  $$update public.milestones set name = 'Zmieniony A' where id = '20000000-0000-0000-0000-000000000001'$$,
  'A edytuje wlasny milestone');
select is(
  (select name from public.milestones where id = '20000000-0000-0000-0000-000000000001'),
  'Zmieniony A', 'zmiana wlasnego milestona widoczna dla A');
select lives_ok(
  $$update public.tasks set title = 'Zmienione A' where id = '30000000-0000-0000-0000-000000000001'$$,
  'A edytuje wlasne zadanie');
select is(
  (select title from public.tasks where id = '30000000-0000-0000-0000-000000000001'),
  'Zmienione A', 'zmiana wlasnego zadania widoczna dla A');

-- A nie przepnie wlasnego wiersza na user_id B (WITH CHECK)
select throws_ok(
  $$update public.projects set user_id = '00000000-0000-0000-0000-0000000000b1'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A nie przepnie wlasnego projektu na user_id B');
select throws_ok(
  $$update public.milestones set user_id = '00000000-0000-0000-0000-0000000000b1'
    where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A nie przepnie wlasnego milestona na user_id B');
select throws_ok(
  $$update public.tasks set user_id = '00000000-0000-0000-0000-0000000000b1'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'A nie przepnie wlasnego zadania na user_id B');

-- A nie podepnie wlasnych rekordow pod rodzica B (zlozony FK)
select throws_ok(
  $$insert into public.milestones (user_id, project_id, name, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', 'pod projekt B', '2026-11-01')$$,
  '23503', null, 'A nie podepnie nowego milestona pod projekt B');
select throws_ok(
  $$insert into public.tasks (user_id, milestone_id, title)
    values ('00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 'pod milestone B')$$,
  '23503', null, 'A nie podepnie nowego zadania pod milestone B');
select throws_ok(
  $$update public.milestones set project_id = '10000000-0000-0000-0000-000000000002'
    where id = '20000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'A nie przepnie wlasnego milestona pod projekt B');

-- Pozytywna kontrola: A usuwa wlasne rekordy (od lisci do korzenia)
select lives_ok(
  $$delete from public.tasks where id = '30000000-0000-0000-0000-000000000003'$$,
  'A usuwa wlasne zadanie');
select is(
  (select count(*) from public.tasks where id = '30000000-0000-0000-0000-000000000003'),
  0::bigint, 'wlasne zadanie A usuniete');
select lives_ok(
  $$delete from public.milestones where id = '20000000-0000-0000-0000-000000000003'$$,
  'A usuwa wlasny milestone');
select is(
  (select count(*) from public.milestones where id = '20000000-0000-0000-0000-000000000003'),
  0::bigint, 'wlasny milestone A usuniety');
select lives_ok(
  $$delete from public.projects where id = '10000000-0000-0000-0000-000000000003'$$,
  'A usuwa wlasny projekt');
select is(
  (select count(*) from public.projects where id = '10000000-0000-0000-0000-000000000003'),
  0::bigint, 'wlasny projekt A usuniety');

-- ---------------------------------------------------------------------------
-- Rola anon: brak uprawnien tabelarycznych
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '';

select throws_ok($$select * from public.projects$$, '42501', null, 'anon nie czyta projects');
select throws_ok($$select * from public.milestones$$, '42501', null, 'anon nie czyta milestones');
select throws_ok($$select * from public.tasks$$, '42501', null, 'anon nie czyta tasks');

select throws_ok(
  $$insert into public.projects (user_id, name, life_area, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', 'anon', 'dom', '2026-12-31')$$,
  '42501', null, 'anon nie wstawia do projects');
select throws_ok(
  $$insert into public.milestones (user_id, project_id, name, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'anon', '2026-11-01')$$,
  '42501', null, 'anon nie wstawia do milestones');
select throws_ok(
  $$insert into public.tasks (user_id, milestone_id, title)
    values ('00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'anon')$$,
  '42501', null, 'anon nie wstawia do tasks');

select throws_ok(
  $$update public.projects set name = 'anon' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon nie edytuje projects');
select throws_ok(
  $$update public.milestones set name = 'anon' where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon nie edytuje milestones');
select throws_ok(
  $$update public.tasks set title = 'anon' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon nie edytuje tasks');

select throws_ok(
  $$delete from public.projects where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon nie usuwa z projects');
select throws_ok(
  $$delete from public.milestones where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon nie usuwa z milestones');
select throws_ok(
  $$delete from public.tasks where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon nie usuwa z tasks');

reset role;

-- Uprawnienia tabelaryczne authenticated: bez TRUNCATE (omija RLS)
select ok(not has_table_privilege('authenticated', 'public.projects', 'TRUNCATE'), 'authenticated nie ma TRUNCATE na projects');
select ok(not has_table_privilege('authenticated', 'public.milestones', 'TRUNCATE'), 'authenticated nie ma TRUNCATE na milestones');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'TRUNCATE'), 'authenticated nie ma TRUNCATE na tasks');

select * from finish();
rollback;
