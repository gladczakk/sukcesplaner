-- Testy funkcji public.today_list(p_today) (S-04) w wielu dniach: lista nie moze zalezec od dnia
-- w sposob, ktory gubi zadania (FR-009), kolejnosc ma byc stala (FR-010), a wynik nie moze zalezec
-- od strefy czasowej sesji. Wyrocznia to regula z PRD, a oczekiwane listy tytulow sa wpisane recznie.
-- Jeden zestaw danych, zapytania w roli authenticated (JWT) dla zakresu dni 2026-10-01 .. 2027-01-31
-- (zawiera date milestona 2026-10-25, dzien po niej i dalsze dni po terminie). Zakres dni generujemy
-- jednym wspolnym zapytaniem (bez asercji na kazdy dzien). created_at ustawiamy jawnie tam, gdzie
-- liczy sie kolejnosc (now() jest stale w obrebie transakcji).
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'd@example.test');

-- Projekty: A (zadania, milestone po terminie od 2026-10-26), B (milestone z samymi zadaniami done),
-- C (zamkniety i otwarty milestone), E (zadania z terminami i bez terminu)
insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'PA dni', 'praca', '2027-06-30'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'PB done', 'dom', '2027-06-30'),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', 'PC zamkniety', 'sport', '2027-06-30'),
  ('40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000d1', 'PE kolejnosc', 'praca', '2027-06-30');

insert into public.milestones (id, user_id, project_id, name, due_date, completed_at)
values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-000000000001', 'mA1', '2026-10-25', null),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-000000000001', 'mA2 pozniejszy', '2026-11-30', null),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-000000000002', 'mB1', '2026-11-15', null),
  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-000000000003', 'mC1', '2026-10-05', '2026-10-05 10:00:00+00'),
  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-000000000003', 'mC2', '2026-11-01', null),
  ('50000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-000000000005', 'mE1', '2026-12-20', null);

insert into public.tasks (id, user_id, milestone_id, title, due_date, status, deferred_until, created_at)
values
  -- PA / mA1 (2026-10-25): termin zadania do daty milestona; a-odlozone przeniesione na 2026-10-20
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000001', 'a-pozno', '2026-10-25', 'todo', null, '2026-10-01 10:00:00+00'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000001', 'a-wczesnie', '2026-10-10', 'todo', null, '2026-10-01 10:00:00+00'),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000001', 'a-bez-terminu', null, 'todo', null, '2026-10-01 08:00:00+00'),
  ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000001', 'a-odlozone', null, 'todo', '2026-10-20', '2026-10-01 09:00:00+00'),
  ('60000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000001', 'a-partial', '2026-10-15', 'partial', null, '2026-10-01 10:00:00+00'),
  -- PA / mA2: nie jest najblizszy, dopoki mA1 jest otwarty
  ('60000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000002', 'a2-pozniejsze', null, 'todo', null, '2026-10-01 10:00:00+00'),
  -- PB / mB1: wszystkie zadania done
  ('60000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000003', 'b-done-1', null, 'done', null, '2026-10-01 10:00:00+00'),
  ('60000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000003', 'b-done-2', '2026-10-10', 'done', null, '2026-10-01 10:00:00+00'),
  -- PC: zamkniety mC1 (zadanie done), otwarty mC2
  ('60000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000004', 'c-zamkniete-done', '2026-10-04', 'done', null, '2026-10-01 10:00:00+00'),
  ('60000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000005', 'c-otwarte', null, 'todo', null, '2026-10-01 10:00:00+00'),
  -- PE / mE1 (2026-12-20)
  ('60000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000006', 'e-20-grudnia', '2026-12-20', 'todo', null, '2026-10-01 10:00:00+00'),
  ('60000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000006', 'e-bez-terminu', null, 'todo', null, '2026-10-01 10:00:00+00'),
  ('60000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000006', 'e-5-grudnia', '2026-12-05', 'todo', null, '2026-10-01 10:00:00+00'),
  ('60000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-000000000006', 'e-12-grudnia', '2026-12-12', 'todo', null, '2026-10-01 10:00:00+00');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

-- Straznik: zakres dni nie jest pusty - w kazdym dniu zakresu lista ma wiersze (inaczej testy
-- "zadanie nie znika" przechodzilyby na pustym wyniku)
select is(
  (select count(*)
   from generate_series(timestamp '2026-10-01', timestamp '2027-01-31', interval '1 day') g(d)
   where not exists (select 1 from public.today_list(g.d::date))),
  0::bigint,
  'kazdy dzien zakresu 2026-10-01 .. 2027-01-31 ma niepusta liste');

-- #1: niedokonczone zadanie najblizszego milestona nie znika w zadnym dniu zakresu (takze w dniu
-- terminu milestona 2026-10-25, po nim i dla zadania przeniesionego); liczymy pary (dzien, zadanie)
-- bez wiersza w wyniku
select is(
  (select count(*)
   from generate_series(timestamp '2026-10-01', timestamp '2027-01-31', interval '1 day') g(d)
   cross join lateral (
     select coalesce(array_agg(l.task_id), '{}') as ids from public.today_list(g.d::date) l
   ) listed
   cross join public.tasks t
   where t.title in (
       'a-pozno', 'a-wczesnie', 'a-bez-terminu', 'a-odlozone', 'a-partial',
       'c-otwarte', 'e-20-grudnia', 'e-bez-terminu', 'e-5-grudnia', 'e-12-grudnia')
     and not (t.id = any (listed.ids))),
  0::bigint,
  'niedokonczone zadania najblizszych milestonow sa na liscie w kazdym dniu zakresu');

-- Zadanie przeniesione na 2026-10-20 (D = 2026-10-19): deferred w dniach <= D, task w dniach >= D+1
select is(
  (select count(*)
   from generate_series(timestamp '2026-10-01', timestamp '2026-10-19', interval '1 day') g(d)
   cross join lateral public.today_list(g.d::date) l
   where l.task_title = 'a-odlozone' and l.kind <> 'deferred'),
  0::bigint,
  'zadanie przeniesione: kind deferred w kazdym dniu <= D');

select is(
  (select count(*)
   from generate_series(timestamp '2026-10-20', timestamp '2027-01-31', interval '1 day') g(d)
   cross join lateral public.today_list(g.d::date) l
   where l.task_title = 'a-odlozone' and l.kind <> 'task'),
  0::bigint,
  'zadanie przeniesione: kind task w kazdym dniu >= D+1');

select results_eq(
  $$select g.d::date, l.kind
    from generate_series(timestamp '2026-10-19', timestamp '2026-10-21', interval '1 day') g(d)
    cross join lateral public.today_list(g.d::date) l
    where l.task_title = 'a-odlozone'
    order by 1$$,
  $$values
    ('2026-10-19'::date, 'deferred'),
    ('2026-10-20'::date, 'task'),
    ('2026-10-21'::date, 'task')$$,
  'zadanie przeniesione na D+1: deferred w D, task w D+1 i D+2');

-- Milestone z samymi zadaniami done jest wierszem milestone w kazdym dniu do zamkniecia
select is(
  (select count(*)
   from generate_series(timestamp '2026-10-01', timestamp '2027-01-31', interval '1 day') g(d)
   where not exists (
     select 1 from public.today_list(g.d::date) l
     where l.kind = 'milestone' and l.milestone_name = 'mB1')),
  0::bigint,
  'milestone z samymi zadaniami done jest wierszem milestone w kazdym dniu zakresu');

-- Po zamknieciu milestona najblizszy jest nastepny otwarty - niezaleznie od dnia
select is(
  (select count(*)
   from generate_series(timestamp '2026-10-01', timestamp '2027-01-31', interval '1 day') g(d)
   cross join lateral (
     select count(*) as n, count(*) filter (where l.milestone_name <> 'mC2') as obcy
     from public.today_list(g.d::date) l
     where l.project_id = '40000000-0000-0000-0000-000000000003'
   ) c
   where c.n = 0 or c.obcy > 0),
  0::bigint,
  'zamkniety milestone pomijany: w kazdym dniu najblizszy to nastepny otwarty (mC2)');

-- #2: kolejnosc wg FR-010 (termin rosnaco, bez terminu na koncu, ale widoczne) jest taka sama
-- w dwoch roznych dniach; dla zadan bez terminu rozstrzyga data milestona i created_at.
-- Oczekiwana lista wpisana recznie.
select results_eq(
  $$select g.d::date,
           (select string_agg(l.task_title, ', ' order by l.ord)
            from (select x.task_title, row_number() over () as ord
                  from public.today_list(g.d::date) x
                  where x.kind = 'task'
                    and x.project_id in (
                      '40000000-0000-0000-0000-000000000001',
                      '40000000-0000-0000-0000-000000000003',
                      '40000000-0000-0000-0000-000000000005')) l)
    from generate_series(timestamp '2026-10-26', timestamp '2026-10-29', interval '3 day') g(d)
    order by 1$$,
  $$values
    ('2026-10-26'::date, 'a-wczesnie, a-partial, a-pozno, e-5-grudnia, e-12-grudnia, e-20-grudnia, a-bez-terminu, a-odlozone, c-otwarte, e-bez-terminu'),
    ('2026-10-29'::date, 'a-wczesnie, a-partial, a-pozno, e-5-grudnia, e-12-grudnia, e-20-grudnia, a-bez-terminu, a-odlozone, c-otwarte, e-bez-terminu')$$,
  'kolejnosc zadan wg FR-010 jest taka sama w dniach D i D+3, bez terminu na koncu');

-- #3: wynik nie zalezy od strefy czasowej sesji (stala data p_today = 2026-10-19: wszystkie rodzaje wierszy)
set local timezone = 'Pacific/Kiritimati';

select results_eq(
  $$select kind, coalesce(task_title, milestone_name)
    from public.today_list('2026-10-19')
    where project_id in (
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000003',
      '40000000-0000-0000-0000-000000000005')$$,
  $$values
    ('task', 'a-wczesnie'),
    ('task', 'a-partial'),
    ('task', 'a-pozno'),
    ('task', 'e-5-grudnia'),
    ('task', 'e-12-grudnia'),
    ('task', 'e-20-grudnia'),
    ('task', 'a-bez-terminu'),
    ('task', 'c-otwarte'),
    ('task', 'e-bez-terminu'),
    ('milestone', 'mB1'),
    ('deferred', 'a-odlozone')$$,
  'strefa Pacific/Kiritimati (UTC+14): wynik dla stalego p_today bez zmian');

set local timezone = 'Etc/GMT+12';

select results_eq(
  $$select kind, coalesce(task_title, milestone_name)
    from public.today_list('2026-10-19')
    where project_id in (
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000003',
      '40000000-0000-0000-0000-000000000005')$$,
  $$values
    ('task', 'a-wczesnie'),
    ('task', 'a-partial'),
    ('task', 'a-pozno'),
    ('task', 'e-5-grudnia'),
    ('task', 'e-12-grudnia'),
    ('task', 'e-20-grudnia'),
    ('task', 'a-bez-terminu'),
    ('task', 'c-otwarte'),
    ('task', 'e-bez-terminu'),
    ('milestone', 'mB1'),
    ('deferred', 'a-odlozone')$$,
  'strefa Etc/GMT+12 (UTC-12): wynik dla stalego p_today bez zmian');

-- Straznik strukturalny: uzupelnia testy stref czasowych - zrodlo funkcji nie zawiera zegara
-- (current_date, now(), current_timestamp), wiec "dzis" pochodzi wylacznie z parametru
select ok(
  (select prosrc !~* '(current_date|now\s*\(\s*\)|current_timestamp)'
   from pg_proc
   where oid = 'public.today_list(date)'::regprocedure),
  'zrodlo today_list(date) nie uzywa current_date, now() ani current_timestamp');

reset role;

select * from finish();
rollback;
