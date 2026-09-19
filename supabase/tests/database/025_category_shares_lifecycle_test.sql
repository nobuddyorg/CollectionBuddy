-- A grant's life after it is issued: promotion, demotion, what may still
-- be edited on it, and who can see it.
--
-- 020_category_shares_rls_test.sql and 030_editor_role_rls_test.sql both
-- take a grant's role as given at insert time, so neither exercises
-- tg_category_shares_enforce's UPDATE branch -- the one place a role
-- changes hands on a live grant, and the only write path on this table
-- that is not simply "issue" or "revoke". A promotion is the cheapest
-- privilege escalation in the whole model if the surrounding fields are
-- not pinned: re-pointing an existing grant at another category, or at
-- another address, would hand out access the owner never issued.
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

-- Promotion: the owner moves a live grant from viewer to editor, and the
-- grantee's write access follows immediately -- there is no accept step
-- and nothing cached, the predicate is re-evaluated per request.
select pg_temp.auth_as(:'grantee_id'::uuid, 'lifecycle-grantee@collectionbuddy.test');
with attempt as (
  update public.items set title = 'edited as a viewer' where id = :'item_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'the grantee cannot write while the grant is still at viewer');

select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
update public.category_shares set role = 'editor' where id = :'share_id'::uuid;

select pg_temp.auth_as(:'grantee_id'::uuid, 'lifecycle-grantee@collectionbuddy.test');
with attempt as (
  update public.items set title = 'edited after promotion' where id = :'item_id'::uuid returning id
)
select is((select count(*) from attempt), 1::bigint,
  'promoting the grant to editor opens writing straight away');

-- ...and demotion closes it again, with the entry still there, so this is
-- the role change being tested rather than a row that stopped existing
-- (TEST_STRATEGY.md §7 rule 7).
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

-- Role is the only field that may move on a live grant. Every other one
-- would silently re-aim an existing grant at something the owner never
-- issued it for -- a different category, a different person, or a longer
-- life than they agreed to -- so each is refused outright rather than
-- ignored.
select ok(
  pg_temp.raises(format(
    'update public.category_shares set invited_email = %L where id = %L',
    'someone-else@collectionbuddy.test', :'share_id'::uuid
  )),
  'a live grant cannot be re-addressed to a different person'
);

select ok(
  pg_temp.raises(format(
    'update public.category_shares set category_id = %L where id = %L',
    :'other_category_id'::uuid, :'share_id'::uuid
  )),
  'nor re-pointed at a different collection'
);

select ok(
  pg_temp.raises(format(
    $q$update public.category_shares set expires_at = now() + interval '1 year' where id = %L$q$,
    :'share_id'::uuid
  )),
  'nor given a longer life than it was issued with'
);

select ok(
  pg_temp.raises(format(
    $q$update public.category_shares set created_at = now() - interval '1 year' where id = %L$q$,
    :'share_id'::uuid
  )),
  'nor backdated'
);

select ok(
  pg_temp.raises(format(
    'update public.category_shares set owner_user_id = %L where id = %L',
    :'grantee_id'::uuid, :'share_id'::uuid
  )),
  'nor handed to a different owner'
);

-- The grantee is not the one who may promote it. Refused by the policy
-- rather than the trigger, so it affects no rows instead of raising --
-- both denials matter, and they fail differently (TEST_STRATEGY.md §7
-- rule 3).
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

-- Issuing a grant on a collection that is not yours, or on one that does
-- not exist. Both are the trigger's own checks: the insert policy only
-- tests owner_user_id, which the trigger has already re-derived from the
-- category by the time the policy sees it.
select pg_temp.auth_as(:'bystander_id'::uuid, 'lifecycle-bystander@collectionbuddy.test');
select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, 'lifecycle-bystander@collectionbuddy.test'
  )),
  'a bystander cannot issue a grant on somebody else''s collection'
);

select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    gen_random_uuid(), 'lifecycle-bystander@collectionbuddy.test'
  )),
  'nor on a collection that does not exist'
);

-- Visibility of the grant row itself. Both parties can see it -- the owner
-- to revoke, the grantee to leave -- and nobody else can.
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

-- An expired grant stays visible to both sides even though it opens
-- nothing: deliberate, so the owner can find it dangling and clean it up
-- and the grantee can leave it (0006_policies.sql -- the select and delete
-- policies carry no expiry check, only the access predicates do).
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

-- A caller whose token carries no email claim at all. caller_email()
-- answers NULL, and `invited_email = NULL` is never true, so every grant
-- predicate fails closed rather than matching broadly -- the one outcome
-- that would be catastrophic here.
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

-- Revoking by deleting the collection: the grants go with it, so a
-- recreated collection of the same name never inherits the old one's
-- access list.
select pg_temp.auth_as(:'owner_id'::uuid, 'lifecycle-owner@collectionbuddy.test');
delete from public.categories where id = :'category_id'::uuid;
select is(
  (select count(*) from public.category_shares where id = :'share_id'::uuid),
  0::bigint,
  'deleting a collection takes its grants with it'
);

select * from finish();
rollback;
