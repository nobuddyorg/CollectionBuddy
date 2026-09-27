-- A collector deleting its own account (0033): what goes, what another account keeps, and the objects-first guard. Through the API: e2e/signed-in/rls/account-deletion.spec.ts.
begin;
select no_plan();

\ir _helpers.psql

-- storage.protect_delete() refuses a delete from SQL without this; the client's removal through Storage is what it stands in for.
select set_config('storage.allow_delete_query', 'true', true);

create function pg_temp.upload(p_path text)
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name) values ('item-images', p_path)
$$;

create function pg_temp.stored(p_path text)
returns boolean
language sql
security definer
as $$
  select exists (select 1 from storage.objects where bucket_id = 'item-images' and name = p_path)
$$;

create function pg_temp.account_exists(p_user_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (select 1 from auth.users where id = p_user_id)
$$;

select gen_random_uuid() as leaver_id, gen_random_uuid() as keeper_id, gen_random_uuid() as revoked_id \gset
insert into auth.users (id, email) values
  (:'leaver_id'::uuid, 'leaver@collectionbuddy.test'),
  (:'keeper_id'::uuid, 'keeper@collectionbuddy.test'),
  (:'revoked_id'::uuid, 'revoked@collectionbuddy.test');

-- The keeper's collection, shared with the leaver as editor and with the revoked editor.
select pg_temp.auth_as(:'keeper_id'::uuid, 'keeper@collectionbuddy.test');
insert into public.categories (name) values ('Kept (pgTAP)') returning id as kept_id \gset
insert into public.items (title) values ('The keeper''s entry') returning id as kept_item_id \gset
insert into public.item_categories (item_id, category_id) values (:'kept_item_id'::uuid, :'kept_id'::uuid);
insert into public.category_shares (category_id, invited_email, role) values
  (:'kept_id'::uuid, 'leaver@collectionbuddy.test', 'editor'),
  (:'kept_id'::uuid, 'revoked@collectionbuddy.test', 'editor');

-- The leaver's own collection, photographed, shared with the keeper, who files an entry into it.
select pg_temp.auth_as(:'leaver_id'::uuid, 'leaver@collectionbuddy.test');
insert into public.categories (name) values ('Leaving (pgTAP)') returning id as left_id \gset
insert into public.items (title) values ('The leaver''s entry') returning id as left_item_id \gset
insert into public.item_categories (item_id, category_id) values (:'left_item_id'::uuid, :'left_id'::uuid);
select :'leaver_id'::text || '/' || :'left_item_id'::text || '/own.webp' as own_photo \gset
select pg_temp.upload(:'own_photo');
insert into public.images (item_id, path_full) values (:'left_item_id'::uuid, :'own_photo');
insert into public.category_shares (category_id, invited_email, role)
values (:'left_id'::uuid, 'keeper@collectionbuddy.test', 'editor');

-- As editor: an entry of the leaver's in the keeper's collection, and a photograph on the keeper's entry.
insert into public.items (title) values ('Filed by the leaver') returning id as filed_item_id \gset
insert into public.item_categories (item_id, category_id) values (:'filed_item_id'::uuid, :'kept_id'::uuid);
select
  :'leaver_id'::text || '/' || :'filed_item_id'::text || '/filed.webp' as filed_photo,
  :'leaver_id'::text || '/' || :'kept_item_id'::text || '/added.webp' as added_photo \gset
select pg_temp.upload(:'filed_photo');
insert into public.images (item_id, path_full) values (:'filed_item_id'::uuid, :'filed_photo');
select pg_temp.upload(:'added_photo');
insert into public.images (item_id, path_full) values (:'kept_item_id'::uuid, :'added_photo');

select pg_temp.auth_as(:'keeper_id'::uuid, 'keeper@collectionbuddy.test');
insert into public.items (title) values ('Filed by the keeper') returning id as keeper_filed_id \gset
insert into public.item_categories (item_id, category_id) values (:'keeper_filed_id'::uuid, :'left_id'::uuid);

select pg_temp.auth_as_anon();
select throws_ok('select public.delete_own_account()', '42501', 'permission denied for function delete_own_account',
  'a visitor with no session cannot call it');

select pg_temp.auth_as(:'leaver_id'::uuid, 'leaver@collectionbuddy.test');
select throws_ok('select public.delete_own_account()', 'PT409', 'photographs are still stored',
  'refused while a photograph the caller could remove is still stored');
select ok(pg_temp.account_exists(:'leaver_id'::uuid), 'and the refusal deletes nothing');

-- What the client removes through Storage first: its own entries' photographs, not the one on the keeper's entry.
delete from storage.objects where bucket_id = 'item-images' and name in (:'own_photo', :'filed_photo');
select lives_ok('select public.delete_own_account()', 'with them removed, the account goes');

reset role;
select ok(not pg_temp.account_exists(:'leaver_id'::uuid), 'the Auth user is deleted');
select is((select count(*) from public.categories where user_id = :'leaver_id'::uuid), 0::bigint,
  'with every collection of its own');
select is((select count(*) from public.items where user_id = :'leaver_id'::uuid), 0::bigint,
  'and every entry of its own, the one filed in the keeper''s collection too');
select is((select count(*) from public.images where item_id in (:'left_item_id'::uuid, :'filed_item_id'::uuid)), 0::bigint,
  'and those entries'' photograph records');
select is((select count(*) from public.category_shares where invited_email = 'leaver@collectionbuddy.test'), 0::bigint,
  'and every grant made to its email');
select is((select count(*) from public.items where id = :'keeper_filed_id'::uuid), 0::bigint,
  'an entry the keeper filed in the leaver''s collection goes with that collection');

select ok(pg_temp.account_exists(:'keeper_id'::uuid), 'the keeper''s account stays');
select is((select count(*) from public.items where id = :'kept_item_id'::uuid), 1::bigint,
  'with its own entry');
select is((select count(*) from public.images where path_full = :'added_photo'), 1::bigint,
  'and the photograph the leaver added to it, which is the keeper''s');
select ok(pg_temp.stored(:'added_photo'), 'whose bytes stay stored');
select is((select count(*) from public.category_shares where invited_email = 'revoked@collectionbuddy.test'), 1::bigint,
  'and its other grant');

-- An editor whose grant ended can remove neither its filed entry nor its bytes; the guard lets that entry go, its bytes to the sweep.
select pg_temp.auth_as(:'revoked_id'::uuid, 'revoked@collectionbuddy.test');
insert into public.items (title) values ('Filed, then revoked') returning id as stranded_item_id \gset
insert into public.item_categories (item_id, category_id) values (:'stranded_item_id'::uuid, :'kept_id'::uuid);
select :'revoked_id'::text || '/' || :'stranded_item_id'::text || '/stranded.webp' as stranded_photo \gset
select pg_temp.upload(:'stranded_photo');
insert into public.images (item_id, path_full) values (:'stranded_item_id'::uuid, :'stranded_photo');

select pg_temp.auth_as(:'keeper_id'::uuid, 'keeper@collectionbuddy.test');
delete from public.category_shares where invited_email = 'revoked@collectionbuddy.test';

select pg_temp.auth_as(:'revoked_id'::uuid, 'revoked@collectionbuddy.test');
select lives_ok('select public.delete_own_account()',
  'a stored photograph the caller may no longer remove does not hold the account');
reset role;
select ok(not pg_temp.account_exists(:'revoked_id'::uuid), 'its Auth user is deleted');
select is((select count(*) from public.items where id = :'stranded_item_id'::uuid), 0::bigint,
  'and its entry in the keeper''s collection');
select ok(pg_temp.stored(:'stranded_photo'), 'whose bytes are left for the daily sweep');

select * from finish();
rollback;
