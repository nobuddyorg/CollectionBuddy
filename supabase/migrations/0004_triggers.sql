-- Triggers wiring the functions from 0002 onto the tables from 0003, split
-- out so the wiring (what fires, on what, before/after, per row/statement)
-- reads in one screen.
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

-- FOR EACH STATEMENT with a transition table: one delete regardless of how
-- many items the category held (see delete_item_if_orphan, 0002).
drop trigger if exists trg_delete_orphan_items_after_ic_delete on public.item_categories;
create trigger trg_delete_orphan_items_after_ic_delete
after delete on public.item_categories
referencing old table as old_rows
for each statement execute function public.delete_item_if_orphan();

-- Deliberately no trigger cleaning up an item's images: Supabase's
-- `prevent-direct-deletes` guard makes a SQL delete of storage.objects
-- raise and abort the transaction. The client removes Storage objects via
-- the Storage API before the item row goes (removeItemImages, images.ts).

-- Ownership/normalization on a share, and (since role is the one field
-- that may change after creation) on an update to one too.
drop trigger if exists trg_category_shares_enforce on public.category_shares;
create trigger trg_category_shares_enforce
before insert or update on public.category_shares
for each row execute function public.tg_category_shares_enforce();

-- Insert only: a photograph row has nothing to change once written --
-- path_full, path_thumb and size_bytes are all fixed at upload time, same
-- "a mapping has nothing to change" reasoning as item_categories having no
-- update policy.
drop trigger if exists trg_images_enforce on public.images;
create trigger trg_images_enforce
before insert on public.images
for each row execute function public.tg_images_enforce();

commit;
