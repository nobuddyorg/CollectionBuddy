-- Direct, fast tests of the pure and near-pure SQL functions and triggers
-- underneath the RLS layer -- normalization, path parsing, and the
-- set-based orphan sweep CLAUDE.md calls out by name. Most of this needs
-- no identity at all; the parts that do use the same impersonation as the
-- rest of this suite (see 005_impersonation_sanity_test.sql).
begin;
select no_plan();

\ir _helpers.psql

-- normalize_text: collapses internal whitespace, trims the ends, and turns
-- a whitespace-only input into NULL rather than an empty string -- so the
-- "blank after normalization" constraints (categories_name_not_blank,
-- items_title_not_blank) catch it via NOT NULL rather than needing their
-- own blank-string check.
select is(public.normalize_text('  a   b  '), 'a b',
  'internal whitespace collapses to one space, ends trimmed');
select is(public.normalize_text('   '), null,
  'a whitespace-only input normalizes to NULL, not an empty string');
select is(public.normalize_text(null), null, 'NULL stays NULL');

-- join_tags / tags_text: the generated column tag search relies on.
select is(public.join_tags(array['b', 'a']), 'b a',
  'tags join in array order, space-separated');
select is(public.join_tags(null), '',
  'a NULL tag array joins to an empty string, not NULL');

-- storage_item_id: parses the item id out of a well-formed path, and
-- answers NULL rather than raising on one that does not parse -- the same
-- reasoning as images_path_full_matches_item (0012): a raised error inside
-- an RLS predicate would abort the whole query, not just fail to match one
-- row.
select gen_random_uuid() as probe_item_id \gset
select is(
  public.storage_item_id('some-uid/' || :'probe_item_id'::text || '/path.webp'),
  :'probe_item_id'::uuid,
  'storage_item_id parses the second path segment as the item id'
);
select is(public.storage_item_id('not-a-uuid/x.webp'), null,
  'a path whose second segment is not a uuid answers NULL rather than raising');
select is(public.storage_item_id('onesegment'), null,
  'a path with no second segment at all also answers NULL');

-- caller_email: lower + trim, tested directly rather than only through the sharing flow (020_category_shares_rls_test.sql).
select pg_temp.auth_as(gen_random_uuid(), '  MiXed.Case@Collectionbuddy.TEST  ');
select is(public.caller_email(), 'mixed.case@collectionbuddy.test',
  'caller_email lowercases and trims the JWT email claim');

-- Normalization triggers, exercised through an actual insert:
-- tg_items_normalize dedupes and sorts tags after normalizing each one,
-- and blanks out an all-whitespace description rather than storing it.
select gen_random_uuid() as owner_id \gset
select pg_temp.auth_as(:'owner_id'::uuid, 'functions-test@collectionbuddy.test');

insert into public.items (title, description, tags)
values ('  padded title  ', '   ', array['  b  ', 'a', 'a'])
returning id as norm_item_id \gset

select is(
  (select title from public.items where id = :'norm_item_id'::uuid),
  'padded title',
  'the title is normalized on insert'
);
select is(
  (select description from public.items where id = :'norm_item_id'::uuid),
  null,
  'a whitespace-only description is stored as NULL'
);
select is(
  (select tags from public.items where id = :'norm_item_id'::uuid),
  array['a', 'b'],
  'tags are deduplicated, normalized and sorted'
);

-- delete_item_if_orphan: a set-based, statement-level cleanup (see
-- 000_schema_test.sql for the direct catalog assertion that the trigger
-- stays FOR EACH STATEMENT). This is the behavioural half: a single DELETE
-- removing several categories' worth of links at once orphans and removes
-- every affected item in that same one statement, and leaves an item still
-- linked elsewhere untouched.
insert into public.categories (name) values ('Orphan test A')
returning id as category_a \gset
insert into public.categories (name) values ('Orphan test B')
returning id as category_b \gset
insert into public.categories (name) values ('Item C''s other category')
returning id as category_c \gset
insert into public.items (title) values ('Orphan candidate A')
returning id as item_a \gset
insert into public.items (title) values ('Orphan candidate B')
returning id as item_b \gset
insert into public.items (title) values ('Stays -- linked elsewhere too')
returning id as item_c \gset

insert into public.item_categories (item_id, category_id) values
  (:'item_a'::uuid, :'category_a'::uuid),
  (:'item_b'::uuid, :'category_b'::uuid),
  (:'item_c'::uuid, :'category_a'::uuid),
  (:'item_c'::uuid, :'category_c'::uuid);

-- One statement, deleting mappings across both category_a and category_b
-- at once.
delete from public.item_categories where category_id in (:'category_a'::uuid, :'category_b'::uuid);

select is(
  (select count(*) from public.items where id in (:'item_a'::uuid, :'item_b'::uuid)),
  0::bigint,
  'both items left with no remaining category link are removed by the one batch delete'
);

select is(
  (select count(*) from public.items where id = :'item_c'::uuid),
  1::bigint,
  'an item still linked elsewhere survives the same batch delete'
);

-- list_category_places (0002_functions.sql): one row per distinct place; any row can locate the place, ties go to the newest.
select gen_random_uuid() as places_owner \gset
select pg_temp.auth_as(:'places_owner'::uuid, 'places-test@collectionbuddy.test');
insert into public.categories (name) values ('Places test')
returning id as places_category \gset

insert into public.items (title, place, place_lat, place_lng, created_at) values
  ('Oldest at Cologne', 'Cologne', 1, 2, now() - interval '3 hours'),
  ('Middle at Cologne, no coords', 'Cologne', null, null, now() - interval '2 hours'),
  ('Newest at Cologne', 'Cologne', 50.94, 6.96, now() - interval '1 hour'),
  ('Only entry, unlocated', 'Nowhere Yet', null, null, now());

-- Fetched back by title, one \gset per row, rather than off the INSERT's
-- own RETURNING: \gset accepts exactly one row, and the insert above wrote
-- four.
select id as oldest_id from public.items where title = 'Oldest at Cologne' \gset
select id as middle_id from public.items where title = 'Middle at Cologne, no coords' \gset
select id as newest_id from public.items where title = 'Newest at Cologne' \gset
select id as unlocated_id from public.items where title = 'Only entry, unlocated' \gset

insert into public.item_categories (item_id, category_id) values
  (:'oldest_id'::uuid, :'places_category'::uuid),
  (:'middle_id'::uuid, :'places_category'::uuid),
  (:'newest_id'::uuid, :'places_category'::uuid),
  (:'unlocated_id'::uuid, :'places_category'::uuid);

select is(
  (select place_lat from public.list_category_places(:'places_category'::uuid, null)
    where place = 'Cologne'),
  50.94::double precision,
  'the newest row with a coordinate pair wins over an older, conflicting one'
);
select is(
  (select place_lng from public.list_category_places(:'places_category'::uuid, null)
    where place = 'Cologne'),
  6.96::double precision,
  'lat and lng are taken from the same winning row, not mixed across rows'
);
select is(
  (select titles from public.list_category_places(:'places_category'::uuid, null)
    where place = 'Cologne'),
  array['Newest at Cologne', 'Middle at Cologne, no coords', 'Oldest at Cologne'],
  'every title at the place is collected, newest first, including a row with no coordinates of its own'
);
select is(
  (select ids from public.list_category_places(:'places_category'::uuid, null)
    where place = 'Cologne'),
  array[:'newest_id'::uuid, :'middle_id'::uuid, :'oldest_id'::uuid],
  'ids are collected in the same newest-first order, for the geocode write-back'
);
select is(
  (select place_lat from public.list_category_places(:'places_category'::uuid, null)
    where place = 'Nowhere Yet'),
  null,
  'a place with no located row at all comes back with null coordinates rather than being dropped'
);

select is(
  (select array_agg(place order by place)
    from public.list_category_places(:'places_category'::uuid, '%Newest%')),
  array['Cologne'],
  'a like_pattern narrows to the places matching it, the same as the searched list'
);

-- SECURITY INVOKER: a bystander gets nothing back, not an error, the same
-- as an ordinary RLS-scoped read would deny them.
select gen_random_uuid() as places_bystander \gset
select pg_temp.auth_as(:'places_bystander'::uuid, 'places-bystander@collectionbuddy.test');
select is(
  (select count(*) from public.list_category_places(:'places_category'::uuid, null)),
  0::bigint,
  'a bystander with no relationship to the category gets no places back'
);

select * from finish();
rollback;
