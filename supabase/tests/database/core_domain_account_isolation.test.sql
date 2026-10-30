-- Izolacja dwoch kont (ryzyko #7): konto B nie czyta ani nie zmienia danych konta A i odwrotnie, takze
-- dzieci (milestones, tasks, task_occurrences) i today_list.
-- Uzupelnia core_domain_rls.test.sql (jeden kierunek A -> B, trzy tabele, bez task_occurrences i listy);
-- nowa wartosc: kierunek B -> A tym samym kodem prob, task_occurrences w stanie 'moved', today_list z wierszami
-- routine/skipped/task/milestone, liczebnosc dzieci po delete projektu przez obce konto, wariant klucza (23505).
-- Anon: nie powtarzamy (core_domain_rls.test.sql, core_domain_today_list.test.sql).
-- Wyrocznia (z PRD, nie z kodu): Access Control i FR-001 - konto widzi i zmienia wylacznie wlasne rekordy;
-- cudze rekordy sa dla niego niewidoczne (odczyt pusty, update/delete bez efektu i bez bledu), a proba zapisu
-- z cudzym user_id jest odrzucona.
-- Obserwacje (NIE wymagania z PRD):
-- - Wstawienie wlasnego dziecka pod cudzego rodzica konczy sie 23503 (klucz obcy; rodzic jest dla roli
--   niewidoczny, wiec check_task_occurrence zwraca new, a bledu dopiero klucz obcy).
-- - Wariant 23505: odhaczenie z kluczem (task_id cudzego zadania, istniejaca u ofiary data 2026-10-14), user_id
--   aktora. ZAOBSERWOWANY KOD: 23505 (unikalnosc task_occurrences_pkey).
--   Obserwacja, nie wymaganie. Oznacza to wyciek istnienia wiersza (wymaga znajomosci UUID zadania ofiary):
--   znane ryzyko, bez zmiany schematu.
-- Konwencja danych: konto A = ...00e1, konto B = ...00e2; symetryczne drzewo na konto, rozpoznawane po sufiksie
-- cyfry konta (1 -> A, 2 -> B). Prefiksy: 94 projekty (01 glowny, 11 dodatkowy), 95 milestony (01 z zadaniami,
-- 11 pusty), 96 zadanie jednorazowe, 97 rytm sr+pt (done sr 14.10, moved pt 16.10 -> sob 17.10),
-- 98 rytm sr+czw (dzis 15.10 daje routine, wczoraj 14.10 daje skipped).
-- Daty stale: "dzis" = 2026-10-15 (czwartek); 14.10 sroda, 16.10 piatek, 17.10 sobota. Dni ISO: 1 = pn ... 7 = nd.
-- Jeden kod prob: funkcja zz_iso_run(aktor, ofiara) wywolana dwa razy z zamienionymi kontami. Funkcje pomocnicze
-- powstaja w transakcji i znikaja z rollback.
begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'e1@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'e2@example.test');

-- Podstawianie znacznikow: {xu}/{yu} uzytkownik, {xl}/{yl} litera konta, {xp},{xp2},{xm},{xm2},{xt},{xr1},{xr2}
-- identyfikatory rekordow (x = aktor, y = ofiara).
create function public.zz_iso_q(q text, x text, y text)
returns text
language plpgsql
immutable
as $f$
declare
  r text := q;
  d text;
  side text;
  s int;
  i int;
  names text[] := array['p', 'p2', 'm', 'm2', 't', 'r1', 'r2'];
  pre text[] := array['94', '94', '95', '95', '96', '97', '98'];
  nn text[] := array['0', '1', '0', '1', '0', '0', '0'];
begin
  for s in 1..2 loop
    d := case s when 1 then x else y end;
    side := case s when 1 then 'x' else 'y' end;
    r := replace(r, '{' || side || 'u}', '00000000-0000-0000-0000-0000000000e' || d);
    r := replace(r, '{' || side || 'l}', case d when '1' then 'A' else 'B' end);
    for i in 1..7 loop
      r := replace(r, '{' || side || names[i] || '}', pre[i] || '000000-0000-0000-0000-0000000000' || nn[i] || d);
    end loop;
  end loop;
  return r;
end
$f$;

grant execute on function public.zz_iso_q(text, text, text) to authenticated;

-- Dane jednego konta (jako postgres, RLS omijane)
create function public.zz_iso_seed(x text)
returns void
language plpgsql
as $f$
begin
  execute public.zz_iso_q($q$
    insert into public.projects (id, user_id, name, life_area, due_date) values
      ('{xp}', '{xu}', '{xl} projekt', 'praca', '2026-12-31'),
      ('{xp2}', '{xu}', '{xl} projekt dodatkowy', 'dom', '2026-12-31')$q$, x, x);
  execute public.zz_iso_q($q$
    insert into public.milestones (id, user_id, project_id, name, due_date) values
      ('{xm}', '{xu}', '{xp}', '{xl} milestone', '2026-10-31'),
      ('{xm2}', '{xu}', '{xp2}', '{xl} milestone pusty', '2026-10-31')$q$, x, x);
  execute public.zz_iso_q($q$
    insert into public.tasks (id, user_id, milestone_id, title) values
      ('{xt}', '{xu}', '{xm}', '{xl} zadanie')$q$, x, x);
  execute public.zz_iso_q($q$
    insert into public.tasks (id, user_id, milestone_id, title, recurrence_weekdays, recurrence_start_date) values
      ('{xr1}', '{xu}', '{xm}', '{xl} rytm 1', '{3,5}', '2026-10-14'),
      ('{xr2}', '{xu}', '{xm}', '{xl} rytm 2', '{3,4}', '2026-10-14')$q$, x, x);
  execute public.zz_iso_q($q$
    insert into public.task_occurrences (task_id, user_id, occurrence_date, state, moved_to) values
      ('{xr1}', '{xu}', '2026-10-14', 'done', null),
      ('{xr1}', '{xu}', '2026-10-16', 'moved', '2026-10-17')$q$, x, x);
end
$f$;

select public.zz_iso_seed('1');
select public.zz_iso_seed('2');

-- Proby aktora x wobec ofiary y; zwraca dokladnie 32 asercje pgTAP
create function public.zz_iso_run(x text, y text)
returns setof text
language plpgsql
as $f$
declare
  xl text := case x when '1' then 'A' else 'B' end;
  yl text := case y when '1' then 'A' else 'B' end;
begin
  perform set_config('request.jwt.claim.sub', public.zz_iso_q('{xu}', x, y), true);
  perform set_config('request.jwt.claims', public.zz_iso_q('{"sub":"{xu}","role":"authenticated"}', x, y), true);
  execute 'set local role authenticated';

  -- ---- Odczyt (8) ----
  -- kontrola pozytywna: lista aktora to dokladnie jego wiersze (zadna pozycja ofiary)
  return next results_eq(
    public.zz_iso_q($q$select kind, project_id, milestone_id, task_id
      from public.today_list('2026-10-15') order by kind$q$, x, y),
    public.zz_iso_q($q$values
      ('milestone', '{xp2}'::uuid, '{xm2}'::uuid, null::uuid),
      ('routine', '{xp}'::uuid, '{xm}'::uuid, '{xr2}'::uuid),
      ('skipped', '{xp}'::uuid, '{xm}'::uuid, '{xr2}'::uuid),
      ('task', '{xp}'::uuid, '{xm}'::uuid, '{xt}'::uuid)$q$, x, y),
    xl || ': today_list(15.10) zwraca dokladnie wlasne wiersze milestone, routine, skipped i task');
  return next is_empty(
    public.zz_iso_q($q$select 1 from public.today_list('2026-10-15')
      where project_id in ('{yp}', '{yp2}')$q$, x, y),
    xl || ': today_list nie zawiera zadnego wiersza projektow konta ' || yl);
  -- kontrola pozytywna: aktor widzi wlasne dane (tabele nie sa puste)
  return next results_eq(
    $q$select (select count(*) from public.projects), (select count(*) from public.milestones),
              (select count(*) from public.tasks), (select count(*) from public.task_occurrences)$q$,
    $q$values (2::bigint, 2::bigint, 3::bigint, 2::bigint)$q$,
    xl || ': widzi tylko wlasne dane (2 projekty, 2 milestony, 3 zadania, 2 wystapienia)');
  return next is_empty(
    public.zz_iso_q($q$select 1 from public.projects where user_id = '{yu}'$q$, x, y),
    xl || ': nie widzi projektow konta ' || yl);
  return next is_empty(
    public.zz_iso_q($q$select 1 from public.milestones where user_id = '{yu}'$q$, x, y),
    xl || ': nie widzi milestonow konta ' || yl);
  return next is_empty(
    public.zz_iso_q($q$select 1 from public.tasks where user_id = '{yu}'$q$, x, y),
    xl || ': nie widzi zadan konta ' || yl);
  return next is_empty(
    public.zz_iso_q($q$select 1 from public.task_occurrences where user_id = '{yu}'$q$, x, y),
    xl || ': nie widzi wystapien (done i moved) konta ' || yl);
  return next is_empty(
    public.zz_iso_q($q$select 1 from public.task_occurrences
      where task_id = '{yr1}' and state = 'moved'$q$, x, y),
    xl || ': nie widzi przeniesienia (moved) zadania konta ' || yl);

  -- ---- Zmiana i usuniecie cudzych rekordow (7): brak bledu, brak efektu ----
  return next lives_ok(
    public.zz_iso_q($q$update public.projects set name = 'przejety' where id in ('{yp}', '{yp2}')$q$, x, y),
    xl || ': update projektow konta ' || yl || ' bez bledu (0 wierszy)');
  return next lives_ok(
    public.zz_iso_q($q$update public.milestones set name = 'przejety' where id in ('{ym}', '{ym2}')$q$, x, y),
    xl || ': update milestonow konta ' || yl || ' bez bledu (0 wierszy)');
  return next lives_ok(
    public.zz_iso_q($q$update public.tasks set title = 'przejete' where id in ('{yt}', '{yr1}', '{yr2}')$q$, x, y),
    xl || ': update zadan konta ' || yl || ' bez bledu (0 wierszy)');
  return next lives_ok(
    public.zz_iso_q($q$delete from public.task_occurrences where task_id = '{yr1}'$q$, x, y),
    xl || ': delete wystapien (done i moved) konta ' || yl || ' bez bledu (0 wierszy)');
  return next lives_ok(
    public.zz_iso_q($q$delete from public.tasks where id in ('{yt}', '{yr1}', '{yr2}')$q$, x, y),
    xl || ': delete zadan konta ' || yl || ' bez bledu (0 wierszy)');
  return next lives_ok(
    public.zz_iso_q($q$delete from public.milestones where id in ('{ym}', '{ym2}')$q$, x, y),
    xl || ': delete milestonow konta ' || yl || ' bez bledu (0 wierszy)');
  return next lives_ok(
    public.zz_iso_q($q$delete from public.projects where id in ('{yp}', '{yp2}')$q$, x, y),
    xl || ': delete projektow konta ' || yl || ' bez bledu (0 wierszy)');

  -- ---- Stan ofiary jako postgres (2) ----
  execute 'reset role';
  return next results_eq(
    public.zz_iso_q($q$select
      (select string_agg(name, ',' order by id) from public.projects where user_id = '{yu}'),
      (select string_agg(name, ',' order by id) from public.milestones where user_id = '{yu}'),
      (select string_agg(title, ',' order by id) from public.tasks where user_id = '{yu}')$q$, x, y),
    public.zz_iso_q($q$values ('{yl} projekt,{yl} projekt dodatkowy', '{yl} milestone,{yl} milestone pusty',
      '{yl} zadanie,{yl} rytm 1,{yl} rytm 2')$q$, x, y),
    'po probach ' || xl || ' nazwy i tytuly konta ' || yl || ' bez zmian');
  return next results_eq(
    public.zz_iso_q($q$select
      (select count(*) from public.projects where id in ('{xp}', '{xp2}') and user_id = '{xu}'),
      (select count(*) from public.milestones where id in ('{xm}', '{xm2}') and user_id = '{xu}'),
      (select count(*) from public.tasks where id in ('{xt}', '{xr1}', '{xr2}') and user_id = '{xu}'),
      (select count(*) from public.task_occurrences
        where task_id = '{xr1}' and user_id = '{xu}' and state = 'done' and occurrence_date = '2026-10-14'),
      (select count(*) from public.task_occurrences
        where task_id = '{xr1}' and user_id = '{xu}' and state = 'moved' and moved_to = '2026-10-17')$q$, y, x),
    $q$values (2::bigint, 2::bigint, 3::bigint, 1::bigint, 1::bigint)$q$,
    'po delete projektu przez ' || xl || ' konto ' || yl || ' zachowuje projekty, milestony, zadania, done i moved');
  execute 'set local role authenticated';

  -- ---- Wstawianie z cudzym user_id (4): 42501 ----
  return next throws_ok(
    public.zz_iso_q($q$insert into public.projects (user_id, name, life_area, due_date)
      values ('{yu}', 'podszywka', 'dom', '2026-12-31')$q$, x, y),
    '42501', 'new row violates row-level security policy for table "projects"', xl || ': nie wstawi projektu z user_id konta ' || yl);
  return next throws_ok(
    public.zz_iso_q($q$insert into public.milestones (user_id, project_id, name, due_date)
      values ('{yu}', '{yp}', 'podszywka', '2026-10-20')$q$, x, y),
    '42501', 'new row violates row-level security policy for table "milestones"', xl || ': nie wstawi milestona z user_id konta ' || yl);
  return next throws_ok(
    public.zz_iso_q($q$insert into public.tasks (user_id, milestone_id, title)
      values ('{yu}', '{ym}', 'podszywka')$q$, x, y),
    '42501', 'new row violates row-level security policy for table "tasks"', xl || ': nie wstawi zadania z user_id konta ' || yl);
  return next throws_ok(
    public.zz_iso_q($q$insert into public.task_occurrences (task_id, user_id, occurrence_date, state)
      values ('{yr1}', '{yu}', '2026-10-21', 'done')$q$, x, y),
    '42501', 'new row violates row-level security policy for table "task_occurrences"', xl || ': nie wstawi wystapienia z user_id konta ' || yl);

  -- ---- Wlasne dziecko pod cudzym rodzicem (4): 23503 ----
  return next throws_ok(
    public.zz_iso_q($q$insert into public.milestones (user_id, project_id, name, due_date)
      values ('{xu}', '{yp}', 'obca podpinka', '2026-10-20')$q$, x, y),
    '23503', null, xl || ': wlasny milestone pod projektem konta ' || yl || ' odrzucony (klucz obcy)');
  return next throws_ok(
    public.zz_iso_q($q$insert into public.tasks (user_id, milestone_id, title)
      values ('{xu}', '{ym}', 'obca podpinka')$q$, x, y),
    '23503', null, xl || ': wlasne zadanie pod milestonem konta ' || yl || ' odrzucone (klucz obcy)');
  return next throws_ok(
    public.zz_iso_q($q$insert into public.task_occurrences (task_id, user_id, occurrence_date, state)
      values ('{yr1}', '{xu}', '2026-10-21', 'done')$q$, x, y),
    '23503', null, xl || ': wlasne wystapienie done pod zadaniem konta ' || yl || ' odrzucone (klucz obcy)');
  return next throws_ok(
    public.zz_iso_q($q$insert into public.task_occurrences (task_id, user_id, occurrence_date, state, moved_to)
      values ('{yr1}', '{xu}', '2026-10-23', 'moved', '2026-10-24')$q$, x, y),
    '23503', null, xl || ': wlasne wystapienie moved pod zadaniem konta ' || yl || ' odrzucone (klucz obcy)');

  -- ---- Wariant klucza: istniejaca u ofiary data (1), kod zaobserwowany ----
  -- EXPECTED TO CHANGE: obserwacja znanego ryzyka (test-plan.md §7), nie wymaganie;
  -- utwardzenie klucza (np. user_id w kluczu unikalnym) ma prawo zmienic ten kod na 23503.
  return next throws_ok(
    public.zz_iso_q($q$insert into public.task_occurrences (task_id, user_id, occurrence_date, state)
      values ('{yr1}', '{xu}', '2026-10-14', 'done')$q$, x, y),
    '23505', null, xl || ': wariant klucza (zadanie i data konta ' || yl || ') - kod zaobserwowany, nie wymaganie');

  -- ---- Przepiecie wlasnego wiersza na cudze konto (3): 42501 ----
  return next throws_ok(
    public.zz_iso_q($q$update public.projects set user_id = '{yu}' where id = '{xp}'$q$, x, y),
    '42501', 'new row violates row-level security policy for table "projects"', xl || ': nie przepnie wlasnego projektu na konto ' || yl);
  return next throws_ok(
    public.zz_iso_q($q$update public.milestones set user_id = '{yu}' where id = '{xm}'$q$, x, y),
    '42501', 'new row violates row-level security policy for table "milestones"', xl || ': nie przepnie wlasnego milestona na konto ' || yl);
  return next throws_ok(
    public.zz_iso_q($q$update public.tasks set user_id = '{yu}' where id = '{xt}'$q$, x, y),
    '42501', 'new row violates row-level security policy for table "tasks"', xl || ': nie przepnie wlasnego zadania na konto ' || yl);

  -- ---- Kontrola pozytywna: wlasny rekord mozna zmienic (2) ----
  return next lives_ok(
    public.zz_iso_q($q$update public.projects set name = 'zmiana wlasna' where id = '{xp}'$q$, x, y),
    xl || ': update wlasnego projektu przechodzi');
  return next results_eq(
    public.zz_iso_q($q$select name from public.projects where id = '{xp}'$q$, x, y),
    $q$values ('zmiana wlasna')$q$,
    xl || ': wlasny projekt ma nowa nazwe');
  execute public.zz_iso_q($q$update public.projects set name = '{xl} projekt' where id = '{xp}'$q$, x, y);

  -- ---- Stan koncowy obu kont jako postgres (1) ----
  execute 'reset role';
  return next results_eq(
    public.zz_iso_q($q$select
      (select count(*) from public.projects where user_id = '{xu}'),
      (select count(*) from public.milestones where user_id = '{xu}'),
      (select count(*) from public.tasks where user_id = '{xu}'),
      (select count(*) from public.task_occurrences where user_id = '{xu}'),
      (select count(*) from public.projects where user_id = '{yu}'),
      (select count(*) from public.milestones where user_id = '{yu}'),
      (select count(*) from public.tasks where user_id = '{yu}'),
      (select count(*) from public.task_occurrences where user_id = '{yu}')$q$, x, y),
    $q$values (2::bigint, 2::bigint, 3::bigint, 2::bigint, 2::bigint, 2::bigint, 3::bigint, 2::bigint)$q$,
    'po wszystkich probach ' || xl || ' oba konta maja nietknieta liczbe rekordow (brak wstawien)');
end
$f$;

-- Straznik dat: dni tygodnia dat uzytych w danych
select results_eq(
  $$select extract(isodow from d)::int
    from (values ('2026-10-14'::date), ('2026-10-15'::date), ('2026-10-16'::date), ('2026-10-17'::date)) v(d)
    order by d$$,
  $$values (3), (4), (5), (6)$$,
  'dni testu: 14.10 sroda, 15.10 czwartek, 16.10 piatek, 17.10 sobota');

-- Kontrola pozytywna jako postgres: oba konta maja pelne, symetryczne dane (nie jest to test na pustych tabelach)
select results_eq(
  $$select
      (select count(*) from public.projects where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2')),
      (select count(*) from public.milestones where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2')),
      (select count(*) from public.tasks where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2')),
      (select count(*) from public.task_occurrences where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2'))$$,
  $$values (4::bigint, 4::bigint, 6::bigint, 4::bigint)$$,
  'dane bazowe: dwa konta po 2 projekty, 2 milestony, 3 zadania i 2 wystapienia (done + moved)');

-- A -> B oraz B -> A: ten sam kod prob
select * from public.zz_iso_run('1', '2');
select * from public.zz_iso_run('2', '1');

select * from finish();
rollback;
