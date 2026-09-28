-- The orphan sweep's shape and every data-model constraint, each refusal attempted as a real write; grants and RLS are 001's.
begin;
select no_plan();

\ir _helpers.psql

-- tgtype bit 0 set means FOR EACH ROW; the orphan sweep must stay statement-level (design-decisions.md).
select ok(
  (select (tgtype::int & 1) = 0
   from pg_catalog.pg_trigger
   where tgname = 'trg_delete_orphan_items_after_ic_delete'
     and tgrelid = 'public.item_categories'::regclass),
  'the orphan-sweep trigger stays statement-level, not per-row'
);

-- images_path_full_matches_item (0003): storage_item_id() answers NULL on an unparsable path, so the check uses is not distinct from.
select gen_random_uuid() as owner_id \gset
select pg_temp.auth_as(:'owner_id'::uuid, 'schema-test-owner@collectionbuddy.test');

insert into public.categories (name) values ('Schema test category')
returning id as category_id \gset
insert into public.items (title) values ('Schema test item')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);

select throws_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, 'not/a/matching/path.webp'
  ),
  '23514',
  'new row for relation "images" violates check constraint "images_path_full_matches_item"',
  'a photograph record cannot claim a path naming a different item'
);

select lives_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/matching.webp'
  ),
  'a photograph record naming its own item is accepted'
);

-- images_path_thumb_matches_item (0019): the owner's client removes the thumbnail too when the record goes.
select throws_ok(
  format(
    'insert into public.images (item_id, path_full, path_thumb) values (%L, %L, %L)',
    :'item_id'::uuid,
    :'owner_id'::text || '/' || :'item_id'::text || '/planted-full.webp',
    :'owner_id'::text || '/' || gen_random_uuid()::text || '/victim.webp'
  ),
  '23514',
  'new row for relation "images" violates check constraint "images_path_thumb_matches_item"',
  'a photograph record cannot claim a thumbnail naming a different item'
);

select lives_ok(
  format(
    'insert into public.images (item_id, path_full, path_thumb) values (%L, %L, %L)',
    :'item_id'::uuid,
    :'owner_id'::text || '/' || :'item_id'::text || '/pair.webp',
    :'owner_id'::text || '/' || :'item_id'::text || '/pair.thumb.webp'
  ),
  'a photograph record whose thumbnail names its own item is accepted'
);

-- 0028 validated it, so no row written before 0019 still names another entry's photograph.
select is(
  (select array_agg(conname::text order by conname)
   from pg_catalog.pg_constraint
   where conrelid = 'public.images'::regclass and not convalidated),
  null,
  'every constraint on images holds for every row, not only for writes since it was added'
);

-- Re-sharing the same (category, email) is a clear conflict, never a second grant (TEST_STRATEGY.md §8, idempotency).
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'schema-test-grantee@collectionbuddy.test');

select throws_ok(
  format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, 'schema-test-grantee@collectionbuddy.test'
  ),
  '23505',
  'duplicate key value violates unique constraint "category_shares_category_email_unique"',
  're-sharing the same category with the same email is refused, not a second grant'
);

-- A plausible `=` spelling of images_path_full_matches_item applies cleanly yet admits unparsable paths, so refusals are attempted, not read from the catalog.
select throws_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid,
    :'owner_id'::text || '/' || gen_random_uuid()::text || '/well-formed.webp'
  ),
  '23514',
  'new row for relation "images" violates check constraint "images_path_full_matches_item"',
  'a well-formed path naming a different item is refused too, not just an unparsable one'
);

-- images_path_full_key / images_path_thumb_key: one row per object, else deleting either row takes the other's object.
select throws_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/matching.webp'
  ),
  '23505',
  'duplicate key value violates unique constraint "images_path_full_key"',
  'two photograph records cannot claim the same full-size object'
);

insert into public.images (item_id, path_full, path_thumb)
values (
  :'item_id'::uuid,
  :'owner_id'::text || '/' || :'item_id'::text || '/withthumb.webp',
  :'owner_id'::text || '/' || :'item_id'::text || '/thumb.webp'
);

select throws_ok(
  format(
    'insert into public.images (item_id, path_full, path_thumb) values (%L, %L, %L)',
    :'item_id'::uuid,
    :'owner_id'::text || '/' || :'item_id'::text || '/other.webp',
    :'owner_id'::text || '/' || :'item_id'::text || '/thumb.webp'
  ),
  '23505',
  'duplicate key value violates unique constraint "images_path_thumb_key"',
  'nor the same thumbnail object'
);

-- The thumbnail index is partial: a failed thumbnail upload is an accepted failure mode (uploadImage, useItemImages.tsx).
select lives_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    :'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/nothumb-two.webp'
  ),
  'but any number of photographs may have no thumbnail at all'
);

-- The normalize triggers turn a whitespace-only name into NULL, so NOT NULL refuses it before either not_blank CHECK.
select throws_ok(
  $q$insert into public.categories (name) values ('   ')$q$,
  '23502',
  'null value in column "name" of relation "categories" violates not-null constraint',
  'a whitespace-only category name is refused, not stored as an empty string'
);
select throws_ok(
  $q$insert into public.items (title) values (E' \t \n ')$q$,
  '23502',
  'null value in column "title" of relation "items" violates not-null constraint',
  'a whitespace-only entry title is refused too'
);

-- categories_user_lower_name_idx: "Münzen" and "münzen" are one collection, never two lookalikes in the list.
select throws_ok(
  $q$insert into public.categories (name) values ('schema TEST category')$q$,
  '23505',
  'duplicate key value violates unique constraint "categories_user_lower_name_idx"',
  'a collection name differing only in case is refused for the same owner'
);

-- ...and scoped to the owner: two collectors may each have a "Münzen".
select gen_random_uuid() as second_owner_id \gset
select pg_temp.auth_as(:'second_owner_id'::uuid, 'schema-test-second@collectionbuddy.test');
select lives_ok(
  $q$insert into public.categories (name) values ('Schema test category')$q$,
  'but another collector may use the very same name'
);
select pg_temp.auth_as(:'owner_id'::uuid, 'schema-test-owner@collectionbuddy.test');

-- tg_items_normalize's unnest() flattens a nested array before items_tags_1d sees it.
insert into public.items (title, tags)
values ('Nested tags', array[array['b', 'a'], array['a', 'c']])
returning id as nested_tags_item \gset

select is(
  (select tags from public.items where id = :'nested_tags_item'::uuid),
  array['a', 'b', 'c'],
  'a nested tag array is flattened, deduplicated and sorted by normalization, never stored nested'
);

-- The normalize trigger leaves a NULL tags alone rather than defaulting it, so NOT NULL is what refuses it.
select throws_ok(
  $q$insert into public.items (title, tags) values ('No tags at all', null)$q$,
  '23502',
  'null value in column "tags" of relation "items" violates not-null constraint',
  'tags cannot be null -- an entry with no tags carries an empty array'
);

-- The invited address is a grant's whole identity, so an address no JWT email claim could match is refused at write time.
select throws_ok(
  format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, 'not-an-address'
  ),
  '23514',
  'new row for relation "category_shares" violates check constraint "category_shares_invited_email_looks_like_email"',
  'a grant addressed to something that is not an email address is refused'
);

-- tg_category_shares_enforce normalizes before the CHECK runs, so its own check refuses a blank address.
select throws_ok(
  format(
    'insert into public.category_shares (category_id, invited_email) values (%L, %L)',
    :'category_id'::uuid, '   '
  ),
  'P0001',
  'invited_email required',
  'nor may a grant be addressed to nothing at all'
);

-- Already-expired grants stay legal (020 relies on it); only an expiry before the grant's own creation is refused.
select throws_ok(
  format(
    $q$insert into public.category_shares (category_id, invited_email, created_at, expires_at)
       values (%L, %L, now(), now() - interval '1 hour')$q$,
    :'category_id'::uuid, 'expiry-probe@collectionbuddy.test'
  ),
  '23514',
  'new row for relation "category_shares" violates check constraint "category_shares_expiry_in_future"',
  'a grant cannot expire before it was created'
);

-- category_shares_role_valid: both access predicates test the literal 'editor', so a typo would silently mean viewer.
select throws_ok(
  format(
    'insert into public.category_shares (category_id, invited_email, role) values (%L, %L, %L)',
    :'category_id'::uuid, 'role-probe@collectionbuddy.test', 'admin'
  ),
  '23514',
  'new row for relation "category_shares" violates check constraint "category_shares_role_valid"',
  'a grant cannot carry a role outside viewer and editor'
);

-- The category's cascade unlinks the entry and the statement-level sweep removes it in the same statement.
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

-- Nothing filters tags by array containment, so no GIN index on the array (0008).
select hasnt_index('public', 'items', 'idx_items_tags_gin', 'items.tags carries no unread GIN index');

select * from finish();
rollback;
