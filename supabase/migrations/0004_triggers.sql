-- Wiring only: what fires, on what, before/after, per row or per statement. Bodies are in 0002.
begin;

-- Ownership, on every write.
create trigger trg_categories_enforce_uid
before insert or update on public.categories
for each row execute function public.enforce_user_id();

create trigger trg_items_enforce_uid
before insert or update on public.items
for each row execute function public.enforce_user_id();

create trigger trg_item_categories_enforce
before insert or update on public.item_categories
for each row execute function public.tg_item_categories_enforce();

-- Normalization, on every write.
create trigger trg_categories_normalize
before insert or update on public.categories
for each row execute function public.tg_categories_normalize();

create trigger trg_items_normalize
before insert or update on public.items
for each row execute function public.tg_items_normalize();

-- updated_at.
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.tg_set_updated_at();

create trigger trg_items_updated_at
before update on public.items
for each row execute function public.tg_set_updated_at();

-- FOR EACH STATEMENT with a transition table: one delete however many items the category held.
create trigger trg_delete_orphan_items_after_ic_delete
after delete on public.item_categories
referencing old table as old_rows
for each statement execute function public.delete_item_if_orphan();

-- No trigger cleans up an item's Storage objects: Supabase forbids SQL deletes on storage.objects.

-- Also on update, since role is the one column that may change after creation.
create trigger trg_category_shares_enforce
before insert or update on public.category_shares
for each row execute function public.tg_category_shares_enforce();

-- Insert only: an images row is written once and removed, never edited.
create trigger trg_images_enforce
before insert on public.images
for each row execute function public.tg_images_enforce();

commit;
