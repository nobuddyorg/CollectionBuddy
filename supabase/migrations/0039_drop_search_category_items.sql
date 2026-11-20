-- The contract half of 0038 (#913): search_category_entries is the one search, so search_category_items, which no live bundle calls, goes.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- squawk-ignore ban-drop-function -- the rule's own remedy: the app stopped calling it in 0038's bundle, live since cc86f2a.
drop function public.search_category_items(uuid, text, int, int);

commit;
