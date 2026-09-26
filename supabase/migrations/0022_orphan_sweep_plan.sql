-- The daily orphan sweep's query, moved out of its workflow so pgTAP runs it (#751); no API role may execute it.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- CLAUDE.md's three invariants: both path columns, text compared to text (a uuid cast aborts on a malformed name), 48 h grace.
create function public.orphan_sweep_plan(max_objects integer)
returns table (
  paths json,
  object_count bigint,
  total_bytes bigint,
  orphan_count bigint,
  deletion_ceiling bigint
)
language sql
stable
strict
security invoker
set search_path = ''
as $$
  with orphan as (
    select o.name, o.created_at, (o.metadata ->> 'size')::bigint as size_bytes
    from storage.objects o
    where o.bucket_id = 'item-images'
      -- useItemImages.tsx writes both objects before the row that names them, so nothing mid-upload is this old.
      and o.created_at < now() - interval '48 hours'
      -- Two `not exists` rather than one `or`, so each uses its own unique index (0003_tables.sql, 0005_indexes.sql).
      and not exists (
        select 1 from public.images im where im.path_full = o.name
      )
      and not exists (
        select 1 from public.images im where im.path_thumb = o.name
      )
  ),

  batch as (
    select orphan.name, orphan.size_bytes
    from orphan
    order by orphan.created_at
    limit max_objects
  )

  select
    coalesce(json_agg(batch.name), '[]'::json),
    count(*),
    coalesce(sum(batch.size_bytes), 0)::bigint,
    (select count(*) from orphan),
    -- A bulk loss of images rows reads as mass orphaning; above max(50, 5% of the bucket) the workflow needs an explicit override.
    (
      select greatest(50, count(*) / 20)
      from storage.objects o
      where o.bucket_id = 'item-images'
    )
  from batch
$$;

-- Its only caller is the Management API's query endpoint, which runs as the owner.
revoke execute on function public.orphan_sweep_plan(integer)
from public, anon, authenticated, service_role;

commit;
