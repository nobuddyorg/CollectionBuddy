-- Postgres grants EXECUTE on a new function to PUBLIC by default, and
-- 0002_functions.sql never revoked it -- so both normalize_text and
-- join_tags, meant only as internal helpers for the generated column and
-- the trigger functions that use them, are reachable at
-- POST /rest/v1/rpc/normalize_text (and join_tags) with the anon key. Only
-- keepalive() was ever meant to be anon-reachable (0006_policies.sql).
--
-- Not exploitable as found: both pin search_path = '' and are pure string
-- functions that touch no table, so SECURITY DEFINER buys an anon caller
-- nothing here. Revoked anyway, on the same "assert rather than assume"
-- reasoning as 0008 and 0009 -- and normalize_text has no reason to run as
-- SECURITY DEFINER when it never reads or writes a row.
begin;

revoke execute on function public.normalize_text(text), public.join_tags(text[])
from public;

grant execute on function public.normalize_text(text), public.join_tags(text[])
to authenticated;

alter function public.normalize_text(text) security invoker;

commit;
