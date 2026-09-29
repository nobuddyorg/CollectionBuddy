-- search_category_items (latest body: 0030) is SECURITY DEFINER, so it must reproduce, never widen, an RLS-scoped read; rls/search-rpc.spec.ts holds the end-to-end half.
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

select is(
  pg_temp.search_titles(:'category_id'::uuid, 'zzzznothing'),
  array[]::text[],
  'a term matching nothing returns an empty array, not an error'
);

-- A real category id and a term that matches a row in it, so empty means refused, not absent.
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

-- Revocation closes search with the entry still present (TEST_STRATEGY.md §7 rule 7).
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

-- Bypassing RLS must not widen 0006's asymmetry: owning the collection reveals no editor-filed entry through search either.
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'search-test-other@collectionbuddy.test', 'editor')
returning id as editor_share_id \gset

select pg_temp.auth_as(:'other_id'::uuid, 'search-test-other@collectionbuddy.test');
insert into public.items (title) values ('Search Probe Editor Entry')
returning id as editor_item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'editor_item_id'::uuid, :'category_id'::uuid);

-- i.user_id = auth.uid() covers the editor's own entry, grant or not.
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
