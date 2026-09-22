# CLAUDE.md

Standing instructions for Claude Code and any other AI assistant working in
this repository. `web/CLAUDE.md` adds Next.js-specific context on top of this
file. Read this file and [TEST_STRATEGY.md](TEST_STRATEGY.md) before writing
anything.

## What this project is

**CollectionBuddy** is a photo-first, bilingual (German/English) catalogue app
for personal collections. Every entry leads with a photo, carries a place and
tags, and is searchable. Features: [README.md](README.md). Full docs:
[docs/README.md](docs/README.md).

- **Frontend**: Next.js App Router as a **static export** (`output: 'export'`).
  No server runtime, no route handlers, no server-side authorization code.
- **Backend**: Supabase (Postgres, Auth, Storage). Google OAuth is the only
  sign-in; anonymous sign-in exists only for the local demo mode.
- **Authorization**: Postgres Row Level Security, and nothing else.
- **Deploy**: `pages-deploy.yml` migrates the production database, then builds
  and publishes to GitHub Pages, on every merge to `main`. No staging.

```text
CONTRIBUTING.md                # local setup, pre-PR checklist
docs/                          # reference/architecture.md, explanation/design-decisions.md, how-to/developer-guide.md
supabase/migrations/           # squashed baseline 0001–0007 plus what landed since
supabase/tests/database/       # pgTAP suite
web/src/app/                   # components/, data/, i18n/, lib/, login/
web/e2e/                       # Playwright: public/ (signed out), signed-in/, pages/ (page objects)
web/mutation-targets.mjs       # the one list of mutated + 100%-covered files
```

## Architecture you must respect

What exists: [architecture.md](docs/reference/architecture.md). Why:
[design-decisions.md](docs/explanation/design-decisions.md). Read both before
touching schema, RLS, sharing, search, storage, or deletes.

- Tables: `categories`, `items`, `item_categories`, `category_shares`, `images`.
- Every policy starts from `user_id = (select auth.uid())`, widened by
  `has_category_read_access()` (an active `category_shares` grant at any role)
  or `has_category_write_access()` (category ownership **or** an active grant
  at role `editor`). The read predicate deliberately excludes ownership; don't
  align the two.
- Sharing is account-based and **not read-only**: an `editor` creates, edits
  and deletes items and photos inside a shared category. Renaming, deleting and
  sharing the category itself stay owner-only.
- Grants and RLS are two separate denials, on purpose: every table has RLS
  **and** `revoke all ... from anon`, and `authenticated` is granted only the
  DML its policies back (no `UPDATE` on `item_categories`/`images`, no
  `TRUNCATE`/`REFERENCES`/`TRIGGER` anywhere — RLS does not filter `TRUNCATE`).
  Never remove one as redundant with the other.
- Photos: one private bucket, object paths `<uid>/<itemId>/<file>`, MIME
  allowlist and size cap set on the bucket. `authenticated` has no `UPDATE` on
  `storage.objects`, so a path never changes.
- Every SQL function pins `set search_path = ''`, and `execute` is revoked
  from `public` unless the function is a deliberate RPC.
- `web/src/app/data/` holds every table and storage query. Only it, `login/`
  and the top-level auth/session files import the Supabase client; nothing
  under `components/` does (`depcruise` + ESLint enforce this). Pure logic in
  `src/app/lib/` or beside its component takes values as parameters and never
  reaches for Supabase, `window`, `fetch`, the router or `Date.now()`.
- Find SQL by what it defines (`grep -rn 'create policy' supabase/migrations/`),
  not by file number: squashes renumber.

## Never do these

Settled decisions with their reasoning in design-decisions.md. If a task seems
to need one reversed, stop and say so.

- No public/anonymous share links.
- Search stays trigram `ILIKE`; no `tsvector`/full-text search.
- Don't restore `UPDATE` on `storage.objects`, `move()` or `upsert`. It reopens
  a real, previously exploited escalation.
- Delete storage objects client-side **before** the DB row, never after. No
  DB-side cleanup trigger for `storage.objects` — Supabase forbids it.
- `delete_item_if_orphan()` stays `FOR EACH STATEMENT`.
- Don't recreate `public.profiles`.
- No DDL on `storage.objects` (indexes, columns) — hosted Supabase refuses with
  `42501`. Policies on it are fine.
- Mutation testing stays scoped by `web/mutation-targets.mjs`, which also sets
  the per-file 100% coverage floors. Add files whose logic tests can reach;
  rendering stays off it.
- Never lower a coverage or mutation threshold (`web/vitest.config.mts`
  `test.coverage.thresholds`, `web/stryker.config.mjs` `thresholds.break`) and
  never auto-ratchet one (`autoUpdate: false` is deliberate). An unreachable
  threshold is a design problem: redesign, or raise it with the user.
- No `/* v8 ignore */` or `// Stryker disable` — `src/` has none. No `.skip`,
  ESLint or TS suppression without first understanding the failure; the few
  that exist each carry their reason on the same line. No test gaming.
- A client-side check is UX, never authorization. Every new query is covered by
  a policy.
- Never commit to `main`, skip hooks (`--no-verify`), force-push over others'
  commits, or rewrite history on a branch you don't own.
- Never modify `.github/workflows/**`, repository secrets, branch protection,
  or `.pre-commit-config.yaml`'s security hooks (`zizmor`, `detect-private-key`)
  unless the user explicitly asks.
- Never run `npm audit fix --force` or a from-scratch `rm -rf node_modules
  package-lock.json && npm install` in `web/`. Both made the tree worse here;
  use targeted `overrides`.
- Never squash migrations as a side effect of another change.

## Secrets

- Never write real Google OAuth credentials, Supabase service-role keys, or
  `SUPABASE_DB_URL`/`SUPABASE_ACCESS_TOKEN` values into code, commits, docs or
  chat — not even as an example. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the one
  credential meant to be public.
- `web/.env.local` is gitignored; `web/.env.example` stays local-stack defaults.
- `service_role` never appears in client code or the export. It lives only in
  CI secrets for `pages-deploy.yml` and `cleanup-orphaned-photos.yml`.

## Database changes

RLS is the only authorization boundary, and this project's history includes
several real RLS bugs. Every policy change is security-critical.

- Local stack only: `supabase start`, `supabase db reset`, `supabase migration`.
  Never `supabase db push` or run SQL against the hosted project; CI's `migrate`
  job does that on merge.
- A schema change is a new `supabase/migrations/NNNN_*.sql` file, never an edit
  to an existing one, plus a regenerated `web/src/app/data/database.types.ts`.
- A new table gets, in the same migration: `enable row level security`, its
  policies, `revoke all ... from anon`, and a grant to `authenticated` of
  exactly the DML those policies back. A new function pins `search_path` and
  revokes `execute` from `public`.
- CI proves a migration applies from scratch; production applies it to a
  populated database, unattended. For a migration that alters an existing table
  or adds a constraint or index to one: `supabase db reset`, seed (the
  `e2e/signed-in.setup.ts` seed covers most shapes), apply the new file on top,
  and say in the PR that you did.
- A policy, grant, or ownership-trigger change ships a matching case in
  `web/e2e/signed-in/rls.spec.ts` in the same change — two real identities,
  real tokens, straight at PostgREST (TEST_STRATEGY.md §7). A pgTAP case in
  `supabase/tests/database/` is welcome alongside but does not replace it.
- Call out any change under `supabase/migrations/**` in the commit message and
  PR description as security-relevant, with one line on what it now allows or
  denies.
- `.github/workflows/cleanup-orphaned-photos.yml` counts as a database change:
  `service_role`, bulk Storage delete, daily cron, irreversible. Its query has
  three load-bearing invariants — it matches **both `path_full` and
  `path_thumb`**, casts **no path to `uuid`**, and keeps a **48h grace
  period**. Never drop, narrow or shorten them; verify any change with the
  default dry run (`workflow_dispatch`) first. Why: TEST_STRATEGY.md §12.

## How to work here

- **Smallest necessary change.** Preserve existing behavior unless changing it
  is the task. Boy-scout fixes stay inside the function, file or policy you are
  already editing; name anything outside it instead of widening the diff.
- **When principles collide:** correctness and security, then KISS/YAGNI, then
  clean code, then DRY, then SOLID. Call the choice out in the PR.
- **KISS.** The most obvious version that fully solves the actual problem. No
  indirection layer, config knob, or helper with one caller. Nested ternaries,
  `reduce` as a loop, and one-liners that need a comment are violations. A
  function that is hard to name or hard to test needs redesign, not a comment.
- **DRY.** One home per piece of knowledge — rule, constant, query shape,
  validation, translation key. Extract on the third occurrence, not the second.
  Two blocks that look alike but change for different reasons stay apart. This
  applies to SQL (a shared predicate is a function, like
  `has_category_read_access()`) and workflows (a repeated step is a composite
  action under `.github/actions/`).
- **SOLID, as module design** — never classes, inheritance or a DI container.
  One unit, one reason to change: fetch in `src/app/data/`, transform in a pure
  function, render in the component. Extend by adding to a list or map, not by
  growing an `if`/`switch`. A union member every caller special-cases is a
  modelling error. Props and parameters carry what the consumer uses, not the
  whole entity. Pure logic takes values; the edge supplies them.
- **Clean code.** Intent-revealing names, no abbreviations or type prefixes;
  functions are verbs, booleans read as predicates. Small functions, one level
  of abstraction, guard clauses, no `else` after `return`. Zero to two
  parameters, else a named object; never a boolean flag. Command-query
  separation; no hidden side effects. No magic numbers or strings. No
  `null`/`undefined` as a signal where a type, empty collection or thrown error
  models it. No `a.b().c().d()` chains. Files under ~350 lines.
- **Comments:** one line, hard cap, only for a non-obvious constraint,
  workaround, invariant or external behavior. Never to narrate code or record a
  decision — that goes in the commit or PR. Existing longer comments are not
  precedent; tighten any you touch.
- **Every line earns its place.** No dead code, no speculative abstractions, no
  dependency without clear value over what's here, none that is deprecated or
  unmaintained.
- **Fail fast; least privilege.** Surface errors, never swallow them. Minimal
  grants, secure defaults.
- **Measure, don't assume.** Performance, coverage, mutation score and bundle
  size are numbers a tool prints. A new filtering or sorting query names its
  index; bulk operations are set-based, not row-by-row.
- **Hard-to-test means wrong design.** Extract the pure logic instead of
  forcing the test or stacking a workaround.
- **i18n:** every user-facing string goes through `t('...')` and exists in
  **both** `web/src/app/i18n/de.json` and `en.json` in the same change. German
  is the default locale.
- **Tests:** a UI change gets an E2E case for its journey; a functional change
  gets a unit test asserting behavior, not implementation; an authorization
  change gets its `rls.spec.ts` case. Which layer proves what and what may be
  mocked: TEST_STRATEGY.md §5–§7. E2E specs reach the app only through the page
  objects in `web/e2e/pages/`, every element by `data-testid`. Disagreeing with
  the playbook is fine; departing from it silently is not.
- **Docs sync:** a change to setup, the checklist, architecture, configuration,
  a design decision or a testing assumption updates the matching `docs/` file
  (and `CONTRIBUTING.md`/`README.md`) in the same change. Two things that rotted
  before: migration filenames after a squash (`grep -rn '00NN_'`), and claims
  that sharing is "read-only". TEST_STRATEGY.md stays generic: a CollectionBuddy
  fact landing there is a bug — it goes in `docs/` or here.

## Development commands

```bash
supabase start && supabase db reset     # repo root, once; needs Docker
cd web && cp .env.example .env.local && npm install
npm run dev          # http://localhost:3000; needs Google OAuth env (CONTRIBUTING.md)
npm run demo         # anonymous local demo user, no OAuth needed
```

## Definition of done

Not done — no "done", no ready PR, no reported success — until every one of
these is green, from `web/`, in this order (`build` generates `next-env.d.ts`,
which `tsc` and ESLint need):

```bash
npm run build
npx tsc --noEmit
npx prettier --check .
npm run lint
npm run depcruise         # architectural boundaries
npm run knip              # dead code / unused dependencies
npm test -- --coverage
npm run e2e
npm run test:mutation
npm run e2e:local         # needs `supabase start`; required if you touched catalogue,
                          # search, map, entry forms, photos, sharing, export, or RLS
supabase test db          # repo root, needs `supabase start`; required alongside
                          # e2e:local for RLS policies, grants, ownership triggers, schema
opengrep scan --config auto web/src web/scripts web/e2e supabase
                          # if you touched those paths; install: CONTRIBUTING.md
npm run lighthouse        # needs `supabase start`
```

CI additionally runs an OWASP ZAP baseline scan against the built export;
reproduce it per developer-guide.md if you touched headers, CSP, or the login
page. `prek run --all-files` from the repo root runs the repo-wide hooks
(`typos`, `zizmor`, `markdownlint`, `sqlfluff-lint`, file hygiene) plus the same
web checks. A partial run is a status update, not a stopping point. If a gate
blocks finishing, say so — never relax the gate.
