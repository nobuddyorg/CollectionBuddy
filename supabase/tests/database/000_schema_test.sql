-- Schema-level pgTAP tests: the orphan-sweep trigger stays statement-level
-- (CLAUDE.md's guardrail against reverting delete_item_if_orphan to FOR
-- EACH ROW), and every constraint keeping the data model honest actually
-- rejects what it is supposed to -- asserted by attempting the write, not
-- by reading the constraint back out of the catalog.
--
-- The grant surface (who may address which table and function at all) is
-- 001_grants_test.sql's, and row level security being enabled on every
-- table is asserted there too, across the whole schema rather than table
-- by table.
--
-- Complements web/e2e/signed-in/rls.spec.ts rather than duplicating it:
-- this file runs directly against Postgres, inside a transaction that
-- rolls back, and is fast enough to run on every schema change. The
-- Playwright suite is what proves the same policies hold through a real
-- PostgREST request carrying a real JWT -- see TEST_STRATEGY.md for the
-- division of labor between the two.
begin;
select no_plan();

\ir _helpers.psql

-- delete_item_if_orphan (CLAUDE.md: "deliberately FOR EACH STATEMENT, not
-- FOR EACH ROW -- the row-level version was a real O(n) performance bug
-- at category-deletion scale; don't revert it for 'simplicity'"). tgtype's
-- bit 0 (value 1) marks a trigger ROW-level; unset means STATEMENT.
select ok(
  (select (tgtype::int & 1) = 0
   from pg_catalog.pg_trigger
   where tgname = 'trg_delete_orphan_items_after_ic_delete'
     and tgrelid = 'public.item_categories'::regclass),
  'the orphan-sweep trigger stays statement-level, not per-row'
);

-- images_path_full_matches_item (0012): a row may not claim a path naming
-- a different item, or one that does not parse as <uid>/<itemId>/<file>
-- at all -- both collapse to the same "is not distinct from" comparison
-- against NULL, since storage_item_id() answers NULL rather than raising
-- on an unparsable path.
select gen_random_uuid() as owner_id \gset
select pg_temp.auth_as(:'owner_id'::uuid, 'schema-test-owner@collectionbuddy.test');

insert into public.categories (name) values ('Schema test category')
returning id as category_id \gset
insert into public.items (title) values ('Schema test item')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);

select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, 'not/a/matching/path.webp'
  )),
  'a photograph record cannot claim a path naming a different item'
);

select ok(
  not pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/matching.webp'
  )),
  'a photograph record naming its own item is accepted'
);

-- category_shares_category_email_unique: re-sharing the same (category,
-- email) pair is refused outright, not a second grant with its own expiry
-- (TEST_STRATEGY.md §8's idempotency table, "creating a grant/share that
-- already exists").
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'schema-test-grantee@collectionbuddy.test');

select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, 'schema-test-grantee@collectionbuddy.test'
  )),
  're-sharing the same category with the same email is refused, not a second grant'
);

-- The rest of the constraints, each attempted as a real write. A CHECK
-- read back out of the catalog proves it exists; only a rejected insert
-- proves it rejects the shape it was written for -- images_path_full_
-- matches_item is the standing example, since a plausible spelling of it
-- (`=` rather than `is not distinct from`) exists, still applies cleanly,
-- and admits every unparsable path.
select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid,
    :'owner_id'::text || '/' || gen_random_uuid()::text || '/well-formed.webp'
  )),
  'a well-formed path naming a different item is refused too, not just an unparsable one'
);

-- images_path_full_key / images_path_thumb_key: one row per stored object,
-- so a second row can never claim bytes the first one already owns and
-- outlive it -- a delete of either would take the other's object with it.
select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/matching.webp'
  )),
  'two photograph records cannot claim the same full-size object'
);

insert into public.images (item_id, path_full, path_thumb)
values (
  :'item_id'::uuid,
  :'owner_id'::text || '/' || :'item_id'::text || '/withthumb.webp',
  :'owner_id'::text || '/' || :'item_id'::text || '/thumb.webp'
);

select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full, path_thumb) values (%L, %L, %L)',
    :'item_id'::uuid,
    :'owner_id'::text || '/' || :'item_id'::text || '/other.webp',
    :'owner_id'::text || '/' || :'item_id'::text || '/thumb.webp'
  )),
  'nor the same thumbnail object'
);

-- The thumbnail index is partial for a reason: a photograph whose
-- thumbnail upload failed is an accepted failure mode (uploadImage,
-- useItemImages.tsx), and several of those must be able to coexist.
select ok(
  not pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/nothumb-two.webp'
  )),
  'but any number of photographs may have no thumbnail at all'
);

-- categories_name_not_blank / items_title_not_blank via the normalize
-- triggers: a whitespace-only name normalizes to NULL and the NOT NULL is
-- what catches it, which is why neither constraint needs a blank-string
-- test of its own (0003_tables.sql).
select ok(
  pg_temp.raises($q$insert into public.categories (name) values ('   ')$q$),
  'a whitespace-only category name is refused, not stored as an empty string'
);
select ok(
  pg_temp.raises($q$insert into public.items (title) values (E' \t \n ')$q$),
  'a whitespace-only entry title is refused too'
);

-- categories_user_lower_name_idx: case-insensitively unique per owner, so
-- "Münzen" and "münzen" are one collection rather than two that look
-- identical in the catalogue list.
select ok(
  pg_temp.raises($q$insert into public.categories (name) values ('schema TEST category')$q$),
  'a collection name differing only in case is refused for the same owner'
);

-- ...and scoped to the owner: two collectors may each have a "Münzen".
select gen_random_uuid() as second_owner_id \gset
select pg_temp.auth_as(:'second_owner_id'::uuid, 'schema-test-second@collectionbuddy.test');
select ok(
  not pg_temp.raises($q$insert into public.categories (name) values ('Schema test category')$q$),
  'but another collector may use the very same name'
);
select pg_temp.auth_as(:'owner_id'::uuid, 'schema-test-owner@collectionbuddy.test');

-- tags is addressed as a flat list everywhere (join_tags, the tag filter),
-- and PostgreSQL's array type would happily accept a nested one. items_tags_1d is the backstop; what actually answers a
-- nested array first is tg_items_normalize, whose unnest() flattens it --
-- so the constraint never sees one, and the row that lands is still
-- one-dimensional. Asserted as it behaves rather than as the constraint
-- alone would suggest.
insert into public.items (title, tags)
values ('Nested tags', array[array['b', 'a'], array['a', 'c']])
returning id as nested_tags_item \gset

select is(
  (select tags from public.items where id = :'nested_tags_item'::uuid),
  array['a', 'b', 'c'],
  'a nested tag array is flattened, deduplicated and sorted by normalization, never stored nested'
);

-- The other half of the same column: tags has no meaningful null state --
-- an entry with no tags carries an empty array -- and the normalize
-- trigger deliberately leaves a null alone rather than defaulting it, so
-- NOT NULL is what refuses it.
select ok(
  pg_temp.raises($q$insert into public.items (title, tags) values ('No tags at all', null)$q$),
  'tags cannot be null -- an entry with no tags carries an empty array'
);

-- category_shares_invited_email_looks_like_email: the invited address is
-- the entire authorization identity of a grant, so a value that could
-- never match a JWT email claim is refused at write time rather than
-- becoming a grant that silently opens nothing.
select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, 'not-an-address'
  )),
  'a grant addressed to something that is not an email address is refused'
);

-- The trigger normalizes before the constraint runs, so a whitespace-only
-- address is caught by tg_category_shares_enforce's own check rather than
-- by the CHECK above.
select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, '   '
  )),
  'nor may a grant be addressed to nothing at all'
);

-- category_shares_expiry_in_future: an expiry at or before creation is a
-- grant that was never usable. Already-expired grants are still legal and
-- deliberately so (020_category_shares_rls_test.sql relies on it) -- what
-- is refused is one whose expiry precedes its own creation.
select ok(
  pg_temp.raises(format(
    $q$insert into public.category_shares (category_id, invited_email, created_at, expires_at)
       values (%L, %L, now(), now() - interval '1 hour')$q$,
    :'category_id'::uuid, 'expiry-probe@collectionbuddy.test'
  )),
  'a grant cannot expire before it was created'
);

-- category_shares_role_valid: the two predicates in 0006_policies.sql test
-- for the literal 'editor', so an unrecognized role would silently behave
-- as a viewer rather than failing -- the constraint is what makes a typo
-- loud.
select ok(
  pg_temp.raises(format(
    'insert into public.category_shares (category_id, invited_email, role) values (%L, %L, %L)',
    :'category_id'::uuid, 'role-probe@collectionbuddy.test', 'admin'
  )),
  'a grant cannot carry a role outside viewer and editor'
);

-- Cascade behaviour: deleting the category removes the item_categories
-- mapping, and the statement-level orphan-sweep trigger then removes the
-- now-orphaned item in the same statement.
delete from public.categories where id = :'category_id'::uuid;

select is(
  (select count(*) from public.items where id = :'item_id'::uuid),
  0::bigint,
  'deleting a category orphans and removes the item it held exclusively'
);

select is(
  (select count(*) from public.item_categories where category_id = :'category_id'::uuid),
  0::bigint,
  'the mapping is gone along with the category'
);

select is(
  (select count(*) from public.images where item_id = :'item_id'::uuid),
  0::bigint,
  'and the photograph records of the removed item cascade away with it'
);

-- Nothing filters tags by array containment, so no GIN index on the array (0016).
select hasnt_index('public', 'items', 'idx_items_tags_gin', 'items.tags carries no unread GIN index');

select * from finish();
rollback;
