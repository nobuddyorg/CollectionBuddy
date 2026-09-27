-- Deleting an Auth user as the dashboard does (0034): every row it owns goes, another account's stay, and the sweep takes its bytes. Through the API: e2e/signed-in/rls/account-deletion.spec.ts.
begin;
select no_plan();

\ir _helpers.psql

create function pg_temp.swept()
returns text[]
language sql
as $$
  select array(
    select path
    from public.orphan_sweep_plan(10000) plan
    cross join lateral json_array_elements_text(plan.paths) as path
    order by path
  )
$$;

-- Older than the sweep's 48 h grace, as the objects of an account deleted by hand would be.
create function pg_temp.upload(p_path text)
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name, metadata, created_at)
  values ('item-images', p_path, '{"size": 10}', now() - interval '3 days')
$$;

select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'item-images';

select is(
  (
    select array_agg(
      format('%s.%s %s %s', conrelid::regclass, a.attname, confdeltype, convalidated)
      order by conrelid::regclass::text
    )
    from pg_constraint
    inner join pg_attribute as a on a.attrelid = conrelid and a.attnum = conkey[1]
    where confrelid = 'auth.users'::regclass
      and connamespace = 'public'::regnamespace
      and confkey = array[(select attnum from pg_attribute where attrelid = 'auth.users'::regclass and attname = 'id')]
  ),
  array[
    'categories.user_id c t',
    'category_shares.owner_user_id c t',
    'images.user_id c t',
    'item_categories.user_id c t',
    'items.user_id c t'
  ],
  'every owner column references auth.users(id), cascades on delete, and is validated'
);

select gen_random_uuid() as leaver_id, gen_random_uuid() as keeper_id \gset

-- The keeper's collection, shared with the leaver as editor.
select pg_temp.auth_as(:'keeper_id'::uuid, 'keeper@collectionbuddy.test');
insert into public.categories (name) values ('Kept (pgTAP)') returning id as kept_id \gset
insert into public.items (title) values ('The keeper''s entry') returning id as kept_item_id \gset
insert into public.item_categories (item_id, category_id) values (:'kept_item_id'::uuid, :'kept_id'::uuid);
insert into public.category_shares (category_id, invited_email, role)
values (:'kept_id'::uuid, 'leaver@collectionbuddy.test', 'editor');

-- The leaver's own photographed collection, shared with the keeper, who files an entry into it.
select pg_temp.auth_as(:'leaver_id'::uuid, 'leaver@collectionbuddy.test');
insert into public.categories (name) values ('Leaving (pgTAP)') returning id as left_id \gset
insert into public.items (title) values ('The leaver''s entry') returning id as left_item_id \gset
insert into public.item_categories (item_id, category_id) values (:'left_item_id'::uuid, :'left_id'::uuid);
insert into public.category_shares (category_id, invited_email, role)
values (:'left_id'::uuid, 'keeper@collectionbuddy.test', 'editor');
reset role;
select
  :'leaver_id'::text || '/' || :'left_item_id'::text || '/own.webp' as own_photo,
  :'leaver_id'::text || '/' || :'left_item_id'::text || '/own.thumb.webp' as own_thumb,
  :'leaver_id'::text || '/' || :'kept_item_id'::text || '/added.webp' as added_photo \gset
select pg_temp.upload(:'own_photo');
select pg_temp.upload(:'own_thumb');
select pg_temp.upload(:'added_photo');

-- As editor: an entry of the leaver's in the keeper's collection, and a photograph on the keeper's entry.
select pg_temp.auth_as(:'leaver_id'::uuid, 'leaver@collectionbuddy.test');
insert into public.images (item_id, path_full, path_thumb)
values (:'left_item_id'::uuid, :'own_photo', :'own_thumb');
insert into public.images (item_id, path_full) values (:'kept_item_id'::uuid, :'added_photo');
insert into public.items (title) values ('Filed by the leaver') returning id as filed_item_id \gset
insert into public.item_categories (item_id, category_id) values (:'filed_item_id'::uuid, :'kept_id'::uuid);

select pg_temp.auth_as(:'keeper_id'::uuid, 'keeper@collectionbuddy.test');
insert into public.items (title) values ('Filed by the keeper') returning id as keeper_filed_id \gset
insert into public.item_categories (item_id, category_id) values (:'keeper_filed_id'::uuid, :'left_id'::uuid);
reset role;

select is(pg_temp.swept(), '{}'::text[], 'while its rows name them, no photograph is the sweep''s');

-- What Auth's admin API, and so the dashboard, runs.
select lives_ok(
  format('delete from auth.users where id = %L', :'leaver_id'),
  'the Auth user can be deleted with rows still naming it'
);

select is((select count(*) from public.categories where user_id = :'leaver_id'::uuid), 0::bigint,
  'its collections go');
select is((select count(*) from public.items where user_id = :'leaver_id'::uuid), 0::bigint,
  'and its entries, the one filed in the keeper''s collection too');
select is((select count(*) from public.item_categories where user_id = :'leaver_id'::uuid), 0::bigint,
  'and their links');
select is((select count(*) from public.category_shares where owner_user_id = :'leaver_id'::uuid), 0::bigint,
  'and the grants it made');
select is((select count(*) from public.images where user_id = :'leaver_id'::uuid), 0::bigint,
  'and its entries'' photograph records');
select is((select count(*) from public.items where id = :'keeper_filed_id'::uuid), 0::bigint,
  'an entry the keeper filed in its collection goes with that collection');

select is((select count(*) from public.items where id = :'kept_item_id'::uuid), 1::bigint,
  'the keeper''s entry stays');
select is((select count(*) from public.images where path_full = :'added_photo'), 1::bigint,
  'with the photograph the leaver added to it, which is the keeper''s');
select is(
  (select count(*) from public.category_shares where invited_email = 'leaver@collectionbuddy.test'), 1::bigint,
  'a grant made to its email names no user, so it stays for the runbook to remove'
);

select is(
  pg_temp.swept(),
  array[:'own_thumb', :'own_photo'],
  'the bytes its rows named are the sweep''s, thumbnail too; the keeper''s are not'
);

-- A token outlives its user until it expires; a row under a uid no one can sign in as is refused.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'leaver_id', 'email', 'leaver@collectionbuddy.test', 'role', 'authenticated')::text,
  true
);
select throws_ok(
  $$insert into public.categories (name) values ('After the account (pgTAP)')$$,
  '23503',
  null,
  'the deleted user''s leftover token writes nothing'
);
reset role;

select * from finish();
rollback;
