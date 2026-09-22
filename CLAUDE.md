# CLAUDE.md

Standing instructions for Claude Code and any other AI assistant working in
this repository. `web/CLAUDE.md` adds Next.js-specific context on top of this
file and does not replace it. Read this file and
[TEST_STRATEGY.md](TEST_STRATEGY.md) before writing anything.

## What this project is

**CollectionBuddy** is a photo-first, bilingual (German/English) catalogue app
for personal collections (coins, stamps, records, cameras, ...). Every entry
leads with a photo, carries a place and tags, and is searchable. Feature list:
[README.md](README.md). Full documentation, organised by
[Diátaxis](https://diataxis.fr): [docs/README.md](docs/README.md).

- **Frontend**: Next.js App Router as a **static export** (`output: 'export'`)
  — no server runtime, no route handlers, no server-side authorization code.
  The pinned version is `web/package.json`'s; `web/AGENTS.md` says to read that
  version's own docs before writing against its APIs.
- **Backend**: Supabase (Postgres + Auth + Storage). Google is the only sign-in
  provider.
- **Authorization**: Postgres Row Level Security, and nothing else.
- **Hosting**: static export on GitHub Pages. `pages-deploy.yml` applies
  pending migrations to production, then builds and deploys, on every merge to
  `main`. There is no staging environment.

```text
CONTRIBUTING.md                # local setup, pre-PR checklist
docs/                          # tutorials/, how-to/, reference/, explanation/
.github/workflows/             # ci.yml, pages-deploy.yml, cleanup-orphaned-photos.yml, ...
supabase/migrations/           # squashed baseline 0001–0007 plus what landed since
supabase/tests/database/       # pgTAP suite
web/src/app/                   # components/, data/, i18n/, lib/, login/
web/e2e/                       # Playwright: public/ (signed out), signed-in/, pages/
web/mutation-targets.mjs       # the one list of mutated + 100%-covered files
```

## Architecture and constraints you must respect

What exists: [architecture.md](docs/reference/architecture.md). Why:
[design-decisions.md](docs/explanation/design-decisions.md). Read both before
touching schema, RLS, sharing, search, storage, or deletes.

- Tables: `categories`, `items`, `item_categories`, `category_shares`, `images`.
- Every policy starts from `user_id = (select auth.uid())` and is widened by
  `has_category_read_access()` (any active `category_shares` grant) or
  `has_category_write_access()` (category ownership **or** an active grant at
  role `editor`). Sharing is account-based and **not read-only**: an editor
  writes items and photos inside a shared category; renaming, deleting and
  managing shares stay owner-only at every role. The read predicate deliberately
  excludes ownership — don't "simplify" the two predicates to match.
- `anon` is denied twice on every table: RLS plus explicit revoked grants.
  `authenticated` holds exactly the DML each table's policies back, and no
  `TRUNCATE`/`REFERENCES`/`TRIGGER` (RLS does not filter `TRUNCATE`). Both
  halves stay; a real gap once hid behind a missing function `EXECUTE` revoke,
  caught only by `supabase/tests/database/000_schema_test.sql`.
- Photos: one private Storage bucket, object paths `<uid>/<itemId>/<file>`, a
  size cap and image-only MIME allowlist on the bucket itself, WebP compression
  in the browser before upload. `authenticated` holds no `UPDATE` on
  `storage.objects`, so an object's path never changes.
- `web/src/app/data/` holds every table and storage query; only it, `login/`,
  and the top-level auth/session files import the Supabase client (`depcruise`
  and an ESLint rule enforce this; nothing under `components/` does). Pure
  logic lives in `src/app/lib/` or beside its component and never reaches for
  Supabase, `window`, `fetch`, the router, or `Date.now()` — it takes values as
  parameters, which is what keeps it testable without mocks.
- Find current SQL by what it defines (`grep -rn 'create policy'
  supabase/migrations/`), not by file number: a squash renumbers files.

## Never do these

Settled decisions; the reasoning is in design-decisions.md. If a task seems to
need one reversed, say so and stop — don't do it quietly.

- No public/anonymous share links. Sharing is account-based only.
- Search is trigram `ILIKE`. Don't reintroduce `tsvector`/full-text search.
- A storage object's path never changes. Don't restore `UPDATE` on
  `storage.objects`, `move()`, or `upsert` — this reopens a real, previously
  exploited escalation.
- Delete storage objects client-side **before** the DB row, never after. There
  is deliberately no DB-side cleanup trigger for `storage.objects`.
- `delete_item_if_orphan()` stays `FOR EACH STATEMENT`, not `FOR EACH ROW`.
- Don't recreate `public.profiles`.
- Don't touch `storage.objects` DDL (indexes, schema changes) — hosted Supabase
  refuses with `42501`. Policies on it are fine.
- Mutation testing stays scoped by `web/mutation-targets.mjs`, which also
  drives the per-file 100% coverage floors. Widening it to logic reachable
  from tests is welcome; rendering stays off it.
- Never lower a coverage or mutation threshold (`web/vitest.config.mts`
  `test.coverage.thresholds`, `web/stryker.config.mjs` `thresholds.break`) to
  make CI pass, and never auto-ratchet them (`autoUpdate: false` is
  deliberate). An unreachable threshold is a design problem: redesign, or raise
  it with the user.
- Never add `/* v8 ignore */`, `// Stryker disable`, `.skip`, or an ESLint/TS
  suppression without first understanding the failure and confirming the
  suppression is legitimate; `src/` currently carries none. No test gaming: a
  green metric that doesn't reflect real confidence is worse than a documented
  gap.
- Never treat a client-side check as authorization. It's UX; the RLS policy is
  the check, and every new query needs one.
- Never commit to `main`, skip hooks (`--no-verify`), force-push over someone
  else's commits, or rewrite history on a branch you don't own.
- Never modify `.github/workflows/**`, repository secrets, branch protection,
  or `.pre-commit-config.yaml`'s security hooks (`zizmor`, `detect-private-key`)
  unless the user explicitly asks for that change.
- Never run `npm audit fix --force` or a from-scratch `rm -rf node_modules
  package-lock.json && npm install` in `web/` — both made the dependency tree
  worse on this project. Use targeted `overrides` entries.
- Never squash migrations as a side effect of another change; the procedure is
  in [developer-guide.md](docs/how-to/developer-guide.md).

## Secrets

- Never write real Google OAuth credentials, Supabase service-role keys, or
  `SUPABASE_DB_URL`/`SUPABASE_ACCESS_TOKEN` values into code, commits, docs, or
  chat — not even as an example. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the one
  credential that belongs in the bundle and the docs.
- `web/.env.local` is local-only and gitignored; `web/.env.example` stays
  placeholder values.
- `service_role` never appears in client code or the static export. It exists
  only in CI secrets for `pages-deploy.yml` and `cleanup-orphaned-photos.yml`.

## Database changes

RLS is the only authorization boundary, and this project's history includes
several real RLS-correctness bugs. Treat every policy change as
security-critical, not routine SQL.

- Work against the **local** stack only (`supabase start`, `supabase db reset`,
  `supabase migration ...`). Never run a migration, `supabase db push`, or
  destructive SQL against staging or production; CI's `migrate` job does that
  on merge to `main`, deliberately.
- Every schema change is a new `supabase/migrations/NNNN_*.sql` file (never an
  edit to an existing one) plus a regenerated
  `web/src/app/data/database.types.ts`.
- CI proves a migration applies from scratch; production applies it to a
  populated database, unattended. For any migration that alters an existing
  table or adds a constraint or index to one: `supabase db reset`, seed rows
  into the affected tables (the `e2e/signed-in.setup.ts` seed covers most
  shapes), apply the new file on top — not through a fresh reset — and say in
  the PR description that you did.
- Any change under `supabase/migrations/**` — new or changed policy, grant, or
  trigger touching auth/ownership — is called out in the commit message and PR
  description as security-relevant, with one line on what it now allows or
  denies.
- A policy, grant, or ownership-trigger change ships a matching case in
  `web/e2e/signed-in/rls.spec.ts` in the same change: two real identities, real
  tokens, straight at PostgREST (TEST_STRATEGY.md §7). A pgTAP case in
  `supabase/tests/database/` is welcome alongside but does not discharge this.
- `.github/workflows/cleanup-orphaned-photos.yml` counts as a database change:
  a `service_role` key, a bulk Storage delete, a daily cron, and irreversible
  deletion of live photos as its failure mode. Three invariants in its query
  look like tidy-ups but aren't: it matches **both `path_full` and
  `path_thumb`**, it casts **no path to `uuid`**, and it keeps a **48h grace
  period**. Never drop, narrow, or shorten them; verify any change with the
  default dry run (`workflow_dispatch`) before it deletes anything.
  TEST_STRATEGY.md §12 explains why each one matters.

## How to work here

- **Smallest necessary change.** Preserve existing behavior unless changing it
  is what was asked. Boy-scout fixes stay inside the function, file, or policy
  you are already editing; if something outside it breaks a rule, say so rather
  than widening the diff.
- **When principles collide:** correctness and security, then KISS/YAGNI, then
  clean code, then DRY, then SOLID. No abstraction for a requirement nobody has;
  extract on the third occurrence. SOLID means modules, hooks, and functions —
  never classes or a DI container. DRY applies to SQL (a shared predicate is a
  function like `has_category_read_access()`) and workflows (a repeated step is
  a composite action in `.github/actions/`) too.
- **Split by responsibility:** fetch in `src/app/data/`, transform in a pure
  function where it can be unit- and mutation-tested, render in the component.
  Hard-to-reach coverage or a stubborn mutant means extract the logic, not
  force the test.
- **Clean code, as applied here:** intent-revealing names, no abbreviations or
  type prefixes; small functions with guard clauses; zero to two parameters,
  else a named object, never a boolean flag; command-query separation; no
  `null`/`undefined` as a signal where a type or empty collection models it;
  files under ~350 lines; no dead code; no dependency without clear value over
  what's here, and none that is deprecated or unmaintained.
- **Comments:** one line, hard cap, only for a non-obvious constraint,
  workaround, invariant, or external behavior — never to narrate code or record
  a decision (that goes in the commit or PR). Existing longer comments are not
  precedent; tighten any you touch.
- **Fail fast; measure, don't assume.** Surface errors, never swallow them.
  Performance, coverage, and bundle size are numbers a tool prints. A new
  filtering/sorting query names its index; bulk operations are set-based.
- **i18n:** every user-facing string goes through `t('...')` and exists in
  **both** `web/src/app/i18n/de.json` and `en.json` in the same change. German
  is the default locale; `parity.test.ts` catches a mismatch, but don't rely on
  it after the fact.
- **Tests:** a UI change gets an E2E case for its journey; a functional change
  gets a unit test asserting behavior, not implementation; an authorization
  change gets its `rls.spec.ts` case (above). Which layer proves what and what
  may be mocked: TEST_STRATEGY.md §5–§7. E2E specs reach the app only through
  the page objects in `web/e2e/pages/`, every element by `data-testid`
  (developer-guide.md lists the screens). Disagreeing with the playbook is
  fine; departing from it silently is not.
- **Docs sync:** a change to setup, the checklist, architecture, configuration,
  a design decision, or a testing assumption updates the matching `docs/` file
  (and `CONTRIBUTING.md`/`README.md`) in the same change. Two things that rotted
  before: migration filenames after a squash (`grep -rn '00NN_'`), and claims
  that sharing is "read-only". TEST_STRATEGY.md is the exception: it stays
  generic, so a CollectionBuddy fact landing there is a bug — concrete facts go
  in architecture.md, design-decisions.md, or here.

## Development commands

```bash
supabase start && supabase db reset     # repo root, once; needs Docker
cd web && cp .env.example .env.local && npm install
npm run dev          # http://localhost:3000; needs Google OAuth env (CONTRIBUTING.md)
npm run demo         # anonymous local demo user, no OAuth needed
```

## Definition of done

A task is **not** done — don't say "done", open a PR as ready, or report
success — until every one of these is green, run from `web/`, in this order
(`build` generates `next-env.d.ts`, which `tsc` and ESLint need):

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

`prek run --all-files` (or `pre-commit run --all-files`) from the repo root runs
the repo-wide hooks (file hygiene, `typos`, `zizmor`, `markdownlint`,
`sqlfluff-lint`) plus the same web checks. A partial run is a status update,
not a stopping point. If a gate blocks finishing, say so — never relax the gate.
