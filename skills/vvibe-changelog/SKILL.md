---
name: vvibe-changelog
version: 0.2.4
manifest_version: 1
description: Keeps VVibe's record of what the product does in sync with what actually shipped, so the Product Knowledge Base behind every generated email and blog post never goes stale. USE THIS SKILL WHENEVER YOU ARE ASKED TO CHANGE THE PRODUCT ITSELF — changing pricing, plan, or tier config; adding or changing a user-facing feature, page, screen, or flow; rewriting landing-page, positioning, or marketing copy; shipping a notable user-facing fix; enabling a feature flag for everyone; or running a deploy, release, or publish. Load it at the START of that work: do exactly what the user asked first, then, once the change is live, log one entry with `vibe_log_product_change` — the user will not remind you, and an unlogged change silently rots the Knowledge Base. Also triggers when the user says "I just shipped X" / "we launched Y" / "changed our pricing". Never log internal refactors, typo fixes, or work that isn't live yet. Trigger to ACT when another VVibe prose task (an email campaign, a blog post) surfaces a stale KB or unannounced major features — nudge a KB update first, then suggest announcing shipped features via email or blog. Trigger to WIRE a public feed when the user wants a public changelog / "what's new" page for their product — VVibe serves the data only; read `references/public-changelog.md` for the feed contract and wiring guidance.
---

# VVibe Changelog Skill — Routing

This file is a router. It first handles a one-time initial-history backfill,
then decides which of the two ongoing directions you're in — **logging** a
change, or **acting** on a staleness/announcement signal — and directs you
to a single deep-dive in `references/`. Keep the flow detail in the
referenced files, not here. When you load this skill: read this whole file,
run the capability check in §2, run the first-execution gate in §2.5, then
**read the matching `references/*.md`** for the flow you're on. Do not read
every reference up front.

## 1. What this skill does

Two independent directions, both riding on the same MCP tools:

1. **Log** — as soon as a user-visible product change ships (a feature,
   a pricing change, a repositioning, a significant fix), record it with
   `vibe_log_product_change`. Most of the time you're the one who
   shipped it — recognize your own completed work as the trigger, don't
   wait for the user to bring it up. This is what lets VVibe know the
   Product Knowledge Base (KB) might be out of date, and what feeds the
   "should we announce this?" signal.
2. **Act** — when a different VVibe prose task (drafting an email
   campaign, writing a blog post) reveals the KB is stale relative to
   logged changes, or that shipped major features were never announced,
   nudge the human: sync the KB first, then suggest announcing via email
   or blog.

These aren't sequential steps of one flow — either can happen on its own.
A session might only ever log changes; another might only ever act on a
staleness signal surfaced by the blog-writer or email skill.

There's also a third, standalone reference that isn't a log/act
direction at all: `references/public-changelog.md` documents VVibe's
separate **public** changelog feed — a read-only, unauthenticated JSON
endpoint, no MCP tool involved. Load it whenever the human wants shipped
changes visible publicly (a `/changelog` page on their own site, or a
third-party changelog tool pointed at the feed) — independent of whether
you're also logging or acting this session.

### Out of scope

- Writing the KB content itself — that's `vvibe-product-brain`. This
  skill only signals *that* the KB is stale and *which* sections; the
  actual section rewrite is a product-brain write
  (`vibe_update_product_kb_section`).
- Drafting or sending the announcement itself — that's `vvibe-email`
  (campaign) or `vvibe-blog-writer` (post). This skill only nudges
  toward those skills and marks entries announced afterward.
- Logging internal-only changes. Refactors, dependency bumps, typo
  fixes, CI/tooling changes, and anything not yet deployed are not
  loggable — see `references/logging.md` §1.
- Rendering a changelog page. VVibe exposes only the public feed's data
  (`references/public-changelog.md`); the page itself belongs in the
  creator's own site, or a third-party changelog tool — never inside
  VVibe.

## 2. Capability checklist (run BEFORE asking the user anything)

| Capability | How to detect | If missing |
|---|---|---|
| Changelog tools available | `vibe_claim_initial_product_changelog_backfill`, `vibe_log_product_change`, `vibe_get_product_changelog`, and `vibe_mark_change_announced` are in your tool list | **Two different cases — don't conflate them.** If you have NO `vibe_*` tools at all → VVibe isn't connected; have the creator connect it — fastest is `npx @vvibe/cli connect --server=https://mcp.vvibe.ai` (the first call opens a browser login, and sign-up is on that same page — full walkthrough in `ONBOARDING.md` at the repo root when present). If you have core `vibe_*` tools (e.g. `vibe_get_product_kb`) but NOT the changelog ones → you're connected but this skill isn't activated for the connection: call `vibe_report_skill_installed({ skillId: 'changelog', version: '<from this file's frontmatter>' })`. That registers the skill for your connection and the changelog tools become available on the same session (reconnect once if your MCP client caches the tool list). |
| Product Brain exists | `vibe_get_product_kb` returns non-null `data` | You can still log changes without a KB — logging doesn't depend on it. But the staleness signal is meaningless with no KB to compare against; if this is a brand-new account, mention routing to `vvibe-product-brain` once there's something worth building |

Detect, don't interrogate: check tool availability yourself before asking
the creator for anything.

## 2.5 First-execution gate — always run this after §2

Call `vibe_claim_initial_product_changelog_backfill({})` once, before
choosing the usual log/act direction:

- `shouldBackfill: false` — this project already has changelog entries, or
  an earlier execution already attempted its initial scan. **Do not inspect
  historical records again**; continue straight to §3.
- `shouldBackfill: true` — this is the first execution for a project with an
  empty changelog. Read `references/initial-backfill.md`, perform the
  two-month scan, then continue to §3 in the same session.

The claim is persistent and is made before the scan. That is intentional: a
new project with no usable history still needs to record that its one allowed
backfill pass happened, rather than rescanning on every future execution.

## 3. Pick where you are

- **You just shipped user-visible work** — implemented a feature,
  changed pricing/plan config, rewrote positioning or marketing copy,
  shipped a notable fix, merged to main or ran a deploy/release/publish
  command, flipped a flag to GA — or the user says "I just shipped X" /
  "we launched Y" / "changed our pricing" / "fixed Z" → **log it**:
  `references/logging.md`
- **KB staleness detected** — `vibe_get_product_kb`'s `staleness` field
  is present, or `vibe_get_product_changelog`'s `pending > 0` — usually
  surfacing mid another task (drafting an email, writing a blog post) →
  `references/kb-sync-flow.md`
- **Unannounced major features** — `vibe_get_product_changelog`'s
  `unannouncedMajorFeatures[]` is non-empty, or `vibe_log_product_change`
  just returned `suggestAnnouncement: true` → `references/announce-flow.md`
- **"add a public changelog / what's-new page" / "show shipped changes
  on my site" / wiring a third-party changelog tool** — not a log/act
  direction, just data consumption → `references/public-changelog.md`

kb-sync and announce can chain: an announcement is drafted from the KB,
so `announce-flow.md` routes through `kb-sync-flow.md` first if the KB is
stale — don't announce off stale content.

## 4. Tools (MCP)

Operate the changelog through the `vibe_*` MCP tools — they carry your
VVibe connection token. There is no REST/API-key equivalent for these
four; they're MCP-only, same posture as the blog-writer tools.

| Intent | MCP tool | Params | Notes |
|---|---|---|---|
| Claim the one-time initial history scan | `vibe_claim_initial_product_changelog_backfill` | `{}` | Returns `{shouldBackfill}`; run once on every skill load before routing. `true` only once for an empty changelog. |
| Log a shipped change | `vibe_log_product_change` | `{summary, change_type, significance, affected_kb_sections?, occurred_at?}` | `occurred_at` is historical-backfill only; returns `kbStale` and `suggestAnnouncement` |
| List the changelog / check staleness | `vibe_get_product_changelog` | `{limit?}` | Returns `{entries[], pending, kbLastUpdatedAt, unannouncedMajorFeatures[]}` |
| Mark changes as announced | `vibe_mark_change_announced` | `{entry_ids: string[]}` | Call after the email/blog for those entries actually sent/published |

Two tools from other skills this one routes into:

| Intent | Tool | Owning skill |
|---|---|---|
| Read the Product Brain (now carries `staleness`) | `vibe_get_product_kb` | always available (no skill gate) |
| Update a KB section to absorb a pending change | `vibe_update_product_kb_section` | `vvibe-product-brain` |

The **public changelog feed** (`references/public-changelog.md`) is
separate again — a plain public `GET` endpoint, no MCP tool, no VVibe
connection needed at all (same posture as `vvibe-blog-render`'s content
API).

## 5. Hard rules

- **Detect it yourself — don't wait to be told.** You hold the evidence
  (you wrote the code, edited the config, ran the deploy); after
  finishing work that changes what a user sees, pays, or can do,
  recognize that and offer to log it — see `references/logging.md` §1
  for the self-detection checklist and §3 for the session-close
  checkpoint.
- **Log after shipped, not planned.** A merged PR or a described intent
  isn't loggable — only changes actually live in production.
- **User-visible only.** No internal refactors, dependency bumps, or
  typo fixes — see `references/logging.md` §1 for the exact line.
- **Changelog-worthy, not merely user-visible.** Record new or improved
  customer value, meaningful fixes, and substantive product positioning.
  Do not turn access restrictions, entitlement removals, price increases,
  eligibility narrowing, account locks, or enforcement steps into release
  notes. See `references/logging.md` §1 for the narrow exception and how to
  keep the Product Brain accurate without publishing such a change.
- **GA only, using the project's release evidence.** A documented automatic
  production-deployment branch or a release/deployment record is sufficient
  evidence of GA unless the commit, PR, release note, or code explicitly
  shows a beta, private preview, pilot, allowlist, feature gate, or selected
  account/team rollout. Do not require the literal word "GA" in every
  record; explicit limited-availability evidence always wins. A beta-to-GA
  transition can then be logged as that availability change.
- **Verify the product fact separately from release status.** A commit title
  only discovers a candidate; it never proves the product, audience, flow, or
  conditions to put in the summary. Before logging a historical or
  other-team change, inspect its focused PR description, user-facing diff,
  tests, API contract, or release note. State only facts that source supports;
  if the scope remains unclear, skip it or ask the creator in one grouped
  question.
- **Soft nudges, not gates.** If the user declines a KB-sync or
  announce suggestion, proceed with whatever they were doing — don't
  re-nag in the same session.
- **Dedup before logging if unsure.** Check
  `vibe_get_product_changelog` for a matching entry before calling
  `vibe_log_product_change` again for the same shipped change.
- **Backfill is a one-time exception.** Run the §2.5 claim before looking at
  history. Only `shouldBackfill: true` permits the two-month scan; never
  create a synthetic entry just to mark a completed scan.
- **Sync before announcing.** Announcement copy is generated from the
  KB — never draft an announcement from a KB you know is stale.

## 6. Reference documents

| File | Contains | Load when |
|---|---|---|
| `references/logging.md` | Self-detection checklist for recognizing your own shipped work (plus a session-close checkpoint), how to write a good `summary`, picking `change_type` / `significance` / `affected_kb_sections`, dedup check, what to do with the response. | direction = log |
| `references/initial-backfill.md` | The first-run, two-month history scan: trustworthy source selection, grouping records into customer-visible changes, preserving each change's original date, and returning safely when there is no usable history. | §2.5 returns `shouldBackfill: true` |
| `references/kb-sync-flow.md` | List pending changes → propose a KB update → write via `vibe_update_product_kb_section` → continue the original task. | staleness detected |
| `references/announce-flow.md` | Sync the KB first → suggest an email campaign and/or blog post for unannounced major features → mark announced after send/publish. | unannounced major features |
| `references/public-changelog.md` | The public, unauthenticated changelog feed (`GET /api/changelog/public/{merchantSlug}`) — what "announced" means for the feed, wiring it into the creator's own site or a third-party tool, a framework-agnostic fetch example, the 5-minute cache. | user wants a public changelog / "what's new" page |
