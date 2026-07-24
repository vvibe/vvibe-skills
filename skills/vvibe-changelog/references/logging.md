# Logging a product change

Read this once you've passed the §2 capability check in SKILL.md and a
user-visible change has just shipped (or you've been asked to log one).

## 1. When to log

Log only changes a customer would notice, or that change what VVibe
should say about the product. Do **not** log:

- internal refactors, code cleanup, dependency bumps, CI/tooling changes
- typo fixes and copy tweaks that don't change meaning
- test additions, internal documentation
- anything not yet deployed — a merged PR or a described plan isn't
  shipped

Log **after** the change is live in production, not when merely planned
or merged. "We're going to add X" is not loggable; "X shipped" is. If
you're not sure whether something has actually gone out, ask before
logging rather than guessing.

## 2. Writing a good summary

One sentence, plain language, phrased as what the user's *customers*
would notice — not the internal engineering description.

Good: "Added a dark mode toggle to account settings."
Bad: "Refactored `ThemeProvider` context and added a
`prefers-color-scheme` media query listener."

Good: "Free tier now includes 3 projects instead of 1."
Bad: "Updated `PROJECT_LIMIT_FREE` from 1 to 3 and added a migration."

If the change came out of a commit message or PR title, translate it —
don't paste the git log line in as the summary.

## 3. Picking `change_type`

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

## 4. Picking `significance`

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

## 5. Picking `affected_kb_sections`

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

## 6. Dedup — check before you log

If you're not sure whether a change was already logged (resuming after
a break, another session might have logged it, or the user says "did I
already log this?"), call `vibe_get_product_changelog({ limit: ... })`
first and scan `entries[]` for a matching summary before calling
`vibe_log_product_change`. Don't log the same shipped change twice.

## 7. After logging

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
