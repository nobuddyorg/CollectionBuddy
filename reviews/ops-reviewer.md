# Ops review

Reviewer: `ops-reviewer`. Scope: the whole repository at commit `f6a4b91` (2026-09-24); vendored, generated and third-party code skipped (`web/node_modules`, `web/package-lock.json`, `web/src/app/data/database.types.ts`, binary assets, build output). Read-only: no source file was modified.

Method: 2 scoped lens reviewers (`cicd`, `runtime-ops`) read their scope in full, a consolidation pass merged and spot-checked their findings, and adversarial verifiers re-checked every critical and high finding (two independent skeptics: `trace` and `context`) and every medium finding (`batch`). Low and info findings were not agent-verified. The lead reviewer's cross-dimension disposition of each finding is in [REVIEW.md](../REVIEW.md).

Findings: 20 (0 critical, 2 high, 10 medium, 7 low, 1 info).

## Summary

The deploy pipeline is well built on its own terms. Jobs run strictly in order (migrate, then schema-cache reload, build, deploy and a live smoke test), with least-privilege permissions. Actions are pinned by SHA, and one Supabase CLI version is shared by CI and the production `db push`. The orphan sweep keeps the three invariants CLAUDE.md requires. The biggest risk is that production is changed with no safety net. Every push to main migrates and publishes production in parallel with CI rather than after it passes on the same SHA; branches are not required to be up to date, so a merged tree that no CI run has tested can reach production (verified: commit 498b27c deployed at 07:15Z, its CI verdict came about 15 minutes later). On top of that, there is no database or Storage backup on the Free plan (confirmed: `automaticBackups: free: false`). A migration that deletes data by mistake, combined with the daily service_role sweep, would therefore cause permanent loss. Rollback is also blocked mechanically: reverting a migration file makes `supabase db push` fail with ErrMissingLocal, verified in CLI v2.110.0 source. The medium findings add further gaps. Production-writing jobs run from any branch with no environment gate. Hosted Auth settings, which are the only control against invite takeover, are never checked. The legacy anon/service_role keys that Supabase deprecates by the end of 2026 are still wired in. The service worker serves stale HTML after deploys, whose lazy-loaded chunks then 404. Per-owner quotas exceed the whole Free-plan allowance, and nothing monitors or alerts. Most fixes touch `.github/workflows/**`, which under CLAUDE.md needs the user's explicit request.

## Findings

| ID | Severity | Title | Location | Verification | Lead review |
| --- | --- | --- | --- | --- | --- |
| [OPS-01](#ops-01) | High | Production migrate and deploy run on every push to main without waiting for CI on the same SHA; merged trees that no CI run tested reach production | `.github/workflows/pages-deploy.yml:3` +3 | trace: confirmed (high); context: partially confirmed (medium) | see REVIEW.md |
| [OPS-02](#ops-02) | High | No database or Storage backup for a Free-plan production project that is migrated unattended on every merge and swept daily by an irreversible service_role delete | `.github/workflows/pages-deploy.yml:34` +4 | trace: confirmed (high); context: confirmed (high) | see REVIEW.md |
| [OPS-03](#ops-03) | Medium | No rollback path: reverting a deployed migration makes `supabase db push` fail forever, re-running an old deploy fails the same way, and no rule requires migrations to stay compatible with the bundle already serving | `.github/workflows/pages-deploy.yml:35` +3 | batch: confirmed (medium) | see REVIEW.md |
| [OPS-04](#ops-04) | Medium | Jobs that write to production have no environment or branch gate: `workflow_dispatch` from any branch applies that branch's migrations, or runs its version of the sweep, against production | `.github/workflows/pages-deploy.yml:6` +4 | batch: partially confirmed (medium) | see REVIEW.md |
| [OPS-05](#ops-05) | Medium | The daily service_role orphan sweep has no automated safeguard: its query has no test and is not tied to the `images` schema, and nothing stops a mass deletion | `.github/workflows/cleanup-orphaned-photos.yml:27` +4 | batch: partially confirmed (medium) | see REVIEW.md |
| [OPS-06](#ops-06) | Medium | The hosted Auth settings that are the only control against pending-invite takeover live only in the dashboard, are never checked, and are missing from the new-environment runbook | `supabase/config.toml:56` +3 | batch: partially confirmed (low) | see REVIEW.md |
| [OPS-07](#ops-07) | Medium | Production still depends on the legacy anon and service_role JWT keys, which Supabase is deprecating by the end of 2026; there is no rotation runbook and nothing checks the key baked into the bundle | `.github/workflows/cleanup-orphaned-photos.yml:91` +4 | batch: partially confirmed (medium) | see REVIEW.md |
| [OPS-08](#ops-08) | Medium | The service worker serves the previous build's HTML after every deploy: lazily loaded chunks of that build 404 on Pages, there is no error boundary, and the cache never shrinks | `web/public/sw.js:18` +7 | batch: confirmed (medium) | see REVIEW.md |
| [OPS-09](#ops-09) | Medium | The CI path filter skips every test job for changes to the deploy path's own inputs (composite actions pinning the Supabase CLI and Node, supabase/config.toml, .semgrepignore), and the docs claim it covers `supabase/**` | `.github/workflows/ci.yml:50` +3 | batch: partially confirmed (low) | see REVIEW.md |
| [OPS-10](#ops-10) | Medium | The premise behind auto-merge, that 'a devDependency reaches the CI runner', does not hold: devDependencies are installed, with their install scripts, and run in the job that builds the production artifact | `.github/workflows/auto-merge.yml:25` +5 | batch: confirmed (medium) | see REVIEW.md |
| [OPS-11](#ops-11) | Medium | Each per-owner quota is at or above the whole Free-plan allowance, so a single account can push the project over quota for everyone | `supabase/migrations/0009_user_quotas.sql:39` +3 | batch: confirmed (medium) | see REVIEW.md |
| [OPS-12](#ops-12) | Medium | No monitoring or alerting in production: client errors go only to the browser console, deploy and scheduled-job failures only to GitHub's default email, and keep-alive stops after 60 idle days | `web/src/app/components/Toast/ToastProvider.tsx:113` +3 | batch: partially confirmed (low) | see REVIEW.md |
| [OPS-13](#ops-13) | Low | Auto-merged Dependabot commits trigger neither main CI nor Deploy Pages, because the merge is performed with GITHUB_TOKEN | `.github/workflows/auto-merge.yml:32` +2 | not agent-verified (low/info) | see REVIEW.md |
| [OPS-14](#ops-14) | Low | Dependabot never updates the actions pinned inside the composite actions | `.github/dependabot.yml:4` +3 | not agent-verified (low/info) | see REVIEW.md |
| [OPS-15](#ops-15) | Low | Some CI tooling floats unpinned or unverified: the Opengrep installer is piped from `main` without a signature check, prek runs at `latest`, the ZAP image at `stable`, and Opengrep rules are fetched live with `--config auto` | `.github/workflows/ci.yml:292` +3 | not agent-verified (low/info) | see REVIEW.md |
| [OPS-16](#ops-16) | Low | 15 of 16 jobs have no `timeout-minutes`, and the curl calls to Supabase have no `--max-time` | `.github/workflows/pages-deploy.yml:19` +3 | not agent-verified (low/info) | see REVIEW.md |
| [OPS-17](#ops-17) | Low | Migration identity is a hand-picked 4-digit number that is reused after squashes; the CLI matches on version only, and the squash runbook's manual SQL step on production has no instruction to pause deploys | `docs/how-to/developer-guide.md:350` +2 | not agent-verified (low/info) | see REVIEW.md |
| [OPS-18](#ops-18) | Low | A ci.yml comment says the prek job does secret scanning, but in CI the gitleaks hook scans only staged changes and so scans nothing | `.github/workflows/ci.yml:13` +2 | not agent-verified (low/info) | see REVIEW.md |
| [OPS-19](#ops-19) | Low | Fork and new-environment setup has drifted: wrong file references, an incomplete fork rename, a `supabase link` recipe the repo itself says fails, a broken `npm start`, CODECOV_TOKEN missing from the secrets table, and a build_and_test job that fork PRs can never pass | `docs/how-to/developer-guide.md:409` +6 | not agent-verified (low/info) | see REVIEW.md |
| [OPS-20](#ops-20) | Info | CI repeats heavy setup: seven `next build`s per main push, uncached Playwright browsers and Supabase images, and no `concurrency` group on ci.yml | `.github/workflows/ci.yml:77` +2 | not agent-verified (low/info) | see REVIEW.md |

### OPS-01

High: **Production migrate and deploy run on every push to main without waiting for CI on the same SHA; merged trees that no CI run tested reach production**

- Category: deploy-safety
- Location: `.github/workflows/pages-deploy.yml:3`, `.github/workflows/pages-deploy.yml:19`, `.github/workflows/ci.yml:27`, `TEST_STRATEGY.md:623`
- Confidence: high; reported by lens `cicd`, `runtime-ops`
- Verification: trace: confirmed (high); context: partially confirmed (medium)

**Description.** CI and Deploy Pages are sibling workflows triggered by the same push. `migrate` applies forward-only migrations to the production database, then `build` and `deploy` publish, all while CI's full main run is still in progress. A red main run can neither stop this nor undo it. PR CI tests the merge ref from its last run. Branches are not required to be up to date: the three merges above show it. Path-filtered jobs can also be skipped on the PR (OPS-09). As a result, the exact tree that gets deployed often has no passing CI run before production sees it. TEST_STRATEGY §13 item 3 is implemented as a report after the fact, not as a gate.

**Impact.** PR A drops or renames a column in migration 00NN. PR B was tested against the old main and adds UI code that writes that column. Both merge without an update. About 4 minutes later pages-deploy has migrated production and published B's bundle, and every save fails with PGRST204 or a constraint error. The signed-out smoke test passes because it never writes. Main CI's e2e_local_stack turns red about 15 minutes later, after production is already broken. The rollback path is blocked as well (OPS-03).

**Recommendation.** Deploy only after CI passes on the same SHA. Option 1: trigger pages-deploy with `on: workflow_run: {workflows: [CI], types: [completed], branches: [main]}`, add `if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'`, and check out `github.event.workflow_run.head_sha`. Option 2: move migrate, build and deploy into ci.yml as jobs that `needs:` every gate, conditioned on a push to main. Option 3: enable a merge queue or 'require branches to be up to date', with the stack jobs required. Workflow edits need the user's explicit request (CLAUDE.md).

Evidence:

```text
pages-deploy.yml:3-6 `on:\n  push:\n    branches: [ main ]\n  workflow_dispatch:`. There is no `workflow_run` or `needs` link to ci.yml. ci.yml:27 `# A push to main forces every job: it is the event that deploys, and a squash-merge may combine unrelated changes.` TEST_STRATEGY.md:623 `Full, unconditional set on the branch that deploys`. Re-verified from git: commit 498b27c (PR #655) has parents 325bbb7 and dbcdfec. `git merge-base 325bbb7 dbcdfec` gives 35f0d4a, but main had already moved through f894650 (#657, also based on 35f0d4a) and 325bbb7, and both #657 and #655 rewrote web/package-lock.json. The three merges landed at 09:11:16, 09:11:19 and 09:11:22 +0200. GitHub API: Deploy Pages run 34816693110 on 498b27c was created 07:11:27Z and completed as success at 07:15:34Z. The cicd lens reports main's CI run on the same SHA completing at 07:30:57Z.
```

<details>
<summary>Verifier notes</summary>

- `trace` (confirmed, high): I could not refute the mechanism. The repository history and the GitHub API both show it happening. 1. Two independent workflows run on the same push. pages-deploy.yml:3-6 is `on: push: branches: [ main ]` plus `workflow_dispatch`. It has no `workflow_run` trigger, and no job in it depends on ci.yml. ci.yml:3-7 also runs on `push: branches: [ main ]`. According to the GitHub docs, one workflow waits for another only through `workflow_run`. As a result, `migrate` (a forward-only `supabase db push` to production, lines 19-51), then `build` and `deploy`, all run while main's CI run on the same SHA is still in progress. A failing main CI run can neither stop that deploy nor undo it. 2. A merged tree that no CI run had tested reached production (checked through the GitHub API). - PR #655 (head dbcdfec, base 35f0d4a) last ran PR CI at 2026-09-13T17:31Z (run 34771832598). That run tested the merge ref against 35f0d4a. - The PR was merged at 2026-09-14T07:11:22Z by besessener onto 325bbb7. By then main already contained #670, #672, #657 (which also rewrote web/package-lock.json from the same base 35f0d4a) and #656. - `git merge-base 325bbb7 dbcdfec` returns 35f0d4a. The three merges are 3 s apart (09:11:16, :19 and :22 +0200). - Deploy Pages run 34816693110 on 498b27c started at 07:11:27Z and finished as success at 07:15:34Z. CI run 34816693295 on the same SHA finished at 07:30:57Z, 15 minutes after production was already migrated and published. 3. SHAs whose main CI failed were deployed anyway. I found four cases the reviewer did not cite, each with a successful Deploy Pages run: - cbc504c (patch-updates in /web): deploy succeeded at 14:44:58Z; e2e_local_stack "Run the signed-in end-to-end suite" failed at 14:46:16Z. - 22025ad: deploy succeeded at 11:06:13Z; signed-in e2e failed at 11:07:59Z. - 42b6892: deploy succeeded at 17:33:59Z; signed-in e2e failed at 17:35:36Z. - 126198a: deploy succeeded; mutation_test failed. Later main runs were green without a fix, so these failures look like flakes rather than production outages. They still show that a red main run arrives after production has already changed. 4. Branch protection does not close the gap. The public branch endpoint shows the required checks as build_and_test, e2e_local_stack, prek and mutation_test, with `enforcement_level: non_admins`, so admins bypass them. The strict ("require up to date") flag could not be read (403). The stale merges above show that either the checks are loose or they were bypassed. The GitHub docs describe exactly this risk for loose checks. 5. This is not a documented decision. design-decisions.md and architecture.md say nothing about deploying in parallel with CI. ci.yml:27 says main forces a full run because "it is the event that deploys, and a squash-merge may combine unrelated changes". That comment names the risk, but the full run cannot gate the deploy it runs beside. TEST_STRATEGY.md:623 ("Full, unconditional set on the branch that deploys") is therefore only a report after the fact. The reviewer's impact scenario (one PR's migration plus another stale PR's UI code) was not observed in the history. Mechanically, though, it is sound. The post-deploy smoke test is signed-out only (pages-deploy.yml:92, "signed-out keeps the run read-only"), so a broken signed-in write path would pass it. Severity stays high. The rubric's "a deploy/migration path that can break production" fits: production migrations and bundles ship from trees that no CI run tested, and stale merges are routine here. It sits at the lower end of high because breakage also needs a semantic conflict or an admin bypass, it is recoverable by fixing forward, and no real outage is on record. Line references are accurate: pages-deploy.yml:3 (`on:`), :19 (`migrate:`), ci.yml:27 (the comment), TEST_STRATEGY.md:623. Mitigations: These mitigations exist, but none of them waits for CI on the SHA that gets deployed: - Required PR checks (build_and_test, e2e_local_stack, prek, mutation_test). Admins bypass them (enforcement non_admins), and they test a merge ref that goes stale when main moves on. - The migrate -> build -> deploy -> smoke_test chain in pages-deploy.yml. A rejected migration or a failed build leaves the previous bundle live. - Each migration runs in its own transaction. - A post-deploy smoke test against the live site. It is signed-out only, so broken signed-in writes pass it. - The concurrency group cancels superseded deploys. - developer-guide.md tells contributors to test migrations on seeded data. A real fix needs one of: a workflow_run gate with conclusion == 'success' that checks out head_sha; deploy jobs inside ci.yml that `needs:` every gate; or a merge queue or strict up-to-date checks enforced for admins too. CLAUDE.md requires the user's explicit request before editing .github/workflows/\*\* or branch protection.
- `context` (partially confirmed, medium): The mechanism is real and I confirmed it. Deploy Pages and CI are sibling workflows started by the same push. Nothing links them: there is no `workflow_run`, `merge_group` or cross-workflow `needs`. Production is migrated and published about 3-4 minutes after a merge, while main's full CI run takes 15-25 minutes. A red main run cannot stop a deploy or undo one. This has happened in practice, which is stronger than the reviewer's evidence: - Three SHAs deployed successfully and then got a red main CI: 1d159dd, 18b3356 and 5bc12f5. - One merged tree, 498b27c, was deployed without ever being tested as merged. It is narrower than described, for these reasons: 1. There is a PR gate. The public branch API shows branch protection on main requires build_and_test, e2e_local_stack, prek and mutation_test. TEST_STRATEGY §13.6 makes the PR gate the intended pre-deploy gate: "No staging means a heavier PR gate". 2. Untested trees are not "often" deployed. Of the last 12 merge commits on main, the 9 most recent (#674 to #729) were up to date with main when merged. So the deployed tree matched the PR merge ref that the required checks tested. All three stale merges were one Dependabot batch merged within 6 seconds on 2026-09-14 (#657, #656, #655). 3. Path filtering is not a real gap for the schema/UI race. e2e_local_stack runs when either `web` or `sql` changes (ci.yml:158). A migration-only PR still runs the signed-in journeys against the current bundle. 4. The observed red-after-deploy runs look like flakes or infrastructure trouble, not shipped defects. 18b3356 changed only docs (TEST_STRATEGY rewrite) and its parent's CI was green. 5bc12f5 failed at ZAP's "Start Supabase" step. I found no evidence of a production incident. 5. The deploy chain fails safe on a rejected migration (pages-deploy.yml:17, `needs:` chain). Migrations are also exercised from scratch in their own PR's e2e_local_stack. One aggravating factor the reviewer missed: the protection's `enforcement_level` is `non_admins`. The maintainer who merges every PR (besessener) can therefore bypass the required checks entirely, and pages-deploy would ship the result regardless. What remains is a real gap in the gate. A semantic conflict between two PRs merged close together without an update, or an admin bypass, reaches production with no pre-deploy gate. That needs a specific extra condition. Rollback is a revert plus a roughly 4-minute redeploy, except for forward-only migrations. This is operational risk with a workaround (a merge queue, "require up to date", or workflow_run gating), so medium fits better than high. The recommendation is technically sound. With `workflow_run`, the default GITHUB_SHA is "Last commit on default branch", so checking out `github.event.workflow_run.head_sha` is required, as the reviewer said. Per CLAUDE.md, workflow edits need the user's explicit request. Mitigations: These narrow the finding but do not neutralize it: - Branch protection requires build_and_test, e2e_local_stack, prek and mutation_test on PRs. Its enforcement is non_admins, so admins can bypass it. - In practice, recent human and Claude PRs are brought up to date before merge, so the deployed tree equals the tested PR merge ref. - e2e_local_stack runs for both web and sql changes, so a schema/UI mismatch inside one PR is caught before merge. - The deploy chain is fail-safe: a rejected migration blocks build and deploy. - The post-deploy signed-out smoke test runs against the live origin. It is read-only and does not catch write-path breakage. Missing pieces: - There is no merge queue. - Nothing shows "require branches to be up to date" is enabled. The stale Dependabot batch shows it is either off or bypassed by an admin. - No deploy gating on CI conclusion exists.

</details>

### OPS-02

High: **No database or Storage backup for a Free-plan production project that is migrated unattended on every merge and swept daily by an irreversible service_role delete**

- Category: backup-restore
- Location: `.github/workflows/pages-deploy.yml:34`, `.github/workflows/cleanup-orphaned-photos.yml:102`, `docs/how-to/developer-guide.md:365`, `docs/how-to/developer-guide.md:404`, `.github/workflows/k6-load-test.yml:23`
- Confidence: high; reported by lens `cicd`, `runtime-ops`
- Verification: trace: confirmed (high); context: confirmed (high)

**Description.** Production data is photos in Storage plus database rows. The pipeline migrates it unattended with no staging, and a daily service_role job deletes Storage objects that no `images` row references. On the Free plan there is no platform backup of the database. On any plan, platform backups never contain Storage objects. There is no scheduled `db dump`, no Storage export, no dump before migrating, and no documented restore. The only copy outside Supabase is the per-category export each user must make by hand, in advance. CI proves only that a migration applies to an empty database, and the populated-data check in developer-guide.md:367-375 is manual.

**Impact.** A future data-changing migration passes CI because CI's tables are empty, for example a cleanup of pre-0020 multi-category links with a predicate that is too broad. `delete_item_if_orphan()` then deletes every item left without a category, and `images` rows cascade with them. 48 hours later the sweep finds the matching Storage objects unreferenced and deletes up to 10,000 per run. There is nothing to restore the rows or the photo bytes from, so every affected user's entries and photos are lost for good. A sweep regression, such as matching only `path_full` (the failure TEST_STRATEGY §12 describes), would do the same to every thumbnail.

**Recommendation.** Choose and document a backup approach. Option A: move to Pro for daily backups or PITR, and still export Storage. Option B: a scheduled `supabase db dump` (roles, schema and data) through the session pooler, encrypted to a public key before upload to private off-site storage. Never keep it as a plain Actions artifact, because this repository is public. Also copy the `item-images` bucket through Storage's S3-compatible API on a schedule, with retention longer than the 48-hour sweep grace period. Add an encrypted dump to `migrate` before `db push` whenever the dry run lists pending migrations. Write a restore runbook in developer-guide.md whose first step is disabling cleanup-orphaned-photos.yml, and rehearse it once.

Evidence:

```text
pages-deploy.yml:34-35 `- name: Apply migrations` / `run: supabase db push --db-url "$SUPABASE_DB_URL"`, with no dump step before it. developer-guide.md:365 `Merge to main applies it to production. Nothing is applied by hand.` The project is on the Free plan: developer-guide.md:436 (`keep-alive.yml stays enabled on a free-tier project`) and k6-load-test.yml:23 (`the production Free-tier project`). Supabase pricing source (https://supabase.com/pricing, from supabase/supabase packages/shared-data/pricing.ts): `key: 'database.automaticBackups' ... free: false`. Supabase backups doc (https://supabase.com/docs/guides/platform/backups, backups.mdx:8,36): `We recommend that free tier plan projects regularly export their data using the Supabase CLI db dump command` and `Database backups do not include objects you store via the Storage API`. `grep -rniE 'backup|restore|pitr|rollback'` over docs/, README.md, CONTRIBUTING.md, CLAUDE.md, TEST_STRATEGY.md and .github finds no backup job or restore procedure (re-run and confirmed). cleanup-orphaned-photos.yml:102-111 bulk-deletes with service_role.
```

<details>
<summary>Verifier notes</summary>

- `trace` (confirmed, high): I could not refute any factual claim in the finding. Every cited location checks out, and so does the platform behaviour it relies on. 1. Production is migrated unattended, and nothing is dumped first. The `migrate` job runs a dry run (pages-deploy.yml:29-30) and then `db push` (lines 34-35). The dry run only prints the pending migrations; it does not gate anything. The job has no `environment:` approval gate, no dump step and no staging. 2. The project is on the Free plan. keep-alive.yml exists only so that a Free-plan project does not pause (architecture.md:155). The docs call it a free-tier project in developer-guide.md:436 and load-testing.md:202, and k6-load-test.yml:23 calls it "the production Free-tier project". 3. The Free plan has no platform backup. Supabase's own backup doc and pricing data say so (see evidence). They also say that on every plan, database backups exclude Storage objects, and that restoring a backup does not bring back objects deleted after it. 4. The repository has no backup or restore procedure. I grepped for backup, restore, pitr, point-in-time, db dump, pg_dump, rollback and disaster across \*.md, \*.yml, \*.sql, \*.ts and \*.sh. The only hits are pgTAP `rollback;` lines and UI undo code. design-decisions.md has no reasoned decision to go without backups. README.md:40 presents export as a guard against lock-in, not as a backup. 5. The amplification chain in the impact section is real in the code: - item_categories has `on delete cascade`, and the statement-level trigger `trg_delete_orphan_items_after_ic_delete` (0004_triggers.sql:36-39) calls `delete_item_if_orphan()` (0002_functions.sql:162-175). That function deletes every item left with no link. - `images.item_id` has `on delete cascade` (0003_tables.sql:64). - The daily sweep then selects Storage objects with no matching images row after 48h (cleanup-orphaned-photos.yml:33-45, `MAX_OBJECTS_PER_RUN=10000`). It bulk-deletes them with service_role (lines 88-111). - Once the images rows are gone, the photo bytes follow within 48 hours. Nothing exists to restore either the rows or the bytes from. 6. CI only proves that migrations apply from scratch (ci.yml:170). The check against populated data is a manual step (developer-guide.md:368-375). Severity: this finding is a missing recovery control, not a defect that destroys data today. Two things point that way: - None of migrations 0008-0020 contain DELETE, UPDATE or TRUNCATE on existing data. - Squawk runs with its default rules, including the bans on dropping tables and columns, and the sweep has three documented invariants plus a dry run that is on by default. So a loss needs one more condition. That condition is plausible, though: - migrations are frequent (20 files, including a reverted one: 193143a); - they are applied on every merge with no staging; - the documented squash procedure runs SQL by hand on the production database (developer-guide.md:396-398); - CI holds `SUPABASE_DB_URL` and a Management API token, so a compromise of any job step that has them could wipe the database. When that one condition occurs, the result is permanent loss of every user's rows and photos. That meets the rubric's "high": realistic data loss needing at most one extra plausible condition. It is not critical, because the loss does not happen in normal operation. Mitigations: These guards make the triggering fault less likely. None of them makes an incident recoverable: - Each migration is one transaction, with `lock_timeout` and `statement_timeout` set (developer-guide.md:350-353). - Squawk runs with its default rules, which ban dropping tables and columns (.squawk.toml; .pre-commit-config.yaml:62-70). It does not catch DML deletes or updates. - CLAUDE.md and developer-guide.md require a manual check of each migration against populated data. This is a human step, not a CI gate. - The migrate job shows a non-gating dry run of pending migrations. - The sweep keeps its three documented invariants: both paths, no uuid cast, and a 48h grace period. Manual runs default to dry run, and each run deletes at most 10,000 objects. - Users get an undo toast when they delete an item or photo. - Users can export a category by hand (user-guide.md:49-55), but only in advance and one category at a time. None of this provides a backup or a restore path.
- `context` (confirmed, high): Every factual claim in OPS-02 checks out. I found nothing that neutralizes it and one detail that makes it worse than stated. 1) Production is on the Free plan, and it holds real users' data. load-testing.md:202 says "The Free tier is shared with real users." k6-load-test.yml:23 calls the target "the production Free-tier project". design-decisions.md:134 and keep-alive.yml (a daily keepalive RPC) say the same. 2) The Free plan has no platform backup of any kind, and no plan backs up Storage. Supabase's own docs and pricing data say so (quoted in evidence). 3) Nothing in the repo takes a backup or documents a restore. pages-deploy.yml:29-35 runs `db push --dry-run` and then `db push`. The dry run only prints the pending migrations and gates nothing, and no dump step exists. A case-insensitive grep for backup|restore|pitr|dump over docs, README, CONTRIBUTING, CLAUDE.md, TEST_STRATEGY.md, .github and supabase finds only pg_dump used as a comparison in design-decisions.md:25 and pgTAP `rollback;` lines. design-decisions.md never discusses backups, so this is not a documented deliberate trade-off. 4) The amplification chain is real: - The statement-level trigger trg_delete_orphan_items_after_ic_delete (0004_triggers.sql:36-39) calls delete_item_if_orphan() (0002_functions.sql:162-174). That function deletes every item left with no item_categories row. - images.item_id is `on delete cascade` (0003_tables.sql:64). - The service_role sweep then deletes Storage objects that no images row references (cleanup-orphaned-photos.yml:30-43 and 102-111), up to 10,000 per run. 5) The Storage exposure is worse than the finding says. The 48h grace period is keyed on `o.created_at < now() - interval '48 hours'` (line 36). That is when the object was uploaded, not when its row disappeared. So after a bad migration or an operator error removes rows, photos uploaded more than 48h ago are deleted at the next daily 04:30 UTC run. The window to notice and disable the workflow is under 24h, not 48h. The recommendation's rationale ("retention longer than the 48-hour sweep grace period") should be restated with that in mind. What narrows likelihood but not impact: - Squawk runs on every migration after 0009 with its default rules on, including the drop-table and drop-column bans. - CLAUDE.md requires a manual populated-data check and a security callout for every migration. - 0020 deliberately left existing multi-collection rows in place ("existing rows are left as they are"). No migration from 0008 to 0020 contains a DELETE, UPDATE or TRUNCATE, only `drop index`. - The sweep has a CLAUDE.md hard rule plus three invariants, and manual runs default to a dry run. - Users can export each category as a ZIP with photos (user-guide.md:49-56, README.md:40). That is a manual, per-category, per-user copy, not a backup the operator can restore from. These controls make the loss conditional on one more fault. That fault is plausible here: - a data-changing migration that a from-scratch CI run cannot catch; - a regression in the sweep query, which TEST_STRATEGY §12 itself calls a "plausible first draft"; - a hand-typed statement in the hosted SQL editor, which the squash procedure already requires (developer-guide.md:393-397); - misuse of SUPABASE_ACCESS_TOKEN, which can run arbitrary SQL through the Management API and sits in three workflows. The project's own risk table classes destructive scheduled-job faults as "Irreversible deletion of live data" (TEST_STRATEGY.md:129). That matches the rubric's "high": realistic, irreversible loss of real users' data behind one plausible condition, on an unattended migration path. It is not critical, because no current code path destroys data in normal operation. Mitigations: Nothing neutralizes the finding. These lower the likelihood only: - Squawk pre-commit hook (.pre-commit-config.yaml:62-70, .squawk.toml) with its default drop-table and drop-column bans, applied to migrations after 0009. - `set local lock_timeout` and `statement_timeout` in each migration. - CLAUDE.md rules for migrations: a new file for each change, a manual populated-data check, and a security callout. There is also a hard rule protecting the sweep's three invariants. - Precedent: 0020 deliberately leaves existing rows alone, and no migration from 0008 to 0020 changes data. - The sweep defaults to a dry run on manual dispatch, fetches service_role only after the dry-run exit, and caps each run at 10,000 objects. - Users can export a category as a ZIP including photos and import it back (user-guide.md:49-56, README.md:40). It is manual, per user and per category, and gives the operator nothing to restore from. Correction to the finding: the sweep's 48h grace period keys on object `created_at`, not on when the row disappeared. Photos older than 48h are deleted at the next daily 04:30 UTC run after their rows are lost, so the recovery window is under 24h. A restore runbook's first step, disabling cleanup-orphaned-photos.yml, has to happen within that window.

</details>

### OPS-03

Medium: **No rollback path: reverting a deployed migration makes `supabase db push` fail forever, re-running an old deploy fails the same way, and no rule requires migrations to stay compatible with the bundle already serving**

- Category: incident-readiness
- Location: `.github/workflows/pages-deploy.yml:35`, `.github/workflows/pages-deploy.yml:17`, `docs/how-to/developer-guide.md:348`, `docs/how-to/developer-guide.md:417`
- Confidence: high; reported by lens `cicd`, `runtime-ops`
- Verification: batch: confirmed (medium)

**Description.** The obvious incident response is GitHub's Revert on the PR that broke production. If that PR added a migration, the revert deletes the migration file, and every later `migrate` run fails with ErrMissingLocal. build and deploy never run, and the broken bundle keeps serving. Re-running an older successful Deploy Pages run fails the same way, because that commit lacks the newer version. Separately, applying the schema before the bundle means the previous bundle runs against the new schema: for about 1.5 minutes per deploy, and indefinitely in stale tabs or service-worker-cached shells (OPS-08). Yet no expand/contract rule says a migration must keep the previous bundle working.

**Impact.** Migration 00NN ships together with a UI change, and signed-in writes break. The maintainer reverts the PR, but `migrate` fails on every push and the broken bundle stays live. Recovery then needs either a forward-fix migration written under pressure or `supabase migration repair` run by hand against production, which no runbook describes and which CLAUDE.md forbids agents from doing. A contracting migration (drop or rename) merged together with its client change breaks every open tab still running the old bundle.

**Recommendation.** Add a 'Roll back a bad deploy' section to developer-guide.md. Make fix-forward the default. To revert, revert app code only, keep the migration file, and add a compensating migration. State that re-running an old deploy is expected to fail at `migrate`. Say when and how a human runs `supabase migration repair --status reverted <version>`. Add an expand/contract rule to 'Change the database schema': each migration must work with the currently deployed bundle, and destructive steps ship in a later PR. Optionally add a main-only `workflow_dispatch` input that skips `migrate` to redeploy a known-good bundle.

Evidence:

```text
pages-deploy.yml:34-35 runs `supabase db push`, and build needs migrate (line 54). Supabase CLI v2.110.0 apps/cli-go/pkg/migration/apply.go (fetched and read: https://github.com/supabase/cli/blob/v2.110.0/apps/cli-go/pkg/migration/apply.go): `ErrMissingLocal  = errors.New("Remote migration versions not found in local migrations directory.")` and `if j == len(localMigrations) { missing = append(missing, remoteMigrations[i:]...) } if len(missing) > 0 { return missing, errors.New(ErrMissingLocal) }`. pages-deploy.yml:17 justifies the database-first order only for additive changes: `a bundle referencing a column that does not exist yet is rejected by PostgREST`. developer-guide.md:348-382 ('Change the database schema') and 417-424 ('Deploy to GitHub Pages') describe only the forward path. A grep for rollback, revert, backward or compatib across docs/ finds nothing.
```

<details>
<summary>Verifier notes</summary>

- `batch` (confirmed, medium): The mechanism holds against the pinned CLI. `.github/actions/setup-supabase-cli/action.yml` pins `version: 2.110.0`. In that version `db push` calls `up.GetPendingMigrations` before it checks for a dry run, and that calls `FindPendingMigrations`. That function returns `ErrMissingLocal` whenever the remote history lists a version the checkout lacks. So if a PR that added a migration is reverted, the first `migrate` step already fails (the `--dry-run` 'Show pending migrations' step at pages-deploy.yml:29-30). `build` has `needs: migrate` (line 54), so the revert never deploys. Re-running an older successful run fails the same way: a workflow run keeps its original commit, which lacks the newer version. The docs describe only the forward path. The only related material is the squash procedure, which deletes `schema_migrations` rows by hand, and `migration repair --status applied` for new environments. There is no rollback, revert or expand/contract guidance: a grep of docs/, CONTRIBUTING.md, README.md and CLAUDE.md for rollback, revert, backward or compatib finds only unrelated hits. Two minor overstatements. First, 'fails forever' means until someone restores the file or repairs the history, and the CLI's own error output names the repair command. Second, the service worker serves navigations stale-while-revalidate, so an old shell lags by one navigation, not indefinitely. Old code keeps running indefinitely only in tabs that stay open. This is a recovery-path gap with a workaround, not a path that breaks production by itself, so it stays medium. Mitigations: Partial only. The CLI error prints the `migration repair --status reverted <version>` hint (up.go:55-57). Restoring the reverted migration file, meaning reverting app code only, unblocks `migrate` at once. The squash section of developer-guide.md already explains how `schema_migrations` gates `db push`. The project writes every migration forward-only ('Never edit an existing migration'). Past migrations used `not valid` so they could not fail the unattended deploy (design-decisions.md:40). The service worker revalidates navigations in the background, so a cached shell refreshes on the next load. No runbook exists for rollback, and no rule requires compatibility with the previous bundle.

</details>

### OPS-04

Medium: **Jobs that write to production have no environment or branch gate: `workflow_dispatch` from any branch applies that branch's migrations, or runs its version of the sweep, against production**

- Category: secrets-and-access
- Location: `.github/workflows/pages-deploy.yml:6`, `.github/workflows/pages-deploy.yml:19`, `.github/workflows/pages-deploy.yml:83`, `.github/workflows/cleanup-orphaned-photos.yml:7`, `docs/reference/configuration.md:29`
- Confidence: medium; reported by lens `cicd`, `runtime-ops`
- Verification: batch: partially confirmed (medium)

**Description.** The platform control that confines production credentials to main is environment protection: a deployment-branch policy plus environment-scoped secrets. Here the production DB URL and the Management API token are repository secrets, used by jobs with no environment. Any dispatch of these workflows on any ref by anyone or anything with write access gets them.

**Impact.** Deploy Pages is dispatched on a feature branch, which is a routine action in this repository. `migrate` applies that branch's unreviewed 00NN to production. `deploy` may then be refused, so production runs a schema ahead of its bundle. If the file is later renumbered or edited before merge, every main deploy fails with ErrMissingLocal (OPS-03) until someone repairs the migration history by hand. An unticked cleanup dispatch from a branch with an edited query deletes objects irreversibly.

**Recommendation.** Create a `production` environment limited to `main` and move SUPABASE_DB_URL, SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF into it as environment secrets. Put `environment: production` on `migrate` and `cleanup`, and add `if: github.ref == 'refs/heads/main'`. Confirm that github-pages has a rule allowing only the default branch.

Evidence:

```text
pages-deploy.yml:6 `workflow_dispatch:` has no branch guard. The `migrate` job (lines 19-51) has no `environment:` and no `if:` on the ref, and reads repository-level `secrets.SUPABASE_DB_URL` and `secrets.SUPABASE_ACCESS_TOKEN`. Only `deploy` (lines 83-84) has `environment: name: github-pages`. cleanup-orphaned-photos.yml:7-12 `workflow_dispatch: inputs: dry_run: ... default: true` also has no environment and no ref check. With the box unticked, a dispatch from a branch runs that branch's query and fetches service_role (lines 88-91). GitHub Pages docs (https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site): 'We recommend that you add a deployment protection rule so that only the default branch can deploy to this environment'. Any such rule applies only to `deploy`, after `migrate` has already run. The cicd lens reports that 23 of the last 25 k6-load-test runs were dispatched from a `claude/*` branch.
```

<details>
<summary>Verifier notes</summary>

- `batch` (partially confirmed, medium): The platform mechanism is confirmed. GitHub runs a `workflow_dispatch` on the chosen ref, using that ref's last commit and its workflow file, and dispatching needs only write access. `migrate` has no `environment:` and no `if:` on the ref. It consumes `SUPABASE_DB_URL` and `SUPABASE_ACCESS_TOKEN`. Those secrets are not environment-scoped: the push-triggered deploys succeed (run 296, 2026-09-24) even though `migrate` references no environment. So a dispatch of Deploy Pages from any branch pushes that branch's migrations to production before the `github-pages` environment rule, if one exists, can stop `deploy`. The same holds for cleanup-orphaned-photos.yml with dry_run unticked. The finding's likelihood claim is overstated. Deploy Pages has never been dispatched: `list_workflow_runs` with event=workflow_dispatch returns total_count 0 out of 296 runs. The cleanup workflow was dispatched once, from `main`. The 23 k6 dispatches from `claude/*` branches (confirmed: runs 3-25) were made by the maintainer, and they target the throwaway local stack, not production. So dispatching a production-writing workflow from a branch is not routine here. The gap is a real defense-in-depth weakness, and it needs one plausible extra condition: a writer or an agent picking a branch in the Run workflow dropdown or `--ref`. Agents constantly create `claude/*` branches in this repository. Note also that anyone with write access can already read repository secrets by pushing a new workflow on a branch. Environment-scoped secrets with a branch policy close that too, which strengthens the recommendation. Mitigations: Only users or apps with write access can dispatch. The Run workflow UI defaults to the default branch. The cleanup dispatch defaults to `dry_run: true`, and the dry run exits before `service_role` is fetched (cleanup-orphaned-photos.yml:78-85). CLAUDE.md forbids agents from running SQL against the hosted project and from modifying workflows. Deploy Pages has never been dispatched, per run history. No platform control (environment branch policy or ref check) stops `migrate` or `cleanup` on a non-main ref.

</details>

### OPS-05

Medium: **The daily service_role orphan sweep has no automated safeguard: its query has no test and is not tied to the `images` schema, and nothing stops a mass deletion**

- Category: scheduled-job-safety
- Location: `.github/workflows/cleanup-orphaned-photos.yml:27`, `.github/workflows/cleanup-orphaned-photos.yml:49`, `.github/workflows/cleanup-orphaned-photos.yml:78`, `.github/workflows/cleanup-orphaned-photos.yml:102`, `TEST_STRATEGY.md:605`
- Confidence: high; reported by lens `cicd`, `runtime-ops`
- Verification: batch: partially confirmed (medium)

**Description.** The three CLAUDE.md invariants hold today, but only review protects them. The query hard-codes the set of path columns, so a migration that adds another derived rendition passes CI without anyone being prompted to update the sweep. The sweep also has no proportionality check. Any event that removes `images` rows in bulk becomes permanent byte deletion within 48 hours, up to the whole bucket in one run: a buggy data migration, SQL run in the hosted editor, or a restore to an older database state. No runbook says to disable the sweep first during an incident.

**Impact.** A migration adds `images.path_medium` and the client starts writing medium renditions. CI, pgTAP and e2e all pass. 48 hours later the 04:30 UTC run classifies every medium rendition as orphaned and deletes them for all users, 10,000 per day. The same happens after a bad migration removes rows (OPS-02). With no backup, the photos are gone, although their paths (`<uid>/<itemId>`) would have been enough to rebuild the rows.

**Recommendation.** Keep all three invariants. Move the SELECT into a checked-in SQL file that the workflow reads. Add a pgTAP case that seeds backdated `storage.objects` rows: referenced full and thumb paths, orphans older and newer than 48 hours, and a malformed path. Assert that only the old orphan is selected. Add a schema assertion that fails when `public.images` gains another `path_*` column. When not in dry-run mode, abort if the orphan count exceeds max(50, 5% of the bucket), and allow an override only through dispatch. Make 'disable cleanup-orphaned-photos.yml' step one of the incident and restore runbook. Validate any change with the default dry run first.

Evidence:

```text
The query exists only as a heredoc in the workflow, cleanup-orphaned-photos.yml:27-46: `and not exists (select 1 from public.images im where im.path_full = o.name) and not exists (select 1 from public.images im where im.path_thumb = o.name)`. Line 49 `MAX_OBJECTS_PER_RUN=10000`. Line 78 `A scheduled run sends no inputs, so DRY_RUN is empty`, so a scheduled run deletes. `grep -rln 'cleanup-orphaned\|48 hours' supabase/tests web/e2e web/src web/scripts` returns nothing (re-run). supabase/tests/database/ has no sweep test. TEST_STRATEGY.md §12: `matching only the primary path classifies every secondary object as orphaned ... only running the predicate against real data catches it.` CLAUDE.md's only prescribed check is a manual dry run, and only when this file is edited.
```

<details>
<summary>Verifier notes</summary>

- `batch` (partially confirmed, medium): The core holds. The sweep's SELECT exists only as a heredoc in the workflow. No pgTAP, e2e or unit test runs it: every 'orphan' hit under supabase/tests is about the `delete_item_if_orphan` trigger, and ci.yml never references the sweep. Nothing ties the hard-coded `path_full`/`path_thumb` pair to the columns of `public.images`. There is no ratio or absolute abort: a scheduled run leaves DRY_RUN empty and deletes up to 10,000 objects. Per the rubric this is a missing test on a data-critical, irreversible path, so medium. Two impact claims are overstated. (1) 'A restore to an older database state' does not trigger mass deletion. `storage.objects` is metadata in the same Postgres database and is restored together with `public.images`, so the sweep's view stays consistent with the rows. Objects uploaded after the backup vanish from `storage.objects` and become invisible to the sweep, not deletable by it (Supabase backups doc). (2) The `path_medium` scenario depends on a future change passing review against CLAUDE.md, which names the path-matching invariant explicitly, and TEST_STRATEGY.md §12's 'Match every derived artifact'. That is a documented human control, not a gate, but it lowers the likelihood. The bulk-row-deletion scenario holds: a bad data migration or SQL-editor delete removes rows but leaves the `storage.objects` rows, and 48 hours later the bytes, the only remaining recovery material, are deleted. The rows are already lost at that point. 'The whole bucket in one run' holds only while the bucket has at most 10,000 objects (`MAX_OBJECTS_PER_RUN=10000`). Mitigations: The 48-hour grace period (:36). The 10,000-per-run cap (:49) bounds one day's damage on a larger bucket. Manual dispatch defaults to a dry run that exits before `service_role` is fetched. The step fails fast on an unexpected result shape (:63-69). CLAUDE.md names the three invariants and requires a dry run before any change to this file. TEST_STRATEGY.md §12 gives the 'match every derived artifact' rule. A DB restore does not trigger the sweep, because `storage.objects` metadata is restored with the rows. There is no automated test, no schema assertion and no mass-deletion brake.

</details>

### OPS-06

Medium: **The hosted Auth settings that are the only control against pending-invite takeover live only in the dashboard, are never checked, and are missing from the new-environment runbook**

- Category: config-drift
- Location: `supabase/config.toml:56`, `supabase/config.toml:73`, `docs/how-to/developer-guide.md:404`, `web/src/app/login/useGoogleSignIn.ts:14`
- Confidence: high; reported by lens `cicd`, `runtime-ops`
- Verification: batch: partially confirmed (low)

**Description.** By the repository's own analysis (#634), email-based sharing is safe only while the hosted project has anonymous sign-ins off and no unconfirmed-email path. That configuration was checked once, by hand, and was never read from the API. No pipeline would notice if it changed. CI cannot detect drift either, because the local stack every RLS test runs against deliberately has anonymous sign-ins on.

**Impact.** Someone turns on anonymous sign-ins in the hosted dashboard, for example to try demo mode against production. An attacker then signs in anonymously, calls `updateUser({email: <pending invitee>})`, and reads and writes the owner's shared collection at editor role, as #634 demonstrated locally. Nothing flags it. A fork that follows developer-guide.md:404-415 leaves Site URL and redirect URLs at their defaults and gets a broken or misdirected Google sign-in.

**Recommendation.** Add a step to `migrate`, or a small daily job, that GETs `https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth`. Fail it when anonymous users are enabled, when the email provider or sign-up without confirmation is enabled, when refresh-token rotation is off, or when `site_url` or `uri_allow_list` do not match the Pages URL. Add these required values to developer-guide.md's new-environment steps.

Evidence:

```text
config.toml:56-60 `MUST STAY OFF ON THE HOSTED PROJECT, where it is off -- confirmed by the maintainer on 2026-09-12 ... because it was not read from /config/auth; re-confirm it there if this ever has to be relied on.` config.toml:70-72 `No SQL-side check distinguishes such a caller from a real one, which is why this setting, and the email/password provider beside it, are the control. See #634.` config.toml:73 `enable_anonymous_sign_ins = true` (local). developer-guide.md:404-415 lists only: create the project, link and push, enable Google, and note the URL and anon key. It says nothing about anonymous sign-ins, the Email provider, Site URL or redirect URLs. Supabase redirect-urls doc (https://supabase.com/docs/guides/auth/redirect-urls, redirect-urls.mdx:24): 'The Site URL ... defines the default redirect URL ... Change this from http://localhost:3000 to your production URL'. `migrate` already holds SUPABASE_ACCESS_TOKEN (pages-deploy.yml:50), but no workflow reads `/v1/projects/$REF/config/auth`.
```

<details>
<summary>Verifier notes</summary>

- `batch` (partially confirmed, low): The configuration-drift gap is real. The repository's own comment says hosted anonymous sign-ins being off was confirmed by hand and not read from `/config/auth`. No workflow reads the auth config. The new-environment runbook covers only project creation, `db push`, Google and keys. It says nothing about anonymous sign-ins, the Email provider (load-testing.md:197-199 calls 'the email provider staying off ... itself a security control'), Site URL or redirect URLs. Local CI cannot detect hosted drift. The impact chain is overstated, though. Per Supabase Auth's source, an anonymous user's `updateUser({email})` is applied immediately only when `config.Mailer.Autoconfirm` is true. Otherwise Auth sends an email-change confirmation to the new address, which an attacker cannot complete. Hosted projects require email confirmation by default; local ones do not, which is why #634 reproduced locally, where config.toml sets no `[auth.email]` and so gets the local default. So turning on anonymous sign-ins in the hosted dashboard is not enough by itself. Takeover also needs 'Confirm email' turned off, either with anonymous sign-ins on or with the email provider on. That is two dashboard misconfigurations by the sole maintainer, or one non-default toggle plus a second, so this is a defense-in-depth or config-hygiene gap. The fork runbook gap (Site URL left at `http://localhost:3000`) is documentation drift that yields a broken sign-in, not a security hole. That is why it is adjusted to low. The finding's recommendation to fail on 'sign-up without confirmation' is the right check and is more load-bearing than the anonymous toggle the finding leads with. Mitigations: Hosted Supabase requires email confirmation by default, so an anonymous or email-provider user cannot claim an invitee's address without also turning off 'Confirm email'. The maintainer confirmed by hand on 2026-09-12 that anonymous sign-ins are off, and the refresh-token settings were checked through the management API (config.toml:74-79). The email provider is documented as off on hosted (load-testing.md:197-199). No automated drift check exists, and the fork runbook omits these settings.

</details>

### OPS-07

Medium: **Production still depends on the legacy anon and service_role JWT keys, which Supabase is deprecating by the end of 2026; there is no rotation runbook and nothing checks the key baked into the bundle**

- Category: secrets-lifecycle
- Location: `.github/workflows/cleanup-orphaned-photos.yml:91`, `.github/workflows/keep-alive.yml:16`, `.gitleaks.toml:13`, `docs/reference/configuration.md:28`, `.github/workflows/pages-deploy.yml:61`
- Confidence: medium; reported by lens `runtime-ops`
- Verification: batch: partially confirmed (medium)

**Description.** The published bundle, the keep-alive and the sweep all use legacy JWT keys, and the sweep is hard-wired to the legacy key's name. No document describes how to rotate or migrate the anon key, the DB password in SUPABASE_DB_URL, the Management API token or the Google OAuth secret. Changing the anon key also requires a rebuild and redeploy, and the deploy never checks that the baked-in URL and key pair actually authenticates.

**Impact.** About three months from today (2026-09-24), once the legacy keys stop working, every request from the deployed app fails and the app is down for all users until the secrets are changed and the site redeployed. Keep-alive fails, which puts the project at risk of pausing. The sweep exits daily with 'Could not read the service_role key' until its jq filter changes, and orphans pile up. After a manual rotation, a wrongly pasted key still passes the build and the signed-out smoke test.

**Recommendation.** Create the publishable and secret keys, switch NEXT_PUBLIC_SUPABASE_ANON_KEY and keep-alive to the publishable key, and select the secret key by type in the sweep. Check the Authorization-header rules the migration guide describes for the new keys. Extend .gitleaks.toml to catch `sb_secret_`. Add a post-deploy step that makes one anonymous request (`rpc/keepalive`) with the bundle's own URL and key. Write a per-secret rotation runbook in configuration.md.

Evidence:

```text
cleanup-orphaned-photos.yml:88-91 `.../api-keys?reveal=true ... | jq -r '.[] | select(.name == "service_role") | .api_key'` selects the legacy key by its name. keep-alive.yml:16-17 sends `apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY` and `Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY`. .gitleaks.toml:13-16 allowlists only JWTs whose payload holds `"role":"anon"`, which is the legacy key format. pages-deploy.yml:61 bakes NEXT_PUBLIC_SUPABASE_ANON_KEY into the bundle. The Supabase deprecation notice (docs partial api_keys_deprecation.mdx, shown on https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) says: 'Supabase is deprecating the `anon` and `service_role` keys by the end of 2026. Use the publishable (`sb_publishable_xxx`) and secret (`sb_secret_xxx`) keys instead.' A grep for publishable, sb_secret and rotate in docs finds nothing. The smoke test is signed-out only.
```

<details>
<summary>Verifier notes</summary>

- `batch` (partially confirmed, medium): Holds: every production path uses the legacy JWT keys. The bundle bakes in NEXT_PUBLIC_SUPABASE_ANON_KEY, keep-alive sends it as apikey and as Bearer, and the sweep picks the legacy key by its name, "service_role". Supabase's official notice says these keys are being deprecated by the end of 2026. The repo has nothing on migrating keys or rotating any secret: a grep for rotate|publishable|sb_secret|sb_publishable outside node_modules finds only `enable_refresh_token_rotation` in supabase/config.toml. The post-deploy smoke test never checks that the baked-in URL and key actually authenticate: the signed-out login spec stubs `**/auth/v1/authorize*` with route.fulfill, so a wrongly pasted key would pass. Overstated: the finding treats 'about three months' as a firm date when legacy keys stop working. Supabase's own timeline says 'Late 2026 (TBC): Legacy API keys will be deleted', and the migration guide says both key types work side by side, so the switch can be done without downtime once someone starts it. The sweep fails loudly when the key is missing: it exits 1 with 'Could not read the service_role key; refusing to continue.' Orphans pile up, but nothing is deleted wrongly. The finding also misses a sharper risk: per the same timeline, 'Projects restored from 1st November 2025 will no longer be restored with the legacy API keys'. So if keep-alive ever fails and the free project pauses, restoring it breaks the deployed app at once, whatever the final date. I could not check whether gitleaks' default rules already catch sb_secret_, and GitHub push protection (configuration.md:39-40) is the server-side backstop. Medium fits: an operational risk with a known workaround and a deadline outside the project's control. Mitigations: The sweep fails closed on a missing key (cleanup-orphaned-photos.yml:96-98), and its dry-run path never fetches the key. The legacy and new keys can run side by side during a migration. pages-deploy.yml has workflow_dispatch, so a rebuild after changing a secret is one click. GitHub push protection is the server-side check for leaked secrets. No rotation runbook and no post-deploy key check exist.

</details>

### OPS-08

Medium: **The service worker serves the previous build's HTML after every deploy: lazily loaded chunks of that build 404 on Pages, there is no error boundary, and the cache never shrinks**

- Category: deploy-skew
- Location: `web/public/sw.js:18`, `web/public/sw.js:39`, `web/public/sw.js:60`, `web/src/app/components/ItemCreate/index.tsx:12`, `web/src/app/components/ItemList/EditItemModal.tsx:12`, `web/src/app/components/ItemList/MapModal.tsx:16`, `web/src/app/components/ItemList/useItemImages.tsx:162`, `web/src/app/useServiceWorker.ts:11`
- Confidence: medium; reported by lens `runtime-ops`
- Verification: batch: confirmed (medium)

**Description.** The design intends that 'a deploy is picked up on the visit after this one' (sw.js:6-8), but it does not account for code splitting. On the first visit after a deploy, the app runs build N from cached HTML while Pages serves only build N+1's chunks. Any build-N chunk the user never loaded before is fetched from the network and 404s. The stale bundle also runs against a schema that has already been migrated (OPS-03). Because CACHE_NAME is constant, chunks from every deploy accumulate in the cache for good.

**Impact.** A returning collector opens the app after a deploy and taps '+' or Edit. The changed ItemForm chunk 404s, next/dynamic throws, and with no error boundary Next shows its built-in English error page. The map fails the same way. A photo upload fails at `import('browser-image-compression')`. A reload recovers the app, because the background revalidation has by then cached the new HTML. Storage used per origin grows with every deploy that changes chunk hashes.

**Recommendation.** Version the worker per build: generate sw.js at build time, or register `sw.js?v=<buildId>`, and derive CACHE_NAME from the build id so that `activate` purges old builds. Serve navigations network-first with a cache fallback, which keeps offline start working. Add a localized `app/global-error.tsx` that reloads once on a chunk-load error. Add an e2e case for a deploy while a tab is open.

Evidence:

```text
sw.js:18 `const CACHE_NAME = 'collectionbuddy-shell-v1';`. sw.js:39-50 is stale-while-revalidate for navigations: `return cached || network;`. sw.js:28-36 `cacheFirst` puts every `_next/static` response into that one cache and never evicts. sw.js:60-73 `activate` deletes only keys other than CACHE_NAME, which never changes. useServiceWorker.ts:11 registers a fixed `${basePath}/sw.js` with no build id. Lazy chunks are loaded on demand: ItemCreate/index.tsx:12 and EditItemModal.tsx:12 `dynamic(() => import('../ItemForm'), { ssr: false })`, MapModal.tsx:16 `dynamic(() => import('../Map'))`, useItemImages.tsx:162 `await import('browser-image-compression')`. `find web/src/app -name error.tsx -o -name global-error.tsx` finds nothing. Next docs (web/node_modules/next/dist/docs/01-app/02-guides/self-hosting.md:215-217): version skew causes 'Missing assets: The client requests JavaScript or CSS files that no longer exist on the server'. Each Pages deployment replaces the whole site with the single `web/out` artifact (pages-deploy.yml:73-75). Deploy Pages ran 12 times on main between 2026-09-22 and 2026-09-24 (API).
```

<details>
<summary>Verifier notes</summary>

- `batch` (confirmed, medium): The mechanism holds as described. Navigations are served stale-while-revalidate from a single cache whose name never changes. Hashed chunks are served cache-first and never evicted. `activate` deletes only caches with a different name, so it never deletes anything. The worker has no precache and no build id. The export is a Turbopack build with content-hashed chunk names (out/_next/static/chunks/\*.js), and a Pages deploy replaces the whole site with web/out. So a chunk from the cached HTML's build that the browser never fetched is requested from the network after a deploy and 404s. The Turbopack runtime then throws `ChunkLoadError`: the built runtime contains `Error(`Failed to load chunk ...`)` with `i.name="ChunkLoadError"`, and the bundle has no reload-on-chunk-error logic. src/ has no error.tsx, global-error.tsx or ErrorBoundary, so Next's built-in English global error ('This page couldn't load', with a Reload button) is shown. The lazy imports cited at ItemCreate:12, EditItemModal:12, MapModal:16 and useItemImages:162-163 are real. The problem can also be worse than the finding says. Because of stale-while-revalidate, the page always runs the HTML fetched on the previous visit, and that build's changed initial chunks were never fetched either. With a code deploy between visit k-2 and k-1 and another between k-1 and k, the initial page chunks can 404 as well, and the app does not hydrate at all. With about 78 commits on main since 2026-09-20, that is realistic. One reload recovers, because the background fetch has by then cached the current HTML, and no data is lost. The photo-upload import failure happens inside a try block (useItemImages.tsx:152), so it surfaces as an error. It is not a silent loss. The cache growth claim is true, but only chunks the user actually fetched are stored, and browsers evict under storage pressure, so that part is low. This is not a documented design decision: docs/ never mention the service worker, only sw.js's own header comment. The e2e service-worker spec asserts the constant cache name (`SHELL_CACHE = 'collectionbuddy-shell-v1'`) but never tests a deploy while a tab is open. Medium: a correctness and ops bug that appears after routine deploys and has a one-click workaround. Mitigations: One reload recovers, because the background revalidation has cached the current HTML. Next's default global error page offers a Reload button. Failed (non-ok) responses are never cached (sw.js:32, :44). No data is lost, and the upload failure surfaces as an error. Nothing prevents the skew itself: no deploymentId, no build-versioned worker and no chunk-error handler.

</details>

### OPS-09

Medium: **The CI path filter skips every test job for changes to the deploy path's own inputs (composite actions pinning the Supabase CLI and Node, supabase/config.toml, .semgrepignore), and the docs claim it covers `supabase/**`**

- Category: ci-gating
- Location: `.github/workflows/ci.yml:50`, `.github/actions/setup-supabase-cli/action.yml:9`, `.github/actions/setup-web/action.yml:9`, `docs/how-to/developer-guide.md:14`
- Confidence: high; reported by lens `cicd`
- Verification: batch: partially confirmed (low)

**Description.** A PR that changes only a composite action runs `prek` and `changes` and nothing else, and skipped jobs report as passing. After merge, pages-deploy immediately uses the changed action against production. So TEST_STRATEGY §13 item 7 fails for exactly the change that alters the CLI. The same applies to a `.semgrepignore` change: the PR that adds a suppression never runs Opengrep.

**Impact.** A PR bumps the Supabase CLI to a release whose `db push` changes statement splitting or history handling. PR CI is green with no stack jobs run. After merge, the new CLI applies the next migration to production unattended, and that is its first run anywhere. A Node bump likewise ships a production build that no test job ever built.

**Recommendation.** Add `'.github/actions/**'` to both filters, `'supabase/config.toml'` to `sql`, and `'.semgrepignore'` to a filter that gates opengrep. Consider forcing the full set of jobs whenever `.github/**` changes. Correct developer-guide.md:14-16 to list the real paths.

Evidence:

```text
ci.yml:50-60 filters: `web: - 'web/**' - '.zap/rules.tsv' - '.github/workflows/ci.yml'` and `sql: - 'supabase/migrations/**' - 'supabase/tests/database/**' - 'supabase/splinter.sh' - '.sqlfluff' - '.github/workflows/ci.yml'`. The filters do not cover setup-supabase-cli/action.yml:9 `version: 2.110.0`, which is the CLI behind the production `db push`, or setup-web/action.yml:9 `node-version: '22.x'`, the Node used for the production build. developer-guide.md:14-16 says `e2e_local_stack` and `opengrep` are skipped `unless web/** or supabase/** changed`, which is broader than the real filter. TEST_STRATEGY.md:631-633 `Pin one Supabase CLI version ... so migrations are exercised by the CLI that applies them.`
```

<details>
<summary>Verifier notes</summary>

- `batch` (partially confirmed, low): Holds: the paths-filter covers neither `.github/actions/**`, `supabase/config.toml` nor `.semgrepignore`. A PR touching only setup-supabase-cli/action.yml or setup-web/action.yml therefore runs only prek and changes, and every other job is skipped and reports as passing. That breaks the project's own rule in TEST_STRATEGY §14 ('A gate is required when the diff touches its inputs'). developer-guide.md:14-16 says `e2e_local_stack` and `opengrep` run when `supabase/**` changed, which is broader than the real filter, so the docs have drifted. Overstated: the impact claims a CLI bump lets the next migration reach production through a CLI that has never run anywhere. That is not so. A push to main forces the full job set (ci.yml:27, :37-39), so the CLI-bump merge itself runs e2e_local_stack with the new CLI through start-local-stack, and any later PR carrying a migration matches the `sql` filter and runs e2e_local_stack with the new CLI too. A CLI-only PR has no pending migration, so the production `db push` it triggers applies nothing, and a failing `--dry-run` stops the deploy. `supabase db push` itself is never exercised in CI whatever the filter says (it appears only at pages-deploy.yml:30,35), so the filter is not what leaves that path untested. What remains: a Node or CLI bump is built and deployed by pages-deploy at the same time as, not after, main's full CI run. The deploy's own build fails safe, and the signed-out smoke test covers only part of the runtime. The .semgrepignore gap only delays new findings until the main-push opengrep run. That is a gating gap plus documentation drift, not a likely path to breaking production, so low. Mitigations: The full forced CI run on every push to main exercises the new CLI and Node in e2e_local_stack and build_and_test right after merge. Later migration PRs run e2e_local_stack. pages-deploy's `db push --dry-run` and build steps fail safe, and the post-deploy signed-out smoke test runs against the live site. Composite-action changes still get human review, since auto-merge covers only npm devDependency patches.

</details>

### OPS-10

Medium: **The premise behind auto-merge, that 'a devDependency reaches the CI runner', does not hold: devDependencies are installed, with their install scripts, and run in the job that builds the production artifact**

- Category: design-decision-challenge
- Location: `.github/workflows/auto-merge.yml:25`, `TEST_STRATEGY.md:637`, `web/postcss.config.mjs:2`, `.github/actions/setup-web/action.yml:16`, `.github/workflows/pages-deploy.yml:67`, `.github/dependabot.yml:39`
- Confidence: medium; reported by lens `cicd`
- Verification: batch: confirmed (medium)

**Description.** The documented control assumes dev-only code cannot reach users. In fact the production build job installs every devDependency, so a new install script in any patch release runs there and can modify node_modules/next before the build. It also executes build-time devDependencies in the same process tree that writes `web/out`, which is published as-is. Keeping `pages: write` out of that job (pages-deploy.yml:8) protects the token, not the artifact. Mitigations in place: a 7-day cooldown, lockfile-lint, and PR CI, which checks behaviour but not bundle integrity.

**Impact.** A malicious tailwindcss or @tailwindcss/postcss patch release outlasts the 7-day cooldown, is grouped into `patch-updates-dev`, and is auto-merged after green CI. It ships with the next human push to main (OPS-13). During `next build` it appends script to `web/out/_next/static/chunks/*.js`, and every visitor then runs attacker code on the production origin with their persisted Supabase session.

**Recommendation.** Treat build-time devDependencies (tailwindcss, @tailwindcss/postcss, postcss, typescript) as shipped: give them their own Dependabot group, or add a name check in auto-merge.yml that sends them to a human. Alternatively, limit auto-merge to an allowlist of test-only tools. Consider `npm ci --ignore-scripts` in the production build job. Correct TEST_STRATEGY §13 and auto-merge.yml:25 to state the real boundary.

Evidence:

```text
auto-merge.yml:25 `direct:development only: a devDependency reaches the CI runner, a runtime one reaches every user's browser (TEST_STRATEGY.md §13).` Lines 27-30 auto-merge `version-update:semver-patch` updates of type `direct:development`. TEST_STRATEGY.md:637-638 `A dev dependency reaches the CI runner; a runtime one reaches every user's browser. That asymmetry is a security control.` web/package.json lists `tailwindcss`, `@tailwindcss/postcss` and `typescript` as devDependencies, and postcss.config.mjs:2 has `plugins: ['@tailwindcss/postcss']`, which runs inside `next build`. setup-web/action.yml:16 `run: npm ci`, without `--ignore-scripts`, installs every devDependency in pages-deploy's `build` job (line 67), which then runs `npm run build` (line 69) and uploads `web/out` (lines 73-75). dependabot.yml:39-44 groups all development patch updates into `patch-updates-dev`.
```

<details>
<summary>Verifier notes</summary>

- `batch` (confirmed, medium): The documented premise does not hold. auto-merge.yml:25 and TEST_STRATEGY.md:637-638 justify auto-merging devDependency patches because 'a devDependency reaches the CI runner, a runtime one reaches every user's browser', and call that asymmetry a security control. But pages-deploy's `build` job, which produces the published artifact, runs `npm ci` through setup-web with no `--omit=dev`, no `--ignore-scripts` and no .npmrc. So every devDependency is installed and its install scripts run. Build-time devDependencies then execute inside `next build`: `@tailwindcss/postcss` through postcss.config.mjs, and `typescript` (build.log shows 'Running TypeScript ...'). The job then uploads web/out unchanged. A compromised patch of any devDependency can therefore change the shipped bundle: by an install script (unrs-resolver already has one, so a new one in any dev package runs) or by code loaded during the build. Keeping `pages: write` out of the build job (pages-deploy.yml:8) protects the token, not the artifact. docs/explanation/design-decisions.md does not discuss this, and architecture.md:158 only describes the workflow. The mitigations the finding lists are real: 7-day cooldown, lockfile-lint on integrity and hosts, PR CI. The attack still needs an upstream compromise that survives the cooldown, which is why this is a defense-in-depth gap (medium), not high. A human merging the same Dependabot bump would rarely inspect the tarball either, so auto-merge adds only modest marginal risk. The factual error is in the stated boundary itself. Mitigations: The 7-day Dependabot cooldown. lockfile-lint (integrity, HTTPS, allowed hosts). Auto-merge covers patch-level devDependency bumps only. Full PR CI must pass. Pushes made with GITHUB_TOKEN do not trigger pages-deploy, so an auto-merged bump deploys only with the next human push. The build job holds no `pages: write`. None of these checks the integrity of the built bundle.

</details>

### OPS-11

Medium: **Each per-owner quota is at or above the whole Free-plan allowance, so a single account can push the project over quota for everyone**

- Category: design-decision-challenge
- Location: `supabase/migrations/0009_user_quotas.sql:39`, `supabase/migrations/0009_user_quotas.sql:60`, `supabase/migrations/0009_user_quotas.sql:12`, `docs/explanation/design-decisions.md:29`
- Confidence: medium; reported by lens `runtime-ops`
- Verification: batch: confirmed (medium)

**Description.** The documented purpose of the quotas is to stop one collector from taking a Free-tier app down. Yet a single owner's photo ceiling (1.07 GB, before thumbnails and before up to 48 hours of orphan uploads) exceeds the project's 1 GB Storage allowance. Any Google account can sign up, and nothing monitors project-level usage (OPS-12). The documented reasoning therefore does not hold at the project's actual plan.

**Impact.** One enthusiastic collector with a few thousand phone photos, or a scripted account, fills the project's 1 GB of Storage while staying within their own quota. The project goes over its Free-plan quota, writes start failing or Fair Use restrictions apply to every user, and the owner's first notice is Supabase's over-quota email.

**Recommendation.** Either size the per-owner ceilings as a fraction of the project allowance and count thumbnails, or document that the quotas only bound runaway growth and plan for Pro before real usage nears 1 GB. Add a scheduled usage check (bucket bytes, `pg_database_size`) that fails at about 70% of the plan quota.

Evidence:

```text
0009_user_quotas.sql:39 `) > 1073741824` (1 GiB per owner). Lines 12-18 take `size_bytes` from `path_full` only, so thumbnails are not counted. Line 60 `) > 50000` entries. design-decisions.md:29 `Any signed-in collector could otherwise create rows and upload 5 MiB objects without end, and on a free-tier project that is the likeliest way to take the app down (#637).` design-decisions.md:44 says bytes without an `images` row are bounded only by the 48-hour sweep. Supabase pricing source (https://supabase.com/pricing, packages/shared-data/pricing.ts): `storage.size ... free: '1 GB included'` and `Database size ... free: '500 MB database size per project included'`.
```

<details>
<summary>Verifier notes</summary>

- `batch` (confirmed, medium): The core claim holds. The production project is on Supabase Free: keep-alive.yml exists, architecture.md:155 says `Calls keepalive() so a free-tier project does not pause.`, and load-testing.md:202 says `The Free tier is shared with real users.` The per-owner photo ceiling is 1 GiB (0009_user_quotas.sql:39 `) > 1073741824`). Supabase's own storage-size doc divides by 1073741824 to report GB, so Free's '1 GB' Storage quota is the same number. One owner's ceiling therefore already equals the whole Free Storage allowance, and that allowance is counted per organization, not per project. On top of that the ceiling is exceeded: (a) the trigger compares with `>` only after insert, so the last insert crosses the line; (b) only `path_full` is sized (0009:12-18 `where o.bucket_id = 'item-images' and o.name = new.path_full`), so thumbnails go uncounted; (c) objects with no `images` row are unbounded for 48h, as design-decisions.md:44 itself says. The documented rationale (design-decisions.md:29) says the quotas exist because unbounded uploads are 'the likeliest way to take the app down' on a free-tier project, and nothing in the docs or in #637/#712 ties the 1 GiB figure to the plan. So the documented reasoning does not hold at this plan, which makes the design-decision-challenge valid. The thumbnail gap is worse than the finding says. The only check on `path_thumb` is the item-prefix constraint (0019:9-10 `check (path_thumb is null or public.storage_item_id(path_thumb) is not distinct from item_id)`), and the sweep keeps any referenced object. A scripted client can therefore store a tiny object at `path_full` and a bucket-max 5 MiB object (0007_storage.sql:17 `5242880`) at `path_thumb`, and pay only for the tiny one. For such a client the per-owner byte ceiling does not bound Storage at all. The entry ceiling has the same shape for database size. Free projects go read-only as soon as database size passes 500 MB. At the text limits (0016: description 10,000, tags_text 5,049, and so on) plus the four trigram GIN indexes (0005_indexes.sql:13-23), 50,000 entries from one scripted owner plausibly exceed 500 MB. That is an estimate; I did not measure it. Parts that are overstated: - 'A few thousand phone photos' is too few for a UI user. The client downsizes to 1000px WebP at 0.8 quality (useItemImages.tsx:163-170, imageCompression.ts), so reaching 1 GB through the UI takes several thousand to roughly ten thousand photos (unmeasured estimate). - Exceeding the Storage quota does not break writes at once. Storage is billed in GB-Hrs, effectively the billing-period average, and going over triggers a notification and a grace period before Fair Use restrictions (402s, read-only, pause). - Resizing the per-owner ceiling alone cannot stop multi-account abuse, because any Google account can sign up and I found no allowlist. The monitoring half of the recommendation is the part that addresses this. Medium stands: it is an availability risk for every user, the workaround is upgrading to Pro or trimming usage, and it cannot leak data. Mitigations: Partial only. Supabase notifies the billing email and grants a grace period before Fair Use restrictions, and Storage is measured as a billing-period average, so a short spike does not trip the quota at once. Client-side compression means a UI user needs many thousands of photos. Anonymous sign-ins are confirmed off on the hosted project (#637 comment, 2026-09-13), which removes the no-account variant. The 48h orphan sweep bounds unreferenced bytes. Nothing bounds referenced path_thumb bytes, multi-account use, or database size at project level.

</details>

### OPS-12

Medium: **No monitoring or alerting in production: client errors go only to the browser console, deploy and scheduled-job failures only to GitHub's default email, and keep-alive stops after 60 idle days**

- Category: observability
- Location: `web/src/app/components/Toast/ToastProvider.tsx:113`, `.github/workflows/pages-deploy.yml:112`, `.github/workflows/keep-alive.yml:4`, `.github/workflows/cleanup-orphaned-photos.yml:6`
- Confidence: high; reported by lens `cicd`, `runtime-ops`
- Verification: batch: partially confirmed (low)

**Description.** Failed uploads, RLS or quota refusals, and stale-build crashes (OPS-08) are recorded nowhere the owner can see, and Supabase Free keeps logs for only one day. A red smoke test looks the same whether the cause is a test artifact or a real regression on the live origin. The keep-alive, the only thing preventing the Free-tier pause, runs on a schedule that GitHub disables after the very inactivity it guards against. developer-guide.md:436 does not mention this.

**Impact.** A smoke test starts failing for a real reason, such as a chunk 404ing on the live origin, and nobody investigates for a day or more, as happened with the 37-hour red streak. Or the repository goes quiet for 60 days, keep-alive and the sweep are disabled, and a week later the production project pauses, with only Supabase's email as warning.

**Recommendation.** Add a failure hook to pages-deploy, cleanup and keep-alive, for example commenting on a pinned 'production health' issue. Add an external uptime check on the Pages URL and on `rest/v1/rpc/keepalive`. Add a localized global error boundary and a small client error sink; a new table needs RLS plus grants per CLAUDE.md. Document the 60-day schedule rule and who receives scheduled-run notifications.

Evidence:

```text
ToastProvider.tsx:113-117 `const reportError = useCallback((scope: string, error: unknown, message: string) => { console.error(scope, error); post('error', message); }`. The package.json dependencies include no error-reporting SDK, and the app has no error.tsx or global-error.tsx. pages-deploy.yml:112-118 only uploads a report on failure. None of the workflows has a notification step. Run history (GitHub API, verified): Deploy Pages failed on 7 consecutive runs on main, 35570972349 (2026-09-21T07:01Z) through 35768379261 (2026-09-22T18:37Z), and the next success was 35780955393 (2026-09-22T20:32Z). The cause was the smoke job's e2e coverage floor, while production deploys themselves kept succeeding. GitHub docs (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): in a public repository, scheduled workflows are disabled after 60 days without repository activity, and scheduled-run notifications go to the user who last modified the cron. Supabase pauses Free projects after 7 days of low activity (https://supabase.com/docs/guides/platform/free-project-pausing).
```

<details>
<summary>Verifier notes</summary>

- `batch` (partially confirmed, low): What holds: - reportError only calls `console.error` and shows a toast (ToastProvider.tsx:113-117). - The only runtime dependencies are supabase-js, browser-image-compression, leaflet, next, react and react-dom, so there is no error-reporting SDK. There is no error.tsx or global-error.tsx under web/src/app. - No workflow has a notification step; the only `if: failure()` in pages-deploy.yml uploads the Playwright report (112-118). - The repository is public (GitHub API: `"private":false`). GitHub's official docs confirm that scheduled workflows in a public repo are disabled after 60 days without repository activity, and that scheduled-run notifications go to whoever last modified the cron. - developer-guide.md:436 says only that keep-alive `stays enabled on a free-tier project`; no doc mentions the 60-day rule. - Supabase Free keeps API and database logs for 1 day. - The 7-run red streak is real: failures from 35570972349 (2026-09-21T07:01Z) through 35768379261 (2026-09-22T18:37Z), then success at 35780955393. In run 35620157951 the migrate, build and deploy jobs succeeded and only smoke_test failed, at `Run npm run e2e`. What is overstated: 1. 'No monitoring or alerting' ignores the alerting that does exist. GitHub sends failed-run notifications (a per-user setting). Supabase emails the owner about a week before pausing a Free project and again once it is paused, and a paused project can be restored for up to a year. Supabase also emails on quota overage before any restriction applies. 2. RLS and quota refusals are not 'recorded nowhere'. They reach PostgREST and Postgres and appear in Supabase's API and Postgres logs, retained 1 day on Free. Only purely client-side failures (compression, chunk loads, render crashes) leave no trace outside the browser. 3. The 37-hour streak does not show a missed production regression. Every deploy job succeeded, and the maintainer merged five more PRs during the streak (#695, #688, #697, #705), then fixed the cause in #706 ('fail-loud workflows, honest e2e coverage'). The failure was visible and was handled. 4. The pause scenario needs two conditions together: 60 days with no pushes, and 7 days with too little database activity from real users (pausing is driven by database activity, not repository activity). When that happens, Supabase warns a week ahead and the project can be restored. What remains is an observability gap plus a documentation gap about the 60-day rule, for a small personal catalogue. Both warrant a low severity, not medium. Mitigations: GitHub failed-run email/web notifications (per-user setting; scheduled runs notify the last cron modifier). Supabase emails a pause warning about a week ahead plus a confirmation, with a 1-year restore window. Supabase quota-overage notifications arrive before Fair Use restrictions. Supabase API/Postgres logs record server-side refusals for 1 day. The smoke-test failure appears on main's commit status. Active repository (119 commits in September 2026). Nothing covers client-only runtime errors or documents the 60-day rule.

</details>

### OPS-13

Low: **Auto-merged Dependabot commits trigger neither main CI nor Deploy Pages, because the merge is performed with GITHUB_TOKEN**

- Category: ci-gating
- Location: `.github/workflows/auto-merge.yml:32`, `.github/workflows/auto-merge.yml:34`, `.github/workflows/ci.yml:27`
- Confidence: high; reported by lens `cicd`
- Verification: not agent-verified (low/info)

**Description.** ci.yml:27 promises that 'A push to main forces every job', but an auto-merged commit gets no main run at all. It has no full Stryker `--force` run, and main's incremental cache is not refreshed. The bump reaches production only with the next human push, bundled with unrelated work.

**Impact.** A tailwindcss patch auto-merges on Monday and a UI PR merges on Thursday. The deploy carries both, and a build or styling regression cannot be traced back to Monday's bump, because that commit never had its own deploy or main CI run.

**Recommendation.** Merge with a GitHub App installation token (actions/create-github-app-token) so the push triggers workflows. Alternatively, schedule a daily ci.yml run on main and document that auto-merged bumps deploy with the next push. A `workflow_run`-based deploy gate (OPS-01) would inherit this gap.

Evidence:

```text
auto-merge.yml:32-34 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` ... `gh pr merge ... --merge --delete-branch --auto`. GitHub docs (https://docs.github.com/en/actions/concepts/security/github_token): 'events triggered by the GITHUB_TOKEN will not create a new workflow run, with the following exceptions: workflow_dispatch and repository_dispatch'. Verified in git: 9d7930e 'Merge pull request #607 ... patch-updates' is authored by `github-actions[bot]`. The cicd lens found via the API that this commit has no CI or Deploy Pages run.
```

### OPS-14

Low: **Dependabot never updates the actions pinned inside the composite actions**

- Category: dependency-flow
- Location: `.github/dependabot.yml:4`, `.github/actions/setup-web/action.yml:7`, `.github/actions/setup-supabase-cli/action.yml:7`, `.github/actions/playwright-results/action.yml:25`
- Confidence: high; reported by lens `cicd`
- Verification: not agent-verified (low/info)

**Description.** The comment says Dependabot is the only thing that moves the SHA pins, but the pins in `.github/actions/*/action.yml` fall outside its scan and stay frozen. They include the action that installs the CLI which migrates production and the Node setup for the production build.

**Impact.** A security fix to actions/setup-node or supabase/setup-cli is never proposed, and CI and the production build keep running the old version with no signal.

**Recommendation.** Use `directories: ["/", "/.github/actions/*"]` for the github-actions ecosystem.

Evidence:

```text
dependabot.yml:3-5 `# Actions are pinned by commit hash ... these bumps are the only thing that does.` / `package-ecosystem: "github-actions"` / `directory: "/"`. Dependabot options reference (https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference): 'For GitHub Actions, use the value `/`. Dependabot will search the `/.github/workflows` directory, as well as the `action.yml/action.yaml` file from the root directory.' Pins outside that scope: setup-web/action.yml:7 `actions/setup-node@8207627...`, setup-supabase-cli/action.yml:7 `supabase/setup-cli@46f7f98...`, and playwright-results/action.yml:25 `daun/playwright-report-summary@31ed947...`, plus lines 38 and 64 `actions/upload-artifact@043fb46...`.
```

### OPS-15

Low: **Some CI tooling floats unpinned or unverified: the Opengrep installer is piped from `main` without a signature check, prek runs at `latest`, the ZAP image at `stable`, and Opengrep rules are fetched live with `--config auto`**

- Category: supply-chain
- Location: `.github/workflows/ci.yml:292`, `.github/workflows/ci.yml:21`, `.github/workflows/ci.yml:299`, `.github/workflows/ci.yml:450`
- Confidence: high; reported by lens `cicd`, `runtime-ops`
- Verification: not agent-verified (low/info)

**Description.** The repository pins actions by SHA and the CLI and k6 by version, but these four inputs change without any commit. The Opengrep installer runs code from a mutable branch head, with no checksum or cosign verification, inside the job that uploads code-scanning results.

**Impact.** A new community rule rated ERROR appears overnight and every open PR fails `opengrep` with no repository change. Or a compromised install.sh on opengrep@main runs in CI and uploads an empty SARIF that hides real alerts.

**Recommendation.** Fetch install.sh from the `v1.30.0` tag, or download the release binary and verify its checksum, as splinter.sh does. Pin `prek-version`. Pin `docker_name` to an image digest. Pin or vendor the Opengrep ruleset.

Evidence:

```text
ci.yml:292 `curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash -s -- -v v1.30.0`, in a job with `security-events: write`. ci.yml:21 `uses: j178/prek-action@4e14d07f...` has no `prek-version`, and the action's default is `latest` (cicd lens, from action.yml at that SHA). ci.yml:299 `--config auto`. ci.yml:450 `zaproxy/action-baseline@de8ad96...` has no `docker_name`, so it defaults to `ghcr.io/zaproxy/zaproxy:stable`. For contrast, supabase/splinter.sh pins `SPLINTER_COMMIT` and checks `SPLINTER_SHA256`.
```

### OPS-16

Low: **15 of 16 jobs have no `timeout-minutes`, and the curl calls to Supabase have no `--max-time`**

- Category: ci-health
- Location: `.github/workflows/pages-deploy.yml:19`, `.github/workflows/ci.yml:14`, `.github/workflows/cleanup-orphaned-photos.yml:17`, `.github/workflows/keep-alive.yml:15`
- Confidence: high; reported by lens `cicd`
- Verification: not agent-verified (low/info)

**Description.** A hung `supabase start`, Playwright run, or Supabase endpoint that accepts the connection but never answers runs until the 360-minute default. For `migrate`, that means holding the `pages` concurrency group until the next push cancels it.

**Impact.** The pooler stalls, `migrate` hangs for up to 6 hours, and no deploy goes out. A stalled keep-alive or cleanup shows 'in progress' for hours instead of failing.

**Recommendation.** Set `timeout-minutes` on every job, sized from observed durations (for example migrate 10, build 15, e2e_local_stack 45, cleanup 15, keep-alive 5), and add `--max-time` to each curl.

Evidence:

```text
`grep -n timeout-minutes .github/workflows/*.yml` returns only `k6-load-test.yml:37: timeout-minutes: 45` (re-run). keep-alive.yml:15 `curl -sS --fail-with-body -X POST ...`, and the cleanup curls at lines 54, 88 and 105, have no `--max-time`.
```

### OPS-17

Low: **Migration identity is a hand-picked 4-digit number that is reused after squashes; the CLI matches on version only, and the squash runbook's manual SQL step on production has no instruction to pause deploys**

- Category: migration-safety
- Location: `docs/how-to/developer-guide.md:350`, `docs/how-to/developer-guide.md:393`, `supabase/migrations/0020_one_collection_per_entry.sql:2`
- Confidence: medium; reported by lens `cicd`
- Verification: not agent-verified (low/info)

**Description.** Two in-flight PRs can pick the same next number without a git conflict. The CLI would apply both bodies, and the second history INSERT fails after its body has already committed. Separately, a push to main between the manual production DELETE and the squash merge would re-run 0008 onward against the populated database. Because numbers are reused, a skipped DELETE cannot be detected from versions alone.

**Impact.** PRs X and Y both add `0021_*` and both merge. Production applies both bodies, migrate fails on the duplicate key, and later deploys fail or re-apply Y's DDL until someone repairs the history by hand.

**Recommendation.** Add a prek/CI check that fails on duplicate version prefixes and on any version at or below the highest one on main, or switch to `supabase migration new` timestamps. In the squash runbook, add steps to disable pages-deploy between the production DELETE and the merge, and to verify `select version, name from supabase_migrations.schema_migrations` afterwards.

Evidence:

```text
developer-guide.md:350 `Add supabase/migrations/NNNN_description.sql, numbered after the highest existing file.` developer-guide.md:392-398 `in the hosted project's SQL editor and right before merging, delete the rows ... delete from supabase_migrations.schema_migrations where version > '0007';`. The CLI compares versions only (apply.go, fetched: `local := migrateFilePattern.FindStringSubmatch(filename)[1]; if remote == local {`). Every file wraps its body in `begin; ... commit;` (0020 lines 2 and last). The cicd lens cites Postgres protocol docs (https://www.postgresql.org/docs/17/protocol-flow.html): after an explicit COMMIT, the CLI's history INSERT runs in a separate implicit transaction.
```

### OPS-18

Low: **A ci.yml comment says the prek job does secret scanning, but in CI the gitleaks hook scans only staged changes and so scans nothing**

- Category: documentation-drift
- Location: `.github/workflows/ci.yml:13`, `.pre-commit-config.yaml:31`, `docs/reference/configuration.md:38`
- Confidence: high; reported by lens `cicd`
- Verification: not agent-verified (low/info)

**Description.** In CI, the only secret check that runs is `detect-private-key`, which catches PEM keys but not JWTs or Postgres URLs. Commits made without local hooks, such as from the web editor or agent sessions without prek, rely entirely on GitHub push protection, whose enablement could not be verified.

**Impact.** A service_role JWT committed from a session without prek passes CI's prek job green, while the ci.yml comment suggests CI would have caught it.

**Recommendation.** Run `gitleaks git --log-opts="origin/main..HEAD"` with .gitleaks.toml in CI, or correct the ci.yml:13 comment and name push protection as the control.

Evidence:

```text
ci.yml:13 `# Unconditional: hygiene and secret scanning must see every changed file.` .pre-commit-config.yaml:31 `# Staged changes on commit`. The gitleaks v8.30.1 hook is `gitleaks git --pre-commit --redact --staged --verbose` (https://github.com/gitleaks/gitleaks/blob/v8.30.1/.pre-commit-hooks.yaml). configuration.md:38-40: `The hook sees only staged changes, so in CI it has nothing to scan; GitHub push protection is the server-side check.`
```

### OPS-19

Low: **Fork and new-environment setup has drifted: wrong file references, an incomplete fork rename, a `supabase link` recipe the repo itself says fails, a broken `npm start`, CODECOV_TOKEN missing from the secrets table, and a build_and_test job that fork PRs can never pass**

- Category: documentation-drift
- Location: `docs/how-to/developer-guide.md:409`, `docs/how-to/developer-guide.md:433`, `web/public/site.webmanifest:4`, `web/src/app/supabase.ts:8`, `web/package.json:8`, `docs/reference/configuration.md:25`, `.github/workflows/ci.yml:124`
- Confidence: high; reported by lens `runtime-ops`
- Verification: not agent-verified (low/info)

**Description.** A maintainer who uses these docs alone to fork or set up an environment is sent to the wrong file, misses the manifest rename, and runs a push recipe the repository elsewhere says fails. `npm start` crashes. A fork's first push fails on a secret nobody documented, and external PRs show a red build_and_test that no change can fix.

**Impact.** A fork under another repository name ships a manifest whose scope and icons 404, which breaks PWA install. Setting up a new environment from an IPv4-only network fails at step 2. External contributors cannot get a green build_and_test.

**Recommendation.** Use `supabase db push --db-url <session pooler>` in the new-environment recipe. Name `repository` and the manifest paths in the fork steps, or derive the manifest from EXPORT_BASE_PATH. Point supabase.ts at CONTRIBUTING.md. Remove `start` or change it to `serve out`. Add CODECOV_TOKEN to configuration.md. Build build_and_test against the local stack's well-known URL and key, or document that outside PRs need a branch pushed by a maintainer.

Evidence:

```text
developer-guide.md:409 `supabase link --project-ref <ref> then supabase db push`, while configuration.md:29 says the direct host `is IPv6-only and unreachable ...; supabase link reports success anyway and the push fails`. developer-guide.md:433-434 `change repo in web/next.config.ts`, but next.config.ts:4 names it `const repository = 'CollectionBuddy';`. site.webmanifest:4-5 hard-code `"start_url": "/CollectionBuddy/"` and `"scope": "/CollectionBuddy/"`, and every icon src does the same. supabase.ts:8 points to `README's "Local development" section`, which is actually in CONTRIBUTING.md:28. package.json:8 `"start": "next start"`, while next.config.ts:10 sets `output: 'export'`, and node_modules/next/dist/server/next.js:246 throws `"next start" does not work with "output: export" configuration`. ci.yml:124-126 require `secrets.CODECOV_TOKEN` with `fail_ci_if_error: true`, but `grep -rn CODECOV docs` returns nothing. ci.yml:76-80 builds with production secrets, which workflows triggered from forks do not receive.
```

### OPS-20

Info: **CI repeats heavy setup: seven `next build`s per main push, uncached Playwright browsers and Supabase images, and no `concurrency` group on ci.yml**

- Category: ci-efficiency
- Location: `.github/workflows/ci.yml:77`, `.github/workflows/ci.yml:141`, `web/scripts/lighthouse.mjs:51`
- Confidence: high; reported by lens `cicd`
- Verification: not agent-verified (low/info)

**Description.** This is not a defect. Some of the duplication is deliberate, since the builds use different environments (local stack, demo mode, source maps). Superseded PR runs are not cancelled.

**Impact.** Feedback on every PR and main push takes longer, and runner minutes grow with each job added.

**Recommendation.** Add `concurrency: {group: ci-${{ github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }}}` to ci.yml. Cache ~/.cache/ms-playwright keyed on the @playwright/test version.

Evidence:

```text
Builds per push to main: build_and_test (ci.yml:77), e2e_local_stack via scripts/e2e-local-stack.mjs:51, lighthouse twice (scripts/lighthouse.mjs:51,65), zap_baseline twice (ci.yml:438,473), plus pages-deploy's build. `npx playwright install --with-deps` runs in five jobs (ci.yml:141, 210, 392; pages-deploy.yml:106) with no cache. ci.yml has no `concurrency` key.
```

## Strengths

- The deploy runs migrate, then PostgREST schema reload, build, deploy and smoke test, each job needing the previous one, so a rejected migration leaves the previous bundle serving the previous schema (pages-deploy.yml:17-95).
- pages-deploy has least-privilege permissions: top-level `contents: read`, with `pages: write`/`id-token: write` only on `deploy`, which runs no npm code. keep-alive and cleanup declare `permissions: {}`. `persist-credentials: false` is set everywhere.
- The jobs that hold SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN (migrate, cleanup) never run `npm ci`, so a compromised npm package cannot reach the production database credentials.
- One pinned Supabase CLI (2.110.0), shared through a composite action, is used by CI's local stack and the production `db push`.
- Every migration since 0011 sets `lock_timeout = '5s'` and `statement_timeout = '60s'`, enforced by Squawk in prek. Constraints on populated tables are added `not valid`.
- The orphan sweep keeps all three CLAUDE.md invariants (two `not exists` for path_full and path_thumb, text-to-text comparison, a 48-hour grace period). Manual runs default to dry-run and exit before fetching service_role. The fetched key is masked, the response shape is validated, each run is capped, and deletes go out in batches of 1,000.
- All third-party actions are pinned by commit SHA, inputs reach shells through env, and zizmor plus actionlint run over `.github/`.
- Dependabot uses a 7-day cooldown and grouped updates. Auto-merge is limited to direct:development patch bumps, uses `--auto` (waits for required checks) and never approves.
- CI checks schema/type drift (a `supabase gen types` diff). pgTAP and Splinter run on the same stack. A signed-out smoke test runs against the live origin, and only that test is retried.
- A missing NEXT_PUBLIC_\* value fails `next build` at prerender, so an unconfigured bundle cannot be published.
- k6 runs only on manual dispatch. It defaults to an in-run local stack, refuses the hosted target without explicit confirmation, and has a timeout and a concurrency group.
- The service worker never intercepts cross-origin or non-GET requests, so Supabase responses and signed photo URLs are never cached.
- splinter.sh pins its lint set by commit and sha256. lockfile-lint enforces the registry, HTTPS and integrity hashes.

## Coverage and gaps

Could not be read with the available access: branch protection and required status checks for main (whether e2e_local_stack and prek are required, whether up-to-date branches are required; git history shows they are not); the github-pages environment's deployment-branch rules; whether GitHub secret-scanning push protection is enabled and covers Supabase JWTs and sb_secret_ keys; and the hosted Supabase project's plan add-ons, PITR, Auth settings (anonymous sign-ins, Email provider, Site URL, redirect allow-list), key type (legacy or new), current usage against quotas, and whether the names in supabase_migrations.schema_migrations match the repository after the 2026-09-22 squash. Per the ground rules, no hosted service was contacted and no workflow, build or test suite was run. The stale-shell chunk 404 (OPS-08) was not reproduced in a browser. The ErrMissingLocal path (OPS-03) was confirmed in CLI v2.110.0 source but not executed. Not reviewed line by line: the k6 scripts under web/load/, migrations 0001-0007 and the bodies of 0015-0020 (headers and transaction/timeout statements only), and TEST_STRATEGY sections other than 8 and 12-14. Platform claims were checked against the source of the official docs on raw.githubusercontent.com (supabase/supabase pricing.ts, backups.mdx, redirect-urls.mdx and api_keys_deprecation.mdx; supabase/cli apply.go) and against Next docs shipped in node_modules. Claims about GitHub's 60-day schedule disable and the Dependabot directory scope rest on the lenses' reading of the github/docs source. Local main is behind origin (runs exist for f6a4b91 and a68adc1, which are not checked out). Only Deploy Pages run history was verified through the API; the CI run timestamp in OPS-01 and the missing CI run for 9d7930e in OPS-13 come from the cicd lens.

- `cicd`: 40 files read, 16 raw findings. Not checked: These could not be read with the access I had: branch protection and required status checks for main (including whether e2e_local_stack/prek are required, as auto-merge.yml:26 asks); the github-pages environment's deployment-branch rules and reviewers; whether GitHub secret-scanning push protection is enabled and covers Supabase JWTs; Codecov/Dependabot secret configuration; the hosted Supabase project's plan, PITR/backup add-ons, auth settings (anonymous sign-ins, email provider), Postgres major version, and whether supabase_migrations.schema_migrations names match the repo after the 2026-09-22 squash. As instructed, I did not contact the production Supabase project or the live Pages site. I ran no workflows, builds or test suites. docs.github.com, supabase.com and postgresql.org were blocked by the egress proxy, so every platform claim is checked against those docs' source files on raw.githubusercontent.com (github/docs, supabase/supabase, postgres/postgres), and the canonical doc URLs are given in the evidence. I did not review the k6 scripts under web/load/ line by line, TEST_STRATEGY sections outside 8 and 12-14, or migrations 0001-0007 and the bodies of 0015-0020 beyond their transaction and timeout statements. Of the seven red Deploy Pages runs, I opened the job details for two.
- `runtime-ops`: 49 files read, 11 raw findings. Not checked: I did not query any hosted service, following the ground rules. So I could not confirm the production Supabase plan (the docs imply Free), its Auth settings (Site URL, redirect allow-list, email and anonymous providers), whether it uses legacy or new API keys, its backup or PITR status, or its current usage against quotas. GitHub branch-protection details were not visible: only `protected: true` for main is, so I do not know about required checks, required up-to-date branches or a merge queue. supabase.com, docs.github.com, developer.mozilla.org, web.dev and w3c.github.io were blocked by the egress proxy. Platform behavior (Free-plan backups and quotas, legacy-key retirement date, the 60-day schedule disable, scheduled-run notification recipient, the byte-for-byte service-worker update rule, the redirect-URL fallback) comes from web-search results that quote those official pages, and github.com for upload-pages-artifact. The legacy-key deletion date is itself marked 'to be confirmed' by Supabase. I did not reproduce the stale-shell chunk 404 in a browser or run the Supabase CLI to show the migration-history divergence error; both rest on documented platform behavior and the exported build in web/out. I did not read k6-load-test.yml, the load-test scripts, or migrations other than 0002 (keepalive) and 0009.

## Dropped during consolidation

- 'No alerting ... a 37-hour red deploy streak went unaddressed' (cicd), 'unaddressed' part: Rephrased in OPS-12. The API confirms the seven consecutive failures, but they were addressed (next success 35780955393, about 37 hours later), and their cause was the smoke test's coverage floor rather than a production defect. The streak is evidence of slow detection, not of neglect.
- CI secret requirements are under-documented and make every fork build fail (runtime-ops), as a standalone finding: Not dropped in substance. It was merged into OPS-19 because it has the same root cause as the other setup and fork drift: undocumented or unautomated steps for forks and contributors. Keeping it separate would split one root cause into two findings.
- Separate runtime-ops finding 'Orphan sweep has no proportionality guard': Merged into OPS-05 together with the cicd finding that the sweep query has no test. Both concern the same destructive job lacking automated safeguards, and both fixes change the same query and file.
- The runtime-ops SW finding's sub-claim that the worker is never re-installed because sw.js is byte-identical: Not needed for the harm in OPS-08 and dropped as a separate mechanism. The stale HTML comes from stale-while-revalidate whether or not the worker updates, and the cache growth comes from the constant CACHE_NAME in cacheFirst. The byte-identical update rule was not independently re-verified.
