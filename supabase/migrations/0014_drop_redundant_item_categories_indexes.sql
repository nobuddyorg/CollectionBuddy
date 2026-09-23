-- Both are prefixes of existing indexes: item_id of the primary key, category_id of idx_item_categories_cat_created (#717).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop index public.idx_item_categories_item;
drop index public.idx_item_categories_category;

commit;
