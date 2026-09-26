-- "Your own vs. a stranger's" -- the core matrix for categories, items,
-- item_categories and images with no sharing involved. TEST_STRATEGY.md
-- §4's "cross-tenant read/write" risk: a wrong policy here is a silent,
-- total confidentiality failure, and the interface would look identical
-- while showing somebody else's collection.
--
-- Complements web/e2e/signed-in/rls.spec.ts's "one collection cannot reach
-- another" describe block rather than duplicating it: that suite proves
-- the same properties through a real PostgREST request carrying a real
-- JWT; this file proves them at the SQL surface directly, in a rolled-back
-- transaction, without a browser or a running application stack.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id, gen_random_uuid() as stranger_id \gset

-- Fixtures, each created by its own identity through the ordinary insert
-- path -- the same trigger-plus-RLS pipeline PostgREST drives, never a
-- service_role bypass (TEST_STRATEGY.md §8: "seed as the user, never as
-- service_role").
select pg_temp.auth_as(:'owner_id'::uuid, 'owner@collectionbuddy.test');
insert into public.categories (name) values ('Owner''s category')
returning id as owner_category_id \gset
insert into public.items (title) values ('Owner''s item')
returning id as owner_item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'owner_item_id'::uuid, :'owner_category_id'::uuid);
insert into public.images (item_id, path_full)
values (:'owner_item_id'::uuid, :'owner_id'::text || '/' || :'owner_item_id'::text || '/owner.webp')
returning id as owner_image_id \gset

select pg_temp.auth_as(:'stranger_id'::uuid, 'stranger@collectionbuddy.test');
insert into public.categories (name) values ('Stranger''s category')
returning id as stranger_category_id \gset

-- A plain read, satisfiable: only the policy can make this come back
-- empty (TEST_STRATEGY.md §7 rule 4).
select is(
  (select count(*) from public.categories where user_id = :'owner_id'::uuid),
  0::bigint,
  'a satisfiable filter on the owner''s categories, run as the stranger, returns nothing'
);

select pg_temp.auth_as(:'owner_id'::uuid, 'owner@collectionbuddy.test');

select is(
  (select count(*) from public.categories where id = :'owner_category_id'::uuid),
  1::bigint,
  'the owner can read their own category'
);

select is(
  (select count(*) from public.categories where id = :'stranger_category_id'::uuid),
  0::bigint,
  'a satisfiable filter on a stranger''s category returns nothing'
);

select is(
  (select count(*) from public.items where id = :'owner_item_id'::uuid),
  1::bigint,
  'the owner can read their own item'
);

-- Write-side: an update against a stranger's row is accepted syntactically
-- but affects zero rows -- the policy filters it out of the update
-- target, it does not error.
select pg_temp.auth_as(:'stranger_id'::uuid, 'stranger@collectionbuddy.test');

with attempt as (
  update public.categories
  set name = 'taken over'
  where id = :'owner_category_id'::uuid
  returning id
)
select is((select count(*) from attempt), 0::bigint,
  'a stranger''s update against the owner''s category affects no rows');

with attempt as (
  update public.items
  set title = 'taken over'
  where id = :'owner_item_id'::uuid
  returning id
)
select is((select count(*) from attempt), 0::bigint,
  'a stranger''s update against the owner''s item affects no rows');

with attempt as (
  delete from public.items
  where id = :'owner_item_id'::uuid
  returning id
)
select is((select count(*) from attempt), 0::bigint,
  'a stranger cannot delete the owner''s item');

-- Read back as the owner: a write accepted but hidden from its owner
-- would be the worst outcome of all (TEST_STRATEGY.md §7 rule 5).
select pg_temp.auth_as(:'owner_id'::uuid, 'owner@collectionbuddy.test');
select is(
  (select title from public.items where id = :'owner_item_id'::uuid),
  'Owner''s item',
  'the item is untouched, read back as its owner'
);

-- item_categories: a stranger cannot file the owner's item into their own
-- category. Refused by tg_item_categories_enforce, a trigger rather than a
-- bare RLS predicate, since the insert policy alone only checks
-- user_id = auth.uid() and user_id is set by that same trigger.
select pg_temp.auth_as(:'stranger_id'::uuid, 'stranger@collectionbuddy.test');
select ok(
  pg_temp.raises(format(
    'insert into public.item_categories (item_id, category_id) values (%L, %L)',
    :'owner_item_id'::uuid, :'stranger_category_id'::uuid
  )),
  'a stranger cannot file the owner''s item into their own category'
);

-- images: a separate authorization surface from storage.objects (a row
-- naming an object, versus the object's own bytes) -- TEST_STRATEGY.md §7
-- rule 6 requires both mirrored surfaces covered; this is the row side.
select is(
  (select count(*) from public.images where id = :'owner_image_id'::uuid),
  0::bigint,
  'a stranger cannot see the owner''s photograph record'
);

select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'owner_item_id'::uuid,
    :'stranger_id'::text || '/' || :'owner_item_id'::text || '/planted.webp'
  )),
  'an images row cannot be inserted for the owner''s item, even with a conforming path'
);

-- enforce_user_id (0002_functions.sql): not refused, ignored -- a BEFORE
-- trigger overwrites the claimed owner with auth.uid(), so there is no
-- request that can land a row in someone else's collection at all.
select pg_temp.auth_as(:'stranger_id'::uuid, 'stranger@collectionbuddy.test');
insert into public.items (user_id, title) values (:'owner_id'::uuid, 'planted')
returning user_id as planted_owner \gset

select is(:'planted_owner'::uuid, :'stranger_id'::uuid,
  'an item addressed to someone else''s collection lands in the caller''s own');

-- Nor can an existing row change hands: on update the trigger restores the
-- old owner rather than accepting the new one.
select pg_temp.auth_as(:'owner_id'::uuid, 'owner@collectionbuddy.test');
update public.items set user_id = :'stranger_id'::uuid
where id = :'owner_item_id'::uuid
returning user_id as after_update_owner \gset

select is(:'after_update_owner'::uuid, :'owner_id'::uuid,
  'an item cannot be handed to another owner by rewriting user_id');

-- Destructive paths each have their own delete policy; a successful unlink would also sweep the orphaned item.
select pg_temp.auth_as(:'stranger_id'::uuid, 'stranger@collectionbuddy.test');
select is(
  pg_temp.rows_written(format('delete from public.item_categories where item_id = %L returning item_id', :'owner_item_id')),
  0::bigint,
  'a stranger cannot unlink the owner''s item from its category'
);
select is(
  pg_temp.rows_written(format('delete from public.images where id = %L returning id', :'owner_image_id')),
  0::bigint,
  'a stranger cannot delete the owner''s photograph record'
);

-- A fresh item of the stranger's own, so the one-collection quota and the ownership check both pass: only the write check is left.
insert into public.items (title) values ('Stranger''s unfiled item')
returning id as stranger_item_id \gset
select throws_ok(
  format(
    'insert into public.item_categories (item_id, category_id) values (%L, %L)',
    :'stranger_item_id'::uuid, :'owner_category_id'::uuid
  ),
  'P0001',
  'cross-tenant assignment is not allowed',
  'a stranger cannot file an item of its own into the owner''s category'
);

-- anon: refused outright (no grant at all) before any policy predicate
-- runs -- not shown an empty result, which would instead mean the grant
-- existed and RLS was doing the work (TEST_STRATEGY.md trust boundary 3).
select pg_temp.auth_as_anon();

select ok(
  pg_temp.raises('select id from public.items limit 1'),
  'a visitor with no session is refused items outright, not shown an empty result'
);

select ok(
  pg_temp.raises('select id from public.categories limit 1'),
  'a visitor with no session is refused categories outright'
);

select * from finish();
rollback;
