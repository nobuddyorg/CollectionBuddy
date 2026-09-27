-- delete_item_if_orphan (0031): an entry goes exactly when its last link does, one link or a collection's worth at a time. 075 asserts it plans per call.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id \gset
select pg_temp.auth_as(:'owner_id'::uuid, 'orphan-cleanup@collectionbuddy.test');

insert into public.categories (name) values ('Bulk') returning id as bulk_id \gset
insert into public.categories (name) values ('Elsewhere') returning id as elsewhere_id \gset
insert into public.categories (name) values ('Empty') returning id as empty_id \gset

-- 500 entries in one collection, and two of them (only possible before 0020) filed elsewhere too.
with filed as (
  insert into public.items (title) select 'Bulk ' || n from generate_series(1, 500) n returning id
)
insert into public.item_categories (item_id, category_id) select id, :'bulk_id'::uuid from filed;
select array_agg(id order by title) filter (where title in ('Bulk 1', 'Bulk 2')) as twice_filed
from public.items where user_id = :'owner_id'::uuid \gset

reset role;
alter table public.item_categories disable trigger trg_item_categories_quota;
select pg_temp.auth_as(:'owner_id'::uuid, 'orphan-cleanup@collectionbuddy.test');
insert into public.item_categories (item_id, category_id)
select unnest(:'twice_filed'::uuid[]) as item_id, :'elsewhere_id'::uuid as category_id;
reset role;
alter table public.item_categories enable trigger trg_item_categories_quota;
select pg_temp.auth_as(:'owner_id'::uuid, 'orphan-cleanup@collectionbuddy.test');

-- A statement that unlinks nothing deletes nothing.
delete from public.categories where id = :'empty_id'::uuid;
select is(
  (select count(*) from public.items where user_id = :'owner_id'::uuid),
  500::bigint,
  'deleting an empty collection leaves every entry'
);

-- Single: one link of a twice-filed entry, then its last one.
delete from public.item_categories
where item_id = (:'twice_filed'::uuid[])[1] and category_id = :'bulk_id'::uuid;
select is(
  (select count(*) from public.items where id = (:'twice_filed'::uuid[])[1]),
  1::bigint,
  'an entry losing one of two links stays'
);

delete from public.item_categories
where item_id = (:'twice_filed'::uuid[])[1] and category_id = :'elsewhere_id'::uuid;
select is(
  (select count(*) from public.items where id = (:'twice_filed'::uuid[])[1]),
  0::bigint,
  'and goes with its last one'
);

-- Bulk: the collection's cascade unlinks 499 entries in one statement.
delete from public.categories where id = :'bulk_id'::uuid;
select is(
  (select array_agg(id) from public.items where user_id = :'owner_id'::uuid),
  array[(:'twice_filed'::uuid[])[2]],
  'deleting the collection removes its 498 orphans and keeps the entry filed elsewhere'
);

-- One statement naming the same entry twice (both its links) removes it once, without error.
insert into public.categories (name) values ('Bulk again') returning id as again_id \gset
reset role;
alter table public.item_categories disable trigger trg_item_categories_quota;
select pg_temp.auth_as(:'owner_id'::uuid, 'orphan-cleanup@collectionbuddy.test');
insert into public.item_categories (item_id, category_id)
values ((:'twice_filed'::uuid[])[2], :'again_id'::uuid);
reset role;
alter table public.item_categories enable trigger trg_item_categories_quota;
select pg_temp.auth_as(:'owner_id'::uuid, 'orphan-cleanup@collectionbuddy.test');

delete from public.item_categories where item_id = (:'twice_filed'::uuid[])[2];
select is(
  (select count(*) from public.items where user_id = :'owner_id'::uuid),
  0::bigint,
  'unlinking an entry from both its collections in one statement removes it'
);

select * from finish();
rollback;
