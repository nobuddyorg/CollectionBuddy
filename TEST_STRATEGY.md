# Test strategy playbook

A portable testing strategy for apps built on the **"thin client, fat
database"** shape: a static or serverless frontend with no backend of its
own, sitting on top of a Postgres database (Supabase, or self-hosted
PostgREST + Postgres, or anything with the same properties) whose
Row-Level-Security policies are the **only** authorization boundary in the
system.

This is not a general "how to test software" essay — plenty of those exist.
It is the distilled, project-agnostic form of a strategy that was built and
hardened against a real production app of exactly this shape, including the
mistakes that shape produces if you don't plan for them. Copy this file into
a new project of the same archetype, then localize it: fill the risk-model
template with your actual tables and roles, pick your actual tool stack,
measure your actual thresholds from your actual code. Nothing in this file
should end up referencing a real table name, file path, or measured number —
those belong in the project's own docs, CI config, and threshold files, not
here. When you localize it, that project-specific instantiation is the thing
that makes this document enforceable day to day; keep this file itself clean
so it stays copy-pasteable the next time.

Two meta-rules the rest of this document assumes:

- **Disagreeing with a strategy in the open beats departing from it
  quietly.** If a task seems to need something the strategy rules out, say
  so and get agreement before doing it anyway.
- **This is a working document, not a monument.** Update it the moment the
  architecture it describes moves. A strategy document that nobody updates
  is worse than none, because it produces false confidence at the exact
  layer nobody double-checks.

---

## 0. When this applies, and when it doesn't

This playbook assumes:

- The frontend ships as static files or a thin serverless layer with **no
  server-side authorization code of its own** — no session-aware backend
  sitting between the client and the database.
- Postgres Row-Level-Security (RLS) is where authorization actually lives,
  reached through an auto-generated REST/GraphQL layer (PostgREST or
  equivalent) rather than hand-written endpoints.
- The client holds a token that is only as trustworthy as the policies
  written against it — anyone can extract the anon key from the bundle and
  issue arbitrary requests, so the policies are the entire defense.
- There is probably no staging environment, and migrations likely apply
  straight to production on merge to the default branch.

If any of those stop being true — a server-side execution surface appears
(an Edge Function, a route handler, anything that isn't a static file or a
pure DB policy), or a second authorization layer gets added — this
playbook's central claim (**the database is the only thing that can catch an
authorization bug**) stops holding, and the whole document needs rethinking,
not just patching.

---

## 1. Purpose

To keep confidence-per-test high and the feedback loop short, by putting
each check at the cheapest level that would actually catch the failure it's
aimed at.

The reason this needs its own document, instead of a generic testing
checklist, is the property named in §0: **there is no server**. Authorization
is not layered — if a database policy is wrong, nothing else in the stack
catches it, and the interface looks completely normal while showing somebody
else's data. That single fact should determine most of a project's testing
priorities, and in practice it's the thing generic advice skips, because most
testing literature assumes a server exists to fall back on.

A strategy that only describes what's already green isn't a strategy. Name
the gaps explicitly, and track them (§16).

---

## 2. System testing context

### The shape to map, for any project of this archetype

Before writing tests, write down (in the project's own docs, not here) a
table like this one, filled in with the project's real pieces:

| Piece | What it is | Testing consequence |
| --- | --- | --- |
| The static/serverless frontend | No route handlers, no server-side authorization code in the deployable | Nothing server-side to unit-test for auth; the deployable is files or edge functions with no privileged logic |
| The static host / CDN | Deployment failures are usually path failures (base path, asset 404s, stale cache), not runtime failures | Needs a real fetch against the deployed origin to catch |
| The Postgres database | Tables, functions, triggers, indexes | Behavior living in SQL (normalization, ownership rewriting, cleanup jobs, generated columns) is unreachable from a unit test — it needs a real database |
| RLS policies | On every table, and on any object-storage bucket | The entire authorization boundary — see §7 |
| The auto-generated API layer (PostgREST/similar) | No hand-written API to contract-test | The schema *is* the contract; a generated client-types file is the client's copy of it, and drift between them is a real production failure mode |
| The auth provider | Whatever sign-in flow is used | Interactive sign-in usually can't be driven in CI; sessions get minted through an admin/session API instead |
| Object storage | A bucket with size/MIME limits, holding files a database row merely references | Bytes can't be deleted from SQL; object *paths* are often load-bearing for authorization if the bucket has its own policies |
| Third-party services called from the browser | Whatever's outside your control | Always faked in tests; never reached from one |
| CI/CD | Holds the highest-privilege credentials in the project (a service-role key, a direct DB connection string) if anything auto-deploys | The highest-privilege *code* in the project is often bash inside a CI workflow, not application code — treat it that way |

If there's **no staging environment** and CI applies pending migrations
straight to production on merge, say so explicitly in this table's row for
CI/CD — that fact should be driving how heavy the pre-merge gate is (§13).

### What the test estate should cover, roughly

A mature estate for this archetype looks like this — not as a percentage
target, but as a checklist of *kinds* of coverage that should each exist
somewhere:

| Suite | Typical location | What it's for |
| --- | --- | --- |
| Unit / component | Alongside source, one file per module | The bulk of the estate once logic is properly extracted from I/O |
| Signed-out browser | A dedicated suite, run at more than one viewport | Everything that must hold for an anonymous visitor — safe to run against production post-deploy |
| Signed-in integration | A dedicated suite, against a real local stack | Critical journeys, end to end, against real infrastructure |
| Database tests (pgTAP or equivalent) | Run directly against Postgres | The RLS/authorization matrix, schema constraints, function/trigger behavior — fast, and the closest thing to the actual policy logic |
| Mutation testing | Scoped to a deliberate subset | Proves unit assertions are load-bearing, not just line-covering |
| Repo hygiene / static analysis | Pre-commit or equivalent | Fast, cheap, gates everything else |
| Schema contract check | CI | Client-side generated types match the live schema |
| General-purpose SAST | CI | Language-level bug/security patterns nothing else is looking for |
| Post-deploy smoke | CI, against the live URL | The one check that sees what users actually see |

### Trust boundaries to enumerate

Every project of this shape has some version of these; write the concrete
version into the project's own docs:

1. **Browser bundle → database API.** A user's token crosses it. Everything
   on the far side is enforced by RLS and triggers. Since the bundle and its
   anon key are both public, the only meaningful test of this boundary is
   one that does exactly what an attacker could: issue a request directly,
   with a real (or absent) token, bypassing the UI.
2. **One identity → another identity's data**, through whatever sharing or
   delegation mechanism exists. If there's more than one role a grant can
   carry (read-only vs. can-write, say), the most permissive role is the one
   that needs the most scrutiny — see §7.
3. **Anonymous/unauthenticated → everything.** Usually denied twice: once by
   RLS (the policy predicate never matches with no identity), and once by an
   explicit revoke of the underlying table grant. Both halves need testing
   independently — they fail differently (a revoked grant errors before any
   policy runs; a policy filter just returns nothing), and a project can have
   one covered while believing both are.
4. **CI/CD → production.** Whatever holds the highest-privilege credential.
   Rarely covered by any *test*; covered instead by workflow-scanning tools,
   pinned action versions, and review.
5. **App → third-party HTTP.** Always faked in tests; never reached.

---

## 3. Testing principles

1. **Authorization is not testable from the client.** A component test
   asserting that a button is hidden proves a UX property, nothing more.
   Authorization tests hold a real token and talk to a real database.
2. **Never mock the thing that carries the risk.** Mocking the database
   client tests your own call shape, which is fine and cheap — it is not a
   test of RLS, triggers, constraints, or the API layer's behavior.
3. **Coverage is a signal; mutation score is a stronger one.** Line coverage
   says the line ran. For pure, high-consequence logic, that's close to
   worthless on its own — which is why a deliberately short list of files
   should carry both a coverage floor and mutation testing, not the whole
   tree.
4. **Prefer the lowest level that gives the same confidence.** Pagination
   math is a unit test. The *fact that the UI paginates* is one E2E case,
   not one per field.
5. **Deterministic or deleted.** No retries to paper over flakiness, except
   at the one boundary where a retry distinguishes a real fault from a
   dropped connection (typically: a post-deploy smoke test against a live,
   possibly cold-starting target). A flake is a defect in the test or the
   code, not weather.
6. **Test the failure paths, not just the happy path.** Anything that
   retries, skips-and-continues, or can be cancelled mid-operation is
   carrying a data-loss or data-duplication risk — those are the paths worth
   injecting failures into deliberately.
7. **If it's hard to test, fix the design.** Every file that earns a place
   on a mutation-testing list does so by having its pure logic pulled out
   from the I/O sitting beside it. Extract, then test the extract — don't
   fake the world to make the untestable testable.
8. **Fixtures may not out-privilege the app.** If tests seed data through an
   elevated/service-role credential, that credential should open exactly one
   door (creating test identities) and nothing else. A fixture that can
   construct a state the app itself could never reach is a fixture that
   hides bugs.
9. **One new behavior, one new assertion, at one level.** Duplicated
   coverage at three levels costs three times as much to maintain and
   catches the bug exactly once.

---

## 4. Risk model — a template, not a checklist

Rank risks by expected cost, not likelihood alone. "Cheapest meaningful
test" means the level below which the risk is genuinely uncovered — a
higher-level test that happens to also exercise the risk doesn't count if a
regression there wouldn't reliably fail it.

Below is the *shape* of a risk model for this archetype, generalized from
what tends to actually go wrong in a "database is the only boundary"
project. Copy the columns, replace the rows with the project's real tables,
roles, and operations, and rank by real cost.

| Risk category | What it typically costs | Cheapest meaningful test |
| --- | --- | --- |
| **Cross-tenant read/write** — a policy stops holding | Silent, total confidentiality failure; the UI looks fine | Integration test with a real token against a real database, bypassing the UI entirely |
| **A permissive grant/role reaches further than intended** — e.g. an "editor"-style role can also rename, delete, or manage the parent resource, or promote itself | Privilege escalation between two real accounts | Same level as above, with a second real identity holding that specific role |
| **Orphaned files / data loss on delete** — an object-storage file outlives the row that named it, or vice versa | Storage bytes with no way to find them again, or a record that silently loses its attachments | Unit test for delete ordering (bytes before row, or whatever the safe order is); integration test for the cascade |
| **A migration that can't apply to a populated database** — works against an empty CI database, fails against real data | Deploy blocked, or a half-applied schema change | CI applying every migration from scratch catches syntax; it does **not** catch a `NOT NULL` with no default, a unique index existing rows violate, etc. — see §8 |
| **Client/schema drift** — generated client types fall behind the live schema | Runtime errors after deploy, in exactly the requests that touch the drifted column | A generated-types diff, run in CI |
| **Injection into a generated query grammar** — a search term or filter string gets parsed as filter *structure* instead of a literal value | A user's input rewrites the query the app meant to run | Unit + mutation tests on the function that builds the filter string, plus adversarial-input E2E cases |
| **Export-format injection/corruption** — e.g. a CSV export executing a user's own text as a spreadsheet formula, or an archive format's own limits (32-bit overflow, epoch limits) producing a corrupt file | A file that damages the opener, or won't open at all | Unit + mutation tests on the specific encoding function |
| **Static-hosting/deployment faults** — base path, manifest scope, stale CDN asset, icon 404s | A site that quietly breaks after a green CI run | Serve the actual built artifact under its real path in a browser; repeat against the deployed origin |
| **In-client race conditions** — a stale response overwriting a newer one, an expired signed URL reused | Wrong data shown, broken assets | Unit tests on the sequencing/caching logic, not an E2E timing test |
| **Duplicate/repeated operations** — a retried upload, a re-run import, a double-submitted form | Duplicate records or duplicate side effects | Unit tests with injected fakes that simulate the retry |
| **Third-party outage** — a mapping/geocoding/analytics service the browser calls directly | Degraded feature, not an outage of your own app | Unit test on the error branch; not worth an integration test against the real third party |
| **Availability** — a free/low tier backend that auto-pauses or cold-starts | The app is simply down or slow to first response | A keep-alive/ping mitigation, tracked as a mitigation, not something a test suite can cover |
| **Destructive scheduled-job logic faults** — a cleanup/sweep job with elevated credentials matches the wrong objects | Irreversible deletion of live user data | No cheap automated test exists for bash-in-YAML; mitigate with a dry-run mode and treat the query itself as security-critical — see §12 |
| **Capacity/throughput** | Slow queries under real usage | Index design + query-plan inspection, not a load-testing harness, unless there's an actual SLA |
| **Accessibility regressions** | The app fails to be usable with a keyboard or screen reader | Static linting for the automatable subset, runtime axe-style checks for what only a rendered DOM reveals — see §9 |

A project should end up with 10-20 rows like this, each with a named
"covered / partly covered / not covered" status, reviewed and updated as
real incidents happen (§16).

---

## 5. Test layers

### Classification — generic verdicts for this archetype

| Layer | Verdict, in this archetype | Why |
| --- | --- | --- |
| Unit (pure functions) | **Required** | Where most interestingly-wrong logic lives once extracted from I/O; the only level mutation testing means anything at. |
| Component / hook | **Required** | Rendering faults (hydration mismatches, missing a11y attrs, a control that never disables) are invisible to pure-logic tests. |
| Integration against a real database/storage | **Required, non-negotiable** | The only level RLS, triggers, constraints and the API layer's real behavior exist at all. |
| Service integration (auth, storage, local stack) | **Required** | Session minting, signed URLs, MIME/size limits — real behavior in none of your own code. |
| API testing | **Required, usually not a separate suite** | If the API is auto-generated, this *is* the integration suite issuing direct calls. |
| Contract testing | **Required, narrow form** | The real contract is schema ↔ generated types; Pact-style provider/consumer testing rarely justified without independent deploys on both sides. |
| Authorization/security testing | **Required — highest priority** | §7. |
| Dynamic scanning (DAST) | **Recommended, narrow scope** | A passive baseline scan of the *running* built artifact — headers, cookie flags, passive injection/error-disclosure probes. Distinct from every static tool in §6, which reads source or a dependency graph, not live HTTP responses. Complements §7; never a substitute for it — see below. |
| Property-based | **Recommended, narrowly** | See §10. |
| Mutation | **Required, deliberately scoped** | See §11. |
| E2E (full stack, browser) | **Required, deliberately small** | See §9. |
| API fuzzing | **Usually not justified as tooling** | Fuzzing an auto-generated API layer mostly tests the vendor's product. What's actually yours — a filter string, an export cell, a file header — is better covered by unit tests with hostile inputs plus mutation testing. |
| Concurrency testing | **Unit level only, unless the data model has real multi-writer scenarios** | In-client races (superseded requests, bounded pools) are common; genuine multi-writer conflicts on the same row are rare in single-owner-per-resource data models. |
| Load testing | **Usually not justified** | Only add it once there's an actual throughput SLA. Otherwise it's a number nobody set a target for. |
| Resilience/failure injection | **Required at unit level; optional above it** | Drive retry/backoff/skip/cancel logic through injected fakes. Injecting failures into the real stack adds cost without proportionate signal once the unit-level branches are covered. |
| Infrastructure/deployment testing | **Required** | Two forms are usually enough: every migration applied from scratch in CI, and the actual built artifact served under its real path. |
| Smoke testing | **Required** | Run the signed-out suite (or equivalent) against the deployed origin. Prerendering in a Node test runner with real env vars can mask failures that only exist once the code is a bundle running in an actual browser. |
| Production synthetic testing | **Optional** | If post-deploy smoke already exists, a separate scheduled synthetic mostly duplicates it unless there's a reason (e.g. catching a cold-start pause) a keep-alive mitigation doesn't already cover. Never point a signed-in synthetic at production. |

### Who owns which behavior — build this table for the real project

The template:

| Behavior class | Owning layer | Not this |
| --- | --- | --- |
| Pure data transforms (filter-building, pagination math, encoding/escaping, formatting, lookup) | Unit + mutation | Not the browser |
| Rendering, disabled states, focus, keyboard paths, accessibility attributes | Component tests | Not E2E, unless the journey genuinely depends on it |
| Normalization, ownership rewriting, cleanup jobs, constraints, cascades, generated columns | Integration against a real database | Not unit — none of it exists in application code |
| Row/object visibility, grant scope, expiry, revocation, anonymous denial | Integration, as a second real identity | **Never** from client code or a component test |
| Generated client types ↔ schema | An automated contract diff | Not a hand-written assertion |
| Base path, icons, manifest, service worker, CSP, anything that runs before the app framework initializes | Signed-out browser suite | Not unit alone — pre-hydration code often isn't reachable from a component test |
| One complete user journey | E2E | Not one E2E case per field — that's what component tests are for |
| Migration applicability | CI applying from scratch | Not review-by-eye alone |
| Repo tooling / scripts that run outside the shipped bundle | The job or script that depends on them | Not unit tests, and not inside the shipped bundle's coverage scope |

---

## 6. Architecture-specific strategy

### The shape of the pyramid, in this archetype

It's not the usual pyramid. The middle band — integration against a real
database — is unusually load-bearing, because authorization and a
meaningful share of the business rules live in SQL and don't exist anywhere
a unit test can reach them.

```text
Layer                              Weight           Runs against
---------------------------------  ---------------  --------------------------------
Unit + component                   most of it       fakes/in-memory; a deliberately
                                                      scoped subset also mutation-scored
Database tests (pgTAP or similar)  fast, targeted    real Postgres, direct SQL, no
                                                      API layer, no browser
API-level integration              a wide band       real database + storage, real
                                                      tokens, no browser — mostly
                                                      authorization
Browser, signed-in journeys        one per journey   real stack, real bundle
Browser, signed-out                small             built artifact, more than one
                                                      viewport; also post-deploy
```

Treat this as the shape to *hold*, not an accident. Two ways it drifts: new
policies landing without the API-level band growing (authorization drifting
out of test coverage — this fails silently, watch it in particular), or the
browser bands growing to assert things a unit or component test could have
settled far more cheaply.

### What must be real, and what may be faked

| Thing | In unit/component tests | In the integration suite |
| --- | --- | --- |
| Database client | Faked — injected as a parameter where the module was designed for it, otherwise module-mocked | **Real.** One client per identity, carrying only that identity's token. |
| Postgres, RLS, triggers | Absent — do not simulate | **Real.** This is the entire point of the suite. |
| Object storage | Faked | **Real**, including MIME/size enforcement |
| Auth/sessions | Faked | **Real**, session minted through an admin API and injected into the test browser context |
| Anything requiring a browser-only API (Worker, Canvas, etc.) | Faked | Real, in the browser half |
| Third-party services | **Always faked** | Always faked. Never reach a third party from a test. |
| Non-deterministic primitives (random ids, clocks) | Injected or stubbed | Real |
| Elevated/service-role credential | Never used in a test's assertions | **Only** to create test identities, never to seed the data under test — see §3 principle 8 |

### Managed-service boundaries worth explicit attention

- **Function/edge runtime boundary.** If there is none — no Edge Functions,
  no serverless handlers — say so explicitly, because the day one is added
  it becomes the first server-side authorization surface in the project and
  needs its own section before it ships.
- **Database-level security policies.** See §7.
- **Object storage paths that carry authorization meaning.** If a bucket's
  policies parse identity or ownership out of the object path itself, a path
  that fails to parse must make the policy **not match**, never abort the
  whole statement — a parsing helper that fails closed (returns "no match")
  rather than raising is worth a direct unit test of its own.
- **Schema-cache staleness.** An auto-generated API layer often caches the
  schema; a newly added column can be invisible until the cache is told to
  reload. If a deploy pipeline does this automatically, a migration applied
  by hand needs the same step — this is usually the one "eventual
  consistency" failure mode in this architecture, and it's a deploy-time
  concern, not a test-time one.
- **Row/response caps.** An API layer with a default row limit will silently
  truncate an unranged response. Anything that reads a potentially large set
  needs to page around it deliberately; page-boundary behavior is a unit
  test with fakes.
- **Partial failure across correlated writes.** If one logical action
  produces more than one write (e.g. a full-size and a thumbnail upload),
  decide and document what happens when one succeeds and the other doesn't
  — and test that specific, chosen behavior with an injected failing write,
  rather than leaving it as an accident of whichever write happened to run
  first.
- **Local emulation vs. deployed.** If the local stack runs the *same*
  database/auth/storage engine in containers (not a mocked emulator), treat
  its integration results as trustworthy. Reserve "only provable against the
  deployed target" for genuinely host-specific behavior (CDN caching, base
  path, cold starts).

### Static analysis layering

A project of this shape typically wants four *different* static-analysis
tools, because they answer four different questions — don't let one stand in
for another:

1. **Module-boundary / dependency-graph tool** (e.g. dependency-cruiser) —
   answers "does an import cross a boundary it shouldn't", by walking the
   whole module graph rather than one file's own imports. The one rule worth
   having from day one in this archetype: **only the data-access layer may
   import the database client directly.** A linter that only looks at a
   single file's imports can't see a component reaching the database
   *indirectly* through some other module; a graph tool can. Also worth
   having: no import cycles, no orphaned modules (dead code), and a rule
   that the shipped bundle never imports Node-only tooling (scripts, test
   harnesses) that might carry privileged credentials.
2. **Dead-code / unused-dependency tool** (e.g. knip) — answers "does
   anything have zero reachable consumers". Generated files (a schema-types
   file, say) need an explicit ignore rather than being "fixed" by hand.
   Anything referenced only as a string inside another tool's config (a
   script name inside a test runner's config, for instance) needs an
   explicit entry point, since static analysis can't follow a string.
3. **General-purpose SAST** (e.g. Semgrep/Opengrep with a community rule
   pack) — answers "does this match a known language-level bug or
   vulnerability shape" that neither of the above is written to catch.
   Worth verifying, once, for any such tool: what it actually sends over the
   network (some "auto" configs claim to phone home with project metadata —
   read the tool's own source rather than trust a docstring), and whether
   findings are graduated by severity rather than all-or-nothing (block on
   the equivalent of "error", surface "warning"/"info" for human triage
   without blocking). Prefer a path-level ignore for "never scan this
   generated file" and an inline per-line suppression (with a comment) for
   "this one rule is a false positive on this one line" — don't use the
   broad tool to solve the narrow problem or vice versa. Every suppression
   needs the false-positive reasoning written down at the suppression, not
   just asserted.
4. **A code-smell/maintainability linter** (e.g. a cognitive-complexity or
   duplication rule set) — catches things a type checker and a graph tool
   are both structurally blind to. Tune its defaults against the project's
   *own* real code before accepting them wholesale — a duplication rule that
   fires on repeated CSS class names rather than duplicated logic is noise,
   not signal, and a complexity threshold copied from the tool's default
   without checking it against real functions is a guess, not a
   measurement.

For all four: measure how long each actually takes against the real
codebase before deciding where it runs. A check that finishes in a couple of
seconds belongs in a fast pre-commit/pre-push gate everyone runs constantly;
one that needs a live network fetch or a cold binary install belongs in CI
only.

### Dynamic scanning (DAST)

Everything in §6 so far is static: it reads source, a dependency graph, or a
findings file. A **baseline (passive-only) scan** — spider plus passive
rules, never an active/attack scan — points a scanner at the *running* app
instead, against an isolated, ephemeral local build, never a deployed
target. It's the only layer that would notice a response header regressing
or a stack trace leaking into rendered HTML — things no static tool sees
because none of them look at real HTTP responses.

- **What it covers**: the same class of finding a SAST tool and static
  accessibility linting cover from other angles — generic
  header/cookie-flag misconfiguration, passive injection/error-disclosure
  probes — observed against real rendered responses instead of source text.
- **What it explicitly does not cover.** A DAST baseline scan never signs
  in with a real identity and never holds a token, so it says nothing about
  the authorization model — that's §7's job, exclusively. Never read a green
  DAST run as authorization coverage.
- **Never scans anything but a local, ephemeral build** — never a deployed
  or production target, signed in or out.
- **Scan more than the entry page** if the app's real content only exists
  once signed in (a login screen alone has almost nothing rendered for a
  content-based finding to hide in) — matching whatever other tooling
  already scans both states (e.g. an accessibility or performance gate).
- **A structurally unfixable static-hosting header stays explicitly
  ignored, not silently unaddressed** — if the hosting platform can't set a
  given security header at all, document why and move on, rather than
  leaving it as permanent unexplained noise.
- **Graduated severity**, same pattern as every other tool in this section:
  a small, deliberate set of findings that block, everything else surfaced
  for triage. Tighten the blocking set only once real scan history justifies it.

---

## 7. Security and authorization testing

**This is the highest-value testing in this architecture.** There is no
second layer to catch an authorization bug — it fails silently and looks
exactly like success.

### Rules

1. Every authorization test holds a **real access token for a real
   identity** and issues requests **directly against the API layer**, not
   through the UI. This suite is the executable form of the authorization
   model; most of it should deliberately bypass the interface.
2. Every test needs **at least two identities**. A single-identity suite
   only ever makes requests the policies are supposed to allow, so it can
   never notice a broken policy — it has nothing to be denied.
3. Assert on the **mechanism, not just the outcome**. An empty result and an
   authorization error mean different things: one says a policy filtered
   the row, the other says the grant never existed in the first place. Both
   are worth distinguishing for the anonymous/no-identity case especially.
4. Assert that a **satisfiable** filter returns nothing. Querying for
   exactly the other identity's known row and getting `[]` back is a much
   sharper signal than an unfiltered read that merely happens not to
   contain it.
5. Write-side tests must **read back as the owner**. A policy that accepts a
   write while hiding it from the writer's own later read is the worst
   possible outcome, and only the owner's own subsequent read can rule it
   out.
6. **Every mirrored authorization surface needs its own test.** If a
   resource has a database row *and* a corresponding object-storage file (or
   any other pair of things governed by separate policies with separate
   join logic), a test against one proves nothing about the other. Name each
   surface and cover each one.
7. Grants must be tested **in both directions**: that an active grant opens
   exactly what it should, *and* that revocation/expiry closes it again with
   the underlying resource still present — otherwise the "access denied"
   assertion only proves the resource stopped existing, not that the grant
   stopped working.

### The most-permissive role is the one that needs the most scrutiny

If the sharing/delegation model has more than one role (read-only vs.
can-edit, say), the most permissive non-owner role is where privilege
escalation actually lives. Write out, for the real project, and test both
halves of each line:

- What the role **can** do: the specific actions it should be able to take
  inside the scope it was granted.
- What the role **cannot** do: anything scoped to the *parent* resource
  (rename it, delete it, manage who else has access, promote its own grant)
  even though it can act on the resource's contents. Also: reaching a
  resource it was never granted at all, and continuing to act after its
  grant is revoked or expires — both asserted with the underlying resource
  still present, so the test is proving the grant stopped working, not that
  the resource disappeared.

One asymmetry worth checking explicitly and writing down once confirmed: if
"can write" is defined as "owns the parent, **or** holds a write-level
grant", and "can read" is defined only via an active grant (ownership of the
*parent* doesn't imply a grant on something a delegate created *inside* it),
then **owning the parent does not automatically reveal everything a
delegate has done inside it**. That's a legitimate, deliberate design — but
it's exactly the kind of thing that's easy to assume is a bug, easy to get
backwards in code review, and worth a named, executed test rather than a
comment.

Tests that only assert "the client sends the right call" or "the button is
disabled for a lower role" are UX tests. They are not a substitute for the
above, by the rule in §3 principle 1.

### Two levels of authorization test, and how they divide labor

If the platform supports impersonating a role directly against the database
(e.g. pgTAP-style tests that `set local role` and inject the claims a real
token would carry), that gives a second, faster layer alongside true
end-to-end integration tests. They complement rather than replace each
other:

- **Direct-database tests** prove the **policy and trigger logic itself** —
  fast enough to run on every schema change, and closest to the actual
  predicate being evaluated. If this mechanism exists, verify the
  impersonation itself works (a sanity test that shows the identical query
  fail with no claim, pass with one, and depend on the claim's actual
  content) — otherwise a test file that accidentally runs with full
  privileges would silently pass everything.
- **Full end-to-end integration tests** prove the **same properties hold
  through the real pipeline** — a real API request, a real minted token,
  the real client library. This is also usually the only place
  storage-level authorization and real storage-API behavior (MIME/size
  limits, signed URLs, whether a path can be renamed) get exercised, since
  a direct-database layer typically can't reach into a managed storage
  service's own tables directly.
- Fixtures at the direct-database layer should still be seeded the way §3
  principle 8 requires — impersonating the real identity's own role, never
  a superuser bypass — even though this layer never touches the API layer
  at all.

A schema change that adds or modifies a policy, grant, or
ownership-affecting trigger should ship a matching case in the end-to-end
suite in the same change; a direct-database case alongside it is encouraged
where it adds a fast, targeted assertion, but doesn't discharge that
requirement on its own. State this as an absolute, not a guideline — the
failure is invisible, there is no second layer to catch it, and SQL review
by eye has a documented history (in whichever project you're running this
in) of missing exactly this class of bug.

### SQL linting is a different concern from authorization testing

A SQL linter/formatter run against migrations answers "is this SQL
well-formed and free of static footguns" — ambiguous joins, inconsistent
`GROUP BY` references, needless subqueries. It cannot see a single policy's
*logic*, discharges none of the authorization-testing requirement above, and
adds no authorization coverage on its own. Think of it as the SQL-side
counterpart to a general code linter, not a competitor to database tests.

### Out of scope, deliberately, in most projects of this shape

- Penetration testing of the managed platform itself (Supabase, or
  whichever backend-as-a-service is in use) — that's the vendor's surface,
  not yours.
- Anything that would require an anonymous/public share link, if the
  project has deliberately ruled that out by design — RLS can't cheaply
  authorize an anonymous reader, so if this is ever added it's a new,
  higher-risk boundary needing its own model, not a checkbox on an existing
  one.
- Secret scanning beyond a dedicated pre-commit hook and the platform's own
  tooling.

---

## 8. Integration strategy

### Setup that must not be weakened

- **Seed as the user, never through an elevated/service-role bypass.** A
  fixture that bypasses RLS to set up state can construct scenarios the app
  itself could never reach, and will hide real policy bugs by doing so. The
  elevated credential should exist only to create test identities.
- **Isolate fixtures across parallel specs.** If specs run in parallel
  against one shared database, decide explicitly which fixtures are
  read-only shared state and which are scratch resources owned by exactly
  one writing spec. A spec that writes into a resource another spec is
  counting makes both flaky, unpredictably.
- **Clean up in `finally`.** Probe records and probe files must not survive
  a failed assertion — later specs may be counting them.
- **Fail the suite on an unexpected console/runtime error.** This is what
  catches a rejected background query hiding behind a passing assertion.

### Migrations against a populated database

CI typically applies every migration to an **empty** database from scratch.
Production applies only the *pending* migrations to a database **full of
real rows**. Those are different operations, and in a no-staging setup the
second one is unattended.

A migration that adds a `NOT NULL` column with no default, a unique index
existing rows would violate, or a constraint existing data fails, passes the
from-scratch CI check and fails against production. If the deploy pipeline
orders "migrate" strictly before "build/deploy the new bundle", a failed
migration at least leaves the previous bundle serving the unchanged schema —
but it still fails in the worst place to discover it.

**Policy:** any migration that alters an existing table, or adds a
constraint/index to one, gets verified locally against a database that
already holds representative rows (reset, seed, *then* apply the new
migration) before it's proposed for merge — and that verification gets
stated explicitly, not assumed. Treat this as a review-enforced practice
rather than an automated gate unless the cost of maintaining a
production-shaped seed for CI is worth paying.

### Idempotency and repeated operations

Any operation that can plausibly be retried, resubmitted, or re-run needs an
explicit, *decided* answer to "what happens the second time", not an
accidental one discovered later:

| Operation shape | What to decide and test |
| --- | --- |
| An import/create run twice with the same input | Does it create a duplicate, or is there an identity to detect the repeat? Whichever is chosen, assert it — so it stays a decision, not a discovery. |
| A file upload retried after a partial failure | Does the retry target the same path? If the storage layer has no "overwrite" verb, a retry after a partial success can get stuck refusing to overwrite — decide the fallback (skip and flag, or a fresh path) and test it with a fake that fails partway through. |
| Creating a grant/share that already exists | Should be a no-op or a clear conflict, never a silent duplicate with different terms. |
| Revoking something already revoked | Should be safely idempotent — a second delete affecting zero rows. |
| A cleanup/orphan-detection job re-run | Should be safe to run repeatedly without re-deleting or double-processing already-handled records — a set-based, existence-checked approach usually gets this for free. |

### What integration tests should *not* do

Re-test pure logic that already has unit and mutation coverage. If
pagination arithmetic is wrong, a unit test says so in milliseconds; making
the same point through a browser and a real database costs orders of
magnitude more and fails far less clearly.

---

## 9. E2E strategy

Split into (at least) two suites with genuinely different jobs:

**Signed-out.** Everything in it must hold for an anonymous visitor — that's
what makes it safe to run against production after every deploy. It's the
right place for things only a real browser and a real deployed artifact can
show: base path correctness, manifest/icons, anything that runs before the
app framework hydrates, layout at more than one viewport. Nothing signed-in
ever belongs here.

**Signed-in.** The critical journeys, against a real stack. Keep this suite
to whole journeys, not field-level detail:

- Load the main view signed in and see the right data, correctly ordered.
- Create, edit, and delete the core resource end to end.
- Search/filter narrows results correctly, including hostile input
  (wildcards, quotes, characters the query grammar treats specially).
- A file attached to a resource persists, survives a reload, and is removed
  when the resource is removed.
- Any cross-cutting view (a map, a dashboard) reflects the same data the
  list view does.
- Export/import round-trips, if the app has one.
- Signing out actually ends the session — no stale data on reload.

That's roughly where a mature suite of this kind sits. A UI change still
generally needs an E2E case somewhere — but the discipline this section adds
is about **where the rest of the assertions go**: the journey gets its one
browser case; every field-level detail around it (disabled states,
validation wording, focus order, every branch of a form) belongs in
component tests, where it runs in milliseconds and fails legibly. Adding a
*second* browser case for the same journey should feel expensive, because it
is.

Two habits worth adopting directly: treat mobile as its own **target**, not
a variant, if layout faults in the project tend to be viewport-specific; and
**poll for expected state rather than reading once**, whenever the UI
debounces or waits on a round trip — an immediate read asserts on the
previous state, not the new one.

### Accessibility, and how two automated layers divide labor

Two complementary automated gates can cover part of an accessibility claim;
neither proves the whole of it:

- **Static** (a JSX/template accessibility linter) — catches what's visibly
  wrong before anything renders: a missing alt text, invalid ARIA usage, a
  label with nothing to point at.
- **Runtime** (an axe-core-style checker driven through the real browser
  suite) — catches what only a rendered DOM reveals: computed color
  contrast, real focus order, the actual accessible-name computation after
  the app's own JS has run. Scope it to representative states, not every
  route — a form, a list view, an empty state, a modal — rather than trying
  to hit every page.

Whatever severity levels the runtime tool reports, decide explicitly which
ones block CI and which are surfaced for human triage — treating every
finding as equally blocking usually means the gate gets disabled the first
time it catches something ambiguous (a contrast call on a decorative
element, say).

**Neither layer is proof of the whole claim.** Full compliance,
screen-reader-specific behavior (announcement timing, verbosity), and
keyboard-only manual walkthroughs of custom widgets are not covered by
either. A clean run is "no known regression," not "verified accessible" —
say that explicitly wherever the app's own claims reference accessibility.

---

## 10. Property-based testing strategy

**Recommended, narrowly. Adopt only where it earns its dependency.**

Most pure functions in a typical app of this shape have small, enumerable
input spaces that example-based tests already cover exhaustively, and
mutation testing already proves those examples are load-bearing.
Property-based testing earns its place specifically where an input space is
genuinely adversarial and a property is easy to state — a filter-builder
that must never let user input escape its intended grammar, an
encoding/decoding pair that must round-trip for *any* input, a date-packing
function that must never produce a value below its valid range.

If adopted: use a **seeded, deterministic** runner (a recorded failing seed
must reproduce the failure); keep it to one dependency; write properties
*beside* the existing example tests rather than replacing them; and keep it
inside the unit suite's normal time budget. Given the "every dependency
needs a concrete reason" principle most such projects hold themselves to,
adding the library needs a real near-miss as its justification, not
speculative adoption.

---

## 11. Mutation testing strategy

**Required, deliberately scoped — not applied to the whole codebase.**

- Scope it to a short, explicit, maintained list of files — sharing that
  same list with any per-file coverage floor, so the two can't drift apart.
- Every file on that list should pair pure, exported logic with the I/O
  sitting beside it clearly marked as excluded from mutation (with the
  reason, if the tool supports inline exclusion regions) — those exclusions
  are load-bearing; a score read without understanding them isn't the
  number it looks like.
- **Never mutate the rendering layer.** Mutating JSX/template strings and
  class names produces thousands of near-equivalent mutants and a score
  nobody can act on. If a file can't be split into "pure logic" and
  "rendering", the file is the actual problem to fix, not the mutation
  scope.
- Run it on every change that touches the scoped files, not just on the
  default branch — learning after merge that a test asserts nothing is
  learning it too late.

What happens to a surviving mutant has exactly two honest endings:

- **It's a missing assertion.** Kill it with a test that asserts real
  behavior — usually a boundary nothing pinned, or an error path nothing
  exercised.
- **It's equivalent.** No input can distinguish the mutant from the
  original — a guard the type system needs but the runtime can never reach,
  a fallback whose value nothing downstream observes. Either delete the
  code (an unreachable branch is dead code) or mark the exclusion **with the
  reason written at the exclusion**. Never write a test that can't fail just
  to make a mutant die.

There's a third possibility worth actively looking for, not just the two
above: the mutant survives because the code is more complicated than it
needs to be. That's usually the one that pays for the whole exercise —
finding it is the actual point of running mutation testing at all, not the
score itself.

A score below a set threshold should fail the build. A score above the
threshold but below 100% is not an automatic stop, and isn't a place to
leave unexamined either — every survivor is a question nobody has answered
yet.

---

## 12. Performance and resilience testing

### Performance

**No numeric gate is usually justified for the database/backend side**
unless there's an actual throughput SLA. A synthetic load number against a
personal-scale or low-traffic app mostly measures the hosting tier, not the
code.

What replaces a load-test number, per the "measure, don't assume" principle:

- A new query that filters or sorts names the index that serves it, or adds
  one. If a search feature is built from multiple OR'd conditions, **every
  branch needs its own index** — one unindexed branch collapses the whole
  query onto a sequential scan regardless of how well-indexed the others
  are.
- A new bulk operation is set-based, not row-by-row. A row-level trigger
  that fires once per affected row is a real O(n) fault at scale; prefer a
  statement-level trigger with a transition table where the platform
  supports it.
- Anything reading a potentially large set pages around the API layer's row
  cap rather than assuming an unbounded response.

Inspect the real query plan for any new hot query — a PR that changes one
and says nothing about its plan is incomplete.

**The frontend bundle/page-load side does benefit from a numeric gate**
(a Lighthouse-style budget or equivalent), because unlike backend
throughput, bundle size and render cost degrade gradually and invisibly
without one. If adopted:

- Run it against the **real production build**, never a dev server — a dev
  build's performance characteristics don't resemble what ships.
- Pick a small number of representative pages/states, not every route,
  especially if the app is a single-page client behind a static export
  where most "pages" are really client-side states.
- Gate on the performance category specifically, and leave accessibility to
  the dedicated accessibility tooling in §9 rather than asserting the same
  finding through two different tools — one regression shouldn't fail two
  unrelated-looking jobs.
- Take a median of several runs, not a single shot — a single slow run from
  a noisy CI neighbor shouldn't fail the build.
- **Set thresholds from a measured baseline, with real margin below/above
  it** — never from a tool's generic defaults, and never set exactly to the
  measured value (that has zero margin for measurement noise). If a
  measurement reveals something genuinely worth understanding (e.g. a
  first-run, empty-state layout shift that a real user's established session
  would never see), write down *why* the threshold is where it is rather
  than silently widening it to make the build pass — the threshold should be
  loose because the underlying case is real and understood, not because it
  was easier than investigating.

### Resilience

Failure injection belongs mostly at unit level, driven through the fakes
those modules should already be designed to accept:

- Anything that batches network calls (an export, a bulk fetch): a failed
  sub-call, retry-with-backoff behavior, skip-and-continue behavior, and
  whatever "N items skipped" result that produces.
- Anything that imports/writes in bulk: a missing input, an upload that
  fails all its retries, a partial multi-write failure (§6), and
  cancellation mid-operation.
- Any bounded concurrency pool: the first rejection stops further pickup,
  in-flight work still settles, the error surfaces exactly once.
- Delete ordering: whichever order is safe for the resource type, verified
  and never silently reversed.

Injecting failures into the real stack is optional and usually not worth
it once the branches above are reachable with a fake — the interesting
logic rarely depends on the real network actually failing in a specific
way.

### Destructive scheduled jobs (the highest-risk logic in the whole system)

If the project has any scheduled job holding elevated credentials and doing
irreversible bulk deletes — a storage-cleanup sweep is the canonical
example — treat its query as the single most security-critical piece of SQL
in the project, more so than most RLS policies, because its failure mode is
silent, irreversible, and touches live user data. It's rarely worth building
a test harness for bash-in-YAML, but three cheap mitigations are almost
always worth having:

1. **Review it like a schema change**, every time its query changes, with
   the same scrutiny a new RLS policy gets.
2. **A dry-run mode that lists what it *would* delete and exits**, ideally
   before any elevated credential is even fetched — so a dry run never puts
   that credential on the runner at all. Default manual invocations to dry
   run; let only the real schedule run for real.
3. **A grace period between "looks orphaned" and "eligible for deletion"**,
   long enough that a slow or partially-failed write can never fall inside
   the window. This is usually the single most important invariant in the
   whole query, and the easiest one for a future edit to accidentally shrink
   while "simplifying."

Three specific lessons worth carrying into any project of this shape,
generalized from real incidents of exactly this kind:

- **A cleanup predicate must match every derived artifact, not just the
  primary one.** If one logical record produces more than one storage
  object (a full-size image and a thumbnail, say), matching only the
  primary path classifies every *secondary* object as orphaned and deletes
  it. This is not a hypothetical edge case — it's what a plausible-looking
  first draft of such a query naturally produces, and it's caught only by
  actually executing the predicate against real data, not by reading it.
- **Never cast an untrusted or malformed identifier into a typed column
  inside the query.** A cast that fails aborts the *entire* query rather
  than simply not matching that one row — comparing as text, or otherwise
  failing closed to "no match" rather than raising, is the safe default for
  anything parsed out of a path or a user-controlled string.
- **The predicate should ask "does anything still reference this object",
  not a proxy for that question** (like "does a record with this parsed-out
  id still exist"). A proxy answers wrong in both directions: it can keep
  an object that merely shares an id with something unrelated, and it can
  never find an object whose owning record failed to get created after the
  bytes were already written.

---

## 13. CI/CD execution strategy

### The general shape

1. **Fast hygiene first.** File hygiene, secret scanning, formatting, and
   any check on the order of a couple of seconds should run first and gate
   everything else — a bad config file should fail before minutes are spent
   spinning up browsers and databases.
2. **Path-filter the heavier jobs on pull requests.** A database/integration
   job only needs to run when database-adjacent files changed; a
   frontend-build job only when frontend files changed. A job skipped by its
   own condition should report as passing, not failing, so this never
   weakens what branch protection actually requires.
3. **Run the full, unconditional set on whatever branch actually deploys**,
   regardless of what that specific push touched. If the default branch
   deploys straight to production, a squash-merge that happens to bundle
   unrelated changes together must never get a job skipped right before it
   ships. Path-filtering is a PR-time speedup, not a release-time one.
4. **Order the deploy pipeline so a failure fails safe.** Typically: migrate
   the database, then build, then deploy, then smoke-test — in that order,
   with each step depending on the previous one succeeding — so a rejected
   migration leaves the previous bundle serving the previous (unchanged)
   schema, rather than a half-migrated database serving a bundle that
   expects the new one.
5. **Retry only the deploy-target smoke test, and only there.** That's the
   one place a retry distinguishes a genuinely broken deploy from a dropped
   connection to a cold-starting target. Everywhere else, `retries: 0` — a
   flake anywhere else is a defect, not weather (§3 principle 5).
6. **No staging means the PR gate has to be heavier, not lighter.** If
   merging to the default branch *is* the release, with no environment in
   between to catch what CI missed, that's the argument for running the full
   authorization/integration suite on every relevant PR rather than treating
   it as optional or nightly-only.

### Scheduled jobs

Typical candidates: a destructive cleanup sweep (§12, dry-run by default),
an availability keep-alive/ping (a mitigation, not a test), and dependency
updates. For dependency auto-merge specifically: restrict it to
patch-level, dev-only dependency bumps if anything auto-merges at all — a
dev dependency reaches the CI runner; a runtime dependency reaches every
user's browser. That asymmetry is a security control, not a convenience
setting, and shouldn't be widened casually.

---

## 14. Quality gates

Every gate needs a stated reason. A gate without one is noise, and tends to
get silently loosened the first time it's inconvenient.

| Gate | Generic guidance |
| --- | --- |
| Coverage floor | A **floor**, set from what the suite actually achieves with a little margin so CI's measurement (often marginally different from local) doesn't flap — not a target to chase. Raise it by hand when the suite genuinely improves; a small number of files may reasonably carry a 100% floor once they're actually reachable from tests without faking the world. |
| Auto-ratcheting coverage | **Don't.** A tool that rewrites the local floor after every run means a green local run can still produce a red PR the moment someone else's coverage differs slightly. Raise floors by hand. |
| Mutation score | A break threshold below 100%, so a genuinely equivalent mutant can't block an unrelated change — but every survivor above the break is still an open question (§11), not a pass. |
| Direction of any threshold | **Never lowered** to make a build pass. A threshold lowered that way converts a design problem into a permanently weaker gate. If a legitimate change makes a threshold genuinely unreachable, that's a signal to redesign, or to raise the question explicitly — not to quietly relax the gate. |
| Test pass rate | 100%, `retries: 0` except the one deploy-target boundary named in §13. |
| Authorization tests | Must pass, and a change touching policies/grants/ownership-affecting triggers must ship a matching case in the same change. See §7. |
| Schema contract | The generated-types-vs-schema diff must be clean — drift here surfaces as production runtime errors, not CI failures, if it's allowed through. |
| Deployment | The post-deploy smoke suite green against the **live** origin — the only check that sees what users actually see. |
| Performance | Per §12: no numeric backend gate without a real SLA; a frontend budget set from a measured baseline with real margin, not a tool's generic defaults. |
| Static analysis (SAST, etc.) | Graduated by severity — block on what the tool itself calls a real finding, surface the rest for human triage, per §6. |
| Suppressions of any kind (coverage ignores, mutation exclusions, skipped tests, lint/type suppressions) | Only with a comment explaining *why*, added only after understanding the failure, never as a first response to a red check. |
| New UI | Needs an E2E case for the journey, plus component-level coverage for the field-level detail — not one E2E case per field. |
| New functional behavior | Needs a unit test. If the behavior is authorization, a unit test does **not** discharge that — see §7. |

---

## 15. Test anti-patterns

Watch for these specifically in this architecture — each one either fails
silently or looks like flake when it's actually a defect.

1. **Treating a client-side check as an authorization test.** "The button is
   hidden for this role" is a UX assertion. The policy is the real check. A
   green component test here provides zero security confidence.
2. **Mocking the database client and calling the result an integration
   test.** It tests your own call shape. Policies, triggers, constraints,
   and the real API layer are all on the far side of the mock.
3. **Seeding fixtures with an elevated/service-role credential.** It
   bypasses RLS and can construct states the app itself can never reach.
   That credential should create test identities and nothing else.
4. **Testing one mirrored authorization surface and assuming the other.**
   A record's database row and its storage object(s) have separate
   policies and separate join logic; a test against one proves nothing
   about the other.
5. **Sharing one seeded resource between parallel writing specs.** One spec
   writing while another is counting fails both, at random, and looks
   exactly like flake.
6. **Leaving probe records or probe files behind on a failed assertion.**
   Clean up in `finally` — later specs may be counting.
7. **Putting a signed-in test in the signed-out suite.** If that suite runs
   against production post-deploy, everything in it must hold for an
   anonymous visitor.
8. **Retries or arbitrary sleeps to paper over a flake.** Poll for the
   expected state instead of waiting a fixed time, and fix the underlying
   race rather than retrying past it.
9. **Re-testing pure logic through the browser.** A second, slower copy of
   an already unit-tested and mutation-scored assertion costs orders of
   magnitude more and fails far less clearly.
10. **Lowering a threshold, or reaching for a suppression, to get to
    green.** Understand the failure first. A suppression is almost never
    the right answer, and when it genuinely is, it needs a comment
    explaining why.
11. **Test gaming.** A test written to touch a line, a branch added
    specifically to dodge a mutant, a file excluded just to avoid dealing
    with it. A green metric that doesn't correspond to real confidence is
    worse than a documented gap.
12. **Widening a mutation-testing scope to the rendering layer.** Mutating
    template/JSX strings produces thousands of meaningless mutants and a
    score nobody can act on.
13. **Writing a test for a platform behavior the platform itself has
    already ruled out.** If a managed backend deliberately doesn't support
    some capability (a specific trigger location, a specific storage
    operation) for its own architectural reasons, a test asserting the
    unsupported behavior "works" is testing a design that was already tried
    and reverted upstream — check the platform's own constraints before
    writing the test, not after it fails mysteriously.
14. **Running any test, migration, or destructive operation against the
    real hosted project.** Local stack only, always — there is no staging
    behind production to absorb a mistake.
15. **Asserting a weak truthiness check on an error object instead of its
    actual code/status.** An object is almost always truthy; assert the
    specific error code and status the failure mode actually produces.
16. **Adding an E2E case for a field-level detail.** Journeys belong at
    E2E level; fields belong in component tests.

---

## 16. Adapting and maintaining this playbook

### When copying this into a new project

1. Fill in §2's system-context table and trust-boundary list with the
   project's real pieces.
2. Build §4's risk table with the project's real tables, roles, and
   operations — rank by real cost, not by copying the example rows verbatim.
3. Fill in §5's "who owns which behavior" table once the codebase exists
   enough to have real modules to assign.
4. Pick the actual tool stack for §6's four static-analysis layers and §11's
   mutation scope, and measure real thresholds for §12 and §14 — don't carry
   over numbers from a different project's measurements.
5. Write the concrete instantiation of all of the above into the project's
   own docs (an architecture doc, a design-decisions doc, CI config, and
   whatever pre-merge checklist the project enforces) — not into a copy of
   this file. Keep this file itself free of project-specific facts so it
   stays reusable the next time.

### When to update it

- A server-side execution surface appears where there was none — this
  invalidates the central assumption in §0 and needs rethinking, not
  patching.
- A new trust boundary appears — another role, another grant shape, a new
  external data source, or a capability (like anonymous access) that was
  previously ruled out.
- A layer's verdict in §5 changes, in either direction — record the
  reasoning, not just the new verdict.
- A quality gate moves. Every entry in §14 should carry its justification;
  a changed number is a changed justification, not just a changed number.
- A named gap gets closed. Delete the gap; don't leave a strategy document
  describing a hole that no longer exists.
- **An incident happens.** A real fault that the estate didn't catch is the
  single best input this kind of document ever gets — add it to the risk
  model and name the level that should have caught it, in the project's own
  instantiation of §4.
