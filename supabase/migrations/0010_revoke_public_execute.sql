-- PUBLIC's default EXECUTE, revoked where 0002 left it: storage_item_id() keeps its explicit `authenticated` grant (#693).
begin;

revoke execute on function public.storage_item_id(text) from public;

commit;
