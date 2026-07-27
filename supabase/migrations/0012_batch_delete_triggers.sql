-- delete_item_if_orphan and cleanup_item_images were FOR EACH ROW triggers,
-- so deleting a category with N items fired each N times: N EXISTS probes
-- plus a single-row DELETE FROM items (which itself fired cleanup_item_images
-- N times), each running `storage.objects` where name like (prefix || '%')`.
-- Supabase's non-C collation means that LIKE can't use a plain btree index,
-- so every one of those was a sequential scan of storage.objects -- a table
-- shared across every bucket and every user in the project. Deleting a
-- category with 500 items meant ~500 sequential scans in one transaction.
--
-- Converting both triggers to FOR EACH STATEMENT with a transition table
-- turns the whole cascade into two set-based statements total, regardless
-- of how many rows are involved: one DELETE ... WHERE id IN (...) AND NOT
-- EXISTS (...) for orphaned items, and one DELETE ... WHERE name LIKE ANY (...)
-- for their storage objects.
--
-- The text_pattern_ops index lets that remaining LIKE ANY use an index scan
-- instead of a sequential scan of storage.objects.
begin;

create or replace function public.delete_item_if_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.items i
  where i.id in (select item_id from old_rows)
    and not exists (
      select 1 from public.item_categories ic where ic.item_id = i.id
    );
  return null;
end
$$;

drop trigger if exists trg_delete_orphan_items_after_ic_delete on public.item_categories;
create trigger trg_delete_orphan_items_after_ic_delete
after delete on public.item_categories
referencing old table as old_rows
for each statement execute function public.delete_item_if_orphan();

create or replace function public.cleanup_item_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from storage.objects so
  where so.bucket_id = 'item-images'
    and so.name like any (
      array(
        select r.user_id::text || '/' || r.id::text || '/%'
        from old_rows r
      )
    );
  return null;
end
$$;

drop trigger if exists trg_items_cleanup on public.items;
create trigger trg_items_cleanup
after delete on public.items
referencing old table as old_rows
for each statement execute function public.cleanup_item_images();

create index if not exists idx_storage_objects_bucket_name_pattern
on storage.objects (bucket_id, name text_pattern_ops);

commit;
