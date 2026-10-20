-- Testy akcji na wystapieniu zadania powtarzalnego (S-09): przeniesienie wystapienia (stan 'moved', moved_to),
-- funkcja is_rhythm_day, wiersze 'skipped' i kolumny task_moved_from / task_can_move w public.today_list(p_today).
-- Dane bazowe wstawiamy jako postgres (RLS omijane); reszta dziala w roli authenticated z kontekstem JWT.
-- Daty sa stale: start rutyn 2026-10-21 (sroda), milestone do 2026-10-30 (piatek). Dni ISO: 1 = pn ... 7 = nd.
-- Komunikaty sa kontraktem z serwisami aplikacji (dopasowanie po tekscie): komunikaty przeniesienia zaczynaja sie
-- od 'Przeniesienie wystapienia', odhaczenia od 'Wystapienie'.
begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test');

-- Projekty: 1 rytmy, przeniesienia i pominiete (milestone otwarty); 2 zamkniety milestone
insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'P1 akcje', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'P2 zamkniety', 'dom', '2026-12-31');

insert into public.milestones (id, user_id, project_id, name, due_date)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm1', '2026-10-30'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', 'm2', '2026-10-30');

-- Zadania (m1): 01 sr+pt przeniesienie na czwartek; 02 sr+pt dwa przeniesienia na ten sam dzien;
-- 03 codziennie; 04 sr+pt done kontra moved (done pierwsze); 05 zwykle (niepowtarzalne);
-- 06 sr+pt przypadki odrzucone; 07 sr+pt niezrobione (pominiete, can_move); 08 sr+pt z odhaczona sroda;
-- 10 sr+pt done kontra moved (moved pierwsze). Zadanie 09 (sr+pt) lezy w m2, ktory zamykamy.
insert into public.tasks (id, user_id, milestone_id, title, due_date, recurrence_interval_days, recurrence_weekdays, recurrence_start_date)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'a-przeniesione', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'b-ten-sam-dzien', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'c-codziennie', null, 1, null, '2026-10-21'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'd-done-potem-moved', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'e-zwykle', null, null, null, null),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'f-odrzucone', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'g-niezrobione', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'h-odhaczone', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 'i-zamkniety', null, null, '{3,5}', '2026-10-21'),
  ('30000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'j-moved-potem-done', null, null, '{3,5}', '2026-10-21');

-- Granica miesiaca i start dzis (projekt 3, milestone m3 do 2026-11-15): zadanie 11 codziennie od 2026-10-25,
-- zadanie 12 codziennie od 2026-11-01.
insert into public.projects (id, user_id, name, life_area, due_date)
values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'P3 granice', 'dom', '2026-12-31');

insert into public.milestones (id, user_id, project_id, name, due_date)
values ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000003', 'm3', '2026-11-15');

insert into public.tasks (id, user_id, milestone_id, title, due_date, recurrence_interval_days, recurrence_weekdays, recurrence_start_date)
values
  ('30000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'k-granica-miesiaca', null, 1, null, '2026-10-25'),
  ('30000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'l-start-dzis', null, 1, null, '2026-11-01');

-- Zamkniecie m2 (same rutyny, wiec dozwolone) jako postgres
update public.milestones set completed_at = now() where id = '20000000-0000-0000-0000-000000000002';

-- Odhaczona sroda zadania 08 (jako postgres; trigger przepuszcza dzien rytmu)
insert into public.task_occurrences (task_id, user_id, occurrence_date)
values ('30000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a1', '2026-10-21');

-- ---------------------------------------------------------------------------
-- Struktura i funkcja is_rhythm_day (jako postgres)
-- ---------------------------------------------------------------------------

select has_column('public', 'task_occurrences', 'moved_to', 'task_occurrences.moved_to istnieje');
select has_function('public', 'is_rhythm_day', array['smallint', 'smallint[]', 'date', 'date'], 'funkcja is_rhythm_day istnieje');

select is(
  public.is_rhythm_day(2::smallint, null::smallint[], '2026-10-21'::date, '2026-10-23'::date),
  true, 'is_rhythm_day: interwal co 2 dni, dzien rytmu');

select is(
  public.is_rhythm_day(2::smallint, null::smallint[], '2026-10-21'::date, '2026-10-22'::date),
  false, 'is_rhythm_day: interwal co 2 dni, dzien poza rytmem');

select is(
  public.is_rhythm_day(null::smallint, '{3,5}'::smallint[], '2026-10-21'::date, '2026-10-23'::date),
  true, 'is_rhythm_day: dni tygodnia, piatek nalezy do rytmu');

select is(
  public.is_rhythm_day(null::smallint, '{3,5}'::smallint[], '2026-10-21'::date, '2026-10-22'::date),
  false, 'is_rhythm_day: dni tygodnia, czwartek nie nalezy do rytmu');

select is(
  public.is_rhythm_day(null::smallint, null::smallint[], '2026-10-21'::date, '2026-10-23'::date),
  false, 'is_rhythm_day: brak rytmu daje false (NULL-bezpieczna)');

-- ---------------------------------------------------------------------------
-- Przeniesienie wystapienia (uzytkownik a1)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000001', '2026-10-21', 'moved', '2026-10-22')$$,
  'przeniesienie srody na czwartek przyjete');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000006', '2026-10-21', 'moved', '2026-10-23')$$,
  '23514',
  'Przeniesienie wystapienia (2026-10-21) na dzien (2026-10-23) nie jest mozliwe: to dzien rytmu zadania',
  'przeniesienie na piatek (dzien rytmu) odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000006', '2026-10-21', 'moved', '2026-10-20')$$,
  '23514',
  'new row for relation "task_occurrences" violates check constraint "task_occurrences_moved_to_check"',
  'przeniesienie na dzien przed zrodlem odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000006', '2026-10-30', 'moved', '2026-10-31')$$,
  '23514',
  'Przeniesienie wystapienia (2026-10-30) na dzien (2026-10-31) wykracza poza date milestona (2026-10-30)',
  'przeniesienie na dzien po dacie milestona odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000006', '2026-10-22', 'moved', '2026-10-24')$$,
  '23514',
  'Przeniesienie wystapienia (2026-10-22) dotyczy dnia spoza rytmu zadania',
  'przeniesienie ze zrodla spoza rytmu odrzucone');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000002', '2026-10-21', 'moved', '2026-10-24')$$,
  'przeniesienie srody na sobote przyjete (pierwsze na ten dzien docelowy)');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000002', '2026-10-23', 'moved', '2026-10-24')$$,
  '23505',
  'duplicate key value violates unique constraint "task_occurrences_moved_to_key"',
  'drugie przeniesienie na ten sam dzien docelowy odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000003', '2026-10-21', 'moved', '2026-10-22')$$,
  '23514',
  'Przeniesienie wystapienia (2026-10-21) na dzien (2026-10-22) nie jest mozliwe: to dzien rytmu zadania',
  'zadanie codzienne nie przyjmuje przeniesienia na jutro');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000005', '2026-10-21', 'moved', '2026-10-22')$$,
  '23514',
  'Wystapienie dotyczy zadania, ktore nie jest powtarzalne',
  'przeniesienie zadania niepowtarzalnego odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000009', '2026-10-21', 'moved', '2026-10-22')$$,
  '23514',
  'Wystapienie nie moze dotyczyc zamknietego milestona',
  'przeniesienie w zamknietym milestonie odrzucone');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000004', '2026-10-21')$$,
  'odhaczenie srody (zadanie 04) przechodzi');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000004', '2026-10-21', 'moved', '2026-10-22')$$,
  '23505',
  'duplicate key value violates unique constraint "task_occurrences_pkey"',
  'przeniesienie dnia juz odhaczonego wyklucza sie kluczem glownym (done potem moved)');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-21', 'moved', '2026-10-22')$$,
  'przeniesienie srody (zadanie 10) przyjete');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-21')$$,
  '23505',
  'duplicate key value violates unique constraint "task_occurrences_pkey"',
  'odhaczenie dnia juz przeniesionego wyklucza sie kluczem glownym (moved potem done)');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state)
    values ('30000000-0000-0000-0000-000000000004', '2026-10-23', 'skipped')$$,
  '23514', null,
  'stan skipped nadal odrzucany');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state)
    values ('30000000-0000-0000-0000-000000000006', '2026-10-21', 'moved')$$,
  '23514',
  'new row for relation "task_occurrences" violates check constraint "task_occurrences_moved_shape"',
  'stan moved bez dnia docelowego odrzucony');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000006', '2026-10-21', 'done', '2026-10-22')$$,
  '23514',
  'new row for relation "task_occurrences" violates check constraint "task_occurrences_moved_shape"',
  'stan done z dniem docelowym odrzucony');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000006', '2026-10-22')$$,
  '23514',
  'Wystapienie (2026-10-22) nie pasuje do rytmu zadania',
  'odhaczenie dnia spoza rytmu bez przeniesienia nadal odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('30000000-0000-0000-0000-000000000001', '2026-10-22', 'moved', '2026-10-24')$$,
  '23514',
  'Przeniesienie wystapienia (2026-10-22) dotyczy dnia spoza rytmu zadania',
  'przeniesionego wystapienia nie da sie przeniesc dalej');

-- ---------------------------------------------------------------------------
-- Lista na dzis: przeniesione wystapienie (zadanie 01: sroda 21 przeniesiona na czwartek 22)
-- ---------------------------------------------------------------------------

select results_eq(
  $$select kind, task_moved_from, task_can_move from public.today_list('2026-10-22')
    where task_id = '30000000-0000-0000-0000-000000000001'$$,
  $$values ('routine', '2026-10-21'::date, false)$$,
  'czwartek: jeden wiersz routine z task_moved_from = sroda i task_can_move = false');

select is(
  (select count(*) from public.today_list('2026-10-22')
    where task_id = '30000000-0000-0000-0000-000000000001' and kind = 'skipped'),
  0::bigint,
  'przeniesiona sroda nie jest pominieta');

-- Czwartek nieodhaczony: w piatek pominiety (dzien docelowy przeniesienia), obok wystapienia z rytmu
select results_eq(
  $$select kind, task_moved_from from public.today_list('2026-10-23')
    where task_id = '30000000-0000-0000-0000-000000000001'$$,
  $$values ('routine', null::date), ('skipped', null::date)$$,
  'piatek: nieodhaczony czwartek (dzien docelowy) jest pominiety, wystapienie piatku jest routine');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000001', '2026-10-22')$$,
  'odhaczenie przeniesionego wystapienia (dzien docelowy) przechodzi');

select is_empty(
  $$select 1 from public.today_list('2026-10-22') where task_id = '30000000-0000-0000-0000-000000000001'$$,
  'odhaczenie przeniesionego wystapienia ukrywa wiersz w czwartek');

select results_eq(
  $$select kind from public.today_list('2026-10-23') where task_id = '30000000-0000-0000-0000-000000000001'$$,
  $$values ('routine')$$,
  'piatek po odhaczeniu czwartku: brak wiersza skipped');

-- ---------------------------------------------------------------------------
-- Pominiete (zadanie 07 niezrobione, 08 z odhaczona sroda, 03 codziennie, 09 zamkniety milestone)
-- ---------------------------------------------------------------------------

select results_eq(
  $$select kind, task_moved_from, task_can_move from public.today_list('2026-10-22')
    where task_id = '30000000-0000-0000-0000-000000000007'$$,
  $$values ('skipped', null::date, null::boolean)$$,
  'niezrobiona sroda: w czwartek jeden wiersz skipped bez task_moved_from i task_can_move');

select results_eq(
  $$select kind from public.today_list('2026-10-23') where task_id = '30000000-0000-0000-0000-000000000007'$$,
  $$values ('routine')$$,
  'pominiete znika w piatek: zostaje tylko wystapienie piatku');

select is(
  (select count(*) from public.today_list('2026-10-21')
    where task_id in ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000007')
      and kind = 'skipped'),
  0::bigint,
  'dzien przed startem nie daje pominietego');

select is(
  (select count(*) from public.today_list('2026-10-22')
    where task_id = '30000000-0000-0000-0000-000000000008'),
  0::bigint,
  'odhaczona sroda nie daje pominietego');

select is_empty(
  $$select 1 from public.today_list('2026-10-22') where task_id = '30000000-0000-0000-0000-000000000009'$$,
  'zamkniety milestone nie daje pominietego');

select results_eq(
  $$select kind from public.today_list('2026-10-22')
    where task_id in ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000005',
      '30000000-0000-0000-0000-000000000007')$$,
  $$values ('routine'), ('skipped'), ('skipped'), ('task')$$,
  'kolejnosc rodzajow: routine, skipped, task');

-- ---------------------------------------------------------------------------
-- task_can_move
-- ---------------------------------------------------------------------------

select is(
  (select task_can_move from public.today_list('2026-10-21')
    where task_id = '30000000-0000-0000-0000-000000000007' and kind = 'routine'),
  true, 'task_can_move: sroda, czwartek wolny - prawda');

select is(
  (select task_can_move from public.today_list('2026-10-23')
    where task_id = '30000000-0000-0000-0000-000000000007' and kind = 'routine'),
  true, 'task_can_move: piatek, sobota wolna - prawda');

select is(
  (select task_can_move from public.today_list('2026-10-22')
    where task_id = '30000000-0000-0000-0000-000000000003' and kind = 'routine'),
  false, 'task_can_move: zadanie codzienne - falsz');

select is(
  (select task_can_move from public.today_list('2026-10-30')
    where task_id = '30000000-0000-0000-0000-000000000007' and kind = 'routine'),
  false, 'task_can_move: dzien daty milestona (jutro po dacie) - falsz');

select is(
  (select count(*) from public.today_list('2026-11-01')
    where task_id = '30000000-0000-0000-0000-000000000011' and kind = 'skipped'),
  1::bigint, 'pominiete: wczoraj to 31 pazdziernika (granica miesiaca)');

select is(
  (select count(*) from public.today_list('2026-11-01')
    where task_id = '30000000-0000-0000-0000-000000000012' and kind = 'skipped'),
  0::bigint, 'pominiete: zadanie wystartowalo dzis, brak pominietego z wczoraj');

reset role;

select * from finish();
rollback;
