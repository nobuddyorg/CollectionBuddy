-- The grant surface beneath the policies, stated as complete privilege sets via has_*_privilege (information_schema shows only the current role's grants).
begin;
select no_plan();

\ir _helpers.psql

-- Derived from the catalog, so a table a later migration adds without its revoke fails here; TRUNCATE is the one RLS never filters.
select is(
  (select array_agg(c.relname::text || ' ' || p.privilege order by c.relname, p.privilege)
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilege)
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('anon', c.oid, p.privilege)
     and not pg_temp.is_extension_member(c.oid)),
  null,
  'anon holds no privilege of any kind on any table or view in schema public'
);

-- authenticated holds nothing a policy of its does not back: no TRUNCATE, REFERENCES or TRIGGER, and no verb without its policy.
select is(
  (select array_agg(c.relname::text || ' ' || p.privilege order by c.relname, p.privilege)
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilege)
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('authenticated', c.oid, p.privilege)
     and not pg_temp.is_extension_member(c.oid)
     and not exists (
       select 1 from pg_catalog.pg_policies pol
       where pol.schemaname = 'public'
         and pol.tablename = c.relname
         and pol.cmd in (p.privilege, 'ALL')
         and pol.roles && array['public', 'authenticated']::name[]
     )),
  null,
  'authenticated holds no privilege on any table or view in schema public that none of its policies back'
);

select is(
  (select array_agg(c.relname::text || ' ' || p.privilege || ' to ' || r.rolname order by c.relname, p.privilege, r.rolname)
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) as p(privilege)
   cross join (values ('anon'), ('authenticated')) as r(rolname)
   where n.nspname = 'public'
     and c.relkind = 'S'
     and has_sequence_privilege(r.rolname, c.oid, p.privilege)),
  null,
  'neither API role holds any privilege on a sequence in schema public'
);

-- Exactly the DML each table's policies back, so a stray TRUNCATE, REFERENCES or TRIGGER fails too.
select table_privs_are('public', t, 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated holds exactly SELECT/INSERT/UPDATE/DELETE on ' || t)
from unnest(array['categories', 'items', 'category_shares']) as t;

-- No UPDATE policy on either, so no UPDATE grant a later `create policy ... for update` could quietly reanimate.
select table_privs_are('public', t, 'authenticated',
  array['SELECT', 'INSERT', 'DELETE'],
  'authenticated holds no UPDATE on ' || t || ' -- it has no UPDATE policy either')
from unnest(array['item_categories', 'images']) as t;

-- Grants and policies agree both ways: a grant with no policy is a silent no-op, a policy with no grant unreachable.
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

-- Without USAGE every policy is unreachable (42501); schema CREATE is set by the bootstrap, not migrations, so not asserted.
select ok(
  has_schema_privilege('authenticated', 'public', 'USAGE'),
  'authenticated holds USAGE on schema public -- the grants above are reachable'
);

-- Function grants asserted apart from table grants: each denial must hold on its own (TEST_STRATEGY.md trust boundary 3).
select function_privs_are('public', f.name, f.args, r.role, r.privileges, r.role || r.verb || f.name)
from (values
  ('has_category_write_access', array['uuid']),
  ('has_category_read_access', array['uuid']),
  ('has_item_write_access', array['uuid', 'uuid']),
  ('caller_email', array[]::text[]),
  ('granted_category_ids', array[]::text[]),
  ('list_category_places', array['uuid', 'text']),
  ('create_items_in_category', array['uuid', 'jsonb']),
  ('search_category_items', array['uuid', 'text', 'int', 'int']),
  ('storage_item_id', array['text']),
  ('photo_upload_has_room', array[]::text[]),
  ('delete_own_account', array[]::text[]),
  ('normalize_text', array['text']),
  ('join_tags', array['text[]']),
  ('longest_tag_length', array['text[]'])
) as f(name, args)
cross join (values
  ('anon', array[]::text[], ' cannot execute '),
  ('authenticated', array['EXECUTE'], ' can execute ')
) as r(role, privileges, verb);
select function_privs_are('public', 'normalize_multiline_text', array['text'],
  'authenticated', array[]::text[], 'only its trigger calls normalize_multiline_text, so authenticated cannot either');
select function_privs_are('public', 'keepalive', array[]::text[],
  'authenticated', array['EXECUTE'], 'authenticated can execute keepalive');

-- PUBLIC's default EXECUTE reaches anon, so this is anon's non-trigger surface; keepalive() is the one it needs (keep-alive.yml).
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prorettype <> 'pg_catalog.trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not pg_temp.is_extension_member(p.oid)),
  array['keepalive'],
  'the only non-trigger function anon may execute is keepalive'
);

-- Direct grants too, not only PUBLIC's: hosted default privileges once gave every new function one to both API roles (0015, #715).
select is(
  (select array_agg(p.proname::text || ' to ' || r.rolname order by p.proname, r.rolname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated')) as r(rolname)
   where n.nspname = 'public'
     and p.prorettype = 'pg_catalog.trigger'::regtype
     and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  null,
  'neither API role holds EXECUTE on any trigger function'
);

-- Default privileges: a table, sequence or function the next migration creates starts ungranted (0015, 0028).
select is(
  (select array_agg(d.defaclobjtype::text || ' ' || a.privilege_type || ' to ' || a.grantee::regrole::text
     order by d.defaclobjtype, a.privilege_type, a.grantee::regrole::text)
   from pg_catalog.pg_default_acl d
   cross join lateral pg_catalog.aclexplode(d.defaclacl) a
   where d.defaclrole = 'postgres'::regrole
     and d.defaclnamespace in (0::oid, 'public'::regnamespace)
     and a.grantee in ('anon'::regrole, 'authenticated'::regrole)),
  null,
  'nothing the next migration creates in public is granted to either API role by default'
);

-- Derived from the catalog, so a table added without enable row level security fails here.
select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
     and not pg_temp.is_extension_member(c.oid)),
  null,
  'no table in schema public is missing row level security'
);

-- Hosted does not let postgres own storage.objects, yet 0007_storage.sql's grants to authenticated rely on its RLS being on.
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'storage.objects'::regclass),
  'row level security is enabled on storage.objects'
);

select * from finish();
rollback;
