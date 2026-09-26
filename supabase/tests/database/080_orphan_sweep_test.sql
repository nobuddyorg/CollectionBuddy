-- The daily orphan sweep's selection (0022, cleanup-orphaned-photos.yml): what it may delete is exactly what these seeded objects allow (#751).
-- TEST_STRATEGY.md §12: every derived path matched, no uuid cast, the 48 h grace, and a ceiling on how much one run may take.
begin;
select no_plan();

\ir _helpers.psql

-- The paths one plan would delete, sorted, so each assertion below reads as a set.
create or replace function pg_temp.swept(p_max_objects integer)
returns text[]
language sql
as $$
  select array(
    select path
    from public.orphan_sweep_plan(p_max_objects) plan
    cross join lateral json_array_elements_text(plan.paths) as path
    order by path
  )
$$;

-- An empty bucket, inside this rolled-back transaction, so the counts below are exact.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'item-images';

select gen_random_uuid() as owner_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'sweep-owner@collectionbuddy.test');
insert into public.categories (name) values ('Sweep (pgTAP)')
returning id as category_id \gset
insert into public.items (title) values ('Sweep entry')
returning id as item_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid);
reset role;

select :'owner_id' || '/' || :'item_id' as prefix \gset

insert into storage.buckets (id, name) values ('sweep-other', 'sweep-other');

insert into storage.objects (bucket_id, name, metadata, created_at)
values
  ('item-images', :'prefix' || '/kept.webp', '{"size": 1000}', now() - interval '30 days'),
  ('item-images', :'prefix' || '/kept.thumb.webp', '{"size": 100}', now() - interval '30 days'),
  ('item-images', :'prefix' || '/lost.webp', '{"size": 2000}', now() - interval '20 days'),
  ('item-images', 'not-a-uuid/nor-this/garbage.webp', '{"size": 30}', now() - interval '10 days'),
  ('item-images', :'prefix' || '/just-past.webp', '{"size": 4}', now() - interval '48 hours 1 minute'),
  ('item-images', :'prefix' || '/uploading.webp', '{"size": 5}', now() - interval '47 hours 59 minutes'),
  ('sweep-other', :'prefix' || '/elsewhere.webp', '{"size": 6}', now() - interval '30 days');

select pg_temp.auth_as(:'owner_id'::uuid, 'sweep-owner@collectionbuddy.test');
insert into public.images (item_id, path_full, path_thumb)
values (:'item_id'::uuid, :'prefix' || '/kept.webp', :'prefix' || '/kept.thumb.webp');
reset role;

select ok(
  not pg_temp.raises('select * from public.orphan_sweep_plan(10000)'),
  'a name that is no uuid path does not abort the plan -- nothing in it is cast to uuid'
);

select is(
  pg_temp.swept(10000),
  array[
    :'prefix' || '/just-past.webp',
    :'prefix' || '/lost.webp',
    'not-a-uuid/nor-this/garbage.webp'
  ],
  'the plan takes exactly the unreferenced item-images objects past 48 h, the malformed name among them'
);

select ok(
  not (:'prefix' || '/kept.webp' = any(pg_temp.swept(10000))),
  'an object an images row names as path_full is never taken'
);

select ok(
  not (:'prefix' || '/kept.thumb.webp' = any(pg_temp.swept(10000))),
  'an object an images row names only as path_thumb is never taken'
);

select ok(
  not (:'prefix' || '/uploading.webp' = any(pg_temp.swept(10000))),
  'an object one minute short of 48 h old is never taken -- the grace period is not shortened'
);

select ok(
  :'prefix' || '/just-past.webp' = any(pg_temp.swept(10000)),
  'an unreferenced object one minute past 48 h is taken'
);

-- The question is "does a row name this path", not "does its entry exist": lost.webp sits under a live entry.
select ok(
  :'prefix' || '/lost.webp' = any(pg_temp.swept(10000)),
  'an unreferenced object under a live entry''s prefix is taken -- no proxy keeps it'
);

select ok(
  not (:'prefix' || '/elsewhere.webp' = any(pg_temp.swept(10000))),
  'an object in another bucket is never taken'
);

select is(
  pg_temp.swept(1),
  array[:'prefix' || '/lost.webp'],
  'a run capped at one object takes the oldest orphan'
);

select results_eq(
  'select object_count, total_bytes, orphan_count from public.orphan_sweep_plan(1)',
  $$values (1::bigint, 2000::bigint, 3::bigint)$$,
  'the plan counts and sizes its own batch, and counts every orphan past the cap'
);

select results_eq(
  'select object_count, total_bytes, orphan_count from public.orphan_sweep_plan(10000)',
  $$values (3::bigint, 2034::bigint, 3::bigint)$$,
  'an uncapped plan''s batch is every orphan, and its bytes are what Storage recorded'
);

select is_empty(
  'select * from public.orphan_sweep_plan(null)',
  'a null cap plans nothing, rather than an unbounded delete'
);

-- The mass-deletion ceiling: max(50, 5% of the bucket), whatever those objects are.
select is(
  (select deletion_ceiling from public.orphan_sweep_plan(10000)),
  50::bigint,
  'a bucket under 1,000 objects allows at most 50 orphans before the workflow needs an override'
);

insert into storage.objects (bucket_id, name, created_at)
select 'item-images' as bucket_id, :'prefix' || '/filler-' || g || '.webp' as name, now() as created_at
from generate_series(1, 4000 - 6) g;

select is(
  (select deletion_ceiling from public.orphan_sweep_plan(10000)),
  200::bigint,
  'a bucket of 4,000 objects allows 5% of them, 200'
);

select is(
  (select orphan_count from public.orphan_sweep_plan(10000)),
  3::bigint,
  'objects inside the grace period count toward the bucket, never toward the orphans'
);

-- The sweep names its columns; a rendition in a new column would read as orphaned and be deleted 48 h after upload.
select is(
  (select array_agg(a.attname::text order by a.attname)
   from pg_catalog.pg_attribute a
   where a.attrelid = 'public.images'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attname like 'path%'),
  array['path_full', 'path_thumb'],
  'images names its objects in path_full and path_thumb only -- a new path column goes into orphan_sweep_plan first'
);

-- No API role reaches it: only the Management API's read-only query endpoint, as supabase_read_only_user, runs the plan (0024).
select function_privs_are('public', 'orphan_sweep_plan', array['integer'], r, array[]::text[],
  r || ' cannot execute orphan_sweep_plan')
from unnest(array['anon', 'authenticated', 'service_role']) as r;

select function_privs_are('public', 'orphan_sweep_plan', array['integer'], 'supabase_read_only_user', array['EXECUTE'],
  'supabase_read_only_user, the sweep token''s query role, can execute orphan_sweep_plan');

select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.orphan_sweep_plan(integer)'::regprocedure),
  'orphan_sweep_plan runs as its caller, so it grants nobody a read they lack'
);

select pg_temp.auth_as(:'owner_id'::uuid, 'sweep-owner@collectionbuddy.test');
select ok(
  pg_temp.raises('select * from public.orphan_sweep_plan(10)'),
  'a signed-in user cannot run the plan'
);
reset role;

-- Last, as nothing after it may write: that endpoint's session is read-only.
set local transaction_read_only = on;
select lives_ok('select * from public.orphan_sweep_plan(10)', 'the plan runs in a read-only transaction');

select * from finish();
rollback;
