# Test strategy playbook

A portable testing strategy for apps of one particular shape: a **Next.js
frontend with no backend of its own**, on top of **Supabase** (Postgres, Auth,
Storage), where **Row Level Security is the only authorization boundary**. It
applies equally to a static export, a serverless deployment, or self-hosted
PostgREST + Postgres with the same properties.

It is not a general "how to test software" essay. It records what each test
layer can and cannot prove in this architecture, and which layer owns which
behavior, distilled from a production app of exactly this shape. Copy it into a
new project of the same archetype, then localize it (§16): fill the risk table
with the real tables and roles, pick the real tool stack, measure real
thresholds. **This file names no real table, route, file path, or measured
number** — those belong in the project's own docs, not here.

Two meta-rules the rest of the document assumes: **disagree in the open rather
than departing quietly** — if a task needs something the strategy rules out,
say so and get agreement first — and **update this the moment the architecture
it describes moves**, because a strategy nobody updates produces false
confidence at exactly the layer nobody double-checks.

The examples throughout use a generic vocabulary: *users* with *profiles* own
*resources*; a resource can be *shared* with another user through a *grant*
that carries a *role* (say, `viewer` or `editor`); a resource may reference
*storage objects* in a private bucket.

---

## 0. When this applies

- The frontend ships as static files or a thin serverless layer with **no
  server-side authorization code of its own**. Every page that shows user data
  is a client component talking to Supabase with the user's own token.
- Postgres RLS is where authorization lives, reached through PostgREST (or
  another auto-generated API layer) rather than hand-written endpoints.
- The anon key and the bundle are both public. Anyone can extract the key and
  issue arbitrary requests, so the policies are the entire defense.
- There is probably no staging environment; migrations likely apply straight to
  production on merge to the default branch.

If a server-side execution surface appears (an Edge Function, a route handler,
a `SECURITY DEFINER` function that re-implements an access check) or a second
authorization layer is added, this playbook's central claim — **the database
is the only thing that can catch an authorization bug** — stops holding for
that surface, and the document needs rethinking there, not patching.

---

## 1. Purpose

Keep confidence-per-test high and the feedback loop short by putting each
check at the cheapest level that would actually catch the failure it is aimed
at.

This needs its own document because there is no server. Authorization is not
layered: a wrong policy is caught by nothing else, and the interface looks
completely normal while showing somebody else's data. Most testing literature
assumes a server to fall back on. A strategy that only describes what is
already green isn't a strategy — name the gaps (§16).

---

## 2. System testing context

### Map the shape, for the real project

Write this table into the project's own docs, filled in with its real pieces:

| Piece | What it is | Testing consequence |
| --- | --- | --- |
| Next.js frontend, static or serverless | No route handlers, no server-side auth code | Nothing server-side to unit-test for authorization |
| Static host / CDN | Deployment failures are usually path failures (base path, asset URLs), not runtime ones | Needs a real fetch against the deployed origin |
| Postgres | Tables, functions, triggers, constraints, indexes | Behavior in SQL is unreachable from a unit test — needs a real database |
| RLS policies | On every table, and on `storage.objects` | The entire authorization boundary — §7 |
| PostgREST | Auto-generated; no hand-written API to contract-test | The schema *is* the contract; generated client types drifting from it is a real production failure |
| Supabase Auth | OAuth or magic-link sign-in | Interactive sign-in cannot run in CI; mint sessions via the admin API instead |
| Supabase Storage | Size/MIME-limited private bucket; files a row merely references | Bytes cannot be deleted from SQL; object *paths* often carry authorization meaning |
| Third-party services called from the browser | Geocoders, analytics, anything external | Always faked in tests |
| CI/CD | Holds `service_role` and the database URL if anything auto-deploys | The highest-privilege *code* is often shell in a workflow, not app code |

If there is no staging environment and CI applies pending migrations straight
to production, that fact should drive how heavy the pre-merge gate is (§13).

### What the estate should cover

Not a percentage target — a checklist of *kinds* of coverage that should each
exist somewhere: unit and component tests (the bulk of the estate); a
signed-out browser suite (safe to run against production); a signed-in
integration suite against a real local stack; database tests (pgTAP) for the
RLS and constraint matrix; mutation testing on a deliberate subset; fast static
analysis gating everything else; a schema-contract check in CI; general-purpose
SAST; and a post-deploy smoke test against the live URL.

### Trust boundaries to enumerate

1. **Browser bundle → PostgREST.** A user's token crosses it; bundle and anon
   key are both public, so the only meaningful test does exactly what an
   attacker could: a direct request, bypassing the UI.
2. **One user → another user's resources**, through whatever sharing or
   delegation exists. The most permissive role a grant can carry needs the most
   scrutiny (§7).
3. **Anonymous → everything.** Usually denied twice: by RLS (no predicate
   matches with no identity) and by an explicit `REVOKE` of the table grant.
   Test both — they fail differently. A revoked grant errors before any policy
   runs; a policy filter returns an empty result. A project can have one
   covered while believing both are.
4. **CI/CD → production.** Whatever holds `service_role` and the database URL.
   Rarely covered by a *test*; covered by workflow-scanning tools and review.
5. **App → third-party HTTP.** Always faked; never reached.

---

## 3. Testing principles

1. **Authorization is not testable from the client.** A hidden button proves a
   UX property, nothing more. Authorization tests hold a real token and talk to
   a real database.
2. **Never mock the thing that carries the risk.** Mocking the Supabase client
   tests your own call shape, not RLS, triggers, or constraints.
3. **Coverage is a signal; mutation score is stronger.** Line coverage says the
   line ran — worthless on its own for pure, high-consequence logic.
4. **Prefer the lowest level with the same confidence.** Pagination math is a
   unit test; *that the UI paginates* is one E2E case, not one per field.
5. **Deterministic or deleted.** No retries to paper over flakiness, except the
   one boundary where a retry distinguishes a real fault from a dropped
   connection (post-deploy smoke). A flake is a defect, not weather.
6. **Test the failure paths.** Anything that retries, skips-and-continues, or
   is cancellable mid-operation carries a data-loss or duplication risk — worth
   injecting failures into deliberately.
7. **If it is hard to test, fix the design.** Extract pure logic from the I/O
   beside it, then test the extract — don't fake the world instead.
8. **Fixtures may not out-privilege the app.** `service_role` in a fixture opens
   exactly one door: creating test users. A fixture that reaches states the app
   itself couldn't hides bugs.
9. **One new behavior, one new assertion, at one level.** Duplicated coverage
   at three levels costs three times as much and catches the bug once.

---

## 4. Risk model — a template, not a checklist

Rank by expected cost, not likelihood alone. "Cheapest meaningful test" means
the level below which the risk is genuinely uncovered. Copy the columns,
replace the rows with the real project's tables, roles, and operations, and
rank by real cost:

| Risk | What it typically costs | Cheapest meaningful test |
| --- | --- | --- |
| **Cross-tenant read or write** — a policy stops holding | Silent, total confidentiality failure; UI looks fine | Integration test, real token, real database, bypassing the UI |
| **A permissive role reaches further than intended** (an `editor` can also rename, delete, or promote itself) | Privilege escalation between two real accounts | Same, with a second user holding that role |
| **A storage policy keys on the wrong path segment** | A grantee moves or overwrites the owner's object; revocation no longer reaches it | Integration test against real Storage, both identities |
| **Orphaned storage objects or data loss on delete** | Bytes unreachable, or an attachment silently lost | Unit test for delete ordering; integration test for the cascade |
| **A migration that cannot apply to a populated database** | Deploy blocked or half-applied, unattended | From-scratch CI catches syntax, not a `NOT NULL` with no default — §8 |
| **Client/schema drift** | Runtime errors after deploy | A generated-types diff in CI |
| **Injection into PostgREST's filter grammar** | User input rewrites the query | Unit + mutation on the filter builder, plus adversarial E2E input |
| **Export-format injection or corruption** (CSV formula injection, archive size limits) | A file that damages the opener or won't open | Unit + mutation on the encoding function |
| **Static-hosting or base-path faults** | A site that quietly breaks post-deploy | Serve the real artifact under its real path, locally and deployed |
| **In-client race conditions** | Stale data shown, broken assets | Unit tests on sequencing and caching, not an E2E timing test |
| **Duplicate or repeated operations** | Duplicate records or side effects | Unit tests with injected fakes simulating the retry |
| **Third-party outage** | Degraded feature, not your outage | Unit test on the error branch only |
| **Availability** (free-tier auto-pause) | App down or slow to first response | A keep-alive mitigation, not a test |
| **Destructive scheduled-job logic faults** | Irreversible deletion of live data | No cheap test; dry-run mode + treat the query as security-critical — §12 |
| **Capacity/throughput** | Slow queries at real usage | Index design + query-plan inspection, not a load harness, absent a real SLA |
| **Accessibility regressions** | Unusable with keyboard or screen reader | Static linting for the automatable subset, runtime checks for the rest — §9 |

A project should end up with 10–20 rows like this, each with a
"covered / partly / not covered" status, updated as real incidents happen.

---

## 5. Test layers

| Layer | Verdict, in this archetype | Why |
| --- | --- | --- |
| Unit (pure functions) | **Required** | Where most interestingly-wrong logic lives once extracted from I/O; the only level mutation testing means anything at. |
| Component / hook | **Required** | Rendering faults (hydration mismatches, missing a11y attributes, a control that never disables) are invisible to pure-logic tests. |
| Database tests (pgTAP) | **Required** | Policies, triggers, constraints, and function hardening, proven directly and fast, impersonating the real roles. |
| Integration against real Postgres + Storage + Auth | **Required, non-negotiable** | The only level where RLS through PostgREST, storage policies, signed URLs, MIME/size limits, and session minting exist at all. |
| API testing | **Required, not a separate suite** | PostgREST is auto-generated; the integration suite issuing direct calls *is* the API suite. |
| Contract testing | **Required, narrow form** | The real contract is schema ↔ generated types. Pact-style consumer/provider testing is rarely justified without independent deploys on both sides. |
| Authorization/security testing | **Required — highest priority** | §7. |
| Dynamic scanning (DAST) | **Recommended, narrow scope** | A passive baseline scan of the *running* built artifact; complements §7, never a substitute — §6. |
| Property-based | **Recommended, narrowly** | §10. |
| Mutation | **Required, deliberately scoped** | §11. |
| E2E (full stack) | **Required, deliberately small** | §9. |
| API fuzzing | **Usually not justified** | Fuzzing PostgREST mostly tests the vendor's product; hostile-input unit tests plus mutation cover what is yours. |
| Concurrency testing | **Unit level, unless real multi-writer scenarios exist** | In-client races are common; same-row multi-writer conflicts are rare in single-owner data models. |
| Load testing | **Usually not justified** | Add it only once there is an actual throughput SLA. |
| Resilience / failure injection | **Required at unit level; optional above** | Drive retry, backoff, skip, and cancel through injected fakes. |
| Infrastructure/deployment testing | **Required** | Every migration applied from scratch in CI, and the built artifact served under its real base path. |
| Smoke testing | **Required** | Signed-out suite against the deployed origin — a Node prerender can mask failures only visible as a browser bundle. |
| Production synthetic testing | **Optional** | Mostly duplicates post-deploy smoke. Never signed-in against production. |

### Who owns which behavior — and who does not

Build this table for the real project once modules exist to assign:

| Behavior class | Owning layer | Not this |
| --- | --- | --- |
| Pure data transforms (filters, pagination, encoding, formatting) | Unit + mutation | Not the browser |
| Rendering, disabled states, focus, keyboard paths, a11y attributes | Component tests | Not E2E, unless the journey depends on it |
| Normalization triggers, ownership rewriting, constraints, cascades, cleanup functions | pgTAP + integration, real database | Not unit — it doesn't exist in app code |
| Row/object visibility, grant scope, expiry, revocation, anon denial | Integration, second real identity, through PostgREST | **Never** client code or a component test |
| Generated client types ↔ schema | Automated contract diff | Not a hand-written assertion |
| Base path, icons, manifest, anything pre-hydration | Signed-out browser suite | Not unit alone |
| One complete user journey | E2E | Not one E2E case per field |
| Migration applicability | CI applying from scratch, plus a populated-database check for altering migrations (§8) | Not review-by-eye alone |
| Repo tooling outside the shipped bundle | The job or script that depends on it | Not unit tests, not in bundle coverage |

---

## 6. Architecture-specific strategy

### The shape of the pyramid

Not the usual pyramid. The middle band — integration against a real database —
is unusually load-bearing, since authorization and much business logic live in
SQL and exist nowhere a unit test can reach.

```text
Layer                              Weight           Runs against
---------------------------------  ---------------  --------------------------------
Unit + component                   most of it       fakes/in-memory; a scoped subset
                                                      also mutation-scored
Database tests (pgTAP)             fast, targeted   real Postgres, direct SQL,
                                                      impersonated roles
API-level integration              a wide band      real database + storage + auth,
                                                      real tokens, no browser
Browser, signed-in journeys        one per journey  real stack, real bundle
Browser, signed-out                small            built artifact; also post-deploy
```

Hold this shape deliberately. Two ways it drifts: new policies landing without
the API-level band growing (authorization silently leaving test coverage —
watch this one especially), or the browser bands growing to assert things a
cheaper level could have settled.

### What must be real, and what may be faked

| Thing | Unit/component tests | Integration suite |
| --- | --- | --- |
| Supabase client | Faked (injected parameter or module mock) | **Real** — one client per identity |
| Postgres, RLS, triggers | Absent — do not simulate | **Real.** The entire point of the suite. |
| Storage | Faked | **Real**, including MIME/size enforcement and path policies |
| Auth/sessions | Faked | **Real**, session minted via the admin API |
| Browser-only APIs (Worker, Canvas, geolocation) | Faked | Real |
| Third-party services | **Always faked** | Always faked |
| Non-deterministic primitives (ids, clocks) | Injected/stubbed | Real |
| `service_role` | Never | **Only** to create test users — §3.8 |

### Managed-service boundaries worth explicit attention

- **Function/edge runtime.** If none exists, say so. The day one is added, it is
  the first server-side authorization surface and needs its own section. The
  same applies to a `SECURITY DEFINER` SQL function that bypasses RLS and
  re-implements the access check itself: it is an authorization boundary in its
  own right and needs its own §7 case.
- **Storage paths that carry authorization meaning.** If a policy parses an id
  out of an object path, a path that fails to parse must make the policy **not
  match**, never abort the statement — a raised error inside `USING` aborts the
  whole query. Worth a direct pgTAP test of the fail-closed parser.
- **Schema-cache staleness.** A newly added column is invisible to PostgREST
  until its cache reloads; a hand-applied migration needs the same
  `NOTIFY pgrst, 'reload schema'` an automated deploy should send. The one
  "eventual consistency" failure mode here, and it is a deploy-time concern.
- **Row/response caps.** PostgREST's default row limit silently truncates
  unranged responses — page around it deliberately, and test page boundaries
  with fakes.
- **Partial failure across correlated writes.** If one action produces more
  than one write (a full-size object and a thumbnail, a row and its file),
  decide and test the specific chosen behavior with an injected failing write,
  rather than leaving it to accident.
- **Local emulation vs. deployed.** `supabase start` runs the same engines in
  containers; trust its integration results. Reserve "only provable deployed"
  for genuinely host-specific behavior (CDN, base path, cold starts).

### Static analysis layering

Four *different* tools answer four different questions — don't let one stand
in for another:

1. **Module-boundary tool** (dependency-cruiser) — "does an import cross a
   boundary it shouldn't," by walking the whole graph. The one rule worth having
   from day one: only the data-access layer may import the Supabase client
   directly. A single-file linter can't see an *indirect* reach through another
   module; a graph tool can. Also: no import cycles, no orphaned modules, and
   the shipped bundle never imports Node-only tooling that might carry
   privileged credentials.
2. **Dead-code/unused-dependency tool** (knip) — "does anything have zero
   reachable consumers." Generated files need an explicit ignore rather than
   hand-editing; anything referenced only as a string inside another tool's
   config needs an explicit entry point.
3. **General-purpose SAST** (Semgrep/Opengrep with a community rule pack) —
   language-level bug and vulnerability shapes nothing else catches. Verify
   once what the tool sends over the network (read its source), and graduate
   findings by severity: block on error, surface warning/info for triage. Every
   suppression carries its reasoning at the suppression, and a claimed fix is
   verified to stop the matcher firing, not assumed to.
4. **A code-smell/maintainability linter** (cognitive complexity, duplication)
   — what a type checker and a graph tool are both blind to. Tune defaults
   against the project's *own* code before accepting them; a threshold copied
   from the default is a guess, not a measurement.

For all four: measure real run time before deciding placement. Seconds-scale
belongs in a pre-commit/pre-push gate; a live network fetch or cold binary
install belongs in CI only.

### Dynamic scanning (DAST)

Everything above is static: it reads source, a dependency graph, or a findings
file. A **baseline, passive-only scan** (spider plus passive rules, never an
active attack scan) points a scanner at the *running* app against an isolated,
ephemeral local build. It is the only layer that notices a response header
regressing or a stack trace leaking into rendered HTML, because nothing else
looks at real HTTP responses.

- **Covers**: generic header and cookie-flag misconfiguration, passive
  injection and error-disclosure probes, observed against real rendered
  responses.
- **Explicitly does not cover**: the authorization model. A baseline scan never
  signs in and never holds a token. Never read a green DAST run as
  authorization coverage — that is §7's job, exclusively.
- **Never scans anything but a local, ephemeral build** — never a deployed or
  production target.
- **Scan more than the login page** if the app's real content only exists once
  signed in; a login screen alone has almost nothing rendered for a
  content-based finding to hide in.
- **A structurally unfixable static-hosting header stays explicitly ignored,
  not silently unaddressed** — if the host can't set a given header at all,
  document why and move on.
- **Graduated severity**, like every other tool here: a small, deliberate set of
  findings blocks; the rest is surfaced for triage.

---

## 7. Security and authorization testing

**The highest-value testing in this architecture.** There is no second layer
to catch an authorization bug — it fails silently and looks like success. A
frontend test is never evidence that an authorization rule works.

### Rules

1. Every authorization test holds a **real access token for a real user** and
   issues requests **directly against PostgREST and the Storage API**, not
   through the UI.
2. Every test needs **at least two users** — a single-identity suite only ever
   makes allowed requests, so it can never notice a broken policy.
3. Assert on the **mechanism, not just the outcome**: an empty result means a
   policy filtered the row; a permission error means the grant never existed.
   Distinguish both, especially for the anonymous case.
4. Assert that a **satisfiable** filter returns nothing — querying for the other
   user's known row and getting `[]` is sharper than an unfiltered read that
   merely doesn't contain it.
5. Write-side tests **read back as the owner** — a write accepted but hidden
   from the writer's own later read is the worst outcome, and only that read
   rules it out.
6. **Every mirrored authorization surface needs its own test.** A database row
   and the storage object it references are governed by separate policies; a
   test against one proves nothing about the other.
7. Grants are tested **in both directions**: an active grant opens exactly what
   it should, *and* revocation or expiry closes it again with the resource still
   present — otherwise "access denied" only proves the resource stopped
   existing.
8. Cover every verb the policies back — `SELECT`, `INSERT`, `UPDATE`, `DELETE`
   — and the negative case for each: as the owner, as a grantee at each role, as
   a stranger, and as `anon`. A table with no `UPDATE` policy is tested for the
   denial that omission implies.

### The most-permissive role needs the most scrutiny

If sharing has more than one role, the most permissive non-owner role is where
escalation lives. Write out, and test both halves: what an `editor` **can** do
inside the shared resource, and what it **cannot** — anything scoped to the
resource itself (rename, delete, manage grants, self-promote), reaching an
ungranted resource, writing under another user's storage prefix, or acting
after revocation or expiry.

One asymmetry worth checking and writing down once confirmed: if "can write"
includes ownership of the parent but "can read" requires an active grant
specifically, then **owning the parent doesn't automatically reveal everything
a delegate did inside it**. That is a legitimate design, easy to mistake for a
bug, and worth a named executed test rather than a comment.

### Two levels of authorization test

pgTAP-style direct-database tests and end-to-end tests through PostgREST
complement each other; neither replaces the other:

- **Direct-database tests** (`SET LOCAL ROLE authenticated` plus a
  `request.jwt.claims` GUC) prove the policy, trigger, and constraint logic
  itself, fast enough for every schema change. Verify the impersonation
  mechanism itself works — an identical query fails with no claim, passes with
  one, and depends on its content — otherwise a suite running as `postgres`
  silently passes everything.
- **End-to-end tests** prove the same properties through the real pipeline — a
  real request, a real minted JWT — and are usually the only place
  storage-level authorization and the bytes behind a `storage.objects` row get
  exercised at all.
- Fixtures at either layer follow §3.8: impersonate the real role, never a
  superuser bypass.

A schema change adding or modifying a policy, grant, or ownership-affecting
trigger ships a matching end-to-end case in the same change; a direct-database
case alongside it is encouraged but doesn't discharge this on its own. State
this as an absolute: the failure is invisible, there is no second layer, and
SQL review by eye has a documented history of missing exactly this class of
bug.

### SQL linting is a different concern

A SQL linter answers "is this well-formed," not "is this policy's logic
correct." It discharges none of the above.

### Out of scope, deliberately

Penetration testing the managed platform itself; anonymous or public share
links if the project has ruled them out by design (a new, higher-risk boundary
if ever added, not a checkbox on an existing one); secret scanning beyond a
dedicated hook and the platform's own tooling.

---

## 8. Integration strategy

### Setup that must not be weakened

- **Seed as the user, never through `service_role`.** That credential exists
  only to create test users. A bypass can construct states the app itself could
  never reach and hides real policy bugs.
- **Isolate fixtures across parallel specs.** Decide explicitly which fixtures
  are read-only shared state and which are scratch resources owned by one
  writing spec. A spec writing into another's resource makes both flaky,
  unpredictably.
- **Build the bundle against the stack it tests.** The Supabase URL is baked in
  at build time; a bundle built against another project produces a suite that
  passes while testing the wrong backend.
- **Clean up in `finally`.** Probe rows and objects must not survive a failed
  assertion.
- **Fail the suite on an unexpected console or runtime error** — this is what
  catches a rejected background query hiding behind a passing assertion.

### Migrations against a populated database

CI applies every migration to an **empty** database; production applies only
*pending* ones to a database **full of rows** — different operations, and in a
no-staging setup the second is unattended. A `NOT NULL` with no default, a
unique index existing rows violate, or a check constraint existing data fails
passes from-scratch CI and fails against production.

**Policy:** any migration altering an existing table, or adding a constraint or
index to one, is verified locally against a database already holding
representative rows (reset, seed, *then* apply) before merge, and that
verification is stated explicitly. Treat as review-enforced rather than
automated unless a production-shaped CI seed is worth maintaining.

### Idempotency and repeated operations

Any repeatable or resubmittable operation needs a *decided*, tested answer —
not an accidental one discovered later:

| Operation shape | What to decide and test |
| --- | --- |
| An import or create run twice with the same input | Duplicate, or an identity to detect the repeat? Assert whichever is chosen. |
| A storage upload retried after a partial failure | Same path? If the bucket forbids overwrite, decide the fallback (skip and flag, fresh path) and test with a fake that fails partway. |
| Creating a grant that already exists | No-op or clear conflict, never a silent duplicate with different terms. |
| Revoking a grant already revoked | Safely idempotent — a second delete affecting zero rows. |
| A cleanup or orphan-detection job re-run | Safe to repeat without re-deleting or double-processing — set-based and existence-checked usually gets this free. |

### What integration tests should *not* do

Re-test pure logic already covered at unit and mutation level. A unit test
finds broken pagination arithmetic in milliseconds; the same point through a
browser and a real database costs orders of magnitude more.

---

## 9. E2E strategy

Split into at least two suites with genuinely different jobs.

**Signed-out** — everything in it must hold for an anonymous visitor, which is
what makes it safe to run against production post-deploy. Base path,
manifest and icons, pre-hydration behavior, theme, layout at more than one
viewport, and the sign-in entry point up to the redirect. Nothing signed-in
belongs here.

**Signed-in** — critical journeys against a real local stack, kept to whole
journeys, not field detail: load the main view and see correct data; create,
edit, and delete the core resource end to end; search narrows results,
including hostile input; an uploaded file persists, survives reload, and is
removed with its resource; any secondary view (a map, a dashboard) agrees with
the list view; export/import round-trips; sharing is driven from both sides
with two real sessions; signing out actually ends the session.

Sign-in does not go through the interface when the only provider is an OAuth
flow no runner can drive: a setup project creates the user through the auth
admin API, signs in, and writes the session into storage state.

A UI change still generally needs one E2E case for its journey — but every
field-level detail around it (disabled states, validation wording, focus order)
belongs in component tests, milliseconds-fast and legible. A second browser
case for the same journey should feel expensive, because it is.

Two habits worth adopting: treat mobile as its own **target**, not a variant,
if layout faults tend to be viewport-specific; and **poll for expected state**
rather than reading once, whenever the UI debounces or waits on a round trip.

### How the browser suite addresses the UI

Pick the locator that matches what the test is about, and make it stable:

- **Accessible, user-facing locators** (`getByRole`, `getByLabel`) when the
  test is about what a user sees and does. They double as an accessibility
  check: a control a role-based locator can't find is a control a screen reader
  can't find either.
- **Stable test ids** (`data-testid`) where a deliberate benefit exists: a
  repeated card or row that needs addressing by content, an element whose
  accessible name is translated or user-supplied copy, an attribute-state
  assertion (`disabled`, `aria-current`, `lang`), or a suite that must survive
  copy edits across locales without turning journeys red. A test id is an
  explicit, greppable contract between the component and the suite.
- **Never by CSS class or DOM structure** — that breaks on every restyle and
  asserts nothing a user cares about.
- **Text that is itself the subject** is asserted, not located by: a
  localization case finds the element by role or id and asserts its *text*;
  finding it *by* that text makes the assertion circular.
- **A third party's own DOM** (a map, a rich-text editor) is reached the way it
  allows, inside the page object rather than the spec, with a one-line comment
  saying why.

A project may choose either locator strategy as its default; what matters is
that the choice is written down, applied consistently, and that neither
strategy leaks into specs (below).

**Wrap each screen in a page object, and hang them all off one tree.** Each
screen exports one `init<Screen>(page)` returning its root locator as a
callable, plus `locators` (raw handles, grouped) and `do` (whole interactions).
Nesting follows the UI, so a repeated row or card gets its own small object of
the same shape:

```ts
export function initResourceList(page: Page) {
  const root = page.getByRole('main');
  const locators = {
    buttons: { newResource: root.getByRole('button', { name: /new/i }) },
    cards: root.getByTestId('resource-card'),
  };
  const interactions = {
    addResource: async (title: string) => {
      await locators.buttons.newResource.click();
      await page.getByLabel(/title/i).fill(title);
      await page.getByRole('button', { name: /save/i }).click();
      await expect(locators.cards.filter({ hasText: title })).toBeVisible();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
```

One tree collects the screens, with getters so a spec that touches one screen
builds one screen's locators, and a fixture hands the tree to every spec:

```ts
export function createPageTree(page: Page) {
  return {
    get resources() {
      return initResourceList(page);
    },
    get form() {
      return initResourceForm(page);
    },
  };
}

export const test = base.extend<{ on: typeof createPageTree }>({
  on: async ({}, use) => {
    await use((page) => createPageTree(page));
  },
});
```

A spec then reads as the journey it is and names no selector at all:

```ts
test('files a resource and finds it again', async ({ on, page }) => {
  const app = on(page);
  await app.resources.do.addResource('Title');
  await expect(app.resources.card('Title').locators.title).toHaveText('Title');
});
```

Four rules keep that from decaying back into selectors sprinkled through specs:

- **No spec names a selector.** A spec needing a new element grows the page
  object rather than reaching past it. Grepping the spec directory for the
  locator API (`getByTestId`, `getByRole`, `locator(`) should come back empty
  but for document-level elements (`html`, `body`, `meta`, `link`) — run that
  grep rather than trusting the convention.
- **`do` holds whole actions; `locators` holds the handles.** An action spanning
  two screens (a delete and the confirmation it raises) belongs to the screen
  that starts it, with a one-line comment saying why it reaches across.
- **Waiting belongs to the page object.** An `open()` returns when the screen is
  actually there, not when the click landed, so no spec carries a wait every
  other spec also needs — and none carries a sleep.
- **Assertions belong to the spec.** A page object may assert what its own
  action promises (the row it just created is on screen); what the test is
  *about* stays in the test.

The cost is real: a page object is indirection, and a badly-drawn one hides the
behavior instead of the markup. Keep each to a single screen, keep `do` methods
to things a user would name, and let a spec drop to `locators` where the
interaction is genuinely one click.

### Accessibility — two automated layers, neither proof of the whole claim

**Static** (a JSX a11y linter) catches what is wrong before anything renders:
missing alt text, invalid ARIA, an unlabeled control. **Runtime** (axe-core in
the browser suite) catches what only a rendered DOM reveals: computed contrast,
real focus order, accessible-name computation — scoped to representative
states, not every route. Decide explicitly which severities block CI and which
are surfaced for triage; treating every finding as blocking usually gets the
gate disabled the first time it catches something ambiguous.

Neither layer proves full compliance, screen-reader-specific behavior, or a
keyboard-only walkthrough of custom widgets. A clean run is "no known
regression," not "verified accessible" — say that explicitly.

---

## 10. Property-based testing strategy

**Recommended, narrowly — only where it earns its dependency.** Most pure
functions have small, enumerable input spaces already covered exhaustively by
example tests, with mutation testing proving those examples load-bearing.
Property-based testing earns its place where an input space is genuinely
adversarial and a property is easy to state: a filter builder that must never
let input escape PostgREST's grammar, an encode/decode pair that must
round-trip for any input, a date-packing function that must never underflow its
valid range.

If adopted: a **seeded, deterministic** runner (a failing seed must reproduce);
one dependency; properties *beside* existing example tests, not replacing them;
inside the unit suite's normal time budget. Needs a real near-miss as
justification, not speculative adoption.

---

## 11. Mutation testing strategy

**Required, deliberately scoped — never the whole codebase.**

- Scope to a short, explicit, maintained file list, shared with any per-file
  coverage floor so the two can't drift apart.
- Every listed file is pure exported logic, or I/O reached through an injected
  parameter so a test can drive it and assert the request it composed. Prefer
  that over inline exclusions; if the tool's exclusion regions are used at all,
  each carries its reason at the exclusion.
- **Never mutate the rendering layer** — JSX mutants are near-equivalent by the
  thousand and the score means nothing. If a file can't split into "pure logic"
  and "rendering," the file is the problem.
- Run on every change touching scoped files, not just the default branch. A
  scoped run is fast enough; learning after the merge that a test asserts
  nothing is learning it too late.

A surviving mutant has exactly two honest endings: **a missing assertion** (kill
it with a real behavioral test — usually an unpinned boundary or error path),
or **equivalent** (no input distinguishes it). For an equivalent mutant, first
ask whether the code it lives in needs to exist: a guard the type system already
discharges, a default spelled out explicitly, a wrapper every caller unwraps.
Deleting that code is the ending that pays for the whole exercise. What
genuinely remains equivalent is left visible in the report with its reason
written down, not hidden behind a suppression. Never write a test that can't
fail just to kill a mutant.

Two survivor classes are structural in React and worth knowing in advance: an
empty dependency array (the tool replaces it with a constant React reads as
unchanged on every render — drop the memoization if it isn't load-bearing,
otherwise leave the survivor visible), and a timeout (a counter driven
backwards, or a fake that answers every page identically — usually fixable by
iterating over the thing being counted, or by a page fake backed by a finite
table).

A score below threshold fails the build; above threshold but below 100% isn't
an automatic pass either — every survivor is an open question.

---

## 12. Performance and resilience testing

### Performance

**No numeric backend gate is usually justified** without a real throughput SLA
— a synthetic load number against a low-traffic app mostly measures the
hosting tier. What replaces it: a new filtering or sorting query names its
index (every branch of an OR'd search needs its own — one gap collapses the
whole query to a sequential scan); a new bulk operation is set-based, not
row-by-row; anything reading a large set pages around PostgREST's row cap.
Inspect the real query plan for any new hot query, **as the role the app uses**
— an index the planner chooses as `postgres` may be unreachable under RLS when
the predicate's operator is not leakproof.

**The frontend bundle/page-load side benefits from a numeric gate**
(Lighthouse CI), since bundle size and render cost degrade invisibly without
one. If adopted: run against the real production build, never a dev server; a
small number of representative pages and states (signed out, and signed in via
a demo or anonymous session), not every route; gate on performance
specifically, leaving accessibility to §9's tooling rather than
double-asserting the same finding; take a median of several runs; and **set
thresholds from a measured baseline with real margin**, never a tool's generic
defaults or the measured value exactly. If a measurement reveals something
worth understanding (a first-run layout shift a real session would never see),
write down *why* the threshold sits where it does rather than silently widening
it.

### Resilience

Drive failure injection at unit level through fakes those modules should
already accept: a batched network operation's failed sub-call and retry/skip
behavior; a bulk import's missing input, exhausted retries, partial multi-write
failure, and cancellation; a bounded concurrency pool's
first-rejection-stops-pickup behavior; delete ordering, verified and never
silently reversed. Injecting into the real stack is optional and rarely worth
it once these branches are reachable with a fake.

### Destructive scheduled jobs — the highest-risk logic in the system

A scheduled job holding `service_role` and doing irreversible bulk deletes (a
storage-orphan sweep is the canonical example) is more security-critical than
most RLS policies: its failure mode is silent, irreversible, and touches live
data. Rarely worth a test harness for shell-in-YAML, but three cheap
mitigations are almost always worth having: **review its query like a schema
change**; **a dry-run mode that lists what it would delete and exits, before
fetching any elevated credential**, defaulted on for manual runs; and **a grace
period** between "looks orphaned" and "eligible for deletion" long enough that
a slow or partial write can never fall inside it — usually the single most
important invariant, and the easiest for a future edit to shrink while
"simplifying."

Three lessons worth carrying into any project of this shape:

- **Match every derived artifact, not just the primary one.** If one record
  produces more than one storage object (full-size plus thumbnail), matching
  only the primary path classifies every secondary object as orphaned. A
  plausible first draft naturally produces this; only executing the predicate
  against real data catches it.
- **Never cast an untrusted or malformed identifier into a typed column inside
  the query.** A failed cast aborts the *entire* query rather than simply not
  matching — fail closed to "no match," don't raise.
- **Ask "does anything still reference this object," not a proxy for it** (like
  "does a record with this parsed-out id exist"). A proxy answers wrong both
  ways: it can keep an object merely sharing an id with something unrelated,
  and it can never find one whose owning row's insert failed after the bytes
  were already written.

---

## 13. CI/CD execution strategy

1. **Fast hygiene first** — file hygiene, secrets, formatting, anything
   seconds-scale gates everything else, so a bad config fails before minutes
   are spent on browsers and databases.
2. **Path-filter heavier jobs on PRs** — a database job runs only when
   database-adjacent files changed. A job skipped by its own condition reports
   as passing, never weakening what branch protection requires.
3. **Run the full, unconditional set on whatever branch actually deploys**,
   regardless of what that push touched — path-filtering is a PR-time speedup,
   not a release-time one.
4. **Order the deploy pipeline to fail safe**: migrate, reload the PostgREST
   schema cache, then build, then deploy, then smoke-test, each depending on
   the last, so a rejected migration leaves the previous bundle serving the
   previous schema.
5. **Retry only the deploy-target smoke test** — the one place a retry
   distinguishes a broken deploy from a dropped connection. Everywhere else,
   `retries: 0`.
6. **No staging means the PR gate has to be heavier, not lighter** — if merging
   to default *is* the release, run the full authorization and integration
   suite on every relevant PR, not nightly-only.
7. **Pin the same Supabase CLI version** for CI's local stack and the
   unattended `db push`, structurally (a shared action), so the migrations are
   exercised by the CLI that will apply them.

**Scheduled jobs:** a destructive cleanup sweep (dry-run by default, §12); an
availability keep-alive (a mitigation, not a test); dependency updates —
restrict auto-merge to patch-level, dev-only bumps if anything auto-merges at
all, since a dev dependency reaches the CI runner but a runtime one reaches
every user's browser. That asymmetry is a security control, not a convenience
setting.

---

## 14. Quality gates

Every gate needs a stated reason — a gate without one is noise, and tends to
get loosened the first time it is inconvenient.

| Gate | Generic guidance |
| --- | --- |
| Coverage floor | A **floor** set from what the suite achieves with margin — not a target. Raise by hand when the suite genuinely improves. A per-suite floor for browser coverage, since signed-in and signed-out suites reach very different amounts of the app. |
| Auto-ratcheting coverage | **Don't** — it makes a green local run produce a red PR. Raise floors by hand. |
| Mutation score | A break threshold just below the measured score so one new equivalent mutant can't block an unrelated change — every survivor above it is still an open question, not a pass. |
| Direction of any threshold | **Never lowered** to pass a build — that converts a design problem into a permanently weaker gate. Redesign, or raise the question, instead. |
| Test pass rate | 100%, `retries: 0` except the one deploy-target boundary (§13). |
| Authorization tests | Must pass; a policy, grant, or trigger change ships a matching case in the same change (§7). |
| Schema contract | The generated-types-vs-schema diff must be clean — drift surfaces as production runtime errors otherwise. |
| Deployment | Post-deploy smoke green against the **live** origin. |
| Performance | No numeric backend gate without a real SLA; a frontend budget from a measured baseline with margin (§12). |
| Static analysis | Graduated by severity — block on real findings, surface the rest for triage (§6). |
| Suppressions (any kind) | Only with a comment explaining *why*, added after understanding the failure — never as a first response to red. |
| New UI | Needs an E2E case for the journey, plus component coverage for field-level detail. |
| New functional behavior | Needs a unit test; authorization behavior additionally needs §7. |

---

## 15. Test anti-patterns

Each of these fails silently or looks like flake when it is actually a defect.

1. Treating a client-side check as an authorization test — it is UX, zero
   security confidence.
2. Mocking the Supabase client and calling it an integration test — it tests
   your own call shape, nothing on the far side of the mock.
3. Seeding fixtures with `service_role` — bypasses RLS, can construct states
   the app can't reach.
4. Testing one mirrored authorization surface (the row) and assuming the other
   (the storage object).
5. Sharing one seeded resource between parallel writing specs — fails both, at
   random, looks like flake.
6. Leaving probe rows or objects behind on a failed assertion.
7. Putting a signed-in test in the signed-out suite that runs against
   production.
8. Retries or arbitrary sleeps to paper over a flake — poll for expected state
   and fix the race instead.
9. Re-testing pure logic through the browser — orders of magnitude more costly,
   fails far less clearly.
10. Lowering a threshold, or reaching for a suppression, to get to green —
    understand the failure first.
11. Test gaming — a test written to touch a line, a branch to dodge a mutant, a
    file excluded to avoid dealing with it.
12. Widening mutation scope to the rendering layer.
13. Writing a test for a platform behavior the platform has already ruled out
    (deleting from `storage.objects` in SQL, DDL on a table the project does
    not own) — check its constraints before writing the test, not after it
    fails mysteriously.
14. Running any test, migration, or destructive operation against the hosted
    project — local stack only, always.
15. Asserting a weak truthiness check on an error object instead of its actual
    code or status.
16. Adding an E2E case for a field-level detail — journeys belong at E2E,
    fields in component tests.
17. Locating an element by CSS class or DOM position, or by the very text the
    test is meant to assert.

---

## 16. Adapting and maintaining this playbook

**Copying into a new project:** fill §2's context table and trust-boundary
list with real pieces; build §4's risk table with real tables, roles, and
operations, ranked by real cost; fill §5's ownership table once real modules
exist to assign; pick the real tool stack for §6's four static-analysis layers
and §11's mutation scope; choose and record §9's default locator strategy; and
measure real thresholds for §12 and §14 — never carry over another project's
numbers. Write the concrete instantiation into the project's own docs
(architecture doc, design-decisions doc, CI config, pre-merge checklist), not
into a copy of this file — keep this file free of project-specific facts so it
stays reusable next time.

**When to update it:** a server-side execution surface appears where there was
none (invalidates §0, needs rethinking); a new trust boundary appears (another
role, grant shape, data source, or a previously ruled-out capability); a
layer's verdict in §5 changes (record the reasoning, not just the verdict); a
quality gate moves (a changed number is a changed justification); a named gap
closes (delete it, don't describe a hole that no longer exists); or an incident
happens — the single best input this kind of document gets, so add it to the
risk model and name the level that should have caught it.
