# Initial changelog backfill

Read this only after `vibe_claim_initial_product_changelog_backfill({})`
returns `{ shouldBackfill: true }`. The server has now reserved this
project's single initial-history pass. Finish the scan before continuing to
the ordinary log/act direction that loaded the skill.

## 1. Search the last two months — not the whole repository

Set the cutoff to two calendar months before the current execution. Search
the product's available shipping records, in this order:

1. Releases, deployment records, and release notes — strongest evidence that
   a change was live.
2. The default/production branch's Git history. When shell access is
   available, a useful starting point is:

   ```sh
   git log --first-parent --since="2 months ago" --format="%H%x09%cI%x09%s"
   ```

   Read the linked PR description or a focused diff only when the subject
   does not make customer impact clear.
3. Existing project changelog files, launch notes, or issue/PR records that
   unambiguously describe something shipped in that same window.

Do not scan unrelated branches, old history, generated files, or every diff
blindly. A commit in a branch is not proof of a release: use it only when
the project is known to deploy that branch or another source confirms it
shipped. Keep the normal rule from `logging.md`: do not invent or log work
that was only planned, merged-but-undeployed, internal, or a typo-level fix.

Establish that release path once before classifying candidates. For example,
if the project's deployment documentation says the default branch is
automatically deployed to production, a first-parent commit on that branch is
evidence that the change shipped. For an incremental improvement or fix to an
established public flow, it is GA evidence by default; do not require every
commit to say "GA". That default is overridden by any stronger evidence that
the change was a beta, private preview, pilot, allowlisted rollout,
feature-gated, or limited to selected accounts or teams.

Treat a newly named product, standalone launch, or major new capability
differently: production deployment proves only that code is live, not that the
product is generally available. Require positive GA evidence from a release
announcement, rollout record, Product Brain/release registry, or creator
confirmation. Keep unresolved launches in a short availability-question list;
do not infer GA from the absence of a beta label.

## 2. Turn records into product changes

Create one candidate per customer-noticeable improvement, meaningful fix, or
substantive product-message change — not one per commit. Collapse
implementation, test, and follow-up commits for the same release into the
same candidate. Skip refactors, dependencies, CI, tooling, documentation-only
work, invisible fixes, beta/private-preview/pilot/allowlisted releases, and
changes that only make access more restrictive. Treat a feature as eligible
when it has either a release/deployment record or a commit on the project's
documented automatic production branch, unless a stronger record shows that
it had limited availability. For a new product, standalone launch, or major
new capability, that shipping evidence must be accompanied by positive GA
evidence. When the availability evidence conflicts, the release path cannot
be established, or a launch lacks that positive evidence, inspect the focused
PR, release note, Product Brain/release registry, or feature-gate change. If a
high-value candidate is still unresolved, ask the creator about the candidates
together instead of silently omitting them.

Treat a Git subject as a discovery lead only, never as text to paraphrase
into a changelog. Before logging each surviving candidate, verify its product
fact with the smallest focused evidence that resolves it: start with the PR
description and changed-file list, then inspect the user-facing component,
copy, API contract, test, or release note as needed. Capture four facts:

1. the user or customer audience;
2. the changed customer-visible behaviour;
3. the product surface and any material conditions; and
4. the source that supports those facts.

Write only what those facts establish. In particular, do not infer a product
or flow from a provider name, a component name, or an overloaded word in a
commit subject. For example, an Apple Pay change might belong to a political
donation form rather than a product called "Payment". If focused evidence
still cannot resolve the scope, skip it or include it in one concise,
grouped question to the creator; never guess to make the first batch longer.

The backfill is an announcement-quality history, not an audit log. Exclude
price increases, reduced quotas, features moved behind a higher tier,
narrower eligibility, account/API locks, removals, and enforcement steps. Do
not reframe those changes as benefits. When a record contains both a
restriction and an independent improvement, include only the independently
useful outcome; if that cannot be stated truthfully without hiding the
restriction, skip it. Only a security, legal, or service-continuity notice
the creator explicitly wants to publish is an exception.

For every candidate, use the same judgement as `logging.md` §§5–8:

- Write a short, customer-facing summary — translate commit/PR jargon.
- Pick `feature`, `pricing`, `positioning`, `fix`, or `other`.
- Default to `minor`; use `major` only when it genuinely merits an
  announcement.
- Include only Product Brain sections the change actually made stale.

Use the best available shipped date — typically the release/deployment date,
otherwise the default-branch commit date. Preserve it with `occurred_at` so
the resulting feed keeps its real chronology:

```text
vibe_log_product_change({
  summary: "Added CSV export for order history.",
  change_type: "feature",
  significance: "major",
  affected_kb_sections: ["features"],
  occurred_at: "2026-06-15T12:00:00.000Z"
})
```

`occurred_at` is for this historical import only. Omit it for a change that
just shipped; the normal logging flow records the current time automatically.

## 3. Empty or inaccessible history is a successful outcome

If the project is new, has no commits/releases in the window, its history is
unavailable, or none of the records can safely be identified as a
customer-visible shipped change, log nothing. Do not report an error and do
not create a placeholder changelog entry. State briefly that no eligible
history was found, then continue with the original request's normal flow.

The initial claim remains complete in this case, so subsequent executions
will not repeat the scan.

## 4. Finish the original flow

After recording any candidates, run `vibe_get_product_changelog` if you need
the resulting staleness or unannounced-feature signals, then resume the §3
direction that triggered this skill. If the current task's newly shipped
change may have been included in the historical scan, deduplicate it against
the newly created entries before using the normal single-change log flow.
