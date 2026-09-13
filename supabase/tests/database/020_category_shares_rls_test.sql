-- Sharing at the default 'viewer' role: an active grant opens exactly the
-- shared category, its items, their links, and their photograph records --
-- read-only, scoped to that one category, and closed again the moment it
-- expires or is revoked. Complements web/e2e/signed-in/rls.spec.ts's
-- "a category shared with another collector" describe block the same way
-- 010_ownership_rls_test.sql complements its stranger-access cases: same
-- properties, proven at the SQL surface instead of through PostgREST.
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

select gen_random_uuid() as owner_id, gen_random_uuid() as grantee_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'share-owner@collectionbuddy.test');
insert into public.categories (name) values ('Münzen (pgTAP)')
returning id as category_id \gset
insert into public.categories (name) values ('Briefmarken (pgTAP)')
returning id as other_category_id \gset
insert into public.items (title) values ('Owner item')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);
insert into public.images (item_id, path_full)
values (:'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/shared.webp')
returning id as image_id \gset

-- An active grant.
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'share-grantee@collectionbuddy.test')
returning id as share_id \gset

select pg_temp.auth_as(:'grantee_id'::uuid, 'share-grantee@collectionbuddy.test');

select is(
  (select count(*) from public.categories where id = :'category_id'::uuid),
  1::bigint,
  'an active viewer grant opens the shared category'
);

select is(
  (select count(*) from public.items where id = :'item_id'::uuid),
  1::bigint,
  'and the items linked into it'
);

select is(
  (select count(*) from public.item_categories where category_id = :'category_id'::uuid),
  1::bigint,
  'and their links'
);

select is(
  (select count(*) from public.images where id = :'image_id'::uuid),
  1::bigint,
  'and a photograph record on one of them'
);

select is(
  (select count(*) from public.categories where id = :'other_category_id'::uuid),
  0::bigint,
  'the grant is scoped to this one category, not to the owner as a whole'
);

-- A viewer grant does not extend to writing.
with attempt as (
  update public.categories set name = 'taken over' where id = :'category_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'a viewer grant does not extend to renaming the category');

with attempt as (
  update public.items set title = 'taken over' where id = :'item_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'a viewer grant does not extend to editing an item inside it');

-- Revoke, then it is gone -- with the row still there, so this is the
-- revocation itself being tested, not a row that stopped existing.
select pg_temp.auth_as(:'owner_id'::uuid, 'share-owner@collectionbuddy.test');
delete from public.category_shares where id = :'share_id'::uuid;

select pg_temp.auth_as(:'grantee_id'::uuid, 'share-grantee@collectionbuddy.test');
select is(
  (select count(*) from public.categories where id = :'category_id'::uuid),
  0::bigint,
  'revocation closes the category again, with it still present'
);

-- An expired grant is refused exactly like no grant at all -- the check
-- constraint only demands expires_at > created_at, not that either sits
-- in the future, so this is a legal row and the question is whether the
-- policy re-checks the clock.
select pg_temp.auth_as(:'owner_id'::uuid, 'share-owner@collectionbuddy.test');
insert into public.category_shares (category_id, invited_email, created_at, expires_at)
values (
  :'category_id'::uuid, 'share-grantee@collectionbuddy.test',
  now() - interval '2 hours', now() - interval '1 hour'
)
returning id as expired_share_id \gset

select pg_temp.auth_as(:'grantee_id'::uuid, 'share-grantee@collectionbuddy.test');
select is(
  (select count(*) from public.categories where id = :'category_id'::uuid),
  0::bigint,
  'an already-expired grant opens nothing'
);

-- A grant addressed to someone else does not open the category to a
-- bystander.
select pg_temp.auth_as(:'owner_id'::uuid, 'share-owner@collectionbuddy.test');
delete from public.category_shares where id = :'expired_share_id'::uuid;
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'nobody-invited@collectionbuddy.test');

select pg_temp.auth_as(:'grantee_id'::uuid, 'share-grantee@collectionbuddy.test');
select is(
  (select count(*) from public.categories where id = :'category_id'::uuid),
  0::bigint,
  'a grant addressed to someone else does not open the category to a bystander'
);

-- An invitation typed with odd case and stray spaces still matches -- both
-- sides normalize via lower(btrim(...)) (0009_caller_email_trim.sql: a
-- claim carrying stray whitespace used to match no grant, denying a
-- legitimate grantee with no error and nothing to distinguish it from
-- never having been invited).
select pg_temp.auth_as(:'owner_id'::uuid, 'share-owner@collectionbuddy.test');
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, '  SHARE-GRANTEE@COLLECTIONBUDDY.TEST  ')
returning invited_email as stored_email \gset

select is(:'stored_email'::text, 'share-grantee@collectionbuddy.test',
  'the address is stored normalized, not as typed');

select pg_temp.auth_as(:'grantee_id'::uuid, 'share-grantee@collectionbuddy.test');
select is(
  (select count(*) from public.categories where id = :'category_id'::uuid),
  1::bigint,
  'and the grantee''s ordinary claim, typed normally, still matches it'
);

-- A category cannot be shared with its own owner (tg_category_shares_enforce).
select pg_temp.auth_as(:'owner_id'::uuid, 'share-owner@collectionbuddy.test');
select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, 'share-owner@collectionbuddy.test'
  )),
  'a category cannot be shared with its own owner'
);

select * from finish();
rollback;
