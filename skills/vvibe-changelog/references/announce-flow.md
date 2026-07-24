# Announce flow

Read this once an announcement signal has fired:

- `vibe_log_product_change` just returned `suggestAnnouncement: true` —
  the entry you just logged is a major feature, or
- `vibe_get_product_changelog`'s `unannouncedMajorFeatures[]` is
  non-empty — one or more past major entries were never announced.

## 1. Sync the KB first

Announcement content (email copy, a blog post) is generated from the
Product Brain — if it's stale, route through `kb-sync-flow.md` before
drafting anything. Never draft an announcement grounded in a KB you
know is out of date; the copy will describe the product as it was, not
as it is.

## 2. Suggest a channel

Name the specific feature(s) from `unannouncedMajorFeatures[]` (or the
entry you just logged) so the suggestion isn't generic:

> Want to announce the dark mode toggle you shipped last week? I can
> draft a feature-update email campaign, a blog post, or both.

Two channels, not mutually exclusive:

- **Email campaign** — `vvibe-email` skill, `mcp-campaign` mode. Reads
  the Product Brain itself when drafting; hand off there rather than
  writing copy in this skill.
- **Blog post** — `vvibe-blog-writer` skill, `product_features`
  direction is the natural fit for a shipped-feature announcement.

## 3. Hand off, don't draft here

This skill only nudges toward the announcement — it doesn't draft
prose itself. Route to the chosen skill(s) to actually create and
send/publish.

## 4. Mark announced after it actually goes out

After the email is sent or the blog post is published, call
`vibe_mark_change_announced({ entry_ids: [...] })` with the entry ids
covered by that announcement.

- One announcement can cover multiple entries (e.g. a monthly
  "what's new" email covering 3 shipped features in one send) — pass
  all covered `entry_ids` in a single call.
- Don't call `vibe_mark_change_announced` speculatively before the
  send/publish actually happens. If the draft gets abandoned, the
  entries should stay unannounced so they resurface next time.

## 5. If the user declines

Proceed with whatever the user was originally doing. This is a soft
nudge — don't re-suggest in the same session.
`unannouncedMajorFeatures[]` will still be there next session if it's
still relevant.
