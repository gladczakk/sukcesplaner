-- Testy luk zmiany rytmu zadania powtarzalnego (S-10, ryzyko #5): dwie zmiany rytmu pod rzad, zmiana rytmu
-- w zamknietym milestonie, zmiana ze startem za data milestona i usuniecie zadania z kaskada wierszy done/moved.
-- Uzupelnia core_domain_recurring_rhythm_change.test.sql (scenariusze A-G); nie powtarza ich.
-- Zmiany rytmu wykonujemy jako authenticated jednym UPDATE z nowym rytmem i recurrence_start_date = dzien
-- zmiany (tak jak aplikacja); stan sprawdzamy zapytaniem o wiersze task_occurrences i lista today_list.
-- Dane bazowe wstawiamy jako postgres (RLS omijane); wyzwalacze dzialaja.
-- Wyrocznia (reczne oczekiwania, nie z implementacji): PRD v2 - rytm zmieniony od dzis ma date startu = dzis,
-- przyszle przeniesienia znikaja, wiersze "zrobione" zostaja, usuniecie zadania usuwa odhaczenia; decyzja S-10 -
-- granica czyszczenia to wiersze 'moved' ze zrodlem albo celem >= nowej daty startu.
-- NIEROZSTRZYGNIETE W PRD: czy baza ma przyjac sama zmiane rytmu w zamknietym milestonie. Test pinuje obecne
-- zachowanie (przyjmuje; lives_ok), a nie wymaganie; rozstrzygniecie trafia do Open Questions. Pewne z PRD
-- jest tylko to, ze po zamknieciu milestona powtarzanie sie konczy (brak routine/skipped na liscie).
-- Daty stale: 2026-10-14 sroda, 10-16 piatek, 10-21 sroda, 10-22 czwartek, 10-23 piatek, 10-24 sobota,
-- 10-26 poniedzialek, 10-27 wtorek, 10-28 sroda, 11-02 poniedzialek, 11-03 wtorek. Dni ISO: 1 = pn ... 7 = nd.
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'f@example.test');

insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('81000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'PF1 dwie zmiany', 'praca', '2027-06-30'),
  ('81000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'PF2 zamkniety', 'praca', '2027-06-30'),
  ('81000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f1', 'PF3 start za data', 'praca', '2027-06-30'),
  ('81000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000f1', 'PF4 usuniecie', 'praca', '2027-06-30');

insert into public.milestones (id, user_id, project_id, name, due_date)
values
  ('82000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '81000000-0000-0000-0000-000000000001', 'mF1', '2026-11-30'),
  ('82000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', '81000000-0000-0000-0000-000000000002', 'mF2', '2026-11-30'),
  ('82000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f1', '81000000-0000-0000-0000-000000000003', 'mF3', '2026-10-30'),
  ('82000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000f1', '81000000-0000-0000-0000-000000000004', 'mF4', '2026-11-30');

-- Zadania z rytmem sr+pt od 2026-10-14 (sroda); r3 od 2026-10-21
insert into public.tasks (id, user_id, milestone_id, title, due_date, recurrence_interval_days, recurrence_weekdays, recurrence_start_date)
values
  ('83000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '82000000-0000-0000-0000-000000000001', 'r1-dwie-zmiany', null, null, '{3,5}', '2026-10-14'),
  ('83000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', '82000000-0000-0000-0000-000000000002', 'r2-zamkniety-milestone', null, null, '{3,5}', '2026-10-14'),
  ('83000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f1', '82000000-0000-0000-0000-000000000003', 'r3-start-za-data-milestona', null, null, '{3,5}', '2026-10-21'),
  ('83000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000f1', '82000000-0000-0000-0000-000000000004', 'r4-usuwane', null, null, '{3,5}', '2026-10-14'),
  ('83000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000f1', '82000000-0000-0000-0000-000000000004', 'r4-zostaje', null, null, '{3,5}', '2026-10-14');

-- Wiersze wystapien (jako postgres), wszystkie na dniach rytmu (zrodla) albo poza nimi (cele przeniesien)
insert into public.task_occurrences (task_id, user_id, occurrence_date, state, moved_to)
values
  -- r1: done sr 14 i pt 16 (przed D1), przeniesienia sr 21 -> cz 22 i pt 23 -> sob 24 (od D1 wzwyz)
  ('83000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '2026-10-14', 'done', null),
  ('83000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '2026-10-16', 'done', null),
  ('83000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '2026-10-21', 'moved', '2026-10-22'),
  ('83000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '2026-10-23', 'moved', '2026-10-24'),
  -- r2: done sr 14, przeniesienie sr 21 -> cz 22 (oba dni przed nowym startem), potem zamkniecie milestona
  ('83000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', '2026-10-14', 'done', null),
  ('83000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', '2026-10-21', 'moved', '2026-10-22'),
  -- r3: przeniesienie sr 21 -> cz 22 i done pt 23
  ('83000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f1', '2026-10-21', 'moved', '2026-10-22'),
  ('83000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f1', '2026-10-23', 'done', null),
  -- r4 (oba zadania tak samo): done sr 14 i przeniesienie sr 21 -> cz 22
  ('83000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000f1', '2026-10-14', 'done', null),
  ('83000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000f1', '2026-10-21', 'moved', '2026-10-22'),
  ('83000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000f1', '2026-10-14', 'done', null),
  ('83000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000f1', '2026-10-21', 'moved', '2026-10-22');

-- Zamkniecie milestona r2 (same rutyny, wiec dozwolone) jako postgres
update public.milestones set completed_at = now() where id = '82000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

-- Straznik dat (1): dni tygodnia wybranych dat
select results_eq(
  $$select extract(isodow from d)::int
    from (values ('2026-10-14'::date), ('2026-10-16'::date), ('2026-10-22'::date), ('2026-10-26'::date),
                 ('2026-10-27'::date), ('2026-10-28'::date), ('2026-11-02'::date), ('2026-11-03'::date)) v(d)
    order by d$$,
  $$values (3), (5), (4), (1), (2), (3), (1), (2)$$,
  'dni testu: 14.10 sroda, 16.10 piatek, 22.10 czwartek, 26.10 pn, 27.10 wt, 28.10 sr, 02.11 pn, 03.11 wt');

-- ---------------------------------------------------------------------------
-- r1: dwie zmiany rytmu pod rzad (D1 = 2026-10-22, D2 = 2026-10-28)
-- ---------------------------------------------------------------------------

-- Kontrola pozytywna (2): zadanie r1 ma na starcie cztery wiersze
select is(
  (select count(*) from public.task_occurrences where task_id = '83000000-0000-0000-0000-000000000001'),
  4::bigint,
  'r1: na starcie cztery wiersze (dwa done, dwa moved)');

-- (3)
select lives_ok(
  $$update public.tasks set recurrence_weekdays = '{1,3}', recurrence_start_date = '2026-10-22'
    where id = '83000000-0000-0000-0000-000000000001'$$,
  'r1: pierwsza zmiana rytmu (D1 = 2026-10-22) przyjeta');

-- (4) wspolne zapytanie stanu r1 uzywane po kazdym kroku (trzy razy, rozne oczekiwania)
select results_eq(
  $$select occurrence_date, state, moved_to from public.task_occurrences
    where task_id = '83000000-0000-0000-0000-000000000001' order by occurrence_date$$,
  $$values ('2026-10-14'::date, 'done', null::date), ('2026-10-16'::date, 'done', null::date)$$,
  'r1 po pierwszej zmianie: oba przeniesienia (zrodlo albo cel >= D1) usuniete, oba done sprzed D1 zostaja');

-- (5)-(7) nowe wiersze w nowym rytmie (pn, sr): przeniesienie pn 26 -> wt 27 (przed D2), przeniesienie pn 02.11 -> wt 03.11
-- (po D2) i done sr 28 (na dniu D2)
select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('83000000-0000-0000-0000-000000000001', '2026-10-26', 'moved', '2026-10-27')$$,
  'r1: przeniesienie pn 2026-10-26 -> wt 2026-10-27 w nowym rytmie przechodzi');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state, moved_to)
    values ('83000000-0000-0000-0000-000000000001', '2026-11-02', 'moved', '2026-11-03')$$,
  'r1: przeniesienie pn 2026-11-02 -> wt 2026-11-03 w nowym rytmie przechodzi');

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state)
    values ('83000000-0000-0000-0000-000000000001', '2026-10-28', 'done')$$,
  'r1: odhaczenie sr 2026-10-28 w nowym rytmie przechodzi');

-- (8)
select results_eq(
  $$select occurrence_date, state, moved_to from public.task_occurrences
    where task_id = '83000000-0000-0000-0000-000000000001' order by occurrence_date$$,
  $$values
    ('2026-10-14'::date, 'done', null::date),
    ('2026-10-16'::date, 'done', null::date),
    ('2026-10-26'::date, 'moved', '2026-10-27'::date),
    ('2026-10-28'::date, 'done', null::date),
    ('2026-11-02'::date, 'moved', '2026-11-03'::date)$$,
  'r1 przed druga zmiana: piec wierszy (kontrola pozytywna zbioru)');

-- (9)
select lives_ok(
  $$update public.tasks set recurrence_weekdays = '{1,3,5}', recurrence_start_date = '2026-10-28'
    where id = '83000000-0000-0000-0000-000000000001'$$,
  'r1: druga zmiana rytmu (D2 = 2026-10-28) przyjeta');

-- (10)
select results_eq(
  $$select occurrence_date, state, moved_to from public.task_occurrences
    where task_id = '83000000-0000-0000-0000-000000000001' order by occurrence_date$$,
  $$values
    ('2026-10-14'::date, 'done', null::date),
    ('2026-10-16'::date, 'done', null::date),
    ('2026-10-26'::date, 'moved', '2026-10-27'::date),
    ('2026-10-28'::date, 'done', null::date)$$,
  'r1 po drugiej zmianie: przeniesienie >= D2 usuniete, done i przeniesienie sprzed D2 zostaja');

-- (11) wtorek 27.10 leży przed nowym startem D2: lista nie pokazuje rytmu sprzed startu (wiersz przeniesienia
-- zostaje w tabeli jako historia, ale nie wraca na liste)
select is_empty(
  $$select 1 from public.today_list('2026-10-27') l
    where l.task_id = '83000000-0000-0000-0000-000000000001'$$,
  'r1: we wtorek 27.10 (przed nowym startem D2) brak wiersza zadania na liscie');

-- (12) przeniesienie usuniete: wtorek 03.11 nie ma duchowego routine, jest tylko pominiete poniedzialkowe 02.11
select results_eq(
  $$select l.kind from public.today_list('2026-11-03') l
    where l.task_id = '83000000-0000-0000-0000-000000000001'$$,
  $$values ('skipped')$$,
  'r1: we wtorek 03.11 tylko skipped z poniedzialku 02.11, bez routine po usunietym przeniesieniu');

-- ---------------------------------------------------------------------------
-- r2: zmiana rytmu w zamknietym milestonie (NIEROZSTRZYGNIETE W PRD, pinujemy obecne zachowanie)
-- ---------------------------------------------------------------------------

-- (13)
select isnt(
  (select completed_at from public.milestones where id = '82000000-0000-0000-0000-000000000002'),
  null,
  'r2: milestone zadania jest zamkniety (dane testu)');

-- (14)
select lives_ok(
  $$update public.tasks set recurrence_weekdays = '{1,3}', recurrence_start_date = '2026-10-26'
    where id = '83000000-0000-0000-0000-000000000002'$$,
  'r2: zmiana rytmu w zamknietym milestonie przyjeta (obecne zachowanie, w PRD nierozstrzygniete)');

-- (15)
select results_eq(
  $$select occurrence_date, state, moved_to from public.task_occurrences
    where task_id = '83000000-0000-0000-0000-000000000002' order by occurrence_date$$,
  $$values ('2026-10-14'::date, 'done', null::date), ('2026-10-21'::date, 'moved', '2026-10-22'::date)$$,
  'r2: done i przeniesienie sprzed nowego startu zostaja');

-- (16)
select is_empty(
  $$select 1 from (values ('2026-10-26'::date), ('2026-10-27'::date), ('2026-10-28'::date), ('2026-11-02'::date)) g(d)
    cross join lateral public.today_list(g.d) l
    where l.task_id = '83000000-0000-0000-0000-000000000002'$$,
  'r2: po zmianie rytmu zamkniety milestone nie daje wiersza routine ani skipped (zamkniecie konczy powtarzanie)');

-- ---------------------------------------------------------------------------
-- r3: start rytmu za data milestona (milestone do 2026-10-30)
-- ---------------------------------------------------------------------------

-- (17)
select throws_ok(
  $$update public.tasks set recurrence_weekdays = '{1,3}', recurrence_start_date = '2026-10-31'
    where id = '83000000-0000-0000-0000-000000000003'$$,
  '23514',
  'Powtarzanie zadania nie moze zaczac sie (2026-10-31) po dacie milestona (2026-10-30)',
  'r3: zmiana rytmu ze startem po dacie milestona odrzucona');

-- (18)
select results_eq(
  $$select occurrence_date, state, moved_to from public.task_occurrences
    where task_id = '83000000-0000-0000-0000-000000000003' order by occurrence_date$$,
  $$values ('2026-10-21'::date, 'moved', '2026-10-22'::date), ('2026-10-23'::date, 'done', null::date)$$,
  'r3: po odrzuceniu wiersze wystapien bez zmian');

-- (19)
select results_eq(
  $$select recurrence_weekdays::int[], recurrence_start_date from public.tasks
    where id = '83000000-0000-0000-0000-000000000003'$$,
  $$values ('{3,5}'::int[], '2026-10-21'::date)$$,
  'r3: po odrzuceniu rytm i data startu zadania bez zmian');

-- ---------------------------------------------------------------------------
-- r4: usuniecie zadania usuwa jego done i moved (kaskada), wiersze innego zadania zostaja
-- ---------------------------------------------------------------------------

-- (20) kontrola pozytywna: oba zadania maja po dwa wiersze (done i moved)
select results_eq(
  $$select task_id, count(*) from public.task_occurrences
    where task_id in ('83000000-0000-0000-0000-000000000004', '83000000-0000-0000-0000-000000000005')
    group by task_id order by task_id$$,
  $$values ('83000000-0000-0000-0000-000000000004'::uuid, 2::bigint),
           ('83000000-0000-0000-0000-000000000005'::uuid, 2::bigint)$$,
  'r4: przed usunieciem oba zadania maja po dwa wiersze (done i moved)');

-- (21)
select lives_ok(
  $$delete from public.tasks where id = '83000000-0000-0000-0000-000000000004'$$,
  'r4: usuniecie zadania powtarzalnego przechodzi');

-- (22)
select is(
  (select count(*) from public.task_occurrences where task_id = '83000000-0000-0000-0000-000000000004'),
  0::bigint,
  'r4: po usunieciu zadania nie zostaje zaden jego wiersz (done ani moved)');

-- (23)
select results_eq(
  $$select occurrence_date, state from public.task_occurrences
    where task_id = '83000000-0000-0000-0000-000000000005' order by occurrence_date$$,
  $$values ('2026-10-14'::date, 'done'), ('2026-10-21'::date, 'moved')$$,
  'r4: wiersze innego zadania zostaja');

-- (24) kontrola pozytywna zbioru danych testu: dokladnie 5 zadan o oczekiwanych tytulach przed usunieciem
-- (po usunieciu r4-usuwane zostaje 4)
select is(
  (select count(*) from public.tasks
   where title in ('r1-dwie-zmiany', 'r2-zamkniety-milestone', 'r3-start-za-data-milestona', 'r4-usuwane', 'r4-zostaje')),
  4::bigint,
  'dane testu: po usunieciu r4-usuwane zostaja cztery zadania o oczekiwanych tytulach');

reset role;

select * from finish();
rollback;
