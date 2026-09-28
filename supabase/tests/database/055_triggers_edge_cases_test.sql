-- The trigger branches 050's normal paths never reach: not-found guards, client-set fields, and the one cross-owner write.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id, gen_random_uuid() as editor_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'edge-owner@collectionbuddy.test');

-- enforce_user_id's categories wiring (0004) is separate from the items one 010 covers, so it could be dropped alone.
insert into public.categories (user_id, name) values (:'editor_id'::uuid, 'Addressed elsewhere')
returning id as category_id, user_id as planted_owner \gset

select is(:'planted_owner'::uuid, :'owner_id'::uuid,
  'a collection addressed to somebody else''s account lands in the caller''s own');

update public.categories set user_id = :'editor_id'::uuid where id = :'category_id'::uuid
returning user_id as after_update_owner \gset

select is(:'after_update_owner'::uuid, :'owner_id'::uuid,
  'and an existing collection cannot be handed to another owner either');

-- now() is fixed per transaction, so tg_set_updated_at is proved by discarding a caller's value, not by moving forward.
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

-- tg_item_categories_enforce runs before the foreign keys, so its message is what a client sees; it looks up each side separately.
select throws_ok(
  format(
    'insert into public.item_categories (item_id, category_id) values (%L, %L)',
    gen_random_uuid(), :'category_id'::uuid
  ),
  'P0001',
  'item or category not found',
  'filing an entry that does not exist is refused'
);

select throws_ok(
  format(
    'insert into public.item_categories (item_id, category_id) values (%L, %L)',
    :'item_id'::uuid, gen_random_uuid()
  ),
  'P0001',
  'item or category not found',
  'and so is filing one into a collection that does not exist'
);

-- tg_images_enforce refuses before the foreign key would, with a message rather than a constraint violation.
select throws_ok(
  format(
    'insert into public.images (item_id, path_full) values (%L, %L)',
    gen_random_uuid(), :'owner_id'::text || '/' || gen_random_uuid()::text || '/x.webp'
  ),
  'P0001',
  'item not found',
  'a photograph record for an item that does not exist is refused'
);

-- The one cross-owner trigger write: user_id follows the item, not the uploader, so the photograph outlives the editor's grant.
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

-- The sweep runs as its owner, so a collection's delete also removes an editor-filed entry its owner cannot see.
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

-- Read as postgres: an RLS-scoped read cannot tell removed from invisible.
reset role;
select is(
  (select count(*) from public.items where id = :'editor_item_id'::uuid),
  0::bigint,
  'deleting the collection sweeps away the editor''s orphaned entry too, not only the owner''s'
);

-- A sweep with no orphan deletes nothing, so it is safe on every mapping delete; filing in two collections predates 0020.
select pg_temp.auth_as(:'owner_id'::uuid, 'edge-owner@collectionbuddy.test');
insert into public.categories (name) values ('Kept A')
returning id as kept_a \gset
insert into public.categories (name) values ('Kept B')
returning id as kept_b \gset
insert into public.items (title) values ('Filed twice')
returning id as kept_item \gset
select pg_temp.file_as_before_0020(:'kept_item'::uuid, :'kept_a'::uuid);
select pg_temp.file_as_before_0020(:'kept_item'::uuid, :'kept_b'::uuid);

delete from public.item_categories
where item_id = :'kept_item'::uuid and category_id = :'kept_a'::uuid;

select is(
  (select count(*) from public.items where id = :'kept_item'::uuid),
  1::bigint,
  'an entry filed in two collections survives losing one of them'
);

-- The entry's own delete cascades its mappings, and the sweep that then fires must not fault on the missing item.
delete from public.items where id = :'kept_item'::uuid;
select is(
  (select count(*) from public.item_categories where item_id = :'kept_item'::uuid),
  0::bigint,
  'deleting the entry directly cascades its mappings away without the sweep faulting on the missing row'
);

-- Every sharing predicate compares against caller_email(), and NULL is what makes them all fail closed (025).
select pg_temp.auth_as(:'owner_id'::uuid, null);
select is(public.caller_email(), null,
  'caller_email answers NULL for a token carrying no email claim');

-- storage_item_id runs inside an RLS USING clause, so each shape must answer NULL rather than raise.
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

-- The empty array is what an untagged entry holds; tags is NOT NULL, so 050's NULL case never occurs.
select is(public.join_tags(array[]::text[]), '',
  'an empty tag array joins to an empty string');

-- A title pasted out of a spreadsheet arrives full of tabs.
select is(public.normalize_text(E'a\t\tb\nc'), 'a b c',
  'tabs and newlines collapse to single spaces like any other whitespace');

select * from finish();
rollback;
