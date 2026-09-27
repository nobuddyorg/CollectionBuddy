-- An entry's description keeps its line breaks; title, place and tags stay single-line (#762).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- CR LF and a lone CR become LF, blanks before a line break go, the ends are trimmed; NULL for blank, as normalize_text().
create function public.normalize_multiline_text(txt text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(regexp_replace(coalesce($1, ''), '\r\n?', E'\n', 'g'), '[[:blank:]]+\n', E'\n', 'g'),
      '^\s+|\s+$', '', 'g'
    ),
    ''
  )
$$;

-- Only tg_items_normalize() calls it, as its owner, so no API role needs EXECUTE.
revoke execute on function public.normalize_multiline_text(text)
from public, anon, authenticated;

-- Same as 0002 but for the description; `create or replace` keeps 0015's revokes on it.
create or replace function public.tg_items_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tmp text[];
begin
  new.title := public.normalize_text(new.title);
  new.description := public.normalize_multiline_text(new.description);
  new.place := public.normalize_text(new.place);

  if new.tags is not null then
    tmp := (
      select array_agg(distinct public.normalize_text(x) order by public.normalize_text(x))
      from unnest(new.tags) as u(x)
      where public.normalize_text(x) is not null
    );
    new.tags := coalesce(tmp, '{}'::text[]);
  end if;

  return new;
end
$$;

commit;
