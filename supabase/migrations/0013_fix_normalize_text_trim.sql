-- normalize_text's own comment says "trim + collapse whitespace", but
-- regexp_replace('\s+', ' ') only collapses internal runs -- it leaves
-- leading/trailing spaces, so nullif(..., '') only ever fires for a truly
-- empty string. A whitespace-only value like '  ' normalizes to ' ', not
-- NULL, so it survives `place is not null` filters and gets geocoded as a
-- blank query, and a whitespace-only title hits the raw items_title_not_blank
-- constraint instead of being nullified into the intended not-null failure.
begin;

create or replace function public.normalize_text(txt text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce($1, ''), '\s+', ' ', 'g')), '')
$$;

commit;
