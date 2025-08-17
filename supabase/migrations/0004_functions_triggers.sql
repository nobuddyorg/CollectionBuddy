-- Ownership enforcement, normalization, updated_at, cross-tenant guard, orphan cleanup, storage cleanup.
begin;

-- normalize text: trim + collapse whitespace; returns NULL if empty
drop function if exists public.normalize_text(text);
create function public.normalize_text(txt text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce($1, ''), '\s+', ' ', 'g'), '')
$$;

-- updated_at maintainer
drop function if exists public.tg_set_updated_at();
create function public.tg_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- server-side auth ownership enforcement
drop function if exists public.enforce_user_id();
create function public.enforce_user_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    return new;
  elsif tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      new.user_id := old.user_id;
    end if;
    return new;
  end if;
  return new;
end
$$;

-- categories: normalize name on write
drop function if exists public.tg_categories_normalize();
create function public.tg_categories_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := public.normalize_text(new.name);
  return new;
end
$$;

-- items: normalize text fields + tags (dedupe, sort)
drop function if exists public.tg_items_normalize();
create function public.tg_items_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tmp text[];
begin
  new.title := public.normalize_text(new.title);
  new.description := public.normalize_text(new.description);
  new.place := public.normalize_text(new.place);

  if new.tags is not null then
    tmp := (
      select array_agg(distinct public.normalize_text(x) order by public.normalize_text(x))
      from unnest(new.tags) as u(x)
      where public.normalize_text(x) is not null
    );
    new.tags := coalesce(tmp, '{}'::text[]);
  end if;

  return new;
end
$$;

-- item_categories: enforce cross-tenant and derive user_id from item
drop function if exists public.tg_item_categories_enforce();
create function public.tg_item_categories_enforce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  itm_user uuid;
  cat_user uuid;
begin
  select i.user_id into itm_user from public.items i where i.id = new.item_id;
  select c.user_id into cat_user from public.categories c where c.id = new.category_id;

  if itm_user is null or cat_user is null then
    raise exception 'item or category not found';
  end if;

  if itm_user <> cat_user then
    raise exception 'cross-tenant assignment is not allowed';
  end if;

  new.user_id := itm_user;

  if itm_user <> auth.uid() then
    raise exception 'ownership mismatch';
  end if;

  return new;
end
$$;

-- orphan cleanup: when a mapping is removed, delete the item if it has no categories left
drop function if exists public.delete_item_if_orphan();
create function public.delete_item_if_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.item_categories ic where ic.item_id = old.item_id
  ) then
    delete from public.items i where i.id = old.item_id;
  end if;
  return null;
end
$$;

-- storage cleanup: delete all images under user_id/item_id prefix
drop function if exists public.cleanup_item_images();
create function public.cleanup_item_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  obj text;
  bucket text := 'item-images';
  prefix text := (old.user_id::text || '/' || old.id::text || '/');
  has_del_3arg boolean;
  has_del_2arg boolean;
begin
  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'storage' and p.proname = 'delete_object'
      and oidvectortypes(p.proargtypes) = 'text, text, uuid'
  ) into has_del_3arg;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'storage' and p.proname = 'delete_object'
      and oidvectortypes(p.proargtypes) = 'text, text'
  ) into has_del_2arg;

  for obj in
    select o.name
    from storage.objects o
    where o.bucket_id = bucket and o.name like (prefix || '%')
  loop
    if has_del_3arg then
      perform storage.delete_object(bucket::text, obj::text, old.user_id::uuid);
    elsif has_del_2arg then
      perform storage.delete_object(bucket::text, obj::text);
    else
      delete from storage.objects so where so.bucket_id = bucket and so.name = obj;
    end if;
  end loop;

  return old;
end
$$;

-- Triggers: ownership, normalization, updated_at, cleanup hooks
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

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_items_updated_at on public.items;
create trigger trg_items_updated_at
before update on public.items
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_categories_normalize on public.categories;
create trigger trg_categories_normalize
before insert or update on public.categories
for each row execute function public.tg_categories_normalize();

drop trigger if exists trg_items_normalize on public.items;
create trigger trg_items_normalize
before insert or update on public.items
for each row execute function public.tg_items_normalize();

drop trigger if exists trg_delete_orphan_items_after_ic_delete on public.item_categories;
create trigger trg_delete_orphan_items_after_ic_delete
after delete on public.item_categories
for each row execute function public.delete_item_if_orphan();

drop trigger if exists trg_items_cleanup on public.items;
create trigger trg_items_cleanup
after delete on public.items
for each row execute function public.cleanup_item_images();

commit;
