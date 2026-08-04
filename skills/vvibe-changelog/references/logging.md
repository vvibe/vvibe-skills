# Logging a product change

Read this once you've passed the §2 capability check in SKILL.md. Unlike
most skills, this one isn't invoked by a user request — you need to
notice the trigger yourself. That's the point of this file.

## 1. Detect it yourself — don't wait to be told

The failure mode this guidance exists to prevent: waiting for the user
to say "I just shipped X" before logging anything. They usually don't
announce it — they finish the task and move on. You're the one holding
the evidence: you edited the pricing config, added the route, rewrote
the copy, ran the deploy. So after finishing any unit of work, ask
yourself:

> **Did what I just did deliver a customer-noticeable improvement, a
> meaningful fix, or a substantive new product message?**

Being visible is necessary but not sufficient: the changelog is a record of
what is newly useful or better for customers, not a complete policy,
entitlement, or enforcement history. If yes, it is a logging candidate. Apply
§2 before writing: log it as soon as you observe it live in production, not
merely when the code is finished or the PR is merged. Concrete signals that
should make you ask that question in the first place, tied to what you
actually observe in a session:

- You edited a pricing/plan file or a plan-limit constant.
- You added or changed a user-facing route, page, or screen.
- You changed landing-page copy or other product-facing marketing text.
- You added a capability that sits behind a flag, and the flag is now
  enabled (GA) — not just merged behind a flag still off.
- You ran `git push` to a deploy branch, ran a deploy/publish/release
  command, or merged a PR to the default branch.
- The user approved and shipped a change you built earlier in the
  session (a plan they signed off on, now live).

Use the project's documented release path to establish that a change shipped.
For an incremental improvement or fix to an established public flow, a
successful production deployment (or a documented automatic-production merge)
is normally enough to treat it as GA; it does not need an explicit "GA"
label. Before logging, still check the task, PR, release note, or changed code
for a beta, private preview, pilot, allowlist, feature flag, or
selected-account/team gate. That explicit limited-availability evidence
overrides the default.

Do not apply that default to a newly named product, standalone launch, or
major new capability. Those need positive GA evidence: a release announcement,
rollout record, Product Brain/release registry, or creator confirmation. If
that evidence is missing, collect such candidates and ask the creator together
instead of treating "no beta flag found" as GA.

Do **not** log:

- internal refactors, code cleanup, dependency bumps, CI/tooling changes
- typo fixes and copy tweaks that don't change meaning
- test additions, internal documentation
- anything not yet deployed — a merged-but-undeployed PR or a described
  plan isn't shipped
- a beta, private preview, pilot, allowlisted rollout, or feature limited to
  selected accounts or teams. Wait until it is generally available to its
  intended audience; log the beta-to-GA transition, not the earlier rollout.
- a change whose primary outcome is taking something away or making it
  harder to access: a price increase, a reduced quota, a feature moved behind
  a higher tier, a narrower eligibility rule, an account/API lock, or a
  removal/deprecation. Do not disguise one as a benefit in the summary.

If a restrictive change also includes a genuinely independent customer
improvement, log only that separable improvement. If the positive wording
would hide the material restriction, skip the whole candidate. The exception
is a security, legal, or service-continuity change that customers must be
notified about; in that case, ask the creator before logging a direct,
plain-language notice. A skipped restriction can still require a Product
Brain or support-document update — route that work to `vvibe-product-brain`;
do not use a changelog entry as its proxy.

## 2. Log after it's live, not when planned

Log **after** the change is live in production, not when merely planned
or merged. "We're going to add X" is not loggable; "X shipped" is. If
you built something in this session but it hasn't deployed yet, don't
log it now — note that it's pending and log it once you observe it's
actually live (a deploy finishes, the PR merges to the branch that
auto-deploys, etc.). If you're not sure whether something has actually
gone out, ask before logging rather than guessing.

## 3. Session-close checkpoint

Before wrapping up a working session that touched any user-visible
surface, do one quick pass: run the §1 question against everything you
did this session — anything shippable that isn't logged yet? If so,
offer it in one short line, don't interrogate:

> "Want me to log the new dark mode toggle to your vvibe changelog?"

Take the answer and move on — one offer, not a back-and-forth. If they
say yes, log it (§4-§7 below); if no, drop it, don't re-ask later in
the same session.

## 4. The `changelogReminder` signal

`vibe_get_product_kb` and `vibe_heartbeat` may return an optional
`changelogReminder` field when nothing has been logged in a while. It
may be absent — don't treat its absence as meaningful, and don't fail
if your MCP client's cached response doesn't have it. When it *is*
present, treat it exactly like the session-close checkpoint above: run
the §1 self-detection question against whatever you've done recently in
this project, and offer to log anything that qualifies.

## 5. Writing a good summary

One sentence, plain language, phrased as what the user's *customers*
would notice — not the internal engineering description.

Good: "Added a dark mode toggle to account settings."
Bad: "Refactored `ThemeProvider` context and added a
`prefers-color-scheme` media query listener."

Good: "Free tier now includes 3 projects instead of 1."
Bad: "Updated `PROJECT_LIMIT_FREE` from 1 to 3 and added a migration."

If the change came out of a commit message or PR title, translate it —
don't paste the git log line in as the summary. For historical work or work
shipped by another team, a title is only a lead: verify the actual product
surface, audience, and relevant conditions in the focused PR description,
user-facing diff, tests, API contract, or release note before writing.
Never infer a product name or flow from a payment provider, a component name,
or another overloaded term in the title.

Make a compact fact check before calling the tool:

1. **Who** can use it?
2. **What** customer-visible behaviour changed?
3. **Where/when** does it apply, including material conditions?
4. **Which focused source** proves each part?

The changelog summary may contain only facts supported by that check. If the
scope stays ambiguous after inspecting the focused evidence, skip the
candidate or ask the creator together with the other unresolved candidates.

## 6. Picking `change_type`

- `feature` — a new capability or user-visible functionality.
- `pricing` — a price, tier, plan, or quota/billing change.
- `positioning` — a messaging, ICP, audience, or brand-voice shift —
  not necessarily a code change at all (e.g. "we're now targeting
  agencies instead of solo founders").
- `fix` — a significant, user-visible bug fix. Not every fix — a
  one-line internal patch with no visible symptom isn't loggable at
  all (see §1); this is for fixes customers would have noticed as
  broken.
- `other` — anything user-visible that doesn't fit the above (e.g.
  deprecating a feature, a UI redesign, a workflow change).

## 7. Picking `significance`

- `major` — something customers should be told about; worth its own
  announcement (a new capability, a pricing change, a meaningful
  repositioning). This is what feeds `suggestAnnouncement` on this call
  and `unannouncedMajorFeatures[]` later.
- `minor` — everything else that's still worth logging for KB
  freshness but doesn't warrant its own announcement (a smaller fix, a
  copy tweak that changes meaning, minor UX polish).

When unsure, default to `minor` — `announce-flow.md` only nudges on
major features, so over-marking causes noisy, unwarranted announcement
suggestions.

## 8. Picking `affected_kb_sections`

Map the change to the Product Brain sections it makes stale, so
`kb-sync-flow.md` knows exactly what to update:

- `company` — brand voice, positioning, about
- `product` — core value prop, differentiators
- `pricing` — tiers, prices, quotas
- `features` — the feature list
- `cases` — customer case studies
- `growth_context` — ICP, pain points, channels, FAQ
- `legal_compliance` — terms, claims, disclaimers
- `conversion` — checkout / signup flow, CTAs

Only include sections the change actually touches — over-tagging causes
`kb-sync-flow.md` to propose edits to sections that didn't change. If a
change doesn't map to any KB section (e.g. a performance fix with no
visible behavior change worth telling customers about, logged anyway
for the record), omit the field entirely rather than guessing a section.

## 9. Dedup — check before you log

If you're not sure whether a change was already logged (resuming after
a break, another session might have logged it, or the user says "did I
already log this?"), call `vibe_get_product_changelog({ limit: ... })`
first and scan `entries[]` for a matching summary before calling
`vibe_log_product_change`. Don't log the same shipped change twice.

## 10. After logging

The response carries two signals — act on both in the same turn:

- `kbStale: boolean` — true when this entry postdates the KB's last
  update. If you're logging *in service of* another task (not a
  standalone "log this" request), consider routing to
  `kb-sync-flow.md` before continuing.
- `suggestAnnouncement: boolean` — true when this entry is a major
  feature. Route to `announce-flow.md` and offer to announce it.

Report back to the user in plain language: what got logged, and if
`suggestAnnouncement` is true, offer the announcement nudge right
there — don't make them ask.
