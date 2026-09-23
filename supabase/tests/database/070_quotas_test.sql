-- Per-owner quotas (0009_user_quotas.sql, #637): photograph bytes as Storage
-- recorded them, never as the client claimed, and a ceiling on entries.
-- 0016_bound_row_volume.sql (#716): categories, shares, links per entry, text lengths.
-- web/e2e/signed-in/rls.spec.ts proves the same refusal through PostgREST.
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

-- Fill to just under 1 GiB: 123456 + 204 x 5 MiB fits (1069670976 <= 1073741824); a 205th does not.
select ok(
  not pg_temp.raises(format(
    'insert into public.images (item_id, path_full) select %L, %L || ''/fill-'' || g || ''.webp'' from generate_series(1, 203) g',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text
  )),
  'an owner under 1 GiB of photographs may add more'
);

select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/over.webp'
  )),
  'the photograph that would take the owner past 1 GiB is refused'
);

select throws_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/over-again.webp'
  ),
  'PT507',
  'photo storage quota of 1 GiB reached',
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

select * from finish();
rollback;
