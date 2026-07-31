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
-- This file originally also created a (bucket_id, name text_pattern_ops)
-- index on storage.objects, so that remaining LIKE ANY could use an index
-- scan. That statement was impossible to execute and so this whole
-- migration -- wrapped in one transaction -- never applied anywhere: not
-- locally, and not in production, where it was found still pending long
-- after the rest of the chain had been run by hand. Hosted Supabase owns
-- storage.objects as supabase_storage_admin and does not make `postgres` a
-- member, so `create index` on it raises 42501 "must be owner of table
-- objects" for every role we can reach, and no `set role` gets around it.
-- The index is therefore dropped from this migration rather than left as
-- an instruction nobody can carry out. What remains is the actual win: the
-- cascade is two set-based statements instead of 2N row-triggers, and the
-- one sequential scan of storage.objects per delete is a cost worth paying
-- against the ~500 it replaces.
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

commit;
