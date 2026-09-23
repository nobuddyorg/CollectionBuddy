-- PUBLIC's default EXECUTE, revoked where 0002 left it. A trigger fires without the caller holding EXECUTE, so only direct calls lose it.
begin;

-- storage_item_id() keeps its explicit `authenticated` grant (#693).
revoke execute on function public.storage_item_id(text) from public;

-- SECURITY DEFINER trigger functions, as 0009 already does for its own (#698, Splinter 0028/0029).
revoke execute on function
public.enforce_user_id(),
public.tg_set_updated_at(),
public.tg_categories_normalize(),
public.tg_items_normalize(),
public.tg_item_categories_enforce(),
public.delete_item_if_orphan(),
public.tg_category_shares_enforce(),
public.tg_images_enforce()
from public;

commit;
