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

- **Frontend**: Next.js App Router as a **static export** — no server runtime,
  no route handlers, no server-side authorization code. `web/`.
- **Backend**: Supabase (Postgres, Auth, Storage). Google OAuth is the only
  sign-in; anonymous sign-in exists only for the local demo mode.
- **Authorization**: Postgres Row Level Security, and nothing else. Sharing is
  account-based, per category, at role `viewer` or `editor` — an editor
  creates, edits and deletes entries and photos inside a shared category, so
  sharing is **not read-only**.
- **Deploy**: `pages-deploy.yml` migrates the production database, then builds
  and publishes to GitHub Pages, on every merge to `main`. No staging.

## Read before you touch

| Area | Read first |
| --- | --- |
| Schema, RLS, sharing, storage, deletes, search | [architecture.md](docs/reference/architecture.md), then [design-decisions.md](docs/explanation/design-decisions.md) |
| Tests: which layer, what may be mocked, how RLS is tested | [TEST_STRATEGY.md](TEST_STRATEGY.md) §5–§7, then [developer-guide.md](docs/how-to/developer-guide.md) |
| Dependencies, `npm audit` findings | design-decisions.md, "npm audit" section |
| Migrations, squashing, deploying, new environments | developer-guide.md |
| Local setup, the pre-PR checklist | [CONTRIBUTING.md](CONTRIBUTING.md) |

## Hard rules

Settled decisions and safety rules. If a task seems to need one reversed, stop
and say so; never work around it quietly. Reasoning lives in
design-decisions.md, not here.

- A client-side check is UX, never authorization. Every query is covered by an
  RLS policy.
- No public/anonymous share links.
- Search stays trigram `ILIKE`; no `tsvector`/full-text search.
- A storage object's path never changes: no `UPDATE` on `storage.objects`, no
  `move()`, no `upsert`. Restoring it reopens an exploited escalation.
- Delete storage objects client-side **before** the DB row, never after, and
  never through a DB trigger.
- No DDL on `storage.objects` (indexes, columns). Hosted Supabase refuses with
  `42501`; a local reset will not tell you. Policies on it are fine.
- Never lower a coverage or mutation threshold (`web/vitest.config.mts`,
  `web/stryker.config.mjs`) or auto-ratchet one. An unreachable threshold is a
  design problem: redesign, or raise it with the user.
- No `/* v8 ignore */` or `// Stryker disable` — `src/` has none. No `.skip`,
  ESLint or TS suppression without understanding the failure first; the reason
  goes on the same line. No test gaming.
- Never commit to `main`, skip hooks (`--no-verify`), force-push over others'
  commits, or rewrite history on a branch you don't own.
- Never modify `.github/workflows/**`, repository secrets, branch protection,
  or `.pre-commit-config.yaml`'s security hooks unless the user explicitly asks.
- Never run `npm audit fix --force` or a from-scratch `rm -rf node_modules
  package-lock.json && npm install` in `web/`; use targeted `overrides`.
- Never write real Google OAuth credentials, service-role keys, or
  `SUPABASE_DB_URL`/`SUPABASE_ACCESS_TOKEN` values anywhere — code, docs,
  commits, chat, not even as an example. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is
  the one credential meant to be public. `service_role` lives only in CI
  secrets, never in client code.

## Database changes

RLS is the only authorization boundary, and this project's history includes
several real RLS bugs. Every policy change is security-critical.

- Local stack only: `supabase start`, `supabase db reset`, `supabase migration`.
  Never `supabase db push` or run SQL against the hosted project; CI's `migrate`
  job does that on merge.
- A schema change is a new `supabase/migrations/NNNN_*.sql` file, never an edit
  to an existing one, plus a regenerated `web/src/app/data/database.types.ts`.
- A new table ships, in the same migration, with `enable row level security`,
  its policies, `revoke all ... from anon`, and a grant to `authenticated` of
  exactly the DML those policies back. A new function pins
  `set search_path = ''` and revokes `execute` from `public` unless it is a
  deliberate RPC. Copy the shape of the existing migrations.
- CI proves a migration applies from scratch; production applies it to a
  populated database, unattended. If a migration alters an existing table or
  adds a constraint or index to one: `supabase db reset`, seed (the
  `e2e/signed-in.setup.ts` seed covers most shapes), apply the new file on top,
  and say in the PR that you did.
- A policy, grant, or ownership-trigger change ships a matching case in
  `web/e2e/signed-in/rls.spec.ts` in the same change — two real identities,
  real tokens, straight at PostgREST. A pgTAP case in
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
  is what was asked. Boy-scout fixes stay inside the function, file, or policy
  you are already editing; if something outside it breaks a rule, say so rather
  than widening the diff.
- **When principles collide:** correctness and security, then KISS/YAGNI, then
  clean code, then DRY, then SOLID. No abstraction for a requirement nobody has;
  extract on the third occurrence. SOLID means modules, hooks, and functions —
  never classes or a DI container. DRY applies to SQL (a shared predicate is a
  function like `has_category_read_access()`) and workflows (a repeated step is
  a composite action in `.github/actions/`) too.
- **Split by responsibility:** fetch in `src/app/data/` (the only place that
  imports the Supabase client, besides `login/` and the top-level session
  files), transform in a pure function that takes values as parameters and
  never reaches for Supabase, `window`, `fetch`, the router or `Date.now()`,
  render in the component. Hard-to-reach coverage or a stubborn mutant means
  extract the logic, not force the test. New pure logic goes on
  `web/mutation-targets.mjs`; rendering stays off it.
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
  is the default locale.
- **Tests:** a UI change gets an E2E case for its journey; a functional change
  gets a unit test asserting behavior, not implementation; an authorization
  change gets its `rls.spec.ts` case. E2E specs reach the app only through the
  page objects in `web/e2e/pages/`, every element by `data-testid`. Disagreeing
  with the playbook is fine; departing from it silently is not.
- **Docs sync:** a change to setup, the checklist, architecture, configuration,
  a design decision, or a testing assumption updates the matching `docs/` file
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
npm run test:mutation     # if you changed code in a file listed in web/mutation-targets.mjs;
                          # comments produce no new mutants (TEST_STRATEGY.md §14, gate scope)
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
