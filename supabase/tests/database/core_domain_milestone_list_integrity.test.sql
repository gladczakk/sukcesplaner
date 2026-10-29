-- Spojnosc listy na dzis po edycji i usunieciu milestona lub projektu (ryzyko #6): po mutacji today_list
-- pokazuje wlasciwy najblizszy niezamkniety milestone i zgodne z nim zadania, a kaskady usuwaja cale poddrzewo.
-- Uzupelnia core_domain_today_list.test.sql (dane statyczne, P07-P11) i core_domain_schema.test.sql (kaskady
-- jako postgres, bez listy); nie powtarza ich. Kazdy scenariusz to sekwencja: stan -> mutacja jako authenticated
-- -> today_list('2026-10-15') -> oczekiwane wiersze wpisane recznie (nigdy liczone zapytaniem tej samej logiki).
-- Dane bazowe wstawiamy jako postgres (RLS omijane; wyzwalacze dzialaja), mutacje i odczyty jako authenticated
-- z JWT (to samo, co PostgREST robi dla zadania aplikacji). Kazdy scenariusz ma wlasny projekt (termin
-- 2026-12-31), a asercje filtruja po project_id.
-- Wyrocznia (reczna, nie z ciala today_list):
-- - Z PRD (FR-003, FR-005, Business Logic): lista na dzis pokazuje niedokonczone zadania z biezacego
--   (niezamknietego) milestona projektu; zamkniecie milestona przesuwa projekt do nastepnego; milestone bez
--   otwartych zadan jest do zamkniecia (wiersz kind = 'milestone'); zadanie przeniesione na pozniej nie jest na liscie.
-- - Reguly projektowe (NIE z PRD, decyzje implementacyjne): "najblizszy" milestone to niezamkniety o najmniejszym
--   (due_date, seq) w projekcie (seq rozstrzyga remis dat: starszy wygrywa); usuniecie milestona lub projektu
--   kaskadowo usuwa jego zadania i ich odhaczenia/przeniesienia (task_occurrences); data milestona nie moze
--   byc wczesniejsza niz termin jego zadania (23514); ponowne otwarcie milestona nie ma walidacji.
-- Daty stale: "dzis" = 2026-10-15 (czwartek). 2026-10-14 sroda, 10-16 piatek, 10-17 sobota (scenariusz 8:
-- rytm sr+pt od 10-14, odhaczenie sr 14.10, przeniesienie pt 16.10 -> sob 17.10; sobota nie jest dniem rytmu).
-- Dni ISO: 1 = pn ... 7 = nd.
begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'd@example.test');

-- Projekty (termin 2026-12-31 dla wszystkich)
-- 01-03 edycja daty; 04 zamkniecie/ponowne otwarcie; 05 usuniecie najblizszego; 06 usuniecie ostatniego
-- niezamknietego (07 kontrola); 08 usuniecie projektu (09 kontrola); 10-12 kaskada do odhaczen
-- (10 milestone, 11 projekt, 12 kontrola); 13 odrzucona edycja
insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'G01 data pozniej', 'praca', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'G02 data wczesniej', 'praca', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', 'G03 remis po edycji', 'praca', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', 'G04 zamkniecie', 'praca', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000d1', 'G05 usuniecie najblizszego', 'praca', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000d1', 'G06 usuniecie ostatniego', 'dom', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000d1', 'G07 kontrola', 'dom', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000d1', 'G08 usuwany projekt', 'sport', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000d1', 'G09 kontrola projektu', 'sport', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000d1', 'G10 kaskada milestona', 'praca', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', 'G11 kaskada projektu', 'praca', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d1', 'G12 kontrola kaskady', 'praca', '2026-12-31'),
  ('91000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000d1', 'G13 odrzucona edycja', 'praca', '2026-12-31');

-- Milestony (kolejnosc wstawiania wyznacza seq: w G03 m05 jest starszy od m06)
insert into public.milestones (id, user_id, project_id, name, due_date, completed_at)
values
  ('92000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000001', 'm01', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000001', 'm02', '2026-10-25', null),
  ('92000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000002', 'm03', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000002', 'm04', '2026-11-10', null),
  ('92000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000003', 'm05 starszy', '2026-11-10', null),
  ('92000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000003', 'm06 mlodszy', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000004', 'm07', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000004', 'm08', '2026-10-25', null),
  ('92000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000005', 'm09', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000005', 'm10', '2026-10-25', null),
  ('92000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000006', 'm11', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000006', 'm12 zamkniety', '2026-10-25', '2026-10-05 10:00:00+00'),
  ('92000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000007', 'm13', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000008', 'm14', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000009', 'm15', '2026-10-20', null),
  ('92000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000010', 'm16 usuwany', '2026-10-30', null),
  ('92000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000010', 'm17 zostaje', '2026-10-30', null),
  ('92000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000011', 'm18', '2026-10-30', null),
  ('92000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000012', 'm19', '2026-10-30', null),
  ('92000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000013', 'm20', '2026-10-25', null),
  ('92000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000d1', '91000000-0000-0000-0000-000000000013', 'm21', '2026-10-26', null);

-- Zadania jednorazowe (termin zadania <= data milestona; terminy tylko tam, gdzie scenariusz ich potrzebuje)
insert into public.tasks (id, user_id, milestone_id, title, due_date, status)
values
  ('93000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000001', 't01', null, 'todo'),
  ('93000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000002', 't02', null, 'todo'),
  ('93000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000003', 't03', null, 'todo'),
  ('93000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000004', 't04', '2026-10-17', 'todo'),
  ('93000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000005', 't05', null, 'todo'),
  ('93000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000006', 't06', null, 'todo'),
  ('93000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000007', 't07 done', null, 'done'),
  ('93000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000008', 't08', null, 'todo'),
  ('93000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000009', 't09', null, 'todo'),
  ('93000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000009', 't10', null, 'todo'),
  ('93000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000010', 't11', null, 'todo'),
  ('93000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000011', 't12', null, 'todo'),
  ('93000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000013', 't13', null, 'todo'),
  ('93000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000014', 't14', null, 'todo'),
  ('93000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000015', 't15', null, 'todo'),
  ('93000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000020', 't20', '2026-10-22', 'todo'),
  ('93000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000021', 't21', '2026-10-24', 'todo');

-- Zadania powtarzalne (rytm sr+pt od 2026-10-14) dla scenariusza kaskady do odhaczen
insert into public.tasks (id, user_id, milestone_id, title, due_date, recurrence_interval_days, recurrence_weekdays, recurrence_start_date)
values
  ('93000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000016', 'r16 usuwane z milestonem', null, null, '{3,5}', '2026-10-14'),
  ('93000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000017', 'r17 zostaje', null, null, '{3,5}', '2026-10-14'),
  ('93000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000018', 'r18 usuwane z projektem', null, null, '{3,5}', '2026-10-14'),
  ('93000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-0000000000d1', '92000000-0000-0000-0000-000000000019', 'r19 kontrola projektu', null, null, '{3,5}', '2026-10-14');

-- Wystapienia: kazde z czterech zadan ma jedno done (sr 14.10) i jedno moved (pt 16.10 -> sob 17.10)
insert into public.task_occurrences (task_id, user_id, occurrence_date, state, moved_to)
select t.id, '00000000-0000-0000-0000-0000000000d1', d.occurrence_date, d.state, d.moved_to
from (values
  ('93000000-0000-0000-0000-000000000016'::uuid),
  ('93000000-0000-0000-0000-000000000017'::uuid),
  ('93000000-0000-0000-0000-000000000018'::uuid),
  ('93000000-0000-0000-0000-000000000019'::uuid)
) t(id)
cross join (values
  ('2026-10-14'::date, 'done', null::date),
  ('2026-10-16'::date, 'moved', '2026-10-17'::date)
) d(occurrence_date, state, moved_to);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

-- Straznik dat (1): dni tygodnia dat uzytych w scenariuszu 8
select results_eq(
  $$select extract(isodow from d)::int
    from (values ('2026-10-14'::date), ('2026-10-15'::date), ('2026-10-16'::date), ('2026-10-17'::date)) v(d)
    order by d$$,
  $$values (3), (4), (5), (6)$$,
  'dni testu: 14.10 sroda, 15.10 czwartek, 16.10 piatek, 17.10 sobota');

-- ---------------------------------------------------------------------------
-- 1. Przesuniecie daty najblizszego milestona na pozniej (G01)
-- ---------------------------------------------------------------------------

-- (2) kontrola pozytywna: najblizszy to m01 (20.10 < 25.10)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000001'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000001'::uuid, '93000000-0000-0000-0000-000000000001'::uuid)$$,
  'G01: przed edycja najblizszy jest m01 z zadaniem t01');

-- (3)
select lives_ok(
  $$update public.milestones set due_date = '2026-11-30'
    where id = '92000000-0000-0000-0000-000000000001'$$,
  'G01: przesuniecie daty m01 na 30.11 przyjete');

-- (4)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000001'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000002'::uuid, '93000000-0000-0000-0000-000000000002'::uuid)$$,
  'G01: po przesunieciu m01 za m02 najblizszy jest m02, na liscie tylko jego zadanie t02');

-- ---------------------------------------------------------------------------
-- 2. Przesuniecie daty nastepnego milestona na wczesniej niz obecny najblizszy (G02)
-- ---------------------------------------------------------------------------

-- (5)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000002'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000003'::uuid, '93000000-0000-0000-0000-000000000003'::uuid)$$,
  'G02: przed edycja najblizszy jest m03 (20.10) z zadaniem t03');

-- (6) nowa data 19.10 jest wczesniejsza niz m03, ale nie wczesniejsza niz termin zadania t04 (17.10)
select lives_ok(
  $$update public.milestones set due_date = '2026-10-19'
    where id = '92000000-0000-0000-0000-000000000004'$$,
  'G02: przesuniecie daty m04 na 19.10 (po terminie zadania t04) przyjete');

-- (7)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000002'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000004'::uuid, '93000000-0000-0000-0000-000000000004'::uuid)$$,
  'G02: po przesunieciu m04 przed m03 najblizszy jest m04, na liscie tylko jego zadanie t04');

-- ---------------------------------------------------------------------------
-- 3. Remis dat powstaly przez edycje: wygrywa starszy (mniejszy seq) (G03)
-- ---------------------------------------------------------------------------

-- (8) kontrola pozytywna: m06 (20.10) jest przed m05 (10.11)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000003'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000006'::uuid, '93000000-0000-0000-0000-000000000006'::uuid)$$,
  'G03: przed edycja najblizszy jest m06 (20.10) z zadaniem t06');

-- (9) m05 (starszy) dostaje te sama date co m06
select lives_ok(
  $$update public.milestones set due_date = '2026-10-20'
    where id = '92000000-0000-0000-0000-000000000005'$$,
  'G03: ustawienie daty m05 na 20.10 (remis z m06) przyjete');

-- (10)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000003'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000005'::uuid, '93000000-0000-0000-0000-000000000005'::uuid)$$,
  'G03: po remisie z edycji najblizszy jest starszy m05, na liscie tylko jego zadanie t05');

-- ---------------------------------------------------------------------------
-- 4. Zamkniecie najblizszego i ponowne otwarcie (G04)
-- ---------------------------------------------------------------------------

-- (11) m07 ma tylko zadanie done, wiec jest najblizszy i "do zamkniecia" (wiersz milestone)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000004'$$,
  $$values ('milestone', '92000000-0000-0000-0000-000000000007'::uuid, null::uuid)$$,
  'G04: przed zamknieciem m07 (same zadania done) daje wiersz milestone');

-- (12)
select lives_ok(
  $$update public.milestones set completed_at = now()
    where id = '92000000-0000-0000-0000-000000000007'$$,
  'G04: zamkniecie m07 przyjete');

-- (13)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000004'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000008'::uuid, '93000000-0000-0000-0000-000000000008'::uuid)$$,
  'G04: po zamknieciu m07 lista przeskakuje na m08 z zadaniem t08');

-- (14)
select lives_ok(
  $$update public.milestones set completed_at = null
    where id = '92000000-0000-0000-0000-000000000007'$$,
  'G04: ponowne otwarcie m07 przyjete');

-- (15)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000004'$$,
  $$values ('milestone', '92000000-0000-0000-0000-000000000007'::uuid, null::uuid)$$,
  'G04: po ponownym otwarciu m07 wraca jako najblizszy (wczesniejsza data), wiersz milestone');

-- ---------------------------------------------------------------------------
-- 5. Usuniecie najblizszego milestona z otwartymi zadaniami (G05)
-- ---------------------------------------------------------------------------

-- (16) kontrola pozytywna: najblizszy m09 ma dwa zadania t09 i t10
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000005'
    order by task_id$$,
  $$values
    ('task', '92000000-0000-0000-0000-000000000009'::uuid, '93000000-0000-0000-0000-000000000009'::uuid),
    ('task', '92000000-0000-0000-0000-000000000009'::uuid, '93000000-0000-0000-0000-000000000010'::uuid)$$,
  'G05: przed usunieciem na liscie dwa zadania najblizszego m09');

-- (17)
select lives_ok(
  $$delete from public.milestones where id = '92000000-0000-0000-0000-000000000009'$$,
  'G05: usuniecie najblizszego m09 przechodzi');

-- (18)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000005'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000010'::uuid, '93000000-0000-0000-0000-000000000011'::uuid)$$,
  'G05: po usunieciu m09 najblizszy jest m10 i na liscie tylko jego zadanie t11');

-- (19) zadania usunietego milestona znikaja tez z tabeli (kaskada), zadanie nastepnego zostaje
select results_eq(
  $$select id from public.tasks
    where id in ('93000000-0000-0000-0000-000000000009', '93000000-0000-0000-0000-000000000010', '93000000-0000-0000-0000-000000000011')
    order by id$$,
  $$values ('93000000-0000-0000-0000-000000000011'::uuid)$$,
  'G05: po usunieciu m09 w tabeli tasks zostaje tylko t11, zadan t09 i t10 brak');

-- ---------------------------------------------------------------------------
-- 6. Usuniecie ostatniego niezamknietego milestona (G06, kontrola G07)
-- ---------------------------------------------------------------------------

-- (20) kontrola pozytywna: G06 ma wiersz zadania m11, zamkniety m12 jest pomijany
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000006'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000011'::uuid, '93000000-0000-0000-0000-000000000012'::uuid)$$,
  'G06: przed usunieciem lista pokazuje zadanie t12 jedynego niezamknietego milestona m11');

-- (21)
select lives_ok(
  $$delete from public.milestones where id = '92000000-0000-0000-0000-000000000011'$$,
  'G06: usuniecie ostatniego niezamknietego milestona m11 przechodzi');

-- (22)
select is_empty(
  $$select 1 from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000006'$$,
  'G06: po usunieciu ostatniego niezamknietego milestona projekt (z samym zamknietym m12) nie ma wierszy');

-- (23) kontrola: drugi projekt nietkniety
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000007'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000013'::uuid, '93000000-0000-0000-0000-000000000013'::uuid)$$,
  'G07: projekt kontrolny nadal ma wiersz zadania t13');

-- ---------------------------------------------------------------------------
-- 7. Usuniecie projektu (G08, kontrola G09 o identycznej strukturze)
-- ---------------------------------------------------------------------------

-- (24) kontrola pozytywna: usuwany projekt ma wiersz zadania
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000008'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000014'::uuid, '93000000-0000-0000-0000-000000000014'::uuid)$$,
  'G08: przed usunieciem projekt ma wiersz zadania t14');

-- (25)
select lives_ok(
  $$delete from public.projects where id = '91000000-0000-0000-0000-000000000008'$$,
  'G08: usuniecie projektu przechodzi');

-- (26)
select is_empty(
  $$select 1 from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000008'$$,
  'G08: po usunieciu projektu brak jego wierszy na liscie');

-- (27)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000009'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000015'::uuid, '93000000-0000-0000-0000-000000000015'::uuid)$$,
  'G09: projekt kontrolny o tej samej strukturze nadal ma wiersz zadania t15');

-- ---------------------------------------------------------------------------
-- 8. Kaskada do task_occurrences (done i moved): usuniecie milestona (G10) i projektu (G11), kontrola G12
-- ---------------------------------------------------------------------------

-- (28) kontrola pozytywna: cztery zadania powtarzalne, po dwa wiersze (done i moved) kazde
select is(
  (select count(*) from public.task_occurrences
   where task_id in ('93000000-0000-0000-0000-000000000016', '93000000-0000-0000-0000-000000000017',
                     '93000000-0000-0000-0000-000000000018', '93000000-0000-0000-0000-000000000019')),
  8::bigint,
  'kaskada: na starcie osiem wierszy wystapien (po jednym done i jednym moved na zadanie)');

-- (29)
select lives_ok(
  $$delete from public.milestones where id = '92000000-0000-0000-0000-000000000016'$$,
  'kaskada milestona: usuniecie m16 z zadaniem powtarzalnym przechodzi');

-- (30)
select is_empty(
  $$select 1 from public.task_occurrences where task_id = '93000000-0000-0000-0000-000000000016'$$,
  'kaskada milestona: po usunieciu m16 nie zostaje zaden wiersz wystapien jego zadania (ani done, ani moved)');

-- (31) kontrola: zadanie drugiego milestona tego samego projektu zachowuje oba stany
select results_eq(
  $$select state from public.task_occurrences
    where task_id = '93000000-0000-0000-0000-000000000017' order by state$$,
  $$values ('done'), ('moved')$$,
  'kaskada milestona: wystapienia zadania z m17 (done i moved) bez zmian');

-- (32)
select lives_ok(
  $$delete from public.projects where id = '91000000-0000-0000-0000-000000000011'$$,
  'kaskada projektu: usuniecie projektu G11 przechodzi');

-- (33)
select is_empty(
  $$select 1 from public.task_occurrences where task_id = '93000000-0000-0000-0000-000000000018'$$,
  'kaskada projektu: po usunieciu projektu nie zostaje zaden wiersz wystapien jego zadania (ani done, ani moved)');

-- (34)
select is(
  (select count(*) from public.milestones where project_id = '91000000-0000-0000-0000-000000000011')
  + (select count(*) from public.tasks where id = '93000000-0000-0000-0000-000000000018'),
  0::bigint,
  'kaskada projektu: po usunieciu projektu brak jego milestonow i zadania powtarzalnego');

-- (35) kontrola: projekt G12 nietkniety
select results_eq(
  $$select state from public.task_occurrences
    where task_id = '93000000-0000-0000-0000-000000000019' order by state$$,
  $$values ('done'), ('moved')$$,
  'kaskada projektu: wystapienia zadania z kontrolnego projektu G12 (done i moved) bez zmian');

-- ---------------------------------------------------------------------------
-- 9. Odrzucona edycja nie zmienia listy (G13)
-- ---------------------------------------------------------------------------

-- (36) kontrola pozytywna: najblizszy to m20 (25.10); m21 ma date 26.10
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000013'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000020'::uuid, '93000000-0000-0000-0000-000000000020'::uuid)$$,
  'G13: przed proba edycji najblizszy jest m20 z zadaniem t20');

-- (37) m21 -> 22.10 wyprzedziloby termin zadania t21 (24.10); gdyby zostalo przyjete, m21 stalby sie najblizszy
select throws_ok(
  $$update public.milestones set due_date = '2026-10-22'
    where id = '92000000-0000-0000-0000-000000000021'$$,
  '23514',
  'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (1)',
  'G13: przesuniecie daty m21 przed termin jego zadania t21 odrzucone (check_violation)');

-- (38)
select results_eq(
  $$select kind, milestone_id, task_id from public.today_list('2026-10-15')
    where project_id = '91000000-0000-0000-0000-000000000013'$$,
  $$values ('task', '92000000-0000-0000-0000-000000000020'::uuid, '93000000-0000-0000-0000-000000000020'::uuid)$$,
  'G13: po odrzuconej edycji lista identyczna jak przed proba (nadal m20 z t20)');

-- (39) odrzucona zmiana nie zostala zapisana w milestonie
select is(
  (select due_date from public.milestones where id = '92000000-0000-0000-0000-000000000021'),
  '2026-10-26'::date,
  'G13: data m21 po odrzuconej edycji bez zmian (26.10)');

reset role;

select * from finish();
rollback;
