-- `search_category_items` (0015_search_category_items.sql) is `SECURITY
-- DEFINER`: it queries with RLS bypassed so ILIKE can reach the trigram
-- indexes (#621/PERF-H4), which makes it an authorization boundary in its
-- own right rather than RLS re-expressed for convenience. It must
-- reproduce -- not widen -- exactly what an ordinary, RLS-scoped read of
-- `items` scoped to one category already allows. This is the direct-
-- database half of that guarantee; e2e/signed-in/rls.spec.ts's
-- "search_category_items (the search RPC)" describe block is the matching
-- end-to-end case (TEST_STRATEGY.md #7: a direct-database case is
-- encouraged alongside the end-to-end one, but doesn't discharge it).
begin;
select no_plan();

\ir _helpers.psql

create or replace function pg_temp.search_titles(p_category_id uuid, p_term text)
returns text[]
language sql
as $$
  select coalesce(array_agg(title order by title), array[]::text[])
  from public.search_category_items(p_category_id, '%' || p_term || '%', 0, 9)
$$;

select gen_random_uuid() as owner_id, gen_random_uuid() as other_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'search-test-owner@collectionbuddy.test');
insert into public.categories (name) values ('Search RLS (pgTAP)')
returning id as category_id \gset
insert into public.items (title) values ('Search Probe Silberdenar')
returning id as owner_item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'owner_item_id'::uuid, :'category_id'::uuid);

-- The owner searches their own category and finds their own entry.
select is(
  pg_temp.search_titles(:'category_id'::uuid, 'Silberdenar'),
  array['Search Probe Silberdenar'],
  'the owner finds a matching title in their own category'
);

-- A satisfiable filter that matches nothing real still comes back empty,
-- not an error.
select is(
  pg_temp.search_titles(:'category_id'::uuid, 'zzzznothing'),
  array[]::text[],
  'a term matching nothing returns an empty array, not an error'
);

-- Called directly, the way anyone holding a session could: a real category
-- id that is not theirs, and a term known to match a real row in it.
select pg_temp.auth_as(:'other_id'::uuid, 'search-test-other@collectionbuddy.test');
select is(
  pg_temp.search_titles(:'category_id'::uuid, 'Silberdenar'),
  array[]::text[],
  'a bystander with no relationship to the category gets nothing back, not an error'
);

-- A viewer grant opens search the same as it opens a plain read.
select pg_temp.auth_as(:'owner_id'::uuid, 'search-test-owner@collectionbuddy.test');
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'search-test-other@collectionbuddy.test')
returning id as viewer_share_id \gset

select pg_temp.auth_as(:'other_id'::uuid, 'search-test-other@collectionbuddy.test');
select is(
  pg_temp.search_titles(:'category_id'::uuid, 'Silberdenar'),
  array['Search Probe Silberdenar'],
  'an active viewer grant opens search on the shared category'
);

-- Revoking closes it again, with the entry still there (TEST_STRATEGY.md
-- #7: both directions of a grant, asserted with the resource still present).
select pg_temp.auth_as(:'owner_id'::uuid, 'search-test-owner@collectionbuddy.test');
delete from public.category_shares where id = :'viewer_share_id'::uuid;

select pg_temp.auth_as(:'other_id'::uuid, 'search-test-other@collectionbuddy.test');
select is(
  pg_temp.search_titles(:'category_id'::uuid, 'Silberdenar'),
  array[]::text[],
  'revoking the grant closes search again'
);
select pg_temp.auth_as(:'owner_id'::uuid, 'search-test-owner@collectionbuddy.test');
select is(
  pg_temp.search_titles(:'category_id'::uuid, 'Silberdenar'),
  array['Search Probe Silberdenar'],
  'the entry itself was never touched by the revocation'
);

-- The deliberate asymmetry (0006_policies.sql, and the editor-role rls
-- tests): has_category_write_access() bundles category ownership in,
-- has_category_read_access() does not, so owning the collection does not
-- reveal, through search, an entry an editor merely filed into it.
-- search_category_items must reproduce this, not widen past it as a side
-- effect of bypassing RLS for the trigram indexes.
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'search-test-other@collectionbuddy.test', 'editor')
returning id as editor_share_id \gset

select pg_temp.auth_as(:'other_id'::uuid, 'search-test-other@collectionbuddy.test');
insert into public.items (title) values ('Search Probe Editor Entry')
returning id as editor_item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'editor_item_id'::uuid, :'category_id'::uuid);

-- The editor itself finds its own filed entry -- i.user_id = auth.uid()
-- covers it even without a read grant of its own on the owner's category.
select is(
  pg_temp.search_titles(:'category_id'::uuid, 'Editor Entry'),
  array['Search Probe Editor Entry'],
  'the editor finds the entry it filed into the shared collection itself'
);

select pg_temp.auth_as(:'owner_id'::uuid, 'search-test-owner@collectionbuddy.test');
select is(
  pg_temp.search_titles(:'category_id'::uuid, 'Editor Entry'),
  array[]::text[],
  'the owner does not find, through search, an entry the editor filed into their own collection'
);

select * from finish();
rollback;
