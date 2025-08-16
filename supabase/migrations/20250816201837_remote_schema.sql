drop trigger if exists "t_item_categories_enforce_uid" on "public"."item_categories";

drop policy "own profile" on "public"."profiles";

revoke delete on table "public"."categories" from "anon";

revoke insert on table "public"."categories" from "anon";

revoke references on table "public"."categories" from "anon";

revoke select on table "public"."categories" from "anon";

revoke trigger on table "public"."categories" from "anon";

revoke truncate on table "public"."categories" from "anon";

revoke update on table "public"."categories" from "anon";

revoke references on table "public"."categories" from "authenticated";

revoke trigger on table "public"."categories" from "authenticated";

revoke truncate on table "public"."categories" from "authenticated";

revoke delete on table "public"."categories" from "service_role";

revoke insert on table "public"."categories" from "service_role";

revoke references on table "public"."categories" from "service_role";

revoke select on table "public"."categories" from "service_role";

revoke trigger on table "public"."categories" from "service_role";

revoke truncate on table "public"."categories" from "service_role";

revoke update on table "public"."categories" from "service_role";

revoke references on table "public"."item_categories" from "anon";

revoke trigger on table "public"."item_categories" from "anon";

revoke truncate on table "public"."item_categories" from "anon";

revoke update on table "public"."item_categories" from "anon";

revoke references on table "public"."item_categories" from "authenticated";

revoke trigger on table "public"."item_categories" from "authenticated";

revoke truncate on table "public"."item_categories" from "authenticated";

revoke update on table "public"."item_categories" from "authenticated";

revoke delete on table "public"."item_categories" from "service_role";

revoke insert on table "public"."item_categories" from "service_role";

revoke references on table "public"."item_categories" from "service_role";

revoke select on table "public"."item_categories" from "service_role";

revoke trigger on table "public"."item_categories" from "service_role";

revoke truncate on table "public"."item_categories" from "service_role";

revoke update on table "public"."item_categories" from "service_role";

revoke delete on table "public"."items" from "anon";

revoke insert on table "public"."items" from "anon";

revoke references on table "public"."items" from "anon";

revoke select on table "public"."items" from "anon";

revoke trigger on table "public"."items" from "anon";

revoke truncate on table "public"."items" from "anon";

revoke update on table "public"."items" from "anon";

revoke references on table "public"."items" from "authenticated";

revoke trigger on table "public"."items" from "authenticated";

revoke truncate on table "public"."items" from "authenticated";

revoke delete on table "public"."items" from "service_role";

revoke insert on table "public"."items" from "service_role";

revoke references on table "public"."items" from "service_role";

revoke select on table "public"."items" from "service_role";

revoke trigger on table "public"."items" from "service_role";

revoke truncate on table "public"."items" from "service_role";

revoke update on table "public"."items" from "service_role";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "authenticated";

revoke insert on table "public"."profiles" from "authenticated";

revoke references on table "public"."profiles" from "authenticated";

revoke select on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke update on table "public"."profiles" from "authenticated";

revoke delete on table "public"."profiles" from "service_role";

revoke insert on table "public"."profiles" from "service_role";

revoke references on table "public"."profiles" from "service_role";

revoke select on table "public"."profiles" from "service_role";

revoke trigger on table "public"."profiles" from "service_role";

revoke truncate on table "public"."profiles" from "service_role";

revoke update on table "public"."profiles" from "service_role";

alter table "public"."profiles" drop constraint "profiles_pkey";

drop index if exists "public"."profiles_pkey";

drop table "public"."profiles";

CREATE INDEX idx_item_categories_category ON public.item_categories USING btree (category_id);

CREATE INDEX idx_item_categories_item ON public.item_categories USING btree (item_id);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.cleanup_item_images()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  obj text;
  bucket text := 'item-images';
  prefix text := (old.user_id::text || '/' || old.id::text || '/');
  has_del_3arg boolean;
  has_del_2arg boolean;
begin
  -- detect which delete function exists
  select exists(
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'storage'
             and p.proname = 'delete_object'
             and oidvectortypes(p.proargtypes) = 'text, text, uuid'
         ) into has_del_3arg;

  select exists(
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'storage'
             and p.proname = 'delete_object'
             and oidvectortypes(p.proargtypes) = 'text, text'
         ) into has_del_2arg;

  -- iterate over all objects under user_id/item_id/
  for obj in
    select name
    from storage.objects
    where bucket_id = bucket
      and name like (prefix || '%')
  loop
    if has_del_3arg then
      perform storage.delete_object(bucket::text, obj::text, old.user_id::uuid);
    elsif has_del_2arg then
      perform storage.delete_object(bucket::text, obj::text);
    else
      -- last-resort: delete the metadata row (Supabase will clean up the file via triggers if configured)
      delete from storage.objects
      where bucket_id = bucket and name = obj;
    end if;
  end loop;

  return old;
end
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_item_images_no_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform storage.delete_objects(
    'item-images',
    (
      select coalesce(array_agg(name), '{}')
      from storage.objects
      where bucket_id = 'item-images'
        and name like '%/' || old.id || '/%'
    )
  );
  return old;
end
$function$
;

CREATE OR REPLACE FUNCTION public.delete_item_if_orphan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1
    from public.item_categories ic
    where ic.item_id = old.item_id
  ) then
    delete from public.items i
    where i.id = old.item_id;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_items_without_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- If OLD.item_id no longer has any category links, delete the item
  if not exists (
    select 1 from public.item_categories ic
    where ic.item_id = old.item_id
  ) then
    delete from public.items where id = old.item_id;
  end if;

  return null; -- no row to return for AFTER DELETE on link table
end
$function$
;

CREATE OR REPLACE FUNCTION public.hook_limit_users(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  n_users int := (select count(*) from auth.users);
  max_users int := 3; -- change this number if needed
begin
  if n_users >= max_users then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', format('User limit reached (%s).', max_users)
      )
    );
  end if;

  return '{}'::jsonb;
end
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

create policy "items_delete_own"
on "public"."items"
as permissive
for delete
to authenticated
using ((user_id = auth.uid()));


CREATE TRIGGER trg_delete_orphan_items_after_ic_delete AFTER DELETE ON public.item_categories FOR EACH ROW EXECUTE FUNCTION delete_item_if_orphan();

CREATE TRIGGER trg_items_cleanup AFTER DELETE ON public.items FOR EACH ROW EXECUTE FUNCTION cleanup_item_images();

CREATE TRIGGER trg_items_cleanup_item_images AFTER DELETE ON public.items FOR EACH ROW EXECUTE FUNCTION cleanup_item_images();


