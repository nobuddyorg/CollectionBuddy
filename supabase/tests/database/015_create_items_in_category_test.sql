-- create_items_in_category (0029): entries and links in one transaction as the caller, so a refused link takes its entries with it; rls/create-rpc.spec.ts is the PostgREST half.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id,
  gen_random_uuid() as stranger_id,
  gen_random_uuid() as viewer_id,
  gen_random_uuid() as editor_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'create-owner@collectionbuddy.test');
insert into public.categories (name) values ('Neuzugang (pgTAP)')
returning id as category_id \gset
insert into public.category_shares (category_id, invited_email, role)
values
  (:'category_id'::uuid, 'create-viewer@collectionbuddy.test', 'viewer'),
  (:'category_id'::uuid, 'create-editor@collectionbuddy.test', 'editor');

-- The form's shape (no id, no timestamp) and an import's (both named), in one call.
select lives_ok(
  format(
    'select public.create_items_in_category(%L, %L)',
    :'category_id',
    '[{"title": "  Form entry ", "tags": ["b", "a"]},
      {"id": "00000000-0000-4000-8000-00000000c001", "created_at": "2020-01-01T00:00:00Z",
       "title": "Imported entry", "description": "Worn", "place": "Rom",
       "place_lat": 41.9, "place_lng": 12.5, "tags": []}]'
  ),
  'an owner creates entries in their own category'
);

select results_eq(
  $$
    select i.title, i.tags, i.user_id = auth.uid(), ic.created_at = i.created_at
    from public.items i
    join public.item_categories ic on ic.item_id = i.id
    where ic.category_id = (select id from public.categories where name = 'Neuzugang (pgTAP)')
    order by i.title
  $$,
  $$
    values
      ('Form entry'::text, array['a', 'b']::text[], true, true),
      ('Imported entry'::text, array[]::text[], true, true)
  $$,
  'each entry is linked, the caller''s own, normalized, and linked at its own timestamp'
);

select is(
  (select created_at from public.items where id = '00000000-0000-4000-8000-00000000c001'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'an import keeps the id and timestamp it named'
);

-- One bad entry takes the whole batch with it: nothing is left in no category.
select throws_ok(
  format(
    'select public.create_items_in_category(%L, %L)',
    :'category_id',
    '[{"title": "Batch survivor?"}, {"title": "   "}]'
  ),
  '23502',
  'null value in column "title" of relation "items" violates not-null constraint',
  'a batch with one blank title is refused'
);
select is(
  (select count(*) from public.items where title = 'Batch survivor?'),
  0::bigint,
  'and none of its entries is left behind'
);

-- Refused links: the entry the same call wrote is rolled back with them.
select pg_temp.auth_as(:'stranger_id'::uuid, 'create-stranger@collectionbuddy.test');
select throws_ok(
  format(
    'select public.create_items_in_category(%L, %L)',
    :'category_id', '[{"title": "Stranger entry"}]'
  ),
  'P0001',
  'cross-tenant assignment is not allowed',
  'a caller with no grant cannot create an entry in someone else''s category'
);
select is(
  (select count(*) from public.items where user_id = :'stranger_id'::uuid),
  0::bigint,
  'and is left with no entry in no category'
);

select pg_temp.auth_as(:'viewer_id'::uuid, 'create-viewer@collectionbuddy.test');
select throws_ok(
  format(
    'select public.create_items_in_category(%L, %L)',
    :'category_id', '[{"title": "Viewer entry"}]'
  ),
  'P0001',
  'cross-tenant assignment is not allowed',
  'a viewer cannot create an entry in the shared category'
);
select is(
  (select count(*) from public.items where user_id = :'viewer_id'::uuid),
  0::bigint,
  'and is left with no entry in no category either'
);

select pg_temp.auth_as(:'editor_id'::uuid, 'create-editor@collectionbuddy.test');
select lives_ok(
  format(
    'select public.create_items_in_category(%L, %L)',
    :'category_id', '[{"title": "Editor entry"}]'
  ),
  'an editor creates an entry in the shared category'
);
select is(
  (
    select count(*)
    from public.items i
    join public.item_categories ic on ic.item_id = i.id
    where i.user_id = :'editor_id'::uuid and ic.category_id = :'category_id'::uuid
  ),
  1::bigint,
  'the editor''s entry is the editor''s own row, filed in the shared category'
);

-- No user_id in the payload changes hands: enforce_user_id() takes it from the JWT.
select lives_ok(
  format(
    'select public.create_items_in_category(%L, %L)',
    :'category_id',
    format('[{"title": "Handed over?", "user_id": "%s"}]', :'owner_id')
  ),
  'a user_id in the payload is ignored rather than refused'
);
select is(
  (select user_id from public.items where title = 'Handed over?'),
  :'editor_id'::uuid,
  'and the entry stays the caller''s'
);

select * from finish();
rollback;
