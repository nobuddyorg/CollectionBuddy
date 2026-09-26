-- A photograph an editor adds to the owner's own entry is the owner's to read and delete, and ending the grant ends the editor's writes to its bytes (0023, #741). Through the Storage API: e2e/signed-in/rls/editor-share-photographs.spec.ts.
begin;
select no_plan();

\ir _helpers.psql

-- storage.protect_delete() refuses a delete from SQL without this; the policies are what is under test.
select set_config('storage.allow_delete_query', 'true', true);

create function pg_temp.upload(p_path text)
returns boolean
language sql
as $$
  select not pg_temp.raises(format(
    'insert into storage.objects (bucket_id, name) values (%L, %L)', 'item-images', p_path))
$$;

create function pg_temp.readable(p_path text)
returns bigint
language sql
as $$
  select count(*) from storage.objects where bucket_id = 'item-images' and name = p_path
$$;

create function pg_temp.removable(p_path text)
returns bigint
language sql
as $$
  select pg_temp.rows_written(format(
    'delete from storage.objects where bucket_id = %L and name = %L returning id', 'item-images', p_path))
$$;

select gen_random_uuid() as owner_id, gen_random_uuid() as editor_id, gen_random_uuid() as stranger_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'photo-owner@collectionbuddy.test');
insert into public.categories (name) values ('Shared photographs (pgTAP)')
returning id as category_id \gset
insert into public.items (title) values ('The owner''s entry')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'photo-editor@collectionbuddy.test', 'editor')
returning id as share_id \gset

select
  :'editor_id'::text || '/' || :'item_id'::text || '/added.webp' as added,
  :'editor_id'::text || '/' || :'item_id'::text || '/unrecorded.webp' as unrecorded,
  :'editor_id'::text || '/' || :'item_id'::text || '/pending.webp' as pending \gset

select ok(pg_temp.upload(:'owner_id'::text || '/' || :'item_id'::text || '/own.webp'),
  'the owner uploads under its own entry');
select ok(not pg_temp.upload(:'owner_id'::text || '/' || gen_random_uuid()::text || '/loose.webp'),
  'but not under an id that names no entry: an object needs an entry its uploader may write');

-- The editor photographs the owner's entry: bytes under its own prefix, the record filed under the owner (tg_images_enforce).
select pg_temp.auth_as(:'editor_id'::uuid, 'photo-editor@collectionbuddy.test');
select ok(pg_temp.upload(:'added'), 'an editor uploads under the owner''s entry, to its own prefix');
insert into public.images (item_id, path_full) values (:'item_id'::uuid, :'added');
select ok(pg_temp.upload(:'unrecorded'), 'and an object no photograph record names');
-- A record whose bytes are not stored yet: nothing may land at its path once the grant ends.
insert into public.images (item_id, path_full) values (:'item_id'::uuid, :'pending');

select pg_temp.auth_as(:'owner_id'::uuid, 'photo-owner@collectionbuddy.test');
select is(pg_temp.readable(:'added'), 1::bigint,
  'the owner reads, so signs, the photograph an editor added to the owner''s entry');
select is(pg_temp.removable(:'added'), 1::bigint,
  'and deletes it, which Storage cannot do for an object it cannot read');
select is(pg_temp.readable(:'unrecorded'), 0::bigint,
  'but not an object under the entry that no photograph record of its own names');

select pg_temp.auth_as(:'stranger_id'::uuid, 'photo-stranger@collectionbuddy.test');
select ok(not pg_temp.upload(:'stranger_id'::text || '/' || :'item_id'::text || '/planted.webp'),
  'a stranger cannot upload under the owner''s entry, not even to its own prefix');

-- Revoked.
select pg_temp.auth_as(:'owner_id'::uuid, 'photo-owner@collectionbuddy.test');
delete from public.category_shares where id = :'share_id'::uuid;

select pg_temp.auth_as(:'editor_id'::uuid, 'photo-editor@collectionbuddy.test');
select is(pg_temp.removable(:'added'), 0::bigint,
  'revoked, the editor can no longer delete the bytes it added to the owner''s entry');
select ok(not pg_temp.upload(:'pending'),
  'nor store bytes at the path of a record it filed while it could');
select ok(not pg_temp.upload(:'editor_id'::text || '/' || :'item_id'::text || '/new.webp'),
  'nor upload anything else under the owner''s entry');
select is(pg_temp.readable(:'added'), 1::bigint,
  'it still reads the bytes it uploaded itself, under its own prefix');

select pg_temp.auth_as(:'owner_id'::uuid, 'photo-owner@collectionbuddy.test');
select is(pg_temp.readable(:'added'), 1::bigint,
  'the owner still reads the photograph after the revocation');
select is(pg_temp.readable(:'pending'), 0::bigint,
  'and nothing was stored at the pending record''s path');

select * from finish();
rollback;
