-- Testy stanu koncowego akcji na zadaniach (S-05, S-09) widzianego przez public.today_list(p_today):
-- po "Zrobione", "Czesciowo", "Na jutro", zapisie statusu po przeniesieniu, "Przywroc" i po przeniesieniu
-- wystapienia zadania z rytmem dni tygodnia lista dla dnia D i D+1 ma zgadzac sie z regulami.
-- Akcje wykonujemy jako authenticated tym samym update/insert, ktory wykonuja serwisy aplikacji
-- (update tasks set status = ..., deferred_until = null; set deferred_until = <jutro>; insert do
-- task_occurrences ze stanem 'moved'). Dane bazowe wstawiamy jako postgres (RLS omijane).
-- Wyrocznia: PRD Business Logic i decyzje S-05, oczekiwane listy wpisane recznie:
-- - zadanie done nie jest wierszem task/deferred; gdy jest ostatnim niedokonczonym, pojawia sie wiersz
--   milestone ("do zamkniecia");
-- - "Na jutro" nie zmienia statusu (deferred w D, task w D+1); zapis statusu zeruje deferred_until
--   (wraca na dzis); zadanie przeniesione to nadal niedokonczone, wiec milestone z jedynym przeniesionym
--   zadaniem nie jest wierszem milestone;
-- - przeniesienie wystapienia jest jednorazowe (task_can_move = false w dniu docelowym).
-- Daty stale: D = 2026-10-21 (sroda), D+1 = 2026-10-22 (czwartek), D+2 = 2026-10-23 (piatek).
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'e@example.test');

-- Kazdy przypadek ma wlasny projekt z jednym milestonem (data 2026-11-30, po sprawdzanych dniach);
-- projekt 7 ma milestone 2026-10-30 (rytm)
insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('71000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'PE1 zrobione', 'praca', '2027-06-30'),
  ('71000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'PE2 czesciowo', 'praca', '2027-06-30'),
  ('71000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', 'PE3 na jutro', 'praca', '2027-06-30'),
  ('71000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e1', 'PE5 status po przeniesieniu', 'praca', '2027-06-30'),
  ('71000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000e1', 'PE6 milestone', 'praca', '2027-06-30'),
  ('71000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000e1', 'PE7 rytm', 'praca', '2027-06-30');

insert into public.milestones (id, user_id, project_id, name, due_date)
values
  ('72000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '71000000-0000-0000-0000-000000000001', 'mE1', '2026-11-30'),
  ('72000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', '71000000-0000-0000-0000-000000000002', 'mE2', '2026-11-30'),
  ('72000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', '71000000-0000-0000-0000-000000000003', 'mE3', '2026-11-30'),
  ('72000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e1', '71000000-0000-0000-0000-000000000005', 'mE5', '2026-11-30'),
  ('72000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000e1', '71000000-0000-0000-0000-000000000006', 'mE6', '2026-11-30'),
  ('72000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000e1', '71000000-0000-0000-0000-000000000007', 'mE7', '2026-10-30');

insert into public.tasks (id, user_id, milestone_id, title, status, created_at)
values
  ('73000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '72000000-0000-0000-0000-000000000001', 'e1-do-zrobienia', 'todo', '2026-10-01 10:00:00+00'),
  ('73000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', '72000000-0000-0000-0000-000000000002', 'e2-do-czesciowo', 'todo', '2026-10-01 10:00:00+00'),
  ('73000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', '72000000-0000-0000-0000-000000000003', 'e3-todo-na-jutro', 'todo', '2026-10-01 10:00:00+00'),
  ('73000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e1', '72000000-0000-0000-0000-000000000003', 'e3-partial-na-jutro', 'partial', '2026-10-01 11:00:00+00'),
  ('73000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e1', '72000000-0000-0000-0000-000000000005', 'e5-przywroc', 'todo', '2026-10-01 10:00:00+00'),
  ('73000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000e1', '72000000-0000-0000-0000-000000000005', 'e5-przywroc-status', 'todo', '2026-10-01 11:00:00+00'),
  ('73000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000e1', '72000000-0000-0000-0000-000000000006', 'e6-jedyne', 'todo', '2026-10-01 10:00:00+00');

insert into public.tasks (id, user_id, milestone_id, title, status, recurrence_weekdays, recurrence_start_date, created_at)
values
  ('73000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000e1', '72000000-0000-0000-0000-000000000007', 'e7-sr-pt', 'todo', '{3,5}', '2026-10-21', '2026-10-01 10:00:00+00');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

-- Kontrola pozytywna: lista tytulow z danych trafia dokladnie w 8 zadan (literowka nie zmniejszy po
-- cichu sprawdzanego zbioru)
select is(
  (select count(*) from public.tasks
   where title in (
     'e1-do-zrobienia', 'e2-do-czesciowo', 'e3-todo-na-jutro', 'e3-partial-na-jutro',
     'e5-przywroc', 'e5-przywroc-status', 'e6-jedyne', 'e7-sr-pt')),
  8::bigint,
  'dane testu: dokladnie 8 zadan o oczekiwanych tytulach');

-- Straznik dat: D jest sroda, D+1 czwartkiem, D+2 piatkiem (ISO 3, 4, 5)
select results_eq(
  $$select extract(isodow from d)::int
    from (values ('2026-10-21'::date), ('2026-10-22'::date), ('2026-10-23'::date)) v(d)
    order by d$$,
  $$values (3), (4), (5)$$,
  'dni testu: 2026-10-21 sroda, 2026-10-22 czwartek, 2026-10-23 piatek');

-- ---------------------------------------------------------------------------
-- Zrobione: jedyne zadanie milestona done -> brak task/deferred, wiersz milestone w D i D+1
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set status = 'done', deferred_until = null
    where id = '73000000-0000-0000-0000-000000000001'$$,
  'akcja Zrobione (update status = done) przechodzi');

select results_eq(
  $$select g.d, l.kind, coalesce(l.task_title, l.milestone_name)
    from (values ('2026-10-21'::date), ('2026-10-22'::date)) g(d)
    cross join lateral public.today_list(g.d) l
    where l.project_id = '71000000-0000-0000-0000-000000000001'
    order by 1$$,
  $$values
    ('2026-10-21'::date, 'milestone', 'mE1'),
    ('2026-10-22'::date, 'milestone', 'mE1')$$,
  'zrobione ostatnie zadanie: w D i D+1 tylko wiersz milestone (do zamkniecia), brak task/deferred');

-- ---------------------------------------------------------------------------
-- Czesciowo: task ze statusem partial w D i D+1
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set status = 'partial', deferred_until = null
    where id = '73000000-0000-0000-0000-000000000002'$$,
  'akcja Czesciowo (update status = partial) przechodzi');

select results_eq(
  $$select g.d, l.kind, l.task_title, l.task_status
    from (values ('2026-10-21'::date), ('2026-10-22'::date)) g(d)
    cross join lateral public.today_list(g.d) l
    where l.project_id = '71000000-0000-0000-0000-000000000002'
    order by 1$$,
  $$values
    ('2026-10-21'::date, 'task', 'e2-do-czesciowo', 'partial'),
    ('2026-10-22'::date, 'task', 'e2-do-czesciowo', 'partial')$$,
  'czesciowo: zadanie partial jest task ze statusem partial w D i D+1');

-- ---------------------------------------------------------------------------
-- Na jutro (todo i partial): deferred w D, task w D+1, status bez zmian
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set deferred_until = '2026-10-22'
    where milestone_id = '72000000-0000-0000-0000-000000000003'$$,
  'akcja Na jutro (update deferred_until = jutro) przechodzi');

select results_eq(
  $$select g.d, l.kind, l.task_title, l.task_status
    from (values ('2026-10-21'::date), ('2026-10-22'::date)) g(d)
    cross join lateral public.today_list(g.d) l
    where l.project_id = '71000000-0000-0000-0000-000000000003'
    order by 1, 3$$,
  $$values
    ('2026-10-21'::date, 'deferred', 'e3-partial-na-jutro', 'partial'),
    ('2026-10-21'::date, 'deferred', 'e3-todo-na-jutro', 'todo'),
    ('2026-10-22'::date, 'task', 'e3-partial-na-jutro', 'partial'),
    ('2026-10-22'::date, 'task', 'e3-todo-na-jutro', 'todo')$$,
  'na jutro: deferred w D i task w D+1, status (todo, partial) bez zmian');

-- ---------------------------------------------------------------------------
-- Zapis statusu po przeniesieniu i "Przywroc": zadanie wraca na dzis
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set deferred_until = '2026-10-22'
    where milestone_id = '72000000-0000-0000-0000-000000000005'$$,
  'przeniesienie zadan projektu 5 na jutro przechodzi');

-- Przed zapisem statusu: oba przeniesione (kontrola pozytywna dla nastepnego asercji)
select results_eq(
  $$select l.kind, l.task_title
    from public.today_list('2026-10-21') l
    where l.project_id = '71000000-0000-0000-0000-000000000005'
    order by 2$$,
  $$values ('deferred', 'e5-przywroc'), ('deferred', 'e5-przywroc-status')$$,
  'przed zapisem statusu i przywroceniem oba zadania sa deferred w D');

select lives_ok(
  $$update public.tasks set status = 'partial', deferred_until = null
    where id = '73000000-0000-0000-0000-000000000006'$$,
  'zapis statusu partial po przeniesieniu (zeruje deferred_until) przechodzi');

select lives_ok(
  $$update public.tasks set deferred_until = null
    where id = '73000000-0000-0000-0000-000000000005'$$,
  'akcja Przywroc (deferred_until = null) przechodzi');

select results_eq(
  $$select l.kind, l.task_title, l.task_status
    from public.today_list('2026-10-21') l
    where l.project_id = '71000000-0000-0000-0000-000000000005'
    order by 2$$,
  $$values
    ('task', 'e5-przywroc', 'todo'),
    ('task', 'e5-przywroc-status', 'partial')$$,
  'po zapisie statusu i po przywroceniu oba zadania wracaja na dzis jako task');

-- ---------------------------------------------------------------------------
-- Milestone z jedynym zadaniem: przeniesione to niedokonczone (brak wiersza milestone), po
-- przywroceniu task, po zrobieniu milestone
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.tasks set deferred_until = '2026-10-22'
    where id = '73000000-0000-0000-0000-000000000007'$$,
  'przeniesienie jedynego zadania milestonu na jutro przechodzi');

select results_eq(
  $$select g.d, l.kind, coalesce(l.task_title, l.milestone_name)
    from (values ('2026-10-21'::date), ('2026-10-22'::date)) g(d)
    cross join lateral public.today_list(g.d) l
    where l.project_id = '71000000-0000-0000-0000-000000000006'
    order by 1$$,
  $$values
    ('2026-10-21'::date, 'deferred', 'e6-jedyne'),
    ('2026-10-22'::date, 'task', 'e6-jedyne')$$,
  'jedyne zadanie przeniesione: w D tylko deferred (bez wiersza milestone), w D+1 task');

select lives_ok(
  $$update public.tasks set deferred_until = null
    where id = '73000000-0000-0000-0000-000000000007'$$,
  'przywrocenie jedynego zadania przechodzi');

select results_eq(
  $$select l.kind, coalesce(l.task_title, l.milestone_name)
    from public.today_list('2026-10-21') l
    where l.project_id = '71000000-0000-0000-0000-000000000006'$$,
  $$values ('task', 'e6-jedyne')$$,
  'jedyne zadanie po przywroceniu: task w D, bez wiersza milestone');

select lives_ok(
  $$update public.tasks set status = 'done', deferred_until = null
    where id = '73000000-0000-0000-0000-000000000007'$$,
  'zrobienie przywroconego zadania przechodzi');

select results_eq(
  $$select l.kind, coalesce(l.task_title, l.milestone_name)
    from public.today_list('2026-10-21') l
    where l.project_id = '71000000-0000-0000-0000-000000000006'$$,
  $$values ('milestone', 'mE6')$$,
  'jedyne zadanie po przywroceniu i zrobieniu: w D wiersz milestone');

-- ---------------------------------------------------------------------------
-- Przeniesienie wystapienia (rytm: sroda i piatek, D = sroda 2026-10-21)
-- ---------------------------------------------------------------------------

select is(
  (select l.task_can_move from public.today_list('2026-10-21') l
   where l.task_id = '73000000-0000-0000-0000-000000000008' and l.kind = 'routine'),
  true,
  'przed przeniesieniem: wystapienie w srode jest routine z task_can_move = prawda');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('73000000-0000-0000-0000-000000000008', '2026-10-21', 'moved', '2026-10-22')$$,
  'przeniesienie srody na czwartek przechodzi');

select is_empty(
  $$select 1 from public.today_list('2026-10-21') l
    where l.task_id = '73000000-0000-0000-0000-000000000008'$$,
  'po przeniesieniu w srode nie ma wiersza zadania (ani routine, ani skipped)');

select results_eq(
  $$select l.kind, l.task_moved_from, l.task_can_move
    from public.today_list('2026-10-22') l
    where l.task_id = '73000000-0000-0000-0000-000000000008'$$,
  $$values ('routine', '2026-10-21'::date, false)$$,
  'czwartek: wiersz routine z task_moved_from = sroda, task_can_move = falsz (przeniesienie jednorazowe)');

select results_eq(
  $$select l.kind from public.today_list('2026-10-23') l
    where l.task_id = '73000000-0000-0000-0000-000000000008'$$,
  $$values ('routine'), ('skipped')$$,
  'piatek: wiersz routine (rytm) i skipped (nieodhaczony czwartek)');

reset role;

select * from finish();
rollback;
