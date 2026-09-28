-- Own vs a stranger's rows, no sharing, at the SQL surface; rls/isolation.spec.ts proves the same through PostgREST.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id, gen_random_uuid() as stranger_id \gset

-- Seeded as each identity through the ordinary insert path, never service_role (TEST_STRATEGY.md §8).
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

-- A satisfiable filter, so only the policy can make it come back empty (TEST_STRATEGY.md §7 rule 4).
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

-- The policy filters a stranger's row out of the update target: zero rows, not an error.
select pg_temp.auth_as(:'stranger_id'::uuid, 'stranger@collectionbuddy.test');

select is(
  pg_temp.rows_written(format('update public.categories set name = %L where id = %L returning id', 'taken over', :'owner_category_id')),
  0::bigint,
  'a stranger''s update against the owner''s category affects no rows'
);

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

-- Read back as the owner: a write accepted but hidden from its owner is the worst outcome (TEST_STRATEGY.md §7 rule 5).
select pg_temp.auth_as(:'owner_id'::uuid, 'owner@collectionbuddy.test');
select is(
  (select title from public.items where id = :'owner_item_id'::uuid),
  'Owner''s item',
  'the item is untouched, read back as its owner'
);

-- tg_item_categories_enforce refuses it: the insert policy checks only user_id = auth.uid(), and that trigger sets user_id.
select pg_temp.auth_as(:'stranger_id'::uuid, 'stranger@collectionbuddy.test');
select throws_ok(
  format(
    'insert into public.item_categories (item_id, category_id) values (%L, %L)',
    :'owner_item_id'::uuid, :'stranger_category_id'::uuid
  ),
  'P0001',
  'ownership mismatch',
  'a stranger cannot file the owner''s item into their own category'
);

-- The row side of the images/storage.objects mirror; TEST_STRATEGY.md §7 rule 6 needs both surfaces covered.
select is(
  (select count(*) from public.images where id = :'owner_image_id'::uuid),
  0::bigint,
  'a stranger cannot see the owner''s photograph record'
);

select throws_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'owner_item_id'::uuid,
    :'stranger_id'::text || '/' || :'owner_item_id'::text || '/planted.webp'
  ),
  'P0001',
  'ownership mismatch',
  'an images row cannot be inserted for the owner''s item, even with a conforming path'
);

-- enforce_user_id (0002) ignores rather than refuses: a BEFORE trigger overwrites the claimed owner with auth.uid().
select pg_temp.auth_as(:'stranger_id'::uuid, 'stranger@collectionbuddy.test');
insert into public.items (user_id, title) values (:'owner_id'::uuid, 'planted')
returning user_id as planted_owner \gset

select is(:'planted_owner'::uuid, :'stranger_id'::uuid,
  'an item addressed to someone else''s collection lands in the caller''s own');

-- On update the trigger restores the old owner rather than accepting the new one.
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

-- No grant, so anon is refused before any policy runs; an empty result would mean RLS did the work (TEST_STRATEGY.md trust boundary 3).
select pg_temp.auth_as_anon();

select throws_ok(
  'select id from public.items limit 1',
  '42501',
  'permission denied for table items',
  'a visitor with no session is refused items outright, not shown an empty result'
);

select throws_ok(
  'select id from public.categories limit 1',
  '42501',
  'permission denied for table categories',
  'a visitor with no session is refused categories outright'
);

select * from finish();
rollback;
