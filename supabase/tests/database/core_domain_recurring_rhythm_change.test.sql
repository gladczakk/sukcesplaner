-- Testy sprzatania przeniesien po zmianie rytmu zadania powtarzalnego (S-10): wyzwalacz tasks_rhythm_change_cleanup
-- usuwa wiersze 'moved' od nowej daty startu wzwyz (zrodlo albo dzien docelowy), zostawia 'done' i przeniesienia
-- sprzed startu; po zmianie rytmu z data startu = dzis today_list nie zwraca "pominietego" z wczoraj.
-- Dane wstawiamy i zmieniamy jako postgres (RLS omijane); wyzwalacze dzialaja. Daty sa stale: start rutyn
-- 2026-10-21 (sroda), milestone do 2026-10-30, zmiana rytmu "dzis" = 2026-10-23 (piatek). Dni ISO: 1 = pn ... 7 = nd.
-- Rytm i data startu zmieniaja sie zawsze w jednym UPDATE (ograniczenia sprawdzaja koncowy wiersz).
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test');

insert into public.projects (id, user_id, name, life_area, due_date)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'P1 zmiana rytmu', 'praca', '2026-12-31');

insert into public.milestones (id, user_id, project_id, name, due_date)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm1', '2026-10-30');

-- Zadania (m1): A sr+pt (zmiana dni tygodnia), B sr+pt (przeniesienie ze zrodlem przed startem, cel po starcie),
-- C interwal co 2 dni (zmiana typu rytmu), D sr+pt (tytul i niezmieniony rytm), E sr+pt (zerowanie rytmu).
insert into public.tasks (id, user_id, milestone_id, title, due_date, recurrence_interval_days, recurrence_weekdays, recurrence_start_date)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'a-dni-tygodnia', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'b-cel-po-starcie', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'c-interwal-na-dni', null, 2, null, '2026-10-21'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'd-bez-zmiany-rytmu', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'e-zerowanie', null, null, '{3,5}', '2026-10-21');

-- Wiersze wystapien (jako postgres):
-- A: moved sroda 21 -> czwartek 22 (przed startem), done piatek 23, moved sroda 28 -> czwartek 29 (po starcie);
-- B: moved sroda 21 -> sobota 24 (zrodlo przed startem, cel po starcie);
-- C: moved 21 -> 22 (przed startem), moved 23 -> 24 (po starcie), rytm co 2 dni: 21, 23, 25, ...;
-- D, E: moved piatek 23 -> sobota 24.
insert into public.task_occurrences (task_id, user_id, occurrence_date, state, moved_to)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '2026-10-21', 'moved', '2026-10-22'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '2026-10-23', 'done', null),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '2026-10-28', 'moved', '2026-10-29'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '2026-10-21', 'moved', '2026-10-24'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '2026-10-21', 'moved', '2026-10-22'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '2026-10-23', 'moved', '2026-10-24'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '2026-10-23', 'moved', '2026-10-24'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '2026-10-23', 'moved', '2026-10-24');

select has_trigger('public', 'tasks', 'tasks_rhythm_change_cleanup', 'wyzwalacz tasks_rhythm_change_cleanup istnieje');

-- ---------------------------------------------------------------------------
-- A: zmiana dni tygodnia i nowa data startu 2026-10-23
-- ---------------------------------------------------------------------------

-- Przed zmiana: czwartek 22 jest dniem docelowym przeniesienia bez wiersza, wiec w piatek jest pominiety
-- (piatkowe wystapienie jest odhaczone, wiec nie ma wiersza routine).
select results_eq(
  $$select kind from public.today_list('2026-10-23') where task_id = '30000000-0000-0000-0000-000000000001'$$,
  $$values ('skipped')$$,
  'przed zmiana rytmu: w piatek wiersz skipped dla czwartku');

select lives_ok(
  $$update public.tasks set recurrence_weekdays = '{1,5}', recurrence_start_date = '2026-10-23'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  'zmiana dni tygodnia z nowa data startu przyjeta');

select results_eq(
  $$select occurrence_date, state from public.task_occurrences
    where task_id = '30000000-0000-0000-0000-000000000001' order by occurrence_date$$,
  $$values ('2026-10-21'::date, 'moved'), ('2026-10-23'::date, 'done')$$,
  'A: przeniesienie sprzed startu i done na dniu granicznym zostaja, przyszle przeniesienie usuniete');

select is_empty(
  $$select 1 from public.today_list('2026-10-23') where task_id = '30000000-0000-0000-0000-000000000001'$$,
  'po zmianie rytmu w piatek brak wiersza skipped (wczoraj przed startem) ani routine (done)');

-- ---------------------------------------------------------------------------
-- B: zrodlo przed startem, dzien docelowy od startu wzwyz (warunek moved_to)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set recurrence_weekdays = '{1,5}', recurrence_start_date = '2026-10-23'
    where id = '30000000-0000-0000-0000-000000000002'$$,
  'B: zmiana dni tygodnia przyjeta');

select is_empty(
  $$select 1 from public.task_occurrences where task_id = '30000000-0000-0000-0000-000000000002'$$,
  'B: przeniesienie ze zrodlem przed startem i dniem docelowym od startu usuniete');

-- ---------------------------------------------------------------------------
-- C: zmiana typu rytmu interwal -> dni tygodnia
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set recurrence_interval_days = null, recurrence_weekdays = '{1,5}',
      recurrence_start_date = '2026-10-23'
    where id = '30000000-0000-0000-0000-000000000003'$$,
  'C: zmiana typu rytmu interwal na dni tygodnia przyjeta');

select results_eq(
  $$select occurrence_date, state from public.task_occurrences
    where task_id = '30000000-0000-0000-0000-000000000003' order by occurrence_date$$,
  $$values ('2026-10-21'::date, 'moved')$$,
  'C: zmiana typu rytmu sprzata tak samo (zostaje tylko przeniesienie sprzed startu)');

-- ---------------------------------------------------------------------------
-- D: tytul i niezmieniony rytm nie usuwaja przeniesien
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set title = 'd-nowy-tytul' where id = '30000000-0000-0000-0000-000000000004'$$,
  'D: zmiana samego tytulu przyjeta');

select is(
  (select count(*) from public.task_occurrences where task_id = '30000000-0000-0000-0000-000000000004'),
  1::bigint,
  'D: zmiana tytulu nie usuwa przeniesienia');

select lives_ok(
  $$update public.tasks set recurrence_weekdays = '{3,5}', recurrence_start_date = '2026-10-22'
    where id = '30000000-0000-0000-0000-000000000004'$$,
  'D: niezmieniony rytm z nowa data startu przyjety');

select is(
  (select count(*) from public.task_occurrences where task_id = '30000000-0000-0000-0000-000000000004'),
  1::bigint,
  'D: niezmieniony rytm nie usuwa przeniesienia');

-- ---------------------------------------------------------------------------
-- E: wyzerowanie rytmu (rytm i data startu NULL w jednym UPDATE)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set recurrence_weekdays = null, recurrence_start_date = null
    where id = '30000000-0000-0000-0000-000000000005'$$,
  'E: bezposrednie zerowanie rytmu przechodzi bez bledu');

select is(
  (select count(*) from public.task_occurrences where task_id = '30000000-0000-0000-0000-000000000005'),
  1::bigint,
  'E: zerowanie rytmu nie sprzata wierszy (data startu NULL)');

select * from finish();
rollback;
