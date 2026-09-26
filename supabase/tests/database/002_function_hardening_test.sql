-- The properties that decide what a function in this schema may do at all:
-- whose privileges it runs with, and how it resolves the names inside it.
-- Both are set once per function in 0002_functions.sql and never mentioned
-- again, which makes them exactly the kind of thing a later edit drops
-- without anyone noticing -- `create or replace function` silently replaces
-- the whole definition, `security definer` and `set search_path` included.
--
-- Derived from the catalog rather than checked function by function, so a
-- function added later is covered by these the day it lands.
begin;
select no_plan();

\ir _helpers.psql

-- Every function in the schema pins search_path. Without it a `security
-- definer` function resolves unqualified names through the *caller's*
-- search_path, so anyone able to create an object could have their own
-- code run as the function's owner -- and a `security invoker` one is
-- still worth pinning, since it is the reason 0001_extensions.sql keeps
-- pgcrypto and pg_trgm out of `public` in the first place.
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (
       select 1 from pg_catalog.pg_depend d
       where d.objid = p.oid and d.deptype = 'e'
     )
     and not coalesce(p.proconfig, '{}') @> array['search_path=""']),
  null,
  'every function in schema public pins search_path to the empty string'
);

-- Every security-definer function, in full: fourteen trigger functions, search_category_items and photo_upload_has_room, deliberate boundaries. A seventeenth must be added here on purpose.
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from pg_catalog.pg_depend d
       where d.objid = p.oid and d.deptype = 'e'
     )),
  array[
    'delete_item_if_orphan', 'enforce_user_id', 'photo_upload_has_room', 'search_category_items',
    'tg_categories_normalize', 'tg_categories_quota', 'tg_category_shares_enforce',
    'tg_category_shares_quota', 'tg_images_enforce',
    'tg_images_quota', 'tg_images_size_from_storage',
    'tg_item_categories_enforce', 'tg_item_categories_quota',
    'tg_items_normalize', 'tg_items_quota', 'tg_set_updated_at'
  ],
  'exactly sixteen functions run as their owner, and search_category_items and photo_upload_has_room are the only non-trigger ones'
);

-- A `security definer` function runs as whoever owns it, so the owner is
-- as much part of the boundary as the body is.
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
     and not exists (
       select 1 from pg_catalog.pg_depend d
       where d.objid = p.oid and d.deptype = 'e'
     )),
  null,
  'every security definer function is owned by postgres, not by a lesser role'
);

-- A trigger fires without EXECUTE, so the API roles hold it on two definers only: the search RPC and the upload policy's bucket count (0010, 0025, Splinter 0028/0029).
select is(
  (select array_agg(p.proname::text || ' to ' || r.rolname order by p.proname, r.rolname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated')) as r(rolname)
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  array['photo_upload_has_room to authenticated', 'search_category_items to authenticated'],
  'the API roles can execute exactly two security definer functions, both signed in only'
);

-- Two must stay `security invoker`. list_category_places checks nothing itself; as a definer it would be an unsound second boundary.
select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.list_category_places(uuid, text)'::regprocedure),
  'list_category_places runs as its caller, so ordinary RLS still applies to it'
);

-- has_category_read_access, has_category_write_access and
-- granted_category_ids are called from inside policy predicates; as
-- definers they would evaluate auth.uid() just the same, but they would
-- also stop being filtered by the RLS on category_shares that currently
-- scopes what they can see.
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

-- 001_grants_test.sql leaves the trigger functions out of anon's reachable
-- surface on the grounds that a trigger function cannot be called
-- directly. That is a property of PostgreSQL rather than of this schema,
-- but the exclusion rests on it, so it is asserted rather than assumed.
set local role anon;
select ok(
  pg_temp.raises('select public.enforce_user_id()'),
  'a trigger function cannot be invoked directly, which is what keeps it off anon''s reachable surface'
);

-- keepalive() is the one thing anon is meant to do: pinged on a schedule
-- so the free-tier project does not auto-pause
-- (.github/workflows/keep-alive.yml). A workflow that starts failing
-- against a 42501 would be noticed late and cost the app its availability.
select ok(
  not pg_temp.raises('select public.keepalive()'),
  'anon can call keepalive() -- the one function the keep-alive schedule depends on'
);
reset role;

-- join_tags has to stay immutable: items.tags_text is a stored generated
-- column defined as join_tags(tags), and PostgreSQL only accepts an
-- immutable expression there -- so a later edit marking it stable or
-- volatile would fail against an existing database while still applying
-- cleanly from scratch, which is precisely the migration shape CI cannot
-- catch (TEST_STRATEGY.md §8).
select is(
  (select provolatile from pg_catalog.pg_proc where oid = 'public.join_tags(text[])'::regprocedure),
  'i'::"char",
  'join_tags is immutable, as items.tags_text''s generated expression requires'
);

select * from finish();
rollback;
