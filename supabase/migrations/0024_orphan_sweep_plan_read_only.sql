-- The sweep's token needs only Database: Read, whose Management API query endpoint runs as supabase_read_only_user (#748).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- That role already reads every table and bypasses RLS; this adds nothing it could not select itself.
grant execute on function public.orphan_sweep_plan(integer)
to supabase_read_only_user;

commit;
