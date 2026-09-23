-- `revoke ... from public` leaves a direct grant in place, and hosted default privileges give every new function one to anon and authenticated (#715).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Trigger functions: a trigger fires without the caller holding EXECUTE, so no API role needs it.
revoke execute on function
public.enforce_user_id(),
public.tg_set_updated_at(),
public.tg_categories_normalize(),
public.tg_items_normalize(),
public.tg_item_categories_enforce(),
public.delete_item_if_orphan(),
public.tg_category_shares_enforce(),
public.tg_images_enforce(),
public.tg_images_size_from_storage(),
public.tg_images_quota(),
public.tg_items_quota()
from public, anon, authenticated;

-- Helpers and RPCs keep their explicit `authenticated` grant; keepalive() stays the one function anon may call.
revoke execute on function
public.normalize_text(text),
public.join_tags(text[]),
public.caller_email(),
public.storage_item_id(text),
public.has_category_write_access(uuid),
public.has_category_read_access(uuid),
public.list_category_places(uuid, text),
public.search_category_items(uuid, text, int, int)
from public, anon;

-- So the next function a migration creates starts with neither grant, whatever the project's bootstrap set.
alter default privileges for role postgres in schema public
revoke execute on functions from anon, authenticated;

commit;
