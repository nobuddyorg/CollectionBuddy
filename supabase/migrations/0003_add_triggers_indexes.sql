create or replace function public.enforce_user_id()
returns trigger
language plpgsql
security definer
as $$
begin
  if (tg_op = 'INSERT') then
    new.user_id := auth.uid();
    return new;
  elsif (tg_op = 'UPDATE') then

    if new.user_id <> old.user_id then
      new.user_id := old.user_id;
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists t_categories_enforce_uid on public.categories;
create trigger t_categories_enforce_uid
before insert or update on public.categories
for each row execute function public.enforce_user_id();

drop trigger if exists t_items_enforce_uid on public.items;
create trigger t_items_enforce_uid
before insert or update on public.items
for each row execute function public.enforce_user_id();

drop trigger if exists t_item_categories_enforce_uid on public.item_categories;
create trigger t_item_categories_enforce_uid
before insert or update on public.item_categories
for each row execute function public.enforce_user_id();
