-- tg_images_quota() sums size_bytes per owner; carrying it in the user_id index makes that an index-only scan (#718).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index idx_images_user_size
on public.images (user_id) include (size_bytes);

drop index public.idx_images_user;

commit;
