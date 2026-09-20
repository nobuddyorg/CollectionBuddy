-- has_category_write_access() is the widest predicate in the schema: an
-- active grant at role 'editor' lets a non-owner edit item *content*
-- inside someone else's category. Everything in 020_category_shares_rls_test.sql
-- tests a viewer, whose grant stops at reading, so none of it says
-- anything about this path -- the same reasoning
-- web/e2e/signed-in/rls.spec.ts's own "a category shared at the editor
-- role" describe block gives for testing it separately, on its own
-- collection.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id, gen_random_uuid() as editor_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'editor-test-owner@collectionbuddy.test');
insert into public.categories (name) values ('Leihgabe (pgTAP)')
returning id as category_id \gset
insert into public.items (title) values ('Owner entry')
returning id as owner_entry_id \gset
insert into public.item_categories (item_id, category_id)
values (:'owner_entry_id'::uuid, :'category_id'::uuid);

insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'editor@collectionbuddy.test', 'editor')
returning id as share_id \gset

-- An editor edits and deletes the owner's entries in the shared collection.
select pg_temp.auth_as(:'editor_id'::uuid, 'editor@collectionbuddy.test');
update public.items set title = 'edited by the editor' where id = :'owner_entry_id'::uuid;

select pg_temp.auth_as(:'owner_id'::uuid, 'editor-test-owner@collectionbuddy.test');
select is(
  (select title from public.items where id = :'owner_entry_id'::uuid),
  'edited by the editor',
  'an editor''s edit is accepted and visible to the owner on read-back'
);

select pg_temp.auth_as(:'editor_id'::uuid, 'editor@collectionbuddy.test');
with attempt as (
  delete from public.items where id = :'owner_entry_id'::uuid returning id
)
select is((select count(*) from attempt), 1::bigint,
  'an editor can delete the owner''s entry in the shared collection');

-- An editor files an entry of its own into the shared collection --
-- tg_item_categories_enforce, not a bare RLS predicate.
insert into public.items (title) values ('Editor''s own entry')
returning id as editor_entry_id \gset
insert into public.item_categories (item_id, category_id)
values (:'editor_entry_id'::uuid, :'category_id'::uuid)
returning user_id as link_owner \gset

select is(:'link_owner'::uuid, :'editor_id'::uuid,
  'the filed entry stays the editor''s own, not the category owner''s');

-- The deliberate asymmetry, asserted so it stays a decision rather than a
-- surprise: has_category_write_access() bundles category ownership in,
-- has_category_read_access() does not, so owning the collection does not
-- reveal an entry the editor merely filed into it -- the owner never held
-- a grant on that entry, and holding the collection is not one
-- (0006_policies.sql).
select pg_temp.auth_as(:'owner_id'::uuid, 'editor-test-owner@collectionbuddy.test');
select is(
  (select count(*) from public.items where id = :'editor_entry_id'::uuid),
  0::bigint,
  'the owner does not see an entry the editor filed into their own collection'
);

-- The line the role is supposed to stop at: item content, never the
-- collection itself.
select pg_temp.auth_as(:'editor_id'::uuid, 'editor@collectionbuddy.test');
with attempt as (
  update public.categories set name = 'taken over' where id = :'category_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'an editor cannot rename the collection');

with attempt as (
  delete from public.categories where id = :'category_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'an editor cannot delete the collection');

-- Cannot promote another grant on the collection...
select pg_temp.auth_as(:'owner_id'::uuid, 'editor-test-owner@collectionbuddy.test');
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'bystander@collectionbuddy.test')
returning id as bystander_share_id \gset

select pg_temp.auth_as(:'editor_id'::uuid, 'editor@collectionbuddy.test');
with attempt as (
  update public.category_shares set role = 'editor' where id = :'bystander_share_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'an editor cannot promote another grant on the collection');

-- ...nor issue a grant of its own -- tg_category_shares_enforce re-derives
-- owner_user_id from the category itself, so a forged value in the
-- payload never reaches the policy.
select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, owner_user_id, invited_email, role) values (%L, %L, %L, %L)',
    :'category_id'::uuid, :'editor_id'::uuid, 'nobody-invited@collectionbuddy.test', 'editor'
  )),
  'an editor cannot issue a grant of its own on the collection'
);

-- An editor reaches no further than the one collection granted.
select pg_temp.auth_as(:'owner_id'::uuid, 'editor-test-owner@collectionbuddy.test');
insert into public.categories (name) values ('Owner''s other category (pgTAP)')
returning id as other_category_id \gset

select pg_temp.auth_as(:'editor_id'::uuid, 'editor@collectionbuddy.test');
select is(
  (select count(*) from public.categories where id = :'other_category_id'::uuid),
  0::bigint,
  'an editor reaches no further than the one collection it was granted'
);

-- A revoked editor can no longer write, with the entry still there -- so
-- this is the revocation itself being tested, not a row that stopped
-- existing.
select pg_temp.auth_as(:'owner_id'::uuid, 'editor-test-owner@collectionbuddy.test');
insert into public.items (title) values ('Revocation probe')
returning id as revocation_item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'revocation_item_id'::uuid, :'category_id'::uuid);
delete from public.category_shares where id = :'share_id'::uuid;

select pg_temp.auth_as(:'editor_id'::uuid, 'editor@collectionbuddy.test');
with attempt as (
  update public.items set title = 'edited after revocation' where id = :'revocation_item_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'a revoked editor can no longer write');

select pg_temp.auth_as(:'owner_id'::uuid, 'editor-test-owner@collectionbuddy.test');
select is(
  (select title from public.items where id = :'revocation_item_id'::uuid),
  'Revocation probe',
  'and the entry is still there, untouched -- revocation is what closed it'
);

-- An expired editor grant writes no more than no grant at all.
insert into public.category_shares (category_id, invited_email, role, created_at, expires_at)
values (
  :'category_id'::uuid, 'editor@collectionbuddy.test', 'editor',
  now() - interval '2 hours', now() - interval '1 hour'
);

select pg_temp.auth_as(:'editor_id'::uuid, 'editor@collectionbuddy.test');
with attempt as (
  update public.items set title = 'edited by an expired editor' where id = :'revocation_item_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'an expired editor grant writes no more than no grant at all');

-- An editor may leave the share, which ends its own access and nobody
-- else's -- "delete own or invited category_shares" deliberately covers
-- both the owner revoking and the grantee leaving.
select pg_temp.auth_as(:'owner_id'::uuid, 'editor-test-owner@collectionbuddy.test');
delete from public.category_shares
where category_id = :'category_id'::uuid and invited_email = 'editor@collectionbuddy.test';
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'editor@collectionbuddy.test', 'editor')
returning id as leaving_share_id \gset

select pg_temp.auth_as(:'editor_id'::uuid, 'editor@collectionbuddy.test');
with attempt as (
  delete from public.category_shares where id = :'leaving_share_id'::uuid returning id
)
select is((select count(*) from attempt), 1::bigint,
  'an editor may delete its own share, leaving the collection');

select is(
  (select count(*) from public.categories where id = :'category_id'::uuid),
  0::bigint,
  'and immediately loses access to the collection'
);

select * from finish();
rollback;
