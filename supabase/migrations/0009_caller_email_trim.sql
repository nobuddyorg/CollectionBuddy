-- Make both sides of the sharing-email comparison normalize the same way.
--
-- tg_category_shares_enforce (0002_functions.sql) stores
-- `lower(btrim(invited_email))`; caller_email() only lowercased. A claim
-- carrying stray whitespace therefore matched no grant -- fail-closed, so
-- never an escalation, but a legitimate grantee would be denied with no
-- error, no log line, and nothing to distinguish it from never having been
-- invited. One character to prevent, against a feature whose entire
-- authorization identity is this one string.
--
-- Deliberately NOT added here: the `email_verified` / `is_anonymous` guard
-- proposed in #634. Executed against a real GoTrue, it does not hold. An
-- anonymous session that calls `updateUser({ email })` with an address nobody
-- has registered yet is handed a token in which GoTrue itself has set
-- `is_anonymous` to false, `user_metadata.email_verified` to true, and
-- `auth.users.email_confirmed_at` to now -- no confirmation of any kind. Every
-- form of that check, including one reading auth.users directly, passes such a
-- caller, so adding it would buy nothing and assert something false in the one
-- place in this schema that must not lie. `user_metadata` is writable by the
-- user it describes in any case (`auth.updateUser({ data })`), so it can never
-- be an authorization input. What actually closes that path is hosted auth
-- configuration, not SQL -- see supabase/config.toml and #634.
begin;

create or replace function public.caller_email()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(btrim((select auth.jwt() ->> 'email')))
$$;

commit;
