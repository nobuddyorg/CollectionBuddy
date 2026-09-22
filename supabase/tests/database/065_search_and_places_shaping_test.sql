-- Shaping of the two read RPCs once authorization is settled: matched columns, page window, total, and each seen through a grant.
-- search_category_items queries with RLS bypassed (0002_functions.sql), so nothing downstream re-checks a lost ILIKE branch.
begin;
select no_plan();

\ir _helpers.psql

-- The function's own `order by created_at desc` is only observable through
-- WITH ORDINALITY -- aggregating its output without it would re-sort the
-- rows and assert nothing about the order they arrived in.
create or replace function pg_temp.search_page(
  p_category_id uuid, p_term text, p_from int, p_to int
)
returns text[]
language sql
as $$
  select coalesce(array_agg(x.title order by x.ord), array[]::text[])
  from public.search_category_items(p_category_id, '%' || p_term || '%', p_from, p_to)
    with ordinality as x(id, title, description, place, place_lat, place_lng, tags, total_count, ord)
$$;

create or replace function pg_temp.search_total(
  p_category_id uuid, p_term text, p_from int, p_to int
)
returns bigint
language sql
as $$
  select max(total_count)
  from public.search_category_items(p_category_id, '%' || p_term || '%', p_from, p_to)
$$;

select gen_random_uuid() as owner_id, gen_random_uuid() as grantee_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'shaping-owner@collectionbuddy.test');
insert into public.categories (name) values ('Shaping (pgTAP)')
returning id as category_id \gset
insert into public.categories (name) values ('Shaping, other (pgTAP)')
returning id as other_category_id \gset

-- Five matching entries with distinct creation times, plus one in the
-- other collection that must never appear.
insert into public.items (title, created_at) values
  ('Probe one', now() - interval '5 hours'),
  ('Probe two', now() - interval '4 hours'),
  ('Probe three', now() - interval '3 hours'),
  ('Probe four', now() - interval '2 hours'),
  ('Probe five', now() - interval '1 hour');
insert into public.items (title) values ('Probe elsewhere')
returning id as elsewhere_id \gset

insert into public.item_categories (item_id, category_id)
select i.id, :'category_id'::uuid from public.items i where i.title like 'Probe %' and i.id <> :'elsewhere_id'::uuid;
insert into public.item_categories (item_id, category_id)
values (:'elsewhere_id'::uuid, :'other_category_id'::uuid);

-- The page window, and the order the catalogue renders in.
select is(
  pg_temp.search_page(:'category_id'::uuid, 'Probe', 0, 1),
  array['Probe five', 'Probe four'],
  'the first page is the two newest matches, newest first'
);

select is(
  pg_temp.search_page(:'category_id'::uuid, 'Probe', 2, 3),
  array['Probe three', 'Probe two'],
  'the next window continues where it left off rather than restarting'
);

select is(
  pg_temp.search_page(:'category_id'::uuid, 'Probe', 4, 5),
  array['Probe one'],
  'a window running past the end returns what is left, not an error'
);

select is(
  pg_temp.search_page(:'category_id'::uuid, 'Probe', 99, 108),
  array[]::text[],
  'and a window entirely past the end returns nothing'
);

-- total_count is the whole match count, not the page's -- it is what the
-- pager renders, so a window-sized value would silently cap navigation at
-- page one.
select is(
  pg_temp.search_total(:'category_id'::uuid, 'Probe', 0, 1),
  5::bigint,
  'total_count counts every match in the collection, not the rows in the page'
);

-- Scoping, restated against a satisfiable filter: an entry with a matching
-- title in another of the caller's own collections is still not in this
-- collection's results (TEST_STRATEGY.md §7 rule 4).
select is(
  pg_temp.search_page(:'category_id'::uuid, 'elsewhere', 0, 9),
  array[]::text[],
  'a matching entry in another collection of the caller''s own is not returned'
);

-- All four ILIKE branches. Each one is a separate OR in the function body
-- with its own trigram index behind it, and losing one shows up only as
-- "search stopped finding things by place" -- a shape no authorization
-- test would ever notice.
insert into public.items (title, description, place, tags) values
  ('Branch entry', 'Eine Beschreibung mit Silberglanz', 'Kölnisch Wasser', array['Reichsmark', 'silber'])
returning id as branch_item \gset
insert into public.item_categories (item_id, category_id)
values (:'branch_item'::uuid, :'category_id'::uuid);

select is(
  pg_temp.search_page(:'category_id'::uuid, 'Branch entry', 0, 9),
  array['Branch entry'],
  'a term matches against the title'
);
select is(
  pg_temp.search_page(:'category_id'::uuid, 'Silberglanz', 0, 9),
  array['Branch entry'],
  'and against the description'
);
select is(
  pg_temp.search_page(:'category_id'::uuid, 'Kölnisch', 0, 9),
  array['Branch entry'],
  'and against the place'
);
select is(
  pg_temp.search_page(:'category_id'::uuid, 'Reichsmark', 0, 9),
  array['Branch entry'],
  'and against the tags, through the generated tags_text column'
);

-- Matching is case-insensitive on every branch -- ILIKE is the whole point
-- of the trigram indexes, and a `like` slipping in would still pass every
-- test above, which all search with the stored casing.
select is(
  pg_temp.search_page(:'category_id'::uuid, 'sILBERGLANZ', 0, 9),
  array['Branch entry'],
  'matching ignores case'
);

-- An editor grant opens reading, exactly like a viewer grant: the read
-- predicate is has_category_read_access, which does not look at the role
-- at all. 060 covers the viewer; this is the other role reaching the same
-- rows through the same RPC.
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'shaping-grantee@collectionbuddy.test', 'editor');

select pg_temp.auth_as(:'grantee_id'::uuid, 'shaping-grantee@collectionbuddy.test');
select is(
  pg_temp.search_page(:'category_id'::uuid, 'Probe five', 0, 9),
  array['Probe five'],
  'an editor grant opens search on the shared collection, the same as a viewer grant does'
);

-- Expiry is deliberately not re-tested through search here.
-- 020_category_shares_rls_test.sql proves an expired grant opens nothing,
-- and 060_search_category_items_rls_test.sql proves a closed grant closes
-- search -- both go through the same has_category_read_access, so a third
-- assertion of the composition would cost a fixture and catch nothing the
-- other two miss (TEST_STRATEGY.md §3.9).

-- list_category_places through a grant. It is `security invoker`, so the
-- grantee's own RLS is what decides -- which is the claim 0014 makes and
-- nothing asserted: the owner's path is covered in
-- 050_functions_triggers_test.sql, and a bystander getting nothing is too,
-- but the case in between, an actual grantee, is the one the map's shared
-- view depends on. Re-issued as a plain viewer grant, since the editor
-- grant above is what the search cases left in place.
select pg_temp.auth_as(:'owner_id'::uuid, 'shaping-owner@collectionbuddy.test');
delete from public.category_shares where category_id = :'category_id'::uuid;
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'shaping-grantee@collectionbuddy.test');

select pg_temp.auth_as(:'grantee_id'::uuid, 'shaping-grantee@collectionbuddy.test');
select is(
  (select array_agg(place order by place)
   from public.list_category_places(:'category_id'::uuid, null)),
  array['Kölnisch Wasser'],
  'a grantee sees the places of the shared collection through the map RPC'
);

-- The map's own search box narrows by the same four columns the catalogue
-- search does, on the invoker side of the fence -- so the two views agree
-- about what a term matches.
select is(
  (select array_agg(place order by place)
   from public.list_category_places(:'category_id'::uuid, '%Reichsmark%')),
  array['Kölnisch Wasser'],
  'and a like_pattern narrows those places by tag, the same as the catalogue search'
);

select is(
  (select array_agg(place order by place)
   from public.list_category_places(:'category_id'::uuid, '%zzzznothing%')),
  null,
  'a pattern matching nothing leaves no places at all'
);

select * from finish();
rollback;
