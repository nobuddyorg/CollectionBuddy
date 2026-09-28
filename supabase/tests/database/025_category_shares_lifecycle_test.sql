-- A live grant's lifecycle: promotion, demotion, the fields that must not move, and who sees it.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id,
       gen_random_uuid() as grantee_id,
       gen_random_uuid() as bystander_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
insert into public.categories (name) values ('Lifecycle (pgTAP)')
returning id as category_id \gset
insert into public.categories (name) values ('Lifecycle, second (pgTAP)')
returning id as other_category_id \gset
insert into public.items (title) values ('Owner entry')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);

insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'lifecycle-grantee@collectionbuddy.test')
returning id as share_id \gset

-- Promotion takes effect at once: no accept step and nothing cached, the predicate is re-evaluated per request.
select pg_temp.auth_as(:'grantee_id'::uuid, 'lifecycle-grantee@collectionbuddy.test');
select is(
  pg_temp.rows_written(format('update public.items set title = %L where id = %L returning id', 'edited as a viewer', :'item_id')),
  0::bigint,
  'the grantee cannot write while the grant is still at viewer'
);

select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
update public.category_shares set role = 'editor' where id = :'share_id'::uuid;

select pg_temp.auth_as(:'grantee_id'::uuid, 'lifecycle-grantee@collectionbuddy.test');
with attempt as (
  update public.items set title = 'edited after promotion' where id = :'item_id'::uuid returning id
)
select is((select count(*) from attempt), 1::bigint,
  'promoting the grant to editor opens writing straight away');

-- Demotion closes writing with the entry still present (TEST_STRATEGY.md §7 rule 7).
select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
update public.category_shares set role = 'viewer' where id = :'share_id'::uuid;

select pg_temp.auth_as(:'grantee_id'::uuid, 'lifecycle-grantee@collectionbuddy.test');
with attempt as (
  update public.items set title = 'edited after demotion' where id = :'item_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'demoting it back to viewer closes writing again');

select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
select is(
  (select title from public.items where id = :'item_id'::uuid),
  'edited after promotion',
  'and the entry is still there, untouched -- the demotion is what closed it'
);

-- Role is the only field that may move on a live grant; any other would re-aim it, so each is refused, not ignored.
select throws_ok(
  format(
    'update public.category_shares set invited_email = %L where id = %L',
    'someone-else@collectionbuddy.test', :'share_id'::uuid
  ),
  'P0001',
  'only role may be changed on an existing share',
  'a live grant cannot be re-addressed to a different person'
);

select throws_ok(
  format(
    'update public.category_shares set category_id = %L where id = %L',
    :'other_category_id'::uuid, :'share_id'::uuid
  ),
  'P0001',
  'only role may be changed on an existing share',
  'nor re-pointed at a different collection'
);

select throws_ok(
  format(
    $q$update public.category_shares set expires_at = now() + interval '1 year' where id = %L$q$,
    :'share_id'::uuid
  ),
  'P0001',
  'only role may be changed on an existing share',
  'nor given a longer life than it was issued with'
);

select throws_ok(
  format(
    $q$update public.category_shares set created_at = now() - interval '1 year' where id = %L$q$,
    :'share_id'::uuid
  ),
  'P0001',
  'only role may be changed on an existing share',
  'nor backdated'
);

select throws_ok(
  format(
    'update public.category_shares set owner_user_id = %L where id = %L',
    :'grantee_id'::uuid, :'share_id'::uuid
  ),
  'P0001',
  'only role may be changed on an existing share',
  'nor handed to a different owner'
);

-- The policy refuses the grantee's update with zero rows rather than the trigger raising (TEST_STRATEGY.md §7 rule 3).
select pg_temp.auth_as(:'grantee_id'::uuid, 'lifecycle-grantee@collectionbuddy.test');
with attempt as (
  update public.category_shares set role = 'editor' where id = :'share_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'the grantee cannot promote its own grant');

select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
select is(
  (select role from public.category_shares where id = :'share_id'::uuid),
  'viewer',
  'and the grant is still a viewer grant, read back as its owner'
);

-- The trigger's own checks: the insert policy tests only owner_user_id, which the trigger re-derives from the category first.
select pg_temp.auth_as(:'bystander_id'::uuid, 'lifecycle-bystander@collectionbuddy.test');
-- A third party's address, as the self-share check would refuse the bystander's own.
select throws_ok(
  format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, 'lifecycle-third-party@collectionbuddy.test'
  ),
  'P0001',
  'ownership mismatch',
  'a bystander cannot issue a grant on somebody else''s collection'
);

select throws_ok(
  format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    gen_random_uuid(), 'lifecycle-third-party@collectionbuddy.test'
  ),
  'P0001',
  'category not found',
  'nor on a collection that does not exist'
);

-- Both parties see the grant row, the owner to revoke and the grantee to leave; nobody else does.
select is(
  (select count(*) from public.category_shares where id = :'share_id'::uuid),
  0::bigint,
  'a bystander cannot see a grant between two other people'
);

select pg_temp.auth_as(:'grantee_id'::uuid, 'lifecycle-grantee@collectionbuddy.test');
select is(
  (select count(*) from public.category_shares where id = :'share_id'::uuid),
  1::bigint,
  'the grantee can see the grant addressed to them'
);

-- Expired grants stay visible so they can be cleaned up or left: the select and delete policies carry no expiry check.
select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
insert into public.category_shares (category_id, invited_email, created_at, expires_at)
values (
  :'other_category_id'::uuid, 'lifecycle-grantee@collectionbuddy.test',
  now() - interval '2 hours', now() - interval '1 hour'
)
returning id as expired_share_id \gset

select pg_temp.auth_as(:'grantee_id'::uuid, 'lifecycle-grantee@collectionbuddy.test');
select is(
  (select count(*) from public.category_shares where id = :'expired_share_id'::uuid),
  1::bigint,
  'an expired grant is still listed for the grantee, so it can be left rather than lingering invisibly'
);
select is(
  (select count(*) from public.categories where id = :'other_category_id'::uuid),
  0::bigint,
  'even though it opens nothing'
);

-- No email claim: caller_email() is NULL and every grant predicate fails closed.
select pg_temp.auth_as(:'grantee_id'::uuid, null);
select is(
  (select count(*) from public.category_shares),
  0::bigint,
  'a session with no email claim is matched by no grant at all, rather than by every grant'
);
select is(
  (select count(*) from public.categories where id = :'category_id'::uuid),
  0::bigint,
  'and reaches none of the collections those grants were for'
);

-- Deleting a collection takes its grants, so a recreated one of the same name never inherits the old access list.
select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
delete from public.categories where id = :'category_id'::uuid;
select is(
  (select count(*) from public.category_shares where id = :'share_id'::uuid),
  0::bigint,
  'deleting a collection takes its grants with it'
);

select * from finish();
rollback;
