-- Every query that names its index: reachable with cheaper paths off on fixture rows, preferred at default settings on generated rows (#704, #621).
begin;
select no_plan();

\ir _helpers.psql

create or replace function pg_temp.plan_json(p_sql text)
returns jsonb
language plpgsql
as $$
declare
  plan jsonb;
begin
  execute 'explain (format json) ' || p_sql into plan;
  return plan;
end;
$$;

-- The text plan, attached to a failing assertion so the log shows what the planner chose instead.
create or replace function pg_temp.plan_text(p_sql text)
returns text
language plpgsql
as $$
declare
  line text;
  lines text[] := array[]::text[];
begin
  for line in execute 'explain ' || p_sql loop
    lines := lines || line;
  end loop;
  return array_to_string(lines, e'\n');
end;
$$;

create or replace function pg_temp.plan_uses_index(p_sql text, p_index text, p_description text)
returns text
language plpgsql
as $$
begin
  if jsonb_path_exists(
    pg_temp.plan_json(p_sql),
    '$.** ? (@."Index Name" == $index)',
    jsonb_build_object('index', p_index)
  ) then
    return ok(true, p_description);
  end if;
  return ok(false, p_description) || e'\n' || diag(pg_temp.plan_text(p_sql));
end;
$$;

create or replace function pg_temp.plan_has_no_seq_scan_on(p_sql text, p_relation text, p_description text)
returns text
language plpgsql
as $$
begin
  if not jsonb_path_exists(
    pg_temp.plan_json(p_sql),
    '$.** ? (@."Node Type" == "Seq Scan" && @."Relation Name" == $relation)',
    jsonb_build_object('relation', p_relation)
  ) then
    return ok(true, p_description);
  end if;
  return ok(false, p_description) || e'\n' || diag(pg_temp.plan_text(p_sql));
end;
$$;

create or replace function pg_temp.plan_uses_index_only(p_sql text, p_index text, p_description text)
returns text
language plpgsql
as $$
begin
  if jsonb_path_exists(
    pg_temp.plan_json(p_sql),
    '$.** ? (@."Node Type" == "Index Only Scan" && @."Index Name" == $index)',
    jsonb_build_object('index', p_index)
  ) then
    return ok(true, p_description);
  end if;
  return ok(false, p_description) || e'\n' || diag(pg_temp.plan_text(p_sql));
end;
$$;

select gen_random_uuid() as owner_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
insert into public.categories (name) values ('Plans (pgTAP)')
returning id as category_id \gset
insert into public.items (title, description, place, tags)
values ('Plan Probe Silberdenar', 'A silver coin', 'Rome', array['coin']);
insert into public.item_categories (item_id, category_id)
select i.id, :'category_id'::uuid from public.items i where i.title = 'Plan Probe Silberdenar';

-- The searched page's body, read from the live function rather than pasted, with its arguments inlined as the app sends them.
select
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(p.prosrc, '\mcat_id\M', quote_literal(:'category_id') || '::uuid', 'g'),
        '\mlike_pattern\M', quote_literal('%silberdenar%'), 'g'
      ),
      '\mpage_from\M', '0', 'g'
    ),
    '\mpage_to\M', '49', 'g'
  ) as search_sql,
  -- EXPLAIN of the call hides the body, so it is planned as the role it runs as: the owner if SECURITY DEFINER, else the caller.
  case when p.prosecdef then pg_catalog.pg_get_userbyid(p.proowner) else 'authenticated' end as search_role
from pg_catalog.pg_proc p
where p.oid = 'public.search_category_items(uuid, text, int, int)'::regprocedure \gset

-- The catalogue page as data/items.ts rawListItems composes it through PostgREST: driven from item_categories, newest first.
select format(
  $sql$
    select ic.item_id, i.title
    from public.item_categories ic
    join public.items i on i.id = ic.item_id
    where ic.category_id = %L::uuid
    order by ic.created_at desc
    limit 50 offset 0
  $sql$,
  :'category_id'
) as catalogue_sql \gset

-- Level 1, reachability: fixture rows only, with every cheaper path off -- a trigram bitmap scan is left as items' only non-penalised access.
set local enable_seqscan = off;
set local enable_indexscan = off;
set local enable_nestloop = off;
select set_config('role', :'search_role', true);

select pg_temp.plan_uses_index(:'search_sql', index_name, 'reachable: search_category_items can use ' || index_name)
from unnest(array[
  'idx_items_title_trgm',
  'idx_items_description_trgm',
  'idx_items_place_trgm',
  'idx_items_tags_text_trgm'
]) as index_name;
select pg_temp.plan_has_no_seq_scan_on(
  :'search_sql', 'items', 'reachable: search_category_items needs no sequential scan on items'
);

-- Sorting off too: the index's whole point is a page already in order, which a bitmap scan plus a sort would also answer.
reset enable_indexscan;
reset enable_nestloop;
set local enable_sort = off;
select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');

select pg_temp.plan_uses_index(
  :'catalogue_sql', 'idx_item_categories_cat_created',
  'reachable: the catalogue page can use idx_item_categories_cat_created under RLS'
);
select pg_temp.plan_has_no_seq_scan_on(
  :'catalogue_sql', 'item_categories', 'reachable: the catalogue page needs no sequential scan on item_categories'
);

reset enable_seqscan;
reset enable_sort;

-- Level 2, preference, default planner settings: the search plan flips to trigram between 750 and 1,000 rows (measured), so 2,000 leaves margin.
insert into public.items (title, description, place, tags)
select
  'Plan filler ' || md5(g::text) as title,
  md5((g * 7)::text) as description,
  'Place ' || (g % 50) as place,
  array['tag' || (g % 20)] as tags
from generate_series(1, 2000) as g;
insert into public.item_categories (item_id, category_id, created_at)
select
  i.id,
  :'category_id'::uuid,
  now() - make_interval(secs => row_number() over (order by i.id)) as created_at
from public.items i
where i.title like 'Plan filler %';

-- Autovacuum flushes GIN's pending list in production; until it does, the planner prices every trigram probe as a pending-list scan.
reset role;
select gin_clean_pending_list(index_name::regclass)
from unnest(array[
  'public.idx_items_title_trgm',
  'public.idx_items_description_trgm',
  'public.idx_items_place_trgm',
  'public.idx_items_tags_text_trgm'
]) as index_name;
analyze public.items, public.item_categories;

select set_config('role', :'search_role', true);
select pg_temp.plan_uses_index(:'search_sql', index_name, 'preferred: search_category_items uses ' || index_name)
from unnest(array[
  'idx_items_title_trgm',
  'idx_items_description_trgm',
  'idx_items_place_trgm',
  'idx_items_tags_text_trgm'
]) as index_name;
select pg_temp.plan_has_no_seq_scan_on(
  :'search_sql', 'items', 'preferred: search_category_items does not scan items sequentially'
);

select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
select pg_temp.plan_uses_index(
  :'catalogue_sql', 'idx_item_categories_cat_created',
  'preferred: the catalogue page uses idx_item_categories_cat_created under RLS'
);
select pg_temp.plan_has_no_seq_scan_on(
  :'catalogue_sql', 'item_categories', 'preferred: the catalogue page does not scan item_categories sequentially'
);

-- The FK cascades' own queries, planned as the owner that runs them: item_categories keeps no index on item_id or category_id alone (#717).
reset role;
select pg_temp.plan_uses_index(
  format('delete from only public.item_categories where item_id = %L::uuid',
    (select ic.item_id from public.item_categories ic limit 1)),
  'item_categories_pkey',
  'preferred: deleting an item cascades to its links through the primary key'
);
select pg_temp.plan_uses_index(
  format('delete from only public.item_categories where category_id = %L::uuid', gen_random_uuid()),
  'idx_item_categories_cat_created',
  'preferred: deleting a category cascades to its links through idx_item_categories_cat_created'
);

-- tg_images_quota()'s per-owner sum reads size_bytes from the index alone, never the owner's heap rows (#718).
select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
insert into public.images (item_id, path_full)
select i.id, :'owner_id'::text || '/' || i.id::text || '/plan.webp'
from public.items i
where i.title like 'Plan filler %'
limit 100;
reset role;
analyze public.images;
set local enable_seqscan = off;
set local enable_bitmapscan = off;
select pg_temp.plan_uses_index_only(
  format('select coalesce(sum(im.size_bytes), 0) from public.images im where im.user_id = %L::uuid', :'owner_id'),
  'idx_images_user_size',
  'reachable: the photo quota sum is an index-only scan on idx_images_user_size'
);

select * from finish();
rollback;
