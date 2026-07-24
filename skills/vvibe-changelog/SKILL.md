---
name: vvibe-changelog
version: 0.1.0
manifest_version: 1
description: Log user-visible product changes (new features, pricing changes, repositioning, significant fixes) into VVibe right after they ship, so VVibe can detect when the Product Knowledge Base (KB) has gone stale — then act on that signal before drafting prose. Trigger to LOG a change when the user says things like "I just shipped X", "we launched Y", "deployed a fix for Z", "changed our pricing" — right after a user-visible change goes live in production, never for internal refactors or typo fixes. Trigger to ACT when another VVibe prose task (an email campaign, a blog post) surfaces a stale KB or unannounced major features — nudge a KB update first, then suggest announcing shipped features via email or blog.
---

# VVibe Changelog Skill — Routing

This file is a router. It decides which of the two directions you're in —
**logging** a change, or **acting** on a staleness/announcement signal —
then directs you to a single deep-dive in `references/`. Keep the flow
detail in the referenced files, not here. When you load this skill: read
this whole file, run the capability check in §2, then **read the matching
`references/*.md`** for the flow you're on. Do not read every reference up
front.

## 1. What this skill does

Two independent directions, both riding on the same MCP tools:

1. **Log** — after a user-visible product change ships (a feature,
   a pricing change, a repositioning, a significant fix), record it with
   `vibe_log_product_change`. This is what lets VVibe know the Product
   Knowledge Base (KB) might be out of date, and what feeds the
   "should we announce this?" signal.
2. **Act** — when a different VVibe prose task (drafting an email
   campaign, writing a blog post) reveals the KB is stale relative to
   logged changes, or that shipped major features were never announced,
   nudge the human: sync the KB first, then suggest announcing via email
   or blog.

These aren't sequential steps of one flow — either can happen on its own.
A session might only ever log changes; another might only ever act on a
staleness signal surfaced by the blog-writer or email skill.

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

## 2. Capability checklist (run BEFORE asking the user anything)

| Capability | How to detect | If missing |
|---|---|---|
| Changelog tools available | `vibe_log_product_change` (+ `vibe_get_product_changelog`, `vibe_mark_change_announced`) are in your tool list | **Two different cases — don't conflate them.** If you have NO `vibe_*` tools at all → VVibe isn't connected; have the creator connect it — fastest is `npx @vvibe/cli connect --server=https://mcp.vvibe.ai` (the first call opens a browser login, and sign-up is on that same page — full walkthrough in `ONBOARDING.md` at the repo root when present). If you have core `vibe_*` tools (e.g. `vibe_get_product_kb`) but NOT the changelog ones → you're connected but this skill isn't activated for the connection: call `vibe_report_skill_installed({ skillId: 'changelog', version: '<from this file's frontmatter>' })`. That registers the skill for your connection and the changelog tools become available on the same session (reconnect once if your MCP client caches the tool list). |
| Product Brain exists | `vibe_get_product_kb` returns non-null `data` | You can still log changes without a KB — logging doesn't depend on it. But the staleness signal is meaningless with no KB to compare against; if this is a brand-new account, mention routing to `vvibe-product-brain` once there's something worth building |

Detect, don't interrogate: check tool availability yourself before asking
the creator for anything.

## 3. The two directions — pick where you are

- **"I just shipped/deployed X" / "we launched Y" / "changed our
  pricing" / "fixed Z" / any user-visible change just went live** →
  **log it**: `references/logging.md`
- **KB staleness detected** — `vibe_get_product_kb`'s `staleness` field
  is present, or `vibe_get_product_changelog`'s `pending > 0` — usually
  surfacing mid another task (drafting an email, writing a blog post) →
  `references/kb-sync-flow.md`
- **Unannounced major features** — `vibe_get_product_changelog`'s
  `unannouncedMajorFeatures[]` is non-empty, or `vibe_log_product_change`
  just returned `suggestAnnouncement: true` → `references/announce-flow.md`

kb-sync and announce can chain: an announcement is drafted from the KB,
so `announce-flow.md` routes through `kb-sync-flow.md` first if the KB is
stale — don't announce off stale content.

## 4. Tools (MCP)

Operate the changelog through the `vibe_*` MCP tools — they carry your
VVibe connection token. There is no REST/API-key equivalent for these
three; they're MCP-only, same posture as the blog-writer tools.

| Intent | MCP tool | Params | Notes |
|---|---|---|---|
| Log a shipped change | `vibe_log_product_change` | `{summary, change_type, significance, affected_kb_sections?}` | Returns `kbStale` and `suggestAnnouncement` |
| List the changelog / check staleness | `vibe_get_product_changelog` | `{limit?}` | Returns `{entries[], pending, kbLastUpdatedAt, unannouncedMajorFeatures[]}` |
| Mark changes as announced | `vibe_mark_change_announced` | `{entry_ids: string[]}` | Call after the email/blog for those entries actually sent/published |

Two tools from other skills this one routes into:

| Intent | Tool | Owning skill |
|---|---|---|
| Read the Product Brain (now carries `staleness`) | `vibe_get_product_kb` | always available (no skill gate) |
| Update a KB section to absorb a pending change | `vibe_update_product_kb_section` | `vvibe-product-brain` |

## 5. Hard rules

- **Log after shipped, not planned.** A merged PR or a described intent
  isn't loggable — only changes actually live in production.
- **User-visible only.** No internal refactors, dependency bumps, or
  typo fixes — see `references/logging.md` §1 for the exact line.
- **Soft nudges, not gates.** If the user declines a KB-sync or
  announce suggestion, proceed with whatever they were doing — don't
  re-nag in the same session.
- **Dedup before logging if unsure.** Check
  `vibe_get_product_changelog` for a matching entry before calling
  `vibe_log_product_change` again for the same shipped change.
- **Sync before announcing.** Announcement copy is generated from the
  KB — never draft an announcement from a KB you know is stale.

## 6. Reference documents

| File | Contains | Load when |
|---|---|---|
| `references/logging.md` | When to log, how to write a good `summary`, picking `change_type` / `significance` / `affected_kb_sections`, dedup check, what to do with the response. | direction = log |
| `references/kb-sync-flow.md` | List pending changes → propose a KB update → write via `vibe_update_product_kb_section` → continue the original task. | staleness detected |
| `references/announce-flow.md` | Sync the KB first → suggest an email campaign and/or blog post for unannounced major features → mark announced after send/publish. | unannounced major features |
