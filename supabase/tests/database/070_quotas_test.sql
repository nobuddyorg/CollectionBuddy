-- Per-owner quotas (0009_user_quotas.sql, #637): photograph bytes as Storage
-- recorded them, never as the client claimed, and a ceiling on entries.
-- 0016_bound_row_volume.sql (#716): categories, shares, links per entry, text lengths.
-- 0025_photo_ceilings_fit_the_plan.sql (#753): thumbnails counted, the bucket's own ceiling, the upload backstops.
-- web/e2e/signed-in/rls/quotas.spec.ts proves the same refusals through PostgREST.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id, gen_random_uuid() as editor_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'quota-owner@collectionbuddy.test');
insert into public.categories (name) values ('Quote (pgTAP)')
returning id as category_id \gset
insert into public.items (title) values ('Quota entry')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);

-- A stored object: its size is what Storage wrote, whatever the row claims.
reset role;
insert into storage.objects (bucket_id, name, metadata)
values (
  'item-images',
  :'owner_id'::text || '/' || :'item_id'::text || '/stored.webp',
  '{"size": 123456}'
);
select pg_temp.auth_as(:'owner_id'::uuid, 'quota-owner@collectionbuddy.test');

insert into public.images (item_id, path_full, size_bytes)
values (:'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/stored.webp', 1)
returning size_bytes as stored_size \gset
select is(:'stored_size'::bigint, 123456::bigint,
  'a photograph''s recorded size is the stored object''s, not the client''s claim');

insert into public.images (item_id, path_full, size_bytes)
values (:'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/absent.webp', 1)
returning size_bytes as absent_size \gset
select is(:'absent_size'::bigint, 5242880::bigint,
  'with nothing stored yet, the row counts the bucket''s 5 MiB cap, so under-claiming buys nothing');

-- Fill to just under 256 MiB: 123456 + 51 x 5 MiB fits (267510336 <= 268435456); a 52nd does not.
select ok(
  not pg_temp.raises(format(
    'insert into public.images (item_id, path_full) select %L, %L || ''/fill-'' || g || ''.webp'' from generate_series(1, 50) g',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text
  )),
  'an owner under 256 MiB of photographs may add more'
);

select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/over.webp'
  )),
  'the photograph that would take the owner past 256 MiB is refused'
);

select throws_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/over-again.webp'
  ),
  'PT507',
  'photo storage quota of 256 MiB reached',
  'and it is refused with a code the client can tell apart'
);

-- An editor's photograph lands on the owner's row (tg_images_enforce), so on the owner's quota.
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'quota-editor@collectionbuddy.test', 'editor');
select pg_temp.auth_as(:'editor_id'::uuid, 'quota-editor@collectionbuddy.test');
select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'editor_id'::text || '/' || :'item_id'::text || '/editor.webp'
  )),
  'an editor cannot add a photograph past the owner''s quota either'
);

-- Thumbnails: sampled like the full size, and on the same 256 MiB (0025).
select gen_random_uuid() as thumb_owner_id \gset
select pg_temp.auth_as(:'thumb_owner_id'::uuid, 'quota-thumbs@collectionbuddy.test');
insert into public.items (title) values ('Thumbnail entry')
returning id as thumb_item_id \gset
select :'thumb_owner_id'::text || '/' || :'thumb_item_id'::text as thumb_prefix \gset
reset role;
insert into storage.objects (bucket_id, name, metadata)
values
  ('item-images', :'thumb_prefix' || '/stored.webp', '{"size": 1000}'),
  ('item-images', :'thumb_prefix' || '/stored.thumb.webp', '{"size": 2345}');
select pg_temp.auth_as(:'thumb_owner_id'::uuid, 'quota-thumbs@collectionbuddy.test');

insert into public.images (item_id, path_full, path_thumb)
values (:'thumb_item_id'::uuid, :'thumb_prefix' || '/stored.webp', :'thumb_prefix' || '/stored.thumb.webp')
returning thumb_size_bytes as stored_thumb_size \gset
select is(:'stored_thumb_size'::bigint, 2345::bigint,
  'a thumbnail''s recorded size is the stored object''s');

insert into public.images (item_id, path_full, path_thumb)
values (:'thumb_item_id'::uuid, :'thumb_prefix' || '/absent.webp', :'thumb_prefix' || '/absent.thumb.webp')
returning thumb_size_bytes as absent_thumb_size \gset
select is(:'absent_thumb_size'::bigint, 5242880::bigint,
  'a thumbnail not stored yet counts the bucket''s 5 MiB cap too');

insert into public.images (item_id, path_full)
values (:'thumb_item_id'::uuid, :'thumb_prefix' || '/bare.webp')
returning thumb_size_bytes as bare_thumb_size \gset
select is(:'bare_thumb_size'::bigint, 0::bigint,
  'a photograph without a thumbnail counts none');

-- 3345 + 15 MiB so far; 24 more at 10 MiB each fit (267390225 <= 268435456), a 25th does not. Uncounted, thumbnails would leave it far inside.
select ok(
  not pg_temp.raises(format(
    'insert into public.images (item_id, path_full, path_thumb) select %L, %L || ''/fill-'' || g || ''.webp'', %L || ''/fill-'' || g || ''.thumb.webp'' from generate_series(1, 24) g',
    :'thumb_item_id'::uuid, :'thumb_prefix', :'thumb_prefix'
  )),
  'an owner may add photographs with thumbnails up to 256 MiB in all'
);
select throws_ok(
  format(
    'insert into public.images (item_id, path_full, path_thumb) values (%L, %L, %L)',
    :'thumb_item_id'::uuid, :'thumb_prefix' || '/over.webp', :'thumb_prefix' || '/over.thumb.webp'
  ),
  'PT507',
  'photo storage quota of 256 MiB reached',
  'thumbnails count against the same quota as the photographs'
);

-- Entries: one statement up to the ceiling is fine, one row past it is not.
select gen_random_uuid() as collector_id \gset
select pg_temp.auth_as(:'collector_id'::uuid, 'quota-collector@collectionbuddy.test');
select ok(
  not pg_temp.raises('insert into public.items (title) select ''bulk '' || g from generate_series(1, 50000) g'),
  'a collector may hold 50,000 entries'
);
select throws_ok(
  'insert into public.items (title) values (''one too many'')',
  'PT507',
  'entry quota of 50000 reached',
  'the 50,001st entry is refused'
);

-- A different collector is unaffected by someone else's ceiling.
select pg_temp.auth_as(:'editor_id'::uuid, 'quota-editor@collectionbuddy.test');
select ok(
  not pg_temp.raises('insert into public.items (title) values (''unaffected'')'),
  'one collector''s ceiling is not another''s'
);

-- Categories: 1,000 per owner, checked once per statement like entries.
select gen_random_uuid() as curator_id \gset
select pg_temp.auth_as(:'curator_id'::uuid, 'quota-curator@collectionbuddy.test');
select ok(
  not pg_temp.raises('insert into public.categories (name) select ''Category '' || g from generate_series(1, 1000) g'),
  'a collector may hold 1,000 categories'
);
select throws_ok(
  'insert into public.categories (name) values (''one too many'')',
  'PT507',
  'category quota of 1000 reached',
  'the 1,001st category is refused'
);

-- Shares: 1,000 per owner, however many categories they are spread over.
select id as shared_category_id from public.categories where name = 'Category 1' \gset
select ok(
  not pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email) select %L, ''guest'' || g || ''@collectionbuddy.test'' from generate_series(1, 1000) g',
    :'shared_category_id'::uuid
  )),
  'an owner may hold 1,000 shares'
);
select throws_ok(
  format(
    'insert into public.category_shares (category_id, invited_email) values (%L, ''one-too-many@collectionbuddy.test'')',
    (select id from public.categories where name = 'Category 2')
  ),
  'PT507',
  'share quota of 1000 reached',
  'the 1,001st share is refused, in another category too'
);

-- Links: an entry belongs to one collection (0020).
insert into public.items (title) values ('Linked entry')
returning id as linked_item_id \gset
select ok(
  not pg_temp.raises(format(
    'insert into public.item_categories (item_id, category_id) select %L, c.id from public.categories c where c.name = ''Category 1''',
    :'linked_item_id'::uuid
  )),
  'an entry may sit in one collection'
);
select throws_ok(
  format(
    'insert into public.item_categories (item_id, category_id) select %L, c.id from public.categories c where c.name = ''Category 2''',
    :'linked_item_id'::uuid
  ),
  'PT507',
  'an entry belongs to one collection',
  'a second collection for the same entry is refused'
);
insert into public.items (title) values ('Linked twice at once')
returning id as twice_item_id \gset
select throws_ok(
  format(
    'insert into public.item_categories (item_id, category_id) select %L, c.id from public.categories c where c.name in (''Category 3'', ''Category 4'')',
    :'twice_item_id'::uuid
  ),
  'PT507',
  'an entry belongs to one collection',
  'so is filing a new entry into two collections in one statement'
);

-- Text: each column's ceiling holds, and the value one past it is refused.
select ok(
  not pg_temp.raises(format(
    'insert into public.items (title, description, place, tags) values (%L, %L, %L, %L)',
    repeat('t', 300), repeat('d', 10000), repeat('p', 500),
    (select array_agg(lpad(g::text, 100, 'x')) from generate_series(1, 50) g)
  )),
  'an entry at every text ceiling is accepted'
);
select throws_ok(
  format('insert into public.items (title) values (%L)', repeat('t', 301)),
  '23514', null, 'a title past 300 characters is refused'
);
select throws_ok(
  format('insert into public.items (title, description) values (''d'', %L)', repeat('d', 10001)),
  '23514', null, 'a description past 10,000 characters is refused'
);
select throws_ok(
  format('insert into public.items (title, place) values (''p'', %L)', repeat('p', 501)),
  '23514', null, 'a place past 500 characters is refused'
);
select throws_ok(
  format('insert into public.items (title, tags) values (''n'', %L)',
    (select array_agg('tag' || g) from generate_series(1, 51) g)),
  '23514', null, 'a 51st tag is refused'
);
select throws_ok(
  format('insert into public.items (title, tags) values (''l'', %L)',
    array[repeat('a', 5050)]),
  '23514', null, 'tags longer together than 50 tags of 100 characters are refused'
);
select throws_ok(
  format('update public.categories set name = %L where name = ''Category 3''', repeat('n', 201)),
  '23514', null, 'a category name past 200 characters is refused, on rename too'
);
select throws_ok(
  format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'shared_category_id'::uuid, repeat('e', 309) || '@example.org'
  ),
  '23514', null, 'an invited email past 320 characters is refused'
);

-- Storage itself (0025): what the upload policy and the photograph trigger see of the bucket, orphans included.
-- storage.protect_delete() refuses a delete from SQL without this; the policies are what is under test.
select set_config('storage.allow_delete_query', 'true', true);

create function pg_temp.upload(p_path text)
returns boolean
language sql
as $$
  select not pg_temp.raises(format(
    'insert into storage.objects (bucket_id, name) values (%L, %L)', 'item-images', p_path))
$$;

-- An object of p_size bytes under p_prefix, stored the way Storage records one, past every policy.
create function pg_temp.store(p_prefix text, p_size bigint)
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name, metadata)
  values ('item-images', p_prefix || '/' || gen_random_uuid() || '.webp', jsonb_build_object('size', p_size))
$$;

create function pg_temp.bucket_bytes()
returns bigint
language sql
as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects where bucket_id = 'item-images'
$$;

create function pg_temp.refusal_detail(p_sql text)
returns text
language plpgsql
as $$
declare
  detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics detail = pg_exception_detail;
  return detail;
end
$$;

select gen_random_uuid() as uploader_id, gen_random_uuid() as neighbour_id \gset
select pg_temp.auth_as(:'neighbour_id'::uuid, 'quota-neighbour@collectionbuddy.test');
insert into public.items (title) values ('Neighbour entry')
returning :'neighbour_id'::text || '/' || id::text as neighbour_prefix, id as neighbour_item_id \gset
select pg_temp.auth_as(:'uploader_id'::uuid, 'quota-uploader@collectionbuddy.test');
insert into public.items (title) values ('Uploader entry')
returning :'uploader_id'::text || '/' || id::text as uploader_prefix, id as uploader_item_id \gset

-- A recorded path takes no bytes once its size is sampled, not even after its object is removed.
select ok(pg_temp.upload(:'uploader_prefix' || '/photo.webp'), 'a collector uploads a photograph');
select ok(pg_temp.upload(:'uploader_prefix' || '/photo.thumb.webp'), 'and its thumbnail');
insert into public.images (item_id, path_full, path_thumb)
values (:'uploader_item_id'::uuid, :'uploader_prefix' || '/photo.webp', :'uploader_prefix' || '/photo.thumb.webp');
delete from storage.objects
where bucket_id = 'item-images' and name like :'uploader_prefix' || '/photo.%';
select ok(not pg_temp.upload(:'uploader_prefix' || '/photo.webp'),
  'removed, the path its record names as the photograph takes no new bytes');
select ok(not pg_temp.upload(:'uploader_prefix' || '/photo.thumb.webp'),
  'nor the path it names as the thumbnail');
insert into public.images (item_id, path_full)
values (:'uploader_item_id'::uuid, :'uploader_prefix' || '/pending.webp');
select ok(not pg_temp.upload(:'uploader_prefix' || '/pending.webp'),
  'nor the path of a record written before its bytes');

-- 320 MiB under one uploader's prefix, recorded or not, and that uploader stores nothing more.
reset role;
select pg_temp.store(:'uploader_prefix', 335544320);
select pg_temp.auth_as(:'uploader_id'::uuid, 'quota-uploader@collectionbuddy.test');
select ok(not pg_temp.upload(:'uploader_prefix' || '/one-more.webp'),
  'an uploader holding 320 MiB of objects, with or without records, uploads nothing more');
select pg_temp.auth_as(:'neighbour_id'::uuid, 'quota-neighbour@collectionbuddy.test');
select ok(pg_temp.upload(:'neighbour_prefix' || '/unaffected.webp'),
  'while another collector still uploads');

-- Past 768 MiB in the bucket, no photograph is recorded, with a detail the client tells apart from the owner's quota.
reset role;
select pg_temp.store(gen_random_uuid()::text, 805306368 + 1 - pg_temp.bucket_bytes());
select pg_temp.auth_as(:'neighbour_id'::uuid, 'quota-neighbour@collectionbuddy.test');
select throws_ok(
  format('insert into public.images (item_id, path_full) values (%L, %L)',
    :'neighbour_item_id'::uuid, :'neighbour_prefix' || '/unaffected.webp'),
  'PT507',
  'the photo storage of this app is full',
  'past 768 MiB in the bucket, orphans included, no collector records a photograph'
);
select is(
  pg_temp.refusal_detail(format('insert into public.images (item_id, path_full) values (%L, %L)',
    :'neighbour_item_id'::uuid, :'neighbour_prefix' || '/unaffected.webp')),
  'project',
  'and the refusal names the project, not the owner'
);
select ok(pg_temp.upload(:'neighbour_prefix' || '/backstop.webp'),
  'uploads still pass below the 832 MiB backstop, so the recorded refusal is what a collector meets');

-- 832 MiB in the bucket, and nobody uploads.
reset role;
select pg_temp.store(gen_random_uuid()::text, 872415232 - pg_temp.bucket_bytes());
select pg_temp.auth_as(:'neighbour_id'::uuid, 'quota-neighbour@collectionbuddy.test');
select ok(not pg_temp.upload(:'neighbour_prefix' || '/too-much.webp'),
  'at 832 MiB in the bucket nobody uploads, however little they hold');

select * from finish();
rollback;
