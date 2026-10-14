-- Testy reguly zamykania milestona (trigger milestones_check_closable).
-- Dane bazowe wstawiamy jako postgres (RLS omijane); przypadki RLS przelaczaja role
-- (set local role) i ustawiaja kontekst JWT, z ktorego czyta auth.uid().
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- Uzytkownicy testowi
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test');

insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Projekt A', 'praca', '2026-12-31');

-- m1: jedno zadanie todo; m2: todo + partial; m3: jedno zadanie todo (zrobimy je w tescie);
-- m4: bez zadan; m5/m6: juz zamkniete (insert nie uruchamia triggera na update);
-- m7: zadanie todo (przypadek RLS); m8: bez zadan (przypadek RLS)
insert into public.milestones (id, user_id, project_id, name, due_date, completed_at)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm1', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm2', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm3', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm4', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm5', '2026-11-01', '2026-10-01 10:00:00+00'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm6', '2026-11-01', '2026-10-01 10:00:00+00'),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm7', '2026-11-01', null),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm8', '2026-11-01', null);

-- Zadania (m5 i m6 dostaja otwarte zadanie dodane po zamknieciu)
insert into public.tasks (id, user_id, milestone_id, title, status)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 't1', 'todo'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 't2a', 'todo'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 't2b', 'partial'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 't3', 'todo'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000005', 't5', 'todo'),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000006', 't6', 'todo'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000007', 't7', 'todo');

-- Struktura
select has_trigger('public', 'milestones', 'milestones_check_closable', 'trigger milestones_check_closable istnieje');

-- Zamkniecie odrzucone (komunikat jest kontraktem z aplikacja)
select throws_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  'Milestone nie moze zostac zamkniety: niezrobione zadania (1)',
  'zamkniecie milestona z zadaniem todo odrzucone');

select throws_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000002'$$,
  '23514',
  'Milestone nie moze zostac zamkniety: niezrobione zadania (2)',
  'zadanie partial tez liczy sie jako otwarte (todo + partial = 2)');

-- Zamkniecie dozwolone
select lives_ok(
  $$update public.tasks set status = 'done'
    where id = '30000000-0000-0000-0000-000000000004'$$,
  'zadanie milestona m3 ustawione na done');

select lives_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000003'$$,
  'milestone ze wszystkimi zadaniami done zamkniety');

select ok(
  (select completed_at is not null from public.milestones where id = '20000000-0000-0000-0000-000000000003'),
  'milestone m3 ma completed_at po zamknieciu');

select lives_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000004'$$,
  'milestone bez zadan zamkniety');

-- Ponowne otwarcie z otwartym zadaniem (dodanym po zamknieciu) przechodzi
select lives_ok(
  $$update public.milestones set completed_at = null
    where id = '20000000-0000-0000-0000-000000000005'$$,
  'ponowne otwarcie zamknietego milestona z otwartym zadaniem przechodzi');

select ok(
  (select completed_at is null from public.milestones where id = '20000000-0000-0000-0000-000000000005'),
  'milestone m5 ma completed_at NULL po ponownym otwarciu');

-- Zmiana nazwy zamknietego milestona z otwartym zadaniem przechodzi
select lives_ok(
  $$update public.milestones set name = 'm6 zmieniony'
    where id = '20000000-0000-0000-0000-000000000006'$$,
  'zmiana nazwy zamknietego milestona z otwartym zadaniem przechodzi');

select is(
  (select name from public.milestones where id = '20000000-0000-0000-0000-000000000006'),
  'm6 zmieniony',
  'nazwa zamknietego milestona m6 zmieniona');

-- ---------------------------------------------------------------------------
-- Regula dziala takze w kontekscie roli authenticated (z RLS)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000007'$$,
  '23514',
  'Milestone nie moze zostac zamkniety: niezrobione zadania (1)',
  'authenticated: zamkniecie wlasnego milestona z otwartym zadaniem odrzucone');

select lives_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000008'$$,
  'authenticated: zamkniecie wlasnego milestona bez otwartych zadan przechodzi');

reset role;

select * from finish();
rollback;
