-- security definer and search_path, derived from the catalog so a new function is covered the day it lands.
begin;
select no_plan();

\ir _helpers.psql

-- Unpinned, a definer resolves names via the caller's search_path and runs their objects as its owner; invokers pin it too.
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not pg_temp.is_extension_member(p.oid)
     and not coalesce(p.proconfig, '{}') @> array['search_path=""']),
  null,
  'every function in schema public pins search_path to the empty string'
);

-- Every security-definer function, in full: fourteen trigger functions, search_category_items, photo_upload_has_room and delete_own_account, deliberate boundaries. An eighteenth must be added here on purpose.
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not pg_temp.is_extension_member(p.oid)),
  array[
    'delete_item_if_orphan', 'delete_own_account', 'enforce_user_id', 'photo_upload_has_room', 'search_category_items',
    'tg_categories_normalize', 'tg_categories_quota', 'tg_category_shares_enforce',
    'tg_category_shares_quota', 'tg_images_enforce',
    'tg_images_quota', 'tg_images_size_from_storage',
    'tg_item_categories_enforce', 'tg_item_categories_quota',
    'tg_items_normalize', 'tg_items_quota', 'tg_set_updated_at'
  ],
  'exactly seventeen functions run as their owner, and search_category_items, photo_upload_has_room and delete_own_account are the only non-trigger ones'
);

-- A `security definer` function runs as its owner, so the owner is as much part of the boundary as the body.
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
     and not pg_temp.is_extension_member(p.oid)),
  null,
  'every security definer function is owned by postgres, not by a lesser role'
);

-- A trigger fires without EXECUTE, so the API roles hold it on three definers only: the search RPC, the upload policy's bucket count and the account deletion (0010, 0025, 0033, Splinter 0028/0029).
select is(
  (select array_agg(p.proname::text || ' to ' || r.rolname order by p.proname, r.rolname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated')) as r(rolname)
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  array['delete_own_account to authenticated', 'photo_upload_has_room to authenticated', 'search_category_items to authenticated'],
  'the API roles can execute exactly three security definer functions, all signed in only'
);

-- These must stay `security invoker`. list_category_places and create_items_in_category check nothing themselves; as definers they would be unsound second boundaries.
select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.list_category_places(uuid, text)'::regprocedure),
  'list_category_places runs as its caller, so ordinary RLS still applies to it'
);
select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.create_items_in_category(uuid, jsonb)'::regprocedure),
  'create_items_in_category runs as its caller, so the items policies and the link trigger decide as for two inserts'
);

-- Called inside policy predicates; as definers they would escape the category_shares RLS that scopes what they see.
select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.has_category_read_access(uuid)'::regprocedure),
  'has_category_read_access runs as its caller'
);
select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.has_category_write_access(uuid)'::regprocedure),
  'has_category_write_access runs as its caller'
);
select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.granted_category_ids()'::regprocedure),
  'granted_category_ids runs as its caller'
);
select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.has_item_write_access(uuid, uuid)'::regprocedure),
  'has_item_write_access runs as its caller'
);

-- 001_grants_test.sql keeps trigger functions off anon's surface as PostgreSQL refuses a direct call; asserted as postgres, who holds EXECUTE.
select throws_ok(
  'select public.enforce_user_id()',
  '0A000',
  'trigger functions can only be called as triggers',
  'a trigger function cannot be invoked directly, even with EXECUTE, which is what keeps it off anon''s reachable surface'
);

-- keepalive() keeps the free-tier project from auto-pausing (keep-alive.yml); a 42501 there would be noticed late.
select pg_temp.auth_as_anon();
select lives_ok(
  'select public.keepalive()',
  'anon can call keepalive() -- the one function the keep-alive schedule depends on'
);
reset role;

-- items.tags_text is generated from join_tags(tags), which Postgres only accepts while join_tags is immutable.
select is(
  (select provolatile from pg_catalog.pg_proc where oid = 'public.join_tags(text[])'::regprocedure),
  'i'::"char",
  'join_tags is immutable, as items.tags_text''s generated expression requires'
);

select * from finish();
rollback;
