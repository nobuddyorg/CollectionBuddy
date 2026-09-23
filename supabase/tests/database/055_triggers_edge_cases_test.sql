-- The branches of the write-path triggers that the happy paths never
-- reach: the "not found" guards, the fields a client may try to set for
-- itself, and the one place a trigger deliberately writes a row belonging
-- to somebody else. 050_functions_triggers_test.sql covers the pure
-- functions and the normal path through each trigger; this file is the
-- rest of each trigger body.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id, gen_random_uuid() as editor_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'edge-owner@collectionbuddy.test');

-- enforce_user_id is wired onto categories as well as items, and only the
-- items half is covered (010_ownership_rls_test.sql). Same trigger
-- function, but a separate wiring in 0004_triggers.sql that could be
-- dropped on its own.
insert into public.categories (user_id, name) values (:'editor_id'::uuid, 'Addressed elsewhere')
returning id as category_id, user_id as planted_owner \gset

select is(:'planted_owner'::uuid, :'owner_id'::uuid,
  'a collection addressed to somebody else''s account lands in the caller''s own');

update public.categories set user_id = :'editor_id'::uuid where id = :'category_id'::uuid
returning user_id as after_update_owner \gset

select is(:'after_update_owner'::uuid, :'owner_id'::uuid,
  'and an existing collection cannot be handed to another owner either');

-- tg_set_updated_at: the column is the server's to write, not the
-- client's. now() is fixed for the whole transaction, so "it moved
-- forward" is untestable here -- what is testable, and what actually
-- matters, is that a value supplied by the caller is discarded.
update public.categories set name = 'Renamed', updated_at = timestamptz '2000-01-01'
where id = :'category_id'::uuid;

select ok(
  (select updated_at from public.categories where id = :'category_id'::uuid) > timestamptz '2020-01-01',
  'a client-supplied updated_at on a collection is overwritten by the server clock'
);

insert into public.items (title) values ('Edge entry')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);

update public.items set title = 'Edge entry, renamed', updated_at = timestamptz '2000-01-01'
where id = :'item_id'::uuid;

select ok(
  (select updated_at from public.items where id = :'item_id'::uuid) > timestamptz '2020-01-01',
  'and so is one on an entry'
);

-- tg_item_categories_enforce's first guard. A mapping row references both
-- sides by foreign key, so a missing row would be refused either way --
-- but the trigger runs first, and its message is what a client actually
-- sees. Both directions, since the function looks each up separately.
select ok(
  pg_temp.raises(format(
    'insert into public.item_categories (item_id, category_id) values (%L, %L)',
    gen_random_uuid(), :'category_id'::uuid
  )),
  'filing an entry that does not exist is refused'
);

select ok(
  pg_temp.raises(format(
    'insert into public.item_categories (item_id, category_id) values (%L, %L)',
    :'item_id'::uuid, gen_random_uuid()
  )),
  'and so is filing one into a collection that does not exist'
);

-- tg_images_enforce's own "not found" guard, which is what stops a
-- photograph record being written against an item id nobody owns. The
-- foreign key would refuse it too; the trigger is what refuses it first,
-- and with a message rather than a constraint violation.
select ok(
  pg_temp.raises(format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    gen_random_uuid(), :'owner_id'::text || '/' || gen_random_uuid()::text || '/x.webp'
  )),
  'a photograph record for an item that does not exist is refused'
);

-- The one place a trigger deliberately writes a row owned by someone other
-- than the caller: an editor photographing the owner's entry. user_id
-- follows the *item*, not the uploader, so the photograph belongs to the
-- collection's entry rather than to whoever happened to take it -- and
-- therefore survives the editor's grant being revoked. Only the right to
-- *insert* it is widened by the grant.
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'edge-editor@collectionbuddy.test', 'editor')
returning id as share_id \gset

select pg_temp.auth_as(:'editor_id'::uuid, 'edge-editor@collectionbuddy.test');
insert into public.images (item_id, path_full)
values (:'item_id'::uuid, :'editor_id'::text || '/' || :'item_id'::text || '/by-the-editor.webp')
returning id as editor_image_id, user_id as image_owner \gset

select is(:'image_owner'::uuid, :'owner_id'::uuid,
  'a photograph an editor adds to the owner''s entry belongs to the entry''s owner, not the uploader');

select pg_temp.auth_as(:'owner_id'::uuid, 'edge-owner@collectionbuddy.test');
delete from public.category_shares where id = :'share_id'::uuid;

select is(
  (select count(*) from public.images where id = :'editor_image_id'::uuid),
  1::bigint,
  'and it stays with the entry once the editor''s grant is revoked'
);

-- delete_item_if_orphan runs as its owner, so the sweep is not filtered by
-- the deleting user's own visibility: an entry an editor filed into a
-- shared collection is removed along with the collection, exactly like the
-- owner's own entries, even though the owner can neither see nor delete
-- that entry directly (030_editor_role_rls_test.sql). Leaving it behind
-- would strand a row its owner could no longer reach through any
-- collection.
insert into public.categories (name) values ('Sweep (pgTAP)')
returning id as sweep_category_id \gset
insert into public.category_shares (category_id, invited_email, role)
values (:'sweep_category_id'::uuid, 'edge-editor@collectionbuddy.test', 'editor');

select pg_temp.auth_as(:'editor_id'::uuid, 'edge-editor@collectionbuddy.test');
insert into public.items (title) values ('Filed by the editor')
returning id as editor_item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'editor_item_id'::uuid, :'sweep_category_id'::uuid);

select pg_temp.auth_as(:'owner_id'::uuid, 'edge-owner@collectionbuddy.test');
select is(
  (select count(*) from public.items where id = :'editor_item_id'::uuid),
  0::bigint,
  'the owner cannot see the entry the editor filed -- so the sweep below is not simply their own row'
);

delete from public.categories where id = :'sweep_category_id'::uuid;

-- Read back with no identity in the way: an RLS-scoped read could not tell
-- "removed" from "invisible to the owner", and invisible is exactly what
-- this row was a moment ago.
reset role;
select is(
  (select count(*) from public.items where id = :'editor_item_id'::uuid),
  0::bigint,
  'deleting the collection sweeps away the editor''s orphaned entry too, not only the owner''s'
);

-- The sweep is a no-op when nothing is actually orphaned, which is what
-- makes it safe to fire on every mapping delete: an entry filed in two
-- collections survives losing one of them.
select pg_temp.auth_as(:'owner_id'::uuid, 'edge-owner@collectionbuddy.test');
insert into public.categories (name) values ('Kept A')
returning id as kept_a \gset
insert into public.categories (name) values ('Kept B')
returning id as kept_b \gset
insert into public.items (title) values ('Filed twice')
returning id as kept_item \gset
insert into public.item_categories (item_id, category_id)
values (:'kept_item'::uuid, :'kept_a'::uuid), (:'kept_item'::uuid, :'kept_b'::uuid);

delete from public.item_categories
where item_id = :'kept_item'::uuid and category_id = :'kept_a'::uuid;

select is(
  (select count(*) from public.items where id = :'kept_item'::uuid),
  1::bigint,
  'an entry filed in two collections survives losing one of them'
);

-- Deleting the entry itself, rather than its last mapping: the mappings go
-- by foreign key cascade, and the sweep that then fires must not fault on
-- an item row that is already gone.
delete from public.items where id = :'kept_item'::uuid;
select is(
  (select count(*) from public.item_categories where item_id = :'kept_item'::uuid),
  0::bigint,
  'deleting the entry directly cascades its mappings away without the sweep faulting on the missing row'
);

-- caller_email() with no email claim, asserted directly here as well as
-- through its consequences in 025_category_shares_lifecycle_test.sql: this
-- is the value every sharing predicate compares against, and NULL is what
-- makes them all fail closed.
select pg_temp.auth_as(:'owner_id'::uuid, null);
select is(public.caller_email(), null,
  'caller_email answers NULL for a token carrying no email claim');

-- storage_item_id's remaining non-parsing shapes. Each has to answer NULL
-- rather than raise: the function is called from inside an RLS USING
-- clause, where a raised error takes down the whole statement instead of
-- failing to match one row.
select is(public.storage_item_id('uid//file.webp'), null,
  'an empty second segment answers NULL');
select is(public.storage_item_id(''), null,
  'so does an empty path');
select is(public.storage_item_id(null), null,
  'and a NULL path');
select is(
  public.storage_item_id('uid/3F2504E0-4F89-11D3-9A0C-0305E82C3301/file.webp'),
  '3f2504e0-4f89-11d3-9a0c-0305e82c3301'::uuid,
  'an upper-case uuid parses the same as a lower-case one'
);
-- Every spelling the uuid type accepts still parses; 0011 tests the segment instead of catching the cast (#720).
select is(
  public.storage_item_id('uid/{3f2504e0-4f89-11d3-9a0c-0305e82c3301}/file.webp'),
  '3f2504e0-4f89-11d3-9a0c-0305e82c3301'::uuid,
  'a braced uuid parses'
);
select is(
  public.storage_item_id('uid/3f2504e04f8911d39a0c0305e82c3301/file.webp'),
  '3f2504e0-4f89-11d3-9a0c-0305e82c3301'::uuid,
  'so does one without hyphens'
);
select is(public.storage_item_id('uid/3f2504e0-4f89-11d3-9a0c-0305e82c330g/file.webp'), null,
  'a uuid-shaped segment with a non-hex digit answers NULL');

-- join_tags on the empty array, the shape every entry with no tags
-- actually has -- the NULL case (050_functions_triggers_test.sql) is the
-- one that cannot occur, since tags is NOT NULL.
select is(public.join_tags(array[]::text[]), '',
  'an empty tag array joins to an empty string');

-- normalize_text collapses every kind of whitespace, not just the space
-- character -- a title pasted out of a spreadsheet arrives full of tabs.
select is(public.normalize_text(E'a\t\tb\nc'), 'a b c',
  'tabs and newlines collapse to single spaces like any other whitespace');

select * from finish();
rollback;
