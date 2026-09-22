-- Per-owner quotas (0009_user_quotas.sql, #637): photograph bytes as Storage
-- recorded them, never as the client claimed, and a ceiling on entries.
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

select * from finish();
rollback;
