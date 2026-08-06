-- Triggers wiring the functions from 0002 onto the tables from 0003.
--
-- Split from the functions so a body can be changed without restating the
-- wiring, and so the wiring can be read in one screen: what fires, on what,
-- before or after, per row or per statement.
begin;

-- Ownership, on every write.
drop trigger if exists trg_categories_enforce_uid on public.categories;
create trigger trg_categories_enforce_uid
before insert or update on public.categories
for each row execute function public.enforce_user_id();

drop trigger if exists trg_items_enforce_uid on public.items;
create trigger trg_items_enforce_uid
before insert or update on public.items
for each row execute function public.enforce_user_id();

drop trigger if exists trg_item_categories_enforce on public.item_categories;
create trigger trg_item_categories_enforce
before insert or update on public.item_categories
for each row execute function public.tg_item_categories_enforce();

-- Normalization, on every write.
drop trigger if exists trg_categories_normalize on public.categories;
create trigger trg_categories_normalize
before insert or update on public.categories
for each row execute function public.tg_categories_normalize();

drop trigger if exists trg_items_normalize on public.items;
create trigger trg_items_normalize
before insert or update on public.items
for each row execute function public.tg_items_normalize();

-- updated_at.
drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_items_updated_at on public.items;
create trigger trg_items_updated_at
before update on public.items
for each row execute function public.tg_set_updated_at();

-- Orphan collection. FOR EACH STATEMENT with a transition table, so
-- deleting a category is two statements regardless of how many items it
-- held (see delete_item_if_orphan in 0002).
drop trigger if exists trg_delete_orphan_items_after_ic_delete on public.item_categories;
create trigger trg_delete_orphan_items_after_ic_delete
after delete on public.item_categories
referencing old table as old_rows
for each statement execute function public.delete_item_if_orphan();

-- There is deliberately no trigger cleaning up an item's images. SQL can
-- delete rows from storage.objects but cannot reach the object bytes, and
-- since Supabase's `prevent-direct-deletes` guard those deletes raise
-- outright and take the whole transaction with them. Images are removed
-- through the Storage API by the client before the item row goes (see
-- removeItemImages in web/src/app/data/images.ts).

commit;
