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

-- A TAP line with the text plan attached when it failed.
create or replace function pg_temp.with_plan_on_failure(p_tap text, p_sql text)
returns text
language sql
as $$
  select p_tap || case when p_tap like 'not ok%' then e'\n' || diag(pg_temp.plan_text(p_sql)) else '' end
$$;

create or replace function pg_temp.plan_uses_index(p_sql text, p_index text, p_description text)
returns text
language sql
as $$
  select pg_temp.with_plan_on_failure(
    ok(
      jsonb_path_exists(
        pg_temp.plan_json(p_sql),
        '$.** ? (@."Index Name" == $index)',
        jsonb_build_object('index', p_index)
      ),
      p_description
    ),
    p_sql
  )
$$;

create or replace function pg_temp.plan_has_no_seq_scan_on(p_sql text, p_relation text, p_description text)
returns text
language sql
as $$
  select pg_temp.with_plan_on_failure(
    ok(
      not jsonb_path_exists(
        pg_temp.plan_json(p_sql),
        '$.** ? (@."Node Type" == "Seq Scan" && @."Relation Name" == $relation)',
        jsonb_build_object('relation', p_relation)
      ),
      p_description
    ),
    p_sql
  )
$$;

create or replace function pg_temp.plan_uses_index_only(p_sql text, p_index text, p_description text)
returns text
language sql
as $$
  select pg_temp.with_plan_on_failure(
    ok(
      jsonb_path_exists(
        pg_temp.plan_json(p_sql),
        '$.** ? (@."Node Type" == "Index Only Scan" && @."Index Name" == $index)',
        jsonb_build_object('index', p_index)
      ),
      p_description
    ),
    p_sql
  )
$$;

create or replace function pg_temp.plan_never_mentions(p_sql text, p_fragment text, p_description text)
returns text
language sql
as $$
  select pg_temp.with_plan_on_failure(ok(strpos(pg_temp.plan_text(p_sql), p_fragment) = 0, p_description), p_sql)
$$;

select gen_random_uuid() as owner_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
insert into public.categories (name) values ('Plans (pgTAP)')
returning id as category_id \gset
insert into public.items (title, description, place, tags)
values ('Plan Probe Silberdenar', 'A silver coin', 'Rome', array['coin']);
insert into public.item_categories (item_id, category_id)
select i.id, :'category_id'::uuid from public.items i where i.title = 'Plan Probe Silberdenar';
select array['idx_items_title_trgm', 'idx_items_description_trgm', 'idx_items_place_trgm', 'idx_items_tags_text_trgm'] as trigram_indexes \gset

-- The searched page's query, read from the live function rather than pasted, with its arguments inlined as the app sends them.
select
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          substring(p.prosrc from 'return query(.*);\s*end'),
          '\mcat_id\M', quote_literal(:'category_id') || '::uuid', 'g'
        ),
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

-- The catalogue page's ids as data/itemPage.ts rawListItemIds reads them: item_categories alone, newest first, no embed (#758).
select format(
  $sql$
    select ic.item_id
    from public.item_categories ic
    where ic.category_id = %L::uuid
    order by ic.created_at desc, ic.item_id
    limit 9 offset 0
  $sql$,
  :'category_id'
) as catalogue_sql \gset

-- Level 1, reachability: fixture rows only, with every cheaper path off -- a trigram bitmap scan is left as items' only non-penalised access.
set local enable_seqscan = off;
set local enable_indexscan = off;
set local enable_nestloop = off;
select set_config('role', :'search_role', true);

select pg_temp.plan_uses_index(:'search_sql', index_name, 'reachable: search_category_items can use ' || index_name)
from unnest(:'trigram_indexes'::text[]) as index_name;
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
select gin_clean_pending_list(('public.' || index_name)::regclass)
from unnest(:'trigram_indexes'::text[]) as index_name;
analyze public.items, public.item_categories;

select set_config('role', :'search_role', true);
select pg_temp.plan_uses_index(:'search_sql', index_name, 'preferred: search_category_items uses ' || index_name)
from unnest(:'trigram_indexes'::text[]) as index_name;
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

-- The last page (#781) beside other collectors' links, as in production: it flips from sorting every link to the index between 20,000 and 30,000 of them (measured); 45,000 is under the entry quota.
select pg_temp.auth_as(gen_random_uuid(), 'plans-other@collectionbuddy.test');
insert into public.categories (name) values ('Plans other (pgTAP)')
returning id as other_category_id \gset
insert into public.items (title)
select 'Plan other ' || g from generate_series(1, 45000) as g;
insert into public.item_categories (item_id, category_id)
select i.id, :'other_category_id'::uuid from public.items i where i.title like 'Plan other %';
reset role;
analyze public.items, public.item_categories;
select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');

select format(
  $sql$
    select ic.item_id
    from public.item_categories ic
    where ic.category_id = %L::uuid
    order by ic.created_at desc, ic.item_id
    limit 9 offset %s
  $sql$,
  :'category_id',
  (select (ceil(count(*) / 9.0)::int - 1) * 9
   from public.item_categories ic
   where ic.category_id = :'category_id'::uuid)
) as last_page_sql \gset

select pg_temp.plan_uses_index(
  :'last_page_sql', 'idx_item_categories_cat_created',
  'preferred: the catalogue''s last page uses idx_item_categories_cat_created under RLS'
);
select pg_temp.plan_has_no_seq_scan_on(
  :'last_page_sql', 'item_categories', 'preferred: the catalogue''s last page does not scan item_categories sequentially'
);

-- rawListItemsByIds, as PostgREST embeds the photographs: nine entries by id, each with its own ordered lateral read of images.
select format(
  $sql$
    select i.id, i.title, coalesce(photos.body, '[]') as images
    from public.items i
    left join lateral (
      select json_agg(im) as body
      from (
        select im.id, im.item_id, im.path_full, im.path_thumb
        from public.images im
        where im.item_id = i.id
        order by im.created_at, im.id
      ) im
    ) photos on true
    where i.id = any(%L::uuid[])
  $sql$,
  (select array_agg(page.item_id)
   from (
     select ic.item_id
     from public.item_categories ic
     where ic.category_id = :'category_id'::uuid
     order by ic.created_at desc, ic.item_id
     limit 9
   ) page)
) as page_items_sql \gset

select pg_temp.plan_uses_index(
  :'page_items_sql', 'items_pkey',
  'preferred: the page''s entries are read by id through items_pkey under RLS'
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

-- tg_images_quota()'s per-owner sum is index-only (#718, 0025); 50 unstored rows count 250 MiB, inside 256 MiB.
select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
insert into public.images (item_id, path_full)
select i.id, :'owner_id'::text || '/' || i.id::text || '/plan.webp'
from public.items i
where i.title like 'Plan filler %'
limit 50;
reset role;
analyze public.images;
set local enable_seqscan = off;
set local enable_bitmapscan = off;
select pg_temp.plan_uses_index_only(
  format('select coalesce(sum(im.size_bytes + im.thumb_size_bytes), 0) from public.images im where im.user_id = %L::uuid', :'owner_id'),
  'idx_images_user_sizes',
  'reachable: the photo quota sum is an index-only scan on idx_images_user_sizes'
);
select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
select pg_temp.plan_uses_index(
  :'page_items_sql', 'idx_images_item_created_at',
  'reachable: the page''s photographs come in order from idx_images_item_created_at under RLS'
);

-- The map's query for a small category beside a large one, planned for the category it names as 0018 makes every call.
select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
insert into public.categories (name) values ('Plans small (pgTAP)')
returning id as small_category_id \gset
insert into public.items (title, place) values ('Plan Probe Small', 'Rome')
returning id as small_item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'small_item_id'::uuid, :'small_category_id'::uuid);
reset role;
analyze public.item_categories;

select
  regexp_replace(
    regexp_replace(
      substring(p.prosrc from 'return query(.*);\s*end'),
      '\mcat_id\M', quote_literal(:'small_category_id') || '::uuid', 'g'
    ),
    '\mlike_pattern\M', 'null::text', 'g'
  ) as places_sql
from pg_catalog.pg_proc p
where p.oid = 'public.list_category_places(uuid, text)'::regprocedure \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
select pg_temp.plan_uses_index(
  :'places_sql', 'idx_item_categories_cat_created',
  'preferred: a small category''s map reads its links through idx_item_categories_cat_created'
);
select pg_temp.plan_has_no_seq_scan_on(
  :'places_sql', 'item_categories', 'preferred: a small category''s map does not scan every link'
);

-- A grantee's reads ask for its grants once per statement (0017): no plan calls has_category_read_access() on a row.
reset enable_seqscan;
reset enable_bitmapscan;
select pg_temp.auth_as(:'owner_id'::uuid, 'plans-owner@collectionbuddy.test');
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'plans-viewer@collectionbuddy.test');
select pg_temp.auth_as(gen_random_uuid(), 'plans-viewer@collectionbuddy.test');

select pg_temp.plan_never_mentions(
  format('select * from %s', relation), 'has_category_read_access',
  'a grantee''s read of ' || relation || ' checks no grant per row'
)
from unnest(array[
  'public.categories', 'public.items', 'public.item_categories', 'public.images', 'storage.objects'
]) as relation;
select pg_temp.plan_never_mentions(
  format('select * from %s', relation), 'SubPlan',
  'a grantee''s read of ' || relation || ' takes its grants once, as an initPlan'
)
from unnest(array['public.categories', 'public.item_categories']) as relation;
select pg_temp.plan_uses_index(
  :'catalogue_sql', 'idx_item_categories_cat_created',
  'preferred: a grantee''s catalogue page uses idx_item_categories_cat_created under RLS'
);

select set_config('role', :'search_role', true);
select pg_temp.plan_never_mentions(
  :'search_sql', 'has_category_read_access',
  'search_category_items checks the grant once per call, not per row'
);

-- The entry and link quotas' checks, read from the live functions with a statement's keys inlined, as each call is planned (0032).
reset role;
select
  regexp_replace(
    substring(p.prosrc from 'if exists \((.*)\) then'),
    '\mlinked\M',
    quote_literal((select array_agg(ic.item_id) from (
      select ic.item_id from public.item_categories ic
      where ic.category_id = :'other_category_id'::uuid limit 100
    ) ic)) || '::uuid[]',
    'g'
  ) as link_quota_sql
from pg_catalog.pg_proc p
where p.oid = 'public.tg_item_categories_quota()'::regprocedure \gset
select
  regexp_replace(
    substring(p.prosrc from 'if exists \((.*)\) then'),
    '\mowners\M',
    quote_literal(array[:'owner_id'::uuid]) || '::uuid[]',
    'g'
  ) as entry_quota_sql
from pg_catalog.pg_proc p
where p.oid = 'public.tg_items_quota()'::regprocedure \gset

select pg_temp.plan_uses_index(
  :'link_quota_sql', 'item_categories_pkey',
  'preferred: a batch''s link quota probes each linked entry through item_categories_pkey'
);
select pg_temp.plan_has_no_seq_scan_on(
  :'link_quota_sql', 'item_categories', 'preferred: a batch''s link quota does not scan every link'
);
select pg_temp.plan_uses_index(
  :'entry_quota_sql', 'idx_items_user_created_at',
  'preferred: the entry quota counts one owner''s entries through idx_items_user_created_at'
);

-- A SQL function's body gets a generic plan in Postgres 17, costed on an average category rather than the one named (0018); a trigger's, on its connection's first calls (0031, 0032).
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and coalesce(p.proconfig, '{}') @> array['plan_cache_mode=force_custom_plan']),
  array[
    'create_items_in_category', 'delete_item_if_orphan', 'list_category_places',
    'search_category_items', 'tg_item_categories_quota', 'tg_items_quota'
  ],
  'the map and search RPCs plan each call for the category it names, entry creation and its quotas for the rows it adds, the orphan cleanup for the links it lost'
);

select * from finish();
rollback;
