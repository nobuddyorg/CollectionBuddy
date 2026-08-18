-- Postgres grants EXECUTE on a new function to PUBLIC by default, and
-- 0002 never revoked it -- so normalize_text and join_tags, meant only as
-- internal helpers, are reachable via the anon key at
-- POST /rest/v1/rpc/normalize_text (and join_tags). Not exploitable as
-- found (both pin search_path = '' and touch no table), but revoked anyway
-- on the same assert-don't-assume reasoning as 0008/0009.
begin;

revoke execute on function public.normalize_text(text), public.join_tags(text[])
from public;

grant execute on function public.normalize_text(text), public.join_tags(text[])
to authenticated;

alter function public.normalize_text(text) security invoker;

commit;
