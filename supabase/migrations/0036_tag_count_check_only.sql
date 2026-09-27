-- items_tags_bounded keeps only its tag count: its length half, char_length(tags_text) <= 5049, cannot refuse since 0028's per-tag limit.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- `not valid`, as 0016 left it: a production row already past 50 tags must not fail the unattended deploy.
alter table public.items
drop constraint items_tags_bounded,
add constraint items_tags_bounded
check (cardinality(tags) <= 50) not valid;

commit;
