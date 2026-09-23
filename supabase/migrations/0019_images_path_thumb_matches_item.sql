-- A thumbnail path must name its own entry, as path_full must (0003): the owner's client deletes both, so a planted one took another entry's photo with it.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- `not valid`: checked on every write from now on; a production row written before must not fail the unattended deploy.
alter table public.images
add constraint images_path_thumb_matches_item
check (path_thumb is null or public.storage_item_id(path_thumb) is not distinct from item_id) not valid;

commit;
