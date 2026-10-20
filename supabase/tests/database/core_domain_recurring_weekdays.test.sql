-- Testy rytmu w wybrane dni tygodnia (S-08): kolumna recurrence_weekdays, is_recurring, ograniczenia,
-- odhaczenia, reguly zamykania i wiersze 'routine' w public.today_list(p_today).
-- Dane bazowe wstawiamy jako postgres (RLS omijane); reszta dziala w roli authenticated z kontekstem JWT.
-- Daty sa stale: start rutyn 2026-10-21 (sroda), milestone do 2026-10-30 (piatek). Dni ISO: 1 = pn ... 7 = nd.
-- Komunikaty sa kontraktem z serwisami aplikacji (dopasowanie po tekscie).
begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test');

-- Projekty: 1 rytmy i odhaczenia; 2 zamykanie z sama rutyna; 3 blokada zamkniecia; 4 rutyna nad
-- przeterminowanym; 5 przesuniecie daty milestona
insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'P1 dni', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'P2 zamykanie', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'P3 blokada', 'sport', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'P4 przeterminowane', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'P5 przesuniecie', 'dom', '2026-12-31');

insert into public.milestones (id, user_id, project_id, name, due_date)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm1', '2026-10-30'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', 'm2', '2026-10-30'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000003', 'm3', '2026-10-30'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000004', 'm4', '2026-10-30'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000005', 'm5', '2026-10-30');

-- Zadania: 01 sr+pt, 02 tylko czwartek, 03 komplet siedmiu dni, 04 interwal co 2 dni (m1);
-- 05 sr+pt (m2, sama rutyna); 06 sr+pt i 07 zwykle todo (m3); 08 przeterminowane i 09 sr+pt (m4); 10 sr+pt (m5)
insert into public.tasks (id, user_id, milestone_id, title, due_date, recurrence_interval_days, recurrence_weekdays, recurrence_start_date)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'd-sr-pt', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'd-czwartek', null, null, '{4}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'd-komplet', null, null, '{1,2,3,4,5,6,7}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'i-co-2-dni', null, 2, null, '2026-10-21'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 'd-sama', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'd-obok-zwyklego', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'zwykle-todo', null, null, null, null),
  ('30000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000004', 'przeterminowane', '2026-10-10', null, null, null),
  ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000004', 'd-nad-przeterminowanym', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000005', 'd-do-przesuniecia', null, null, '{3,5}', '2026-10-21');

-- ---------------------------------------------------------------------------
-- Struktura (jako postgres)
-- ---------------------------------------------------------------------------

select has_column('public', 'tasks', 'recurrence_weekdays', 'tasks.recurrence_weekdays istnieje');
select has_column('public', 'tasks', 'is_recurring', 'tasks.is_recurring istnieje');
select has_function('public', 'weekdays_valid', array['smallint[]'], 'funkcja weekdays_valid istnieje');

select is(public.weekdays_valid('{1,7}'::smallint[]), true, 'weekdays_valid: poprawna tablica');
select is(public.weekdays_valid('{}'::smallint[]), false, 'weekdays_valid: pusta tablica odrzucona');

-- ---------------------------------------------------------------------------
-- Uzytkownik a1: kwalifikacja na liscie
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

-- Zadanie sr+pt: wystapienia w sr 21 i pt 23, sr 28 i pt 30; brak w pozostale dni, przed startem
-- (sr 14 i wt 20) i po dacie milestona (sr 4.11)
select results_eq(
  $$select d, (select count(*) from public.today_list(d) where task_id = '30000000-0000-0000-0000-000000000001')
    from (values
      ('2026-10-14'::date), ('2026-10-20'::date), ('2026-10-21'::date), ('2026-10-22'::date),
      ('2026-10-23'::date), ('2026-10-24'::date), ('2026-10-25'::date), ('2026-10-26'::date),
      ('2026-10-27'::date), ('2026-10-28'::date), ('2026-10-30'::date), ('2026-10-31'::date),
      ('2026-11-04'::date)) v(d) order by d$$,
  $$values
    ('2026-10-14'::date, 0::bigint), ('2026-10-20'::date, 0::bigint), ('2026-10-21'::date, 1::bigint),
    ('2026-10-22'::date, 0::bigint), ('2026-10-23'::date, 1::bigint), ('2026-10-24'::date, 0::bigint),
    ('2026-10-25'::date, 0::bigint), ('2026-10-26'::date, 0::bigint), ('2026-10-27'::date, 0::bigint),
    ('2026-10-28'::date, 1::bigint), ('2026-10-30'::date, 1::bigint), ('2026-10-31'::date, 0::bigint),
    ('2026-11-04'::date, 0::bigint)$$,
  'sr+pt: wystapienia tylko w srody i piatki od dnia startu do daty milestona (wlacznie)');

-- Jeden dzien: czwartek 22 i 29; w dniu dodania (sr 21) niewybranym brak wystapienia; pt 30 brak
select results_eq(
  $$select d, (select count(*) from public.today_list(d) where task_id = '30000000-0000-0000-0000-000000000002')
    from (values ('2026-10-21'::date), ('2026-10-22'::date), ('2026-10-23'::date), ('2026-10-29'::date), ('2026-10-30'::date))
      v(d) order by d$$,
  $$values
    ('2026-10-21'::date, 0::bigint), ('2026-10-22'::date, 1::bigint), ('2026-10-23'::date, 0::bigint),
    ('2026-10-29'::date, 1::bigint), ('2026-10-30'::date, 0::bigint)$$,
  'jeden dzien tygodnia: tylko ten dzien, dzien dodania niewybrany nie jest wystapieniem');

-- Komplet siedmiu dni: wystapienie codziennie od startu do daty milestona (10 dni), nie przed i nie po
select is(
  (select count(*) from generate_series('2026-10-21'::date, '2026-10-30'::date, interval '1 day') g(d)
    where (select count(*) from public.today_list(g.d::date)
            where task_id = '30000000-0000-0000-0000-000000000003') = 1),
  10::bigint,
  'komplet siedmiu dni daje wystapienie codziennie od startu do daty milestona');

select is(
  (select count(*) from public.today_list('2026-10-20') where task_id = '30000000-0000-0000-0000-000000000003')
    + (select count(*) from public.today_list('2026-10-31') where task_id = '30000000-0000-0000-0000-000000000003'),
  0::bigint,
  'komplet siedmiu dni: brak wystapienia przed startem i po dacie milestona');

select is(
  (select kind from public.today_list('2026-10-21') where task_id = '30000000-0000-0000-0000-000000000001'),
  'routine',
  'wiersz rutyny z dniami ma rodzaj routine (dzien dodania wybrany jest wystapieniem)');

select is(
  (select task_recurrence_weekdays from public.today_list('2026-10-21')
    where task_id = '30000000-0000-0000-0000-000000000001'),
  array[3,5]::smallint[],
  'wiersz routine niesie dni w task_recurrence_weekdays');

select is(
  (select task_recurrence_interval_days from public.today_list('2026-10-21')
    where task_id = '30000000-0000-0000-0000-000000000001'),
  null::smallint,
  'wiersz routine z dniami ma NULL w task_recurrence_interval_days');

-- Regresja interwalu: co 2 dni od 21.10, bez dni w wierszu
select results_eq(
  $$select d, (select count(*) from public.today_list(d) where task_id = '30000000-0000-0000-0000-000000000004')
    from (values ('2026-10-21'::date), ('2026-10-22'::date), ('2026-10-23'::date), ('2026-10-24'::date))
      v(d) order by d$$,
  $$values ('2026-10-21'::date, 1::bigint), ('2026-10-22'::date, 0::bigint),
    ('2026-10-23'::date, 1::bigint), ('2026-10-24'::date, 0::bigint)$$,
  'interwal nadal dziala: co 2 dni od dnia startu');

select results_eq(
  $$select task_recurrence_interval_days, task_recurrence_weekdays from public.today_list('2026-10-21')
    where task_id = '30000000-0000-0000-0000-000000000004'$$,
  $$values (2::smallint, null::smallint[])$$,
  'wiersz routine z interwalem niesie interwal i NULL w dniach');

select results_eq(
  $$select kind, task_recurrence_weekdays from public.today_list('2026-10-21')
    where project_id = '10000000-0000-0000-0000-000000000004' order by kind$$,
  $$values ('routine', array[3,5]::smallint[]), ('task', null::smallint[])$$,
  'wiersz task ma NULL w task_recurrence_weekdays');

select results_eq(
  $$select kind, task_title from public.today_list('2026-10-21')
    where project_id = '10000000-0000-0000-0000-000000000004'$$,
  $$values ('routine', 'd-nad-przeterminowanym'), ('task', 'przeterminowane')$$,
  'rutyna z dniami jest nad zadaniem przeterminowanym');

select results_eq(
  $$select kind, coalesce(task_title, milestone_name) from public.today_list('2026-10-21')
    where project_id = '10000000-0000-0000-0000-000000000002'$$,
  $$values ('routine', 'd-sama'), ('milestone', 'm2')$$,
  'milestone z sama rutyna dni jest wierszem do zamkniecia, rutyna na szczycie');

-- ---------------------------------------------------------------------------
-- Ograniczenia na tasks (milestone m1 do 2026-10-30)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_interval_days, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'oba rytmy', 2, '{3}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_one_rhythm_check"',
  'interwal razem z dniami tygodnia odrzucony');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'pusta tablica', '{}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_weekdays_check"',
  'pusta tablica dni odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'dzien 0', '{0}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_weekdays_check"',
  'dzien 0 odrzucony');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'dzien 8', '{3,8}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_weekdays_check"',
  'dzien 8 odrzucony');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'duplikat', '{3,3}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_weekdays_check"',
  'duplikat dnia odrzucony');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'null w tablicy', array[3, null]::smallint[], '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_weekdays_check"',
  'NULL w tablicy dni odrzucony');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays)
    values ('20000000-0000-0000-0000-000000000001', 'dni bez startu', '{3,5}')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_pair_check"',
  'dni tygodnia bez daty startu odrzucone');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, due_date, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'z terminem', '2026-10-24', '{3,5}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'rutyna z dniami i due_date odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, status, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'done', 'done', '{3,5}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'rutyna z dniami ze statusem done odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, status, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'partial', 'partial', '{3,5}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'rutyna z dniami ze statusem partial odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, deferred_until, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'przeniesiona', '2026-10-22', '{3,5}', '2026-10-21')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'rutyna z dniami i deferred_until odrzucona');

select throws_ok(
  $$update public.tasks set status = 'done' where id = '30000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'zmiana statusu rutyny z dniami na done odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'start po milestonie', '{3}', '2026-10-31')$$,
  '23514',
  'Powtarzanie zadania nie moze zaczac sie (2026-10-31) po dacie milestona (2026-10-30)',
  'start rytmu dni po dacie milestona odrzucony');

select lives_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'poprawne dni', '{1,7}', '2026-10-21')$$,
  'poprawne dni tygodnia przechodza');

select is(
  (select is_recurring from public.tasks where id = '30000000-0000-0000-0000-000000000001'),
  true, 'is_recurring prawdziwe dla zadania z dniami');

select is(
  (select is_recurring from public.tasks where id = '30000000-0000-0000-0000-000000000004'),
  true, 'is_recurring prawdziwe dla zadania z interwalem');

select is(
  (select is_recurring from public.tasks where id = '30000000-0000-0000-0000-000000000007'),
  false, 'is_recurring falszywe dla zwyklego zadania');

-- ---------------------------------------------------------------------------
-- Data milestona a start rutyny z dniami (m5: jedna rutyna, start 2026-10-21)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.milestones set due_date = '2026-10-20'
    where id = '20000000-0000-0000-0000-000000000005'$$,
  '23514',
  'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (1)',
  'data milestona wczesniejsza niz start rutyny z dniami odrzucona');

select lives_ok(
  $$update public.milestones set due_date = '2026-10-21'
    where id = '20000000-0000-0000-0000-000000000005'$$,
  'data milestona rowna startowi rutyny z dniami przechodzi');

-- ---------------------------------------------------------------------------
-- Zamykanie milestona (m2: sama rutyna dni; m3: rutyna dni + zwykle zadanie todo)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000003'$$,
  '23514',
  'Milestone nie moze zostac zamkniety: niezrobione zadania (1)',
  'zamkniecie z niezrobionym zadaniem niepowtarzalnym nadal blokowane (rutyna dni sie nie liczy)');

select lives_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000002'$$,
  'zamkniecie milestona z sama rutyna dni przechodzi');

select is_empty(
  $$select 1 from public.today_list('2026-10-21')
    where project_id = '10000000-0000-0000-0000-000000000002'$$,
  'zamkniety milestone ukrywa rutyne z dniami');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_weekdays, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000002', 'rutyna do zamknietego', '{3,5}', '2026-10-21')$$,
  '23514',
  'Zamkniety milestone nie moze miec niezrobionych zadan',
  'wstawienie rutyny z dniami do zamknietego milestona odrzucone');

select lives_ok(
  $$update public.tasks set recurrence_weekdays = '{3,5,6}'
    where id = '30000000-0000-0000-0000-000000000005'$$,
  'aktualizacja rutyny z dniami w zamknietym milestonie (bez zmiany milestona) przechodzi');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000005', '2026-10-23')$$,
  '23514',
  'Wystapienie nie moze dotyczyc zamknietego milestona',
  'odhaczenie rutyny z dniami w zamknietym milestonie odrzucone');

-- ---------------------------------------------------------------------------
-- Odhaczenia wystapien (t01: sr+pt od 2026-10-21, m1 do 2026-10-30)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000001', '2026-10-21')$$,
  'odhaczenie wybranego dnia przechodzi');

select is_empty(
  $$select 1 from public.today_list('2026-10-21') where task_id = '30000000-0000-0000-0000-000000000001'$$,
  'odhaczenie wybranego dnia ukrywa wystapienie');

select is(
  (select count(*) from public.today_list('2026-10-23') where task_id = '30000000-0000-0000-0000-000000000001'),
  1::bigint,
  'nastepny wybrany dzien po odhaczeniu wraca');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000001', '2026-10-22')$$,
  '23514',
  'Wystapienie (2026-10-22) nie pasuje do rytmu zadania',
  'odhaczenie niewybranego dnia (czwartek) odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000001', '2026-11-04')$$,
  '23514',
  'Wystapienie (2026-11-04) wykracza poza zakres powtarzania zadania (2026-10-21 - 2026-10-30)',
  'odhaczenie dnia po dacie milestona odrzucone (nawet wybranego dnia tygodnia)');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000001', '2026-10-14')$$,
  '23514',
  'Wystapienie (2026-10-14) wykracza poza zakres powtarzania zadania (2026-10-21 - 2026-10-30)',
  'odhaczenie wybranego dnia przed startem odrzucone');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000001', '2026-10-30')$$,
  'odhaczenie ostatniego dnia rownego dacie milestona przechodzi');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000003', '2026-10-25')$$,
  'komplet siedmiu dni: odhaczenie niedzieli przechodzi');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000007', '2026-10-21')$$,
  '23514',
  'Wystapienie dotyczy zadania, ktore nie jest powtarzalne',
  'odhaczenie zadania niepowtarzalnego odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000004', '2026-10-22')$$,
  '23514',
  'Wystapienie (2026-10-22) nie pasuje do rytmu zadania',
  'interwal nadal odrzuca niepasujacy dzien');

select lives_ok(
  $$delete from public.task_occurrences
    where task_id = '30000000-0000-0000-0000-000000000001' and occurrence_date = '2026-10-21'$$,
  'usuniecie odhaczenia przechodzi');

select is(
  (select count(*) from public.today_list('2026-10-21') where task_id = '30000000-0000-0000-0000-000000000001'),
  1::bigint,
  'po usunieciu odhaczenia wystapienie wraca na liste');

reset role;

select * from finish();
rollback;
