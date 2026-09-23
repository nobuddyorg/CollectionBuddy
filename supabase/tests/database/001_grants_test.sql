-- The grant surface underneath the policies (0006_policies.sql): what each role may address at all, before RLS gets a say.
--
-- Every assertion below states the *complete* privilege set rather than
-- probing one verb at a time, so a privilege nobody meant to grant fails
-- the test instead of passing unnoticed. pgTAP's table_privs_are and
-- function_privs_are resolve through has_table_privilege /
-- has_function_privilege, not the information_schema grant views -- those
-- only show rows the *current* role is a party to, which would make every
-- check here pass vacuously for postgres (see 000_schema_test.sql).
begin;
select no_plan();

\ir _helpers.psql

-- anon holds nothing at all on any of the five tables. TRUNCATE is the one
-- that would matter most: row level security does not filter it, so the
-- privilege means "empty this table, every user's rows included".
select table_privs_are('public', t, 'anon', array[]::text[],
  'anon holds no privilege of any kind on ' || t)
from unnest(array['categories', 'items', 'item_categories', 'category_shares', 'images']) as t;

-- authenticated holds exactly the DML each table's policies back, and no
-- TRUNCATE, REFERENCES or TRIGGER anywhere.
select table_privs_are('public', t, 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated holds exactly SELECT/INSERT/UPDATE/DELETE on ' || t)
from unnest(array['categories', 'items', 'category_shares']) as t;

-- item_categories and images are the two exceptions, and the grant is what
-- states it: neither has an UPDATE policy -- a mapping has nothing to
-- change, and a photograph row is written once and removed -- so the
-- UPDATE privilege beside them was dead weight that a future
-- `create policy ... for update` could have quietly reanimated.
select table_privs_are('public', t, 'authenticated',
  array['SELECT', 'INSERT', 'DELETE'],
  'authenticated holds no UPDATE on ' || t || ' -- it has no UPDATE policy either')
from unnest(array['item_categories', 'images']) as t;

-- The grant and the policy set have to agree in both directions: a verb
-- granted with no policy behind it is a silent no-op, and a policy with no
-- grant behind it is unreachable. Derived from the catalog rather than
-- listed by hand, so a new policy or a new grant on any of the five has to
-- be matched by the other.
select is(
  (select array_agg(distinct cmd order by cmd)
   from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'item_categories'),
  array['DELETE', 'INSERT', 'SELECT'],
  'item_categories carries policies for exactly the three verbs it grants'
);

select is(
  (select array_agg(distinct cmd order by cmd)
   from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'images'),
  array['DELETE', 'INSERT', 'SELECT'],
  'images carries policies for exactly the three verbs it grants'
);

-- The schema grant the table grants above sit on top of: without USAGE,
-- every policy in 0006_policies.sql is unreachable and the whole app
-- returns 42501. Schema-level CREATE is deliberately not asserted here --
-- it is set by the Supabase project bootstrap rather than by anything in
-- supabase/migrations/, so this suite is not where a change to it would
-- be caught.
select ok(
  has_schema_privilege('authenticated', 'public', 'USAGE'),
  'authenticated holds USAGE on schema public -- the grants above are reachable'
);

-- The function surface. A real historical gap in this project: one table
-- was missing from the revoke list for a while, and what was actually
-- refusing anon in its place was a missing EXECUTE on a helper function --
-- a denial nobody had asserted, holding for a reason nobody had written
-- down. Both halves need asserting independently (TEST_STRATEGY.md trust
-- boundary 3), so the table grants above are stated separately from the
-- function grants here.
select function_privs_are('public', 'has_category_write_access', array['uuid'],
  'anon', array[]::text[], 'anon cannot execute has_category_write_access');
select function_privs_are('public', 'has_category_read_access', array['uuid'],
  'anon', array[]::text[], 'anon cannot execute has_category_read_access');
select function_privs_are('public', 'caller_email', array[]::text[],
  'anon', array[]::text[], 'anon cannot execute caller_email');
select function_privs_are('public', 'list_category_places', array['uuid', 'text'],
  'anon', array[]::text[], 'anon cannot execute list_category_places');
select function_privs_are('public', 'search_category_items',
  array['uuid', 'text', 'int', 'int'], 'anon', array[]::text[],
  'anon cannot execute search_category_items -- SECURITY DEFINER makes this the highest-stakes grant to get right');
select function_privs_are('public', 'normalize_text', array['text'],
  'anon', array[]::text[], 'anon cannot execute normalize_text');
select function_privs_are('public', 'join_tags', array['text[]'],
  'anon', array[]::text[], 'anon cannot execute join_tags');
select function_privs_are('public', 'storage_item_id', array['text'],
  'anon', array[]::text[], 'anon cannot execute storage_item_id');

-- ...and the same set from the other side: the application's own role can
-- reach every function it actually calls. An EXECUTE quietly lost here is
-- a feature that fails with 42501 for every signed-in user at once.
select function_privs_are('public', f.name, f.args, 'authenticated', array['EXECUTE'],
  'authenticated can execute ' || f.name)
from (values
  ('has_category_write_access', array['uuid']),
  ('has_category_read_access', array['uuid']),
  ('caller_email', array[]::text[]),
  ('list_category_places', array['uuid', 'text']),
  ('search_category_items', array['uuid', 'text', 'int', 'int']),
  ('storage_item_id', array['text']),
  ('normalize_text', array['text']),
  ('join_tags', array['text[]']),
  ('keepalive', array[]::text[])
) as f(name, args);

-- Postgres grants EXECUTE to PUBLIC on every new function, which reaches
-- `anon` too -- so what has *not* been revoked from PUBLIC is the real
-- shape of anon's function surface, and it is worth enumerating rather
-- than spot-checking. Extension-owned functions are excluded by their
-- pg_depend entry rather than by name, so where pgTAP itself is installed
-- makes no difference to this.
--
-- keepalive() is the one ordinary function anon is meant to reach
-- (.github/workflows/keep-alive.yml). Everything else is a trigger function,
-- which cannot be called directly at all (002_function_hardening_test.sql
-- asserts that rather than assuming it).
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prorettype <> 'pg_catalog.trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not exists (
       select 1 from pg_catalog.pg_depend d
       where d.objid = p.oid and d.deptype = 'e'
     )),
  array['keepalive'],
  'the only non-trigger function anon may execute is keepalive'
);

-- Row level security on every table in the schema, derived rather than
-- listed: a sixth table added without it would be readable by every signed-
-- in user, and a policy file that simply forgot the `alter table ... enable`
-- line looks complete from the outside.
select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
     and not exists (
       select 1 from pg_catalog.pg_depend d
       where d.objid = c.oid and d.deptype = 'e'
     )),
  null,
  'no table in schema public is missing row level security'
);

-- storage.objects is not ours to enable RLS on (hosted Supabase does not
-- grant `postgres` ownership of it), which is exactly why it is worth
-- asserting: 0007_storage.sql's grants to authenticated assume it is on,
-- and would otherwise expose every object in every bucket.
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'storage.objects'::regclass),
  'row level security is enabled on storage.objects'
);

select * from finish();
rollback;
