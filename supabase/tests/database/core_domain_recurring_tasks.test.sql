-- Testy zadan powtarzalnych (S-07): rytm na tasks, odhaczenia task_occurrences, reguly zamykania
-- i nowy rodzaj wiersza 'routine' w public.today_list(p_today).
-- Dane bazowe wstawiamy jako postgres (RLS omijane); reszta dziala w roli authenticated z kontekstem
-- JWT (auth.uid()), a odrzucenie anon w roli anon.
-- Daty sa stale (rutyny startuja 2026-10-19 = dzien 0), bo logika zalezy od dnia. Komunikaty sa
-- kontraktem z serwisami aplikacji (dopasowanie po tekscie).
begin;

create extension if not exists pgtap with schema extensions;

select plan(61);

-- Uzytkownicy: a1 (wlasciciel danych), b1 (test izolacji RLS)
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'b@example.test');

-- Projekty (termin 2026-12-31): 1 rytmy i granice; 2 dalszy milestone; 3 rutyna nad przeterminowanym;
-- 4 zamykanie i ponowne otwarcie; 5 blokada zamkniecia zadaniem niepowtarzalnym; 6 odhaczenia
insert into public.projects (id, user_id, name, life_area, due_date)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'P1 rytmy', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'P2 dalszy milestone', 'dom', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'P3 przeterminowane', 'sport', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'P4 zamykanie', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'P5 blokada', 'praca', '2026-12-31'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', 'P6 odhaczenia', 'dom', '2026-12-31');

-- Milestony (kolejnosc wstawiania wyznacza seq)
insert into public.milestones (id, user_id, project_id, name, due_date)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'm1', '2026-10-25'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', 'm2 najblizszy', '2026-10-22'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', 'm3 dalszy', '2026-11-30'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000003', 'm4', '2026-10-25'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000004', 'm5', '2026-10-25'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000005', 'm6', '2026-10-25'),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000006', 'm7', '2026-10-25');

-- Zadania: t1 codziennie, t2 co 2 dni (m1); t3 zwykle bez terminu (m2); t4 codziennie (m3 dalszy);
-- t5 zwykle przeterminowane i t6 codziennie (m4); t7 codziennie (m5, same rutyny);
-- t8 codziennie i t9 zwykle todo (m6); t10 co 2 dni (m7)
insert into public.tasks (id, user_id, milestone_id, title, due_date, recurrence_interval_days, recurrence_start_date)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'r-codziennie', null, 1, '2026-10-19'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'r-co-2-dni', null, 2, '2026-10-19'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000002', 'zwykle', null, null, null),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000003', 'r-dalszy-milestone', null, 1, '2026-10-19'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000004', 'przeterminowane', '2026-10-10', null, null),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000004', 'r-nad-przeterminowanym', null, 1, '2026-10-19'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000005', 'r-sama', null, 1, '2026-10-19'),
  ('30000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000006', 'r-obok-zwyklego', null, 1, '2026-10-19'),
  ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000006', 'zwykle-todo', null, null, null),
  ('30000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000007', 'r-do-odhaczania', null, 2, '2026-10-19');

-- ---------------------------------------------------------------------------
-- Struktura i uprawnienia (jako postgres)
-- ---------------------------------------------------------------------------

select has_column('public', 'tasks', 'recurrence_interval_days', 'tasks.recurrence_interval_days istnieje');
select has_column('public', 'tasks', 'recurrence_start_date', 'tasks.recurrence_start_date istnieje');
select has_table('public', 'task_occurrences', 'tabela task_occurrences istnieje');
select has_trigger('public', 'task_occurrences', 'task_occurrences_check_occurrence', 'trigger walidacji odhaczenia istnieje');

select is(
  (select relrowsecurity from pg_class where oid = 'public.task_occurrences'::regclass),
  true, 'RLS wlaczone na task_occurrences');

select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'task_occurrences' and roles = '{authenticated}'),
  3::bigint, 'task_occurrences ma trzy polityki dla authenticated (bez update)');

select ok(
  has_table_privilege('authenticated', 'public.task_occurrences', 'SELECT')
    and has_table_privilege('authenticated', 'public.task_occurrences', 'INSERT')
    and has_table_privilege('authenticated', 'public.task_occurrences', 'DELETE')
    and not has_table_privilege('authenticated', 'public.task_occurrences', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.task_occurrences', 'TRUNCATE'),
  'authenticated: select/insert/delete na task_occurrences, bez update i truncate');

-- ---------------------------------------------------------------------------
-- Uzytkownik a1: kwalifikacja na liscie
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select results_eq(
  $$select d, (select count(*) from public.today_list(d) where task_id = '30000000-0000-0000-0000-000000000001' and kind = 'routine')
    from (values ('2026-10-19'::date), ('2026-10-20'::date), ('2026-10-21'::date)) v(d) order by d$$,
  $$values ('2026-10-19'::date, 1::bigint), ('2026-10-20'::date, 1::bigint), ('2026-10-21'::date, 1::bigint)$$,
  'rutyna codzienna: widoczna w dniu 0 i w kolejnych dniach');

select results_eq(
  $$select d, (select count(*) from public.today_list(d) where task_id = '30000000-0000-0000-0000-000000000002' and kind = 'routine')
    from (values ('2026-10-19'::date), ('2026-10-20'::date), ('2026-10-21'::date), ('2026-10-22'::date), ('2026-10-23'::date))
      v(d) order by d$$,
  $$values
    ('2026-10-19'::date, 1::bigint),
    ('2026-10-20'::date, 0::bigint),
    ('2026-10-21'::date, 1::bigint),
    ('2026-10-22'::date, 0::bigint),
    ('2026-10-23'::date, 1::bigint)$$,
  'rutyna co 2 dni: widoczna w dniach 0/2/4, niewidoczna w dniach 1/3');

select results_eq(
  $$select d, (select count(*) from public.today_list(d) where task_id = '30000000-0000-0000-0000-000000000001' and kind = 'routine')
    from (values ('2026-10-25'::date), ('2026-10-26'::date)) v(d) order by d$$,
  $$values ('2026-10-25'::date, 1::bigint), ('2026-10-26'::date, 0::bigint)$$,
  'ostatni dzien rowny dacie milestona widoczny, nastepny dzien nie');

select is(
  (select count(*) from public.today_list('2026-10-18') where task_id = '30000000-0000-0000-0000-000000000001'),
  0::bigint,
  'przed dniem startu rutyna jest niewidoczna');

select is(
  (select kind from public.today_list('2026-10-19') where task_id = '30000000-0000-0000-0000-000000000002'),
  'routine',
  'wiersz rutyny ma rodzaj routine');

select is(
  (select task_recurrence_interval_days from public.today_list('2026-10-19')
    where task_id = '30000000-0000-0000-0000-000000000002'),
  2::smallint,
  'wiersz routine niesie rytm w task_recurrence_interval_days');

select is(
  (select task_recurrence_interval_days from public.today_list('2026-10-19')
    where task_id = '30000000-0000-0000-0000-000000000003'),
  null::smallint,
  'wiersz task ma NULL w task_recurrence_interval_days');

select results_eq(
  $$select kind, coalesce(task_title, milestone_name) from public.today_list('2026-10-20')
    where project_id = '10000000-0000-0000-0000-000000000002' and kind <> 'skipped'$$,
  $$values ('routine', 'r-dalszy-milestone'), ('task', 'zwykle')$$,
  'rutyna z dalszego (nie najblizszego) milestona jest widoczna, na szczycie');

select results_eq(
  $$select kind, task_title from public.today_list('2026-10-20')
    where project_id = '10000000-0000-0000-0000-000000000003' and kind <> 'skipped'$$,
  $$values ('routine', 'r-nad-przeterminowanym'), ('task', 'przeterminowane')$$,
  'rutyna jest nad zadaniem przeterminowanym');

-- ---------------------------------------------------------------------------
-- Ograniczenia i reguly na tasks
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'start po milestonie', 1, '2026-10-26')$$,
  '23514',
  'Powtarzanie zadania nie moze zaczac sie (2026-10-26) po dacie milestona (2026-10-25)',
  'start rytmu po dacie milestona odrzucony');

select lives_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'start w dniu milestona', 3, '2026-10-25')$$,
  'start rytmu rowny dacie milestona przechodzi');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'x0', 0, '2026-10-19')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_interval_check"',
  'interwal 0 odrzucony');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'x31', 31, '2026-10-19')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_interval_check"',
  'interwal 31 odrzucony');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_interval_days)
    values ('20000000-0000-0000-0000-000000000001', 'sam interwal', 2)$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_pair_check"',
  'interwal bez daty startu odrzucony');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'sam start', '2026-10-19')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_pair_check"',
  'data startu bez interwalu odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, due_date, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'z terminem', '2026-10-24', 1, '2026-10-19')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'rutyna z due_date odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, status, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'done', 'done', 1, '2026-10-19')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'rutyna ze statusem done odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, status, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'partial', 'partial', 1, '2026-10-19')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'rutyna ze statusem partial odrzucona');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, deferred_until, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000001', 'przeniesiona', '2026-10-20', 1, '2026-10-19')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'rutyna z deferred_until odrzucona');

select throws_ok(
  $$update public.tasks set status = 'done' where id = '30000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"',
  'zmiana statusu rutyny na done odrzucona');

-- ---------------------------------------------------------------------------
-- Data milestona a start rutyny (m3: jedna rutyna t4, start 2026-10-19)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.milestones set due_date = '2026-10-18'
    where id = '20000000-0000-0000-0000-000000000003'$$,
  '23514',
  'Nie mozna przesunac daty milestona: zadania z pozniejszym terminem (1)',
  'data milestona wczesniejsza niz start rutyny odrzucona (rutyna nie znika po cichu)');

select lives_ok(
  $$update public.milestones set due_date = '2026-10-19'
    where id = '20000000-0000-0000-0000-000000000003'$$,
  'data milestona rowna startowi rutyny przechodzi');

-- ---------------------------------------------------------------------------
-- Zamykanie milestona (m5: sama rutyna; m6: rutyna + zwykle zadanie todo)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000006'$$,
  '23514',
  'Milestone nie moze zostac zamkniety: niezrobione zadania (1)',
  'zamkniecie milestona z niezrobionym zadaniem niepowtarzalnym nadal blokowane (rutyna nie liczy sie)');

select results_eq(
  $$select kind, coalesce(task_title, milestone_name) from public.today_list('2026-10-20')
    where project_id = '10000000-0000-0000-0000-000000000004' and kind <> 'skipped'$$,
  $$values ('routine', 'r-sama'), ('milestone', 'm5')$$,
  'milestone z samymi rutynami jest wierszem do zamkniecia, rutyna na szczycie');

select lives_ok(
  $$update public.milestones set completed_at = now()
    where id = '20000000-0000-0000-0000-000000000005'$$,
  'zamkniecie milestona z sama rutyna przechodzi');

select is_empty(
  $$select 1 from public.today_list('2026-10-20')
    where project_id = '10000000-0000-0000-0000-000000000004'$$,
  'zamkniety milestone ukrywa rutyne');

select throws_ok(
  $$insert into public.tasks (milestone_id, title, recurrence_interval_days, recurrence_start_date)
    values ('20000000-0000-0000-0000-000000000005', 'rutyna do zamknietego', 1, '2026-10-19')$$,
  '23514',
  'Zamkniety milestone nie moze miec niezrobionych zadan',
  'wstawienie rutyny do zamknietego milestona odrzucone');

select throws_ok(
  $$update public.tasks set milestone_id = '20000000-0000-0000-0000-000000000005'
    where id = '30000000-0000-0000-0000-000000000008'$$,
  '23514',
  'Zamkniety milestone nie moze miec niezrobionych zadan',
  'przeniesienie rutyny do zamknietego milestona odrzucone');

select lives_ok(
  $$update public.tasks set recurrence_interval_days = 1
    where id = '30000000-0000-0000-0000-000000000007'$$,
  'aktualizacja rutyny w zamknietym milestonie (bez zmiany milestona) przechodzi');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000007', '2026-10-20')$$,
  '23514',
  'Wystapienie nie moze dotyczyc zamknietego milestona',
  'odhaczenie wystapienia w zamknietym milestonie odrzucone');

select lives_ok(
  $$update public.milestones set completed_at = null
    where id = '20000000-0000-0000-0000-000000000005'$$,
  'ponowne otwarcie milestona z rutyna przechodzi');

select results_eq(
  $$select kind, coalesce(task_title, milestone_name) from public.today_list('2026-10-20')
    where project_id = '10000000-0000-0000-0000-000000000004' and kind <> 'skipped'$$,
  $$values ('routine', 'r-sama'), ('milestone', 'm5')$$,
  'ponowne otwarcie milestona przywraca rutyne');

-- ---------------------------------------------------------------------------
-- Odhaczenia wystapien (t10: co 2 dni od 2026-10-19, m7 do 2026-10-25)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-19')$$,
  'odhaczenie pasujacego dnia przechodzi (user_id z auth.uid())');

select is_empty(
  $$select 1 from public.today_list('2026-10-19') where task_id = '30000000-0000-0000-0000-000000000010'$$,
  'odhaczenie dnia ukrywa wystapienie');

select is(
  (select count(*) from public.today_list('2026-10-21') where task_id = '30000000-0000-0000-0000-000000000010'),
  1::bigint,
  'nastepny pasujacy dzien po odhaczeniu wraca');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-20')$$,
  '23514',
  'Wystapienie (2026-10-20) nie pasuje do rytmu zadania',
  'odhaczenie niepasujacego dnia odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-27')$$,
  '23514',
  'Wystapienie (2026-10-27) wykracza poza zakres powtarzania zadania (2026-10-19 - 2026-10-25)',
  'odhaczenie dnia po dacie milestona odrzucone (nawet gdy pasuje do rytmu)');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-17')$$,
  '23514',
  'Wystapienie (2026-10-17) wykracza poza zakres powtarzania zadania (2026-10-19 - 2026-10-25)',
  'odhaczenie dnia przed startem odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000003', '2026-10-19')$$,
  '23514',
  'Wystapienie dotyczy zadania, ktore nie jest powtarzalne',
  'odhaczenie zadania niepowtarzalnego odrzucone');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-19')$$,
  '23505', null,
  'drugie odhaczenie tego samego dnia odrzucone kluczem glownym');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date, state)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-21', 'skipped')$$,
  '23514', null,
  'stan inny niz done odrzucony');

-- ---------------------------------------------------------------------------
-- RLS: uzytkownik b1 nie widzi ani nie wstawia odhaczen cudzego zadania
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is_empty(
  $$select 1 from public.task_occurrences$$,
  'b1 nie widzi odhaczen a1');

select throws_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-21')$$,
  '23503', null,
  'b1 nie odhaczy cudzego zadania (klucz obcy)');

select throws_ok(
  $$insert into public.task_occurrences (task_id, user_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000a1', '2026-10-21')$$,
  '42501', null,
  'b1 nie wstawi odhaczenia z user_id a1');

select lives_ok(
  $$delete from public.task_occurrences$$,
  'b1 nie usuwa cudzych odhaczen (0 wierszy)');

-- a1 dalej widzi swoje odhaczenie, nie edytuje go, ale moze je usunac
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*) from public.task_occurrences where task_id = '30000000-0000-0000-0000-000000000010'),
  1::bigint,
  'a1 widzi swoje odhaczenie (odhaczenie nietkniete przez b1)');

select throws_ok(
  $$update public.task_occurrences set state = 'done' where task_id = '30000000-0000-0000-0000-000000000010'$$,
  '42501', null,
  'authenticated nie edytuje odhaczen (brak uprawnienia update)');

select lives_ok(
  $$delete from public.task_occurrences
    where task_id = '30000000-0000-0000-0000-000000000010' and occurrence_date = '2026-10-19'$$,
  'a1 usuwa wlasne odhaczenie');

select is(
  (select count(*) from public.today_list('2026-10-19') where task_id = '30000000-0000-0000-0000-000000000010'),
  1::bigint,
  'po usunieciu odhaczenia wystapienie wraca na liste');

-- Kaskada: usuniecie zadania kasuje jego odhaczenia
select lives_ok(
  $$insert into public.task_occurrences (task_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000010', '2026-10-21')$$,
  'a1 odhacza kolejne wystapienie');

select lives_ok(
  $$delete from public.tasks where id = '30000000-0000-0000-0000-000000000010'$$,
  'a1 usuwa zadanie powtarzalne');

select is(
  (select count(*) from public.task_occurrences where task_id = '30000000-0000-0000-0000-000000000010'),
  0::bigint,
  'usuniecie zadania kasuje jego odhaczenia');

-- ---------------------------------------------------------------------------
-- Rola anon: brak dostepu
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '';

select throws_ok(
  $$select * from public.task_occurrences$$,
  '42501', null, 'anon nie czyta task_occurrences');

select throws_ok(
  $$insert into public.task_occurrences (task_id, user_id, occurrence_date)
    values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '2026-10-19')$$,
  '42501', null, 'anon nie wstawia do task_occurrences');

reset role;

select * from finish();
rollback;
