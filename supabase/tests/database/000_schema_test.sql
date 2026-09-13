-- Schema-level pgTAP tests: RLS is actually enabled (not merely intended),
-- anon holds no privilege anywhere RLS depends on it holding none, the
-- orphan-sweep trigger stays statement-level (CLAUDE.md's guardrail
-- against reverting delete_item_if_orphan to FOR EACH ROW), and the
-- constraints that keep the images/storage mirror and the sharing model
-- honest actually reject what they are supposed to.
--
-- Complements web/e2e/signed-in/rls.spec.ts rather than duplicating it:
-- this file runs directly against Postgres, inside a transaction that
-- rolls back, and is fast enough to run on every schema change. The
-- Playwright suite is what proves the same policies hold through a real
-- PostgREST request carrying a real JWT -- see TEST_STRATEGY.md for the
-- division of labor between the two.
begin;
select no_plan();

create or replace function pg_temp.auth_as(p_user_id uuid, p_email text default null)
returns void
language plpgsql
as $$
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'email', p_email, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- Executes p_sql and reports whether it raised, using plpgsql's own
-- implicit savepoint so a raised statement rolls back cleanly without
-- aborting the rest of this file's transaction. Used instead of pgTAP's
-- throws_ok() so the outcome depends only on this file's own logic, not on
-- recalling throws_ok()'s exact overload for an errcode versus a message.
create or replace function pg_temp.raises(p_sql text)
returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

-- Row level security is actually turned on, not merely policied -- a
-- table with RLS disabled ignores every policy defined on it outright.
select ok(relrowsecurity, 'row level security is enabled on ' || oid::regclass::text)
from pg_catalog.pg_class
where oid = any (array[
  'public.categories'::regclass,
  'public.items'::regclass,
  'public.item_categories'::regclass,
  'public.category_shares'::regclass,
  'public.images'::regclass
]);

-- anon holds no DML privilege on any of the five tables -- defence in
-- depth alongside the policies above (TEST_STRATEGY.md trust boundary 3).
-- has_table_privilege(), not information_schema: the info-schema grant
-- views are restricted to rows the *current* role is a party to, which
-- would make this pass vacuously for postgres regardless of anon's actual
-- grants -- exactly the kind of test that asserts nothing while looking
-- green.
select ok(
  not has_table_privilege('anon', 'public.' || t, 'SELECT')
  and not has_table_privilege('anon', 'public.' || t, 'INSERT')
  and not has_table_privilege('anon', 'public.' || t, 'UPDATE')
  and not has_table_privilege('anon', 'public.' || t, 'DELETE'),
  'anon holds no SELECT/INSERT/UPDATE/DELETE on ' || t
)
from unnest(array['categories', 'items', 'item_categories', 'category_shares', 'images']) as t;

-- The historical gap TEST_STRATEGY.md names by name: "one table was
-- missing from that [revoke] list for a while, and what was actually
-- refusing it was a missing EXECUTE on a helper function... a denial
-- nobody had asserted". Assert both halves directly so neither can drift
-- back to being an accident.
select ok(
  not has_function_privilege('anon', 'public.has_category_write_access(uuid)', 'EXECUTE'),
  'anon has no EXECUTE on has_category_write_access'
);
select ok(
  not has_function_privilege('anon', 'public.has_category_read_access(uuid)', 'EXECUTE'),
  'anon has no EXECUTE on has_category_read_access'
);
select ok(
  not has_function_privilege('anon', 'public.caller_email()', 'EXECUTE'),
  'anon has no EXECUTE on caller_email'
);

-- delete_item_if_orphan (CLAUDE.md: "deliberately FOR EACH STATEMENT, not
-- FOR EACH ROW -- the row-level version was a real O(n) performance bug
-- at category-deletion scale; don't revert it for 'simplicity'"). tgtype's
-- bit 0 (value 1) marks a trigger ROW-level; unset means STATEMENT.
select ok(
  (select (tgtype::int & 1) = 0
   from pg_catalog.pg_trigger
   where tgname = 'trg_delete_orphan_items_after_ic_delete'
     and tgrelid = 'public.item_categories'::regclass),
  'the orphan-sweep trigger stays statement-level, not per-row'
);

-- images_path_full_matches_item (0012): a row may not claim a path naming
-- a different item, or one that does not parse as <uid>/<itemId>/<file>
-- at all -- both collapse to the same "is not distinct from" comparison
-- against NULL, since storage_item_id() answers NULL rather than raising
-- on an unparseable path.
select gen_random_uuid() as owner_id \gset
select pg_temp.auth_as(:'owner_id'::uuid, 'schema-test-owner@collectionbuddy.test');

insert into public.categories (name) values ('Schema test category')
returning id as category_id \gset
insert into public.items (title) values ('Schema test item')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);

select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, 'not/a/matching/path.webp'
  )),
  'a photograph record cannot claim a path naming a different item'
);

select ok(
  not pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/matching.webp'
  )),
  'a photograph record naming its own item is accepted'
);

-- category_shares_category_email_unique: re-sharing the same (category,
-- email) pair is refused outright, not a second grant with its own expiry
-- (TEST_STRATEGY.md R11).
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'schema-test-grantee@collectionbuddy.test');

select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, 'schema-test-grantee@collectionbuddy.test'
  )),
  're-sharing the same category with the same email is refused, not a second grant'
);

-- Cascade behaviour: deleting the category removes the item_categories
-- mapping, and the statement-level orphan-sweep trigger then removes the
-- now-orphaned item in the same statement.
delete from public.categories where id = :'category_id'::uuid;

select is(
  (select count(*) from public.items where id = :'item_id'::uuid),
  0::bigint,
  'deleting a category orphans and removes the item it held exclusively'
);

select is(
  (select count(*) from public.item_categories where category_id = :'category_id'::uuid),
  0::bigint,
  'the mapping is gone along with the category'
);

select * from finish();
rollback;
