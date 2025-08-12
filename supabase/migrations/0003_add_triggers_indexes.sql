create or replace function public.set_user_id_items()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end; $$;

drop trigger if exists trg_set_user_id_items on public.items;
create trigger trg_set_user_id_items
before insert on public.items
for each row execute function public.set_user_id_items();

create or replace function public.set_user_id_item_categories()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end; $$;

drop trigger if exists trg_set_user_id_item_categories on public.item_categories;
create trigger trg_set_user_id_item_categories
before insert on public.item_categories
for each row execute function public.set_user_id_item_categories();

create index if not exists idx_items_created_at on public.items (created_at desc);
create index if not exists idx_item_categories_category on public.item_categories (category_id);
create index if not exists idx_item_categories_item on public.item_categories (item_id);

select pg_notify('pgrst','reload schema');
