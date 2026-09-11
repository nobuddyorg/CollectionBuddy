# CLAUDE.md

This file guides Claude Code (and any other AI assistant) when working in this
repository. It is project-wide: `web/CLAUDE.md` adds Next.js-specific context
on top of this file and does not replace it.

## Project Overview

**CollectionBuddy** is a photo-first, bilingual (German/English) catalog app
for personal collections (coins, stamps, records, cameras, ...). Every entry
leads with a photo, carries a place and tags, and is searchable.

- **Frontend**: Next.js 16 (App Router, **static export**, `output: 'export'`)
  — no server runtime, no route handlers, no server-side authorization code.
- **Backend**: Supabase (Postgres + Auth + Storage). Google is the only
  sign-in provider.
- **Authorization**: enforced entirely by Postgres **Row Level Security**.
  There is nowhere else it could live — see "Hard guardrails" below.
- **Hosting**: static export deployed to GitHub Pages.

Read [README.md](README.md) for the feature list and
[docs/README.md](docs/README.md) for the full documentation set, organised by
[Diátaxis](https://diataxis.fr).

## Repository Structure

```text
CollectionBuddy/
├── README.md                    # Feature overview, screenshots
├── CONTRIBUTING.md               # Local setup, pre-PR checklist
├── CLAUDE.md                     # This file
├── TEST_STRATEGY.md              # READ THIS before writing or changing tests
├── build.sh                      # Convenience build wrapper
├── .pre-commit-config.yaml       # File hygiene, spell check, zizmor, shellcheck,
│                                  # markdownlint, and web/'s own checks
├── docs/                         # Diátaxis docs
│   ├── tutorials/getting-started.md
│   ├── how-to/user-guide.md, developer-guide.md
│   ├── reference/architecture.md, configuration.md
│   └── explanation/design-decisions.md   # READ THIS before touching schema,
│                                          # RLS, sharing, search, or deletes
├── supabase/
│   ├── config.toml                # Local stack ports, Google OAuth block
│   └── migrations/                # 0001..0007 baseline (squashed), 0008+ additive
└── web/                           # The Next.js app (see web/CLAUDE.md)
    ├── src/app/                   # components/, data/, i18n/, lib/, login/
    ├── e2e/                       # Playwright specs (signed-out + signed-in)
    ├── stryker.config.mjs         # Mutation testing, scoped to pure functions
    └── vitest.config.mts           # Unit tests, coverage thresholds
```

## Development Commands

Full setup: [CONTRIBUTING.md](CONTRIBUTING.md). Summary:

```bash
# One-time local backend (from repo root)
supabase start
supabase db reset

# Web app (from web/)
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3000
npm run demo             # no Google OAuth needed, anonymous local demo user
```

Checks, from `web/`, **in this order** (the build must run first — it
generates `next-env.d.ts`, which `tsc`/ESLint need):

```bash
npm run build
npx tsc --noEmit
npx prettier --check .
npm run lint
npm test -- --coverage
npm run e2e
npm run test:mutation     # separate CI job, run it too before calling something done
npm run e2e:local         # needs `supabase start`; required if you touched
                           # catalogue, search, map, entry forms, photos, or RLS
```

`prek run --all-files` (or `pre-commit run --all-files`) from the repo root
runs the repo-wide hooks (file hygiene, `typos`, `zizmor`, `shellcheck`,
`markdownlint`) plus the same web checks.

## Hard guardrails — never skip these

These are not suggestions. If one of them would block finishing a task, stop
and say so instead of working around it.

### 1. Definition of done = the full pre-PR checklist

A task is **not** done — do not say "done", open a PR as ready, or report
success — until every command in the checklist above has been run and is
green: `build`, `tsc`, `prettier --check`, `lint`, `test -- --coverage`,
`e2e`, `test:mutation`, and (if the change touches catalogue/search/map/
forms/photos/RLS) `e2e:local`. Partial runs ("lint passes, I didn't run the
rest") are not a stopping point, they're a status update.

- **[TEST_STRATEGY.md](TEST_STRATEGY.md) defines this repository's testing
  strategy and quality gates.** Read and follow it for all implementation,
  refactoring, and test-related work — it decides which layer a given
  behavior belongs to, what may be mocked, and which gates a change has to
  clear. Update it when architectural or testing assumptions materially
  change; don't restate it here.
- **Never** lower a coverage or mutation-score threshold
  (`web/vitest.config.mts` `test.coverage.thresholds`,
  `web/stryker.config.mjs` `thresholds.break`) to make CI pass. If a
  legitimate change makes a threshold unreachable, that's a design problem —
  redesign the code/tests, or raise it with the user; don't quietly relax the
  gate.
- **Never** add `/* v8 ignore */`, `// Stryker disable`, `.skip`, or an
  ESLint/TS suppression to make a check pass without first understanding
  *why* it's failing and confirming the suppression is legitimate (see
  [design-decisions.md#why-mutation-testing-is-scoped-to-a-handful-of-files](docs/explanation/design-decisions.md#why-mutation-testing-is-scoped-to-a-handful-of-files)
  for the one place this pattern is already deliberately used).
- **No test gaming.** Coverage and mutation score must reflect real
  assertions on real behavior — never write a test just to touch a line, add
  a meaningless branch to dodge a mutant, or exclude a file to avoid dealing
  with it. A green metric that doesn't correspond to real confidence is worse
  than a documented gap.

### 2. Database changes: local-first, RLS is load-bearing

RLS (`supabase/migrations/0006_policies.sql` and its extensions) is the
**only** authorization boundary in this app — there is no server to fall back
on. This project's history includes several real RLS-correctness bugs
(#292, #387, #335, #290, #386), so treat every policy change as
security-critical, not routine SQL.

- Write and run migrations against the **local** stack only
  (`supabase start`, `supabase db reset`, `supabase migration ...`).
  **Never** run a migration, `supabase db push`, or any destructive SQL
  against a staging or production project/database — those need
  `SUPABASE_DB_URL`/`SUPABASE_ACCESS_TOKEN` secrets this session should not
  have reason to use, and pushing schema changes to `main` is what
  `pages-deploy.yml`'s `migrate` job does, deliberately, in CI.
- Any change to `supabase/migrations/**` — new policy, changed policy, new
  grant, new trigger touching auth/ownership — **must** be called out
  explicitly in the commit message and PR description as a security-relevant
  change, with a one-line explanation of what it now allows or denies.
- Never treat a client-side check ("only show the delete button if...") as
  authorization. It's UX. The RLS policy is the real check, and any new
  query needs to be covered by one.
- Don't touch `storage.objects` DDL — hosted Supabase doesn't grant `postgres`
  ownership of it; policies are fine, `CREATE INDEX`/schema changes are not
  and will fail with `42501` (this is expected, not a bug to work around).
- Squashing migrations again is a deliberate, rare act with a verification
  procedure (see [developer-guide.md#squashing-migrations-again](docs/how-to/developer-guide.md#squashing-migrations-again))
  — never squash as a side effect of an unrelated change.

### 3. Git, branches, CI

- Never commit directly to `main` (the pre-commit hook `no-commit-to-branch`
  already blocks this locally — don't bypass it with `--no-verify`).
- Never skip hooks (`--no-verify`), force-push over someone else's commits,
  or rewrite history on a branch you don't own.
- Never modify `.github/workflows/**`, repository secrets, branch protection,
  or `.pre-commit-config.yaml`'s security hooks (`zizmor`, `detect-private-key`)
  without the user explicitly asking for that change.
- Never run `npm audit fix --force` or a from-scratch
  `rm -rf node_modules package-lock.json && npm install` in `web/` — both
  have concretely made the dependency tree *worse* on this project (see
  [design-decisions.md#npm-audit-whats-overridden-and-whats-accepted-risk-issue-191](docs/explanation/design-decisions.md#npm-audit-whats-overridden-and-whats-accepted-risk-issue-191)).
  Use targeted `overrides` entries instead.

### 4. Secrets and environment

- Never write real Google OAuth credentials, Supabase service-role keys, or
  `SUPABASE_DB_URL`/`SUPABASE_ACCESS_TOKEN` values into code, commits, docs,
  or chat output — not even "as an example". `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  is the one credential that's fine to see in the client bundle and docs by
  design; nothing else is.
- `web/.env.local` is local-only and gitignored — never add real secrets to
  `web/.env.example`, which stays placeholder values.
- `service_role` must never be used from client code or shipped in the
  static export; it exists only in CI workflow secrets for specific
  server-side jobs (`pages-deploy.yml`, `cleanup-orphaned-photos.yml`).

### 5. i18n

Every user-facing string goes through `t('...')` and must exist in **both**
`web/src/app/i18n/de.json` and `en.json` with the same key. There's an
executable parity test (`web/src/app/i18n/parity.test.ts`) that fails on a
missing or mismatched key — but don't rely on it to catch this after the
fact; add both languages in the same change. German is the default locale.

### 6. Scope-creep guard — settled decisions, don't relitigate silently

[docs/explanation/design-decisions.md](docs/explanation/design-decisions.md)
documents choices that look like they could be "improved" but were made
deliberately, for reasons that took real investigation. Read it before
touching any of the areas below. Do not change these without first flagging
the tradeoff to the user:

- **No public/anonymous share links** — sharing is account-based only
  (RLS can't cheaply authorize an anonymous reader; see the doc).
- **Search is trigram `ILIKE`, not full-text search** — don't reintroduce
  `tsvector`/FTS columns; they were added once, found unused, and dropped.
- **Storage objects are deleted client-side *before* the DB row**, never
  the other way around — reversing the order orphans image files with no
  way to find them again. There is deliberately no DB-side cleanup trigger
  for `storage.objects` (Supabase forbids deleting from it outside the
  Storage API).
- **Mutation testing (Stryker) is deliberately scoped** to the specific pure
  functions listed in design-decisions.md, not the whole `src/app` tree.
  Don't widen `stryker.config.mjs`'s scope without reproducing the
  reasoning (mutating JSX/Tailwind strings produces thousands of
  meaningless mutants).
- **The coverage floor is raised by hand** (`autoUpdate: false`) and never
  auto-ratcheted — that was tried and reverted because it made local-green
  runs produce red PRs.
- **`delete_item_if_orphan()` runs `FOR EACH STATEMENT`, not `FOR EACH
  ROW`** — the row-level version was a real O(n) performance bug at
  category-deletion scale; don't revert it for "simplicity".
- Don't recreate a `public.profiles` table — it existed pre-squash, was
  never populated or queried, and was dropped as dead weight.

If a task seems to require reversing one of these, say so explicitly and
explain why, rather than quietly doing it.

## Engineering Principles

Apply these across the codebase — TypeScript/React in `web/`, SQL in
`supabase/migrations/`, workflows, and docs alike. Three meta-rules sit above
all the others:

1. **Measure, don't assume.** Performance, coverage, mutation score,
   complexity, and bundle size are things to run a tool and read a number
   for — not to estimate from how the code "feels".
2. **Every line has to earn its place.** Code, dependencies, abstractions,
   and config all need a concrete, present-tense reason to exist.
3. **Preserve existing behavior**, unless a change to it is explicitly what
   was asked for. An unrequested behavior change hidden inside a refactor is
   a bug, not a bonus.

And the rest:

- **Security by design** — think about RLS/auth/input handling while
  writing the code, not as a pass afterward.
- **Performance by design** — pick a reasonable approach up front (e.g. an
  index-friendly query, a set-based SQL statement) rather than shipping an
  O(n²)/one-row-at-a-time version and optimizing later.
- **Clean code by design** — leave code in the state you'd want to find it,
  not the state a later cleanup pass would fix.
- **Caveman mode** — prefer the simplest solution that fully and reliably
  solves the actual problem. No unnecessary cleverness or magic.
- **Keep files small** — aim to stay under ~350 lines; split when a file is
  growing past what one concern justifies.
- **Maximize test coverage** — and when high coverage is hard to reach,
  that's usually a sign the design needs to change (extract the pure logic),
  not that the tests should be forced.
- **Maximize mutation score** — same principle: a mutant that's hard to kill
  usually means the code or test needs redesigning, not a Stryker exclusion.
- **No outdated/unmaintained dependencies** — don't add or keep a
  dependency that's deprecated, unmaintained, or clearly stale.
- **Minimal dependencies** — every added dependency needs clear value over
  the standard library / what's already in the project.
- **YAGNI / no speculative engineering** — don't build for a requirement
  that doesn't exist yet. No "for later" abstractions.
- **Simplicity over cleverness** — obvious, readable code beats a clever or
  over-abstracted version of the same behavior.
- **Redesign instead of workaround** — when security, performance,
  testability, maintainability, or complexity is the actual problem,
  question the design rather than stacking a workaround on it.
- **Fail fast, no silent failures** — surface errors early and clearly;
  never swallow them.
- **Least privilege & secure defaults** — minimal grants/permissions;
  never make an insecure configuration the default.
- **No dead code** — remove unused code, imports, config, abstractions, and
  dependencies as you find them, don't leave them "just in case".
- **Smallest necessary change** — no unrequested large-scale rewrites; change
  only what the goal actually requires.
- **Behavior over implementation in tests** — assert real behavior and
  meaningful edge cases, not implementation details that just mirror the code.
- **No test gaming** — don't manipulate coverage or mutation score with
  meaningless tests, artificial branches, or exclusions; the metrics should
  reflect real quality.
- **Comments:**
  Keep comments to a minimum. Add a comment only when it explains something
  that is not reasonably obvious from the code itself, such as a non-obvious
  constraint, workaround, invariant, or important external behavior.
  Do not add comments merely to document implementation decisions, restate
  what the code does, narrate obvious logic, or explain routine changes.
  Prefer clear naming and simple code over explanatory comments.
  Preserve existing comments unless they are incorrect, obsolete, or
  misleading. Remove comments that no longer provide meaningful context.
- **Ui changes:** Always need a e2e test
- **Functional changes:** Always need a unit test

## Quick Architecture Reference

For anything beyond this summary, read
[docs/reference/architecture.md](docs/reference/architecture.md) and
[docs/explanation/design-decisions.md](docs/explanation/design-decisions.md)
first — both explain *why*, not just *what*.

- Tables: `categories`, `items`, `item_categories`, `category_shares`,
  `images` — see [architecture.md#tables](docs/reference/architecture.md#tables).
- Every table's RLS predicate is `user_id = (select auth.uid())`, extended
  for `category_shares` grants where applicable.
- `anon` has both RLS denial *and* explicit revoked grants (defense in
  depth, not redundancy — don't remove either).
- Photos: `item-images` Storage bucket, 5 MiB/file limit,
  `image/webp`/`image/jpeg`/`image/png` only; WebP compression happens in
  the browser before upload.
- Weekly `cleanup-orphaned-photos.yml` sweeps Storage objects a crashed
  client-side delete left behind (48h grace period).

## Documentation Sync

If a change affects local setup, the pre-PR checklist, architecture,
configuration, or a design decision, update the relevant file in `docs/`
(and `CONTRIBUTING.md`/`README.md` if applicable) in the same change — don't
let docs drift from what the code actually does.
