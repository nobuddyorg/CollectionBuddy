-- 0034's keys, validated in a transaction of their own: SHARE UPDATE EXCLUSIVE, so reads and writes go on while the tables are scanned (#792).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.categories validate constraint categories_user_id_fkey;
alter table public.items validate constraint items_user_id_fkey;
alter table public.item_categories validate constraint item_categories_user_id_fkey;
alter table public.category_shares validate constraint category_shares_owner_user_id_fkey;
alter table public.images validate constraint images_user_id_fkey;

commit;
