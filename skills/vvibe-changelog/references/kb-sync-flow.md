# KB sync flow

Read this once staleness has been detected. Staleness surfaces two ways:

- `vibe_get_product_kb`'s response carries a non-empty
  `staleness: { pendingChanges, entries[] }` field — this is the common
  case, since prose skills call `vibe_get_product_kb` at the start of
  every task.
- `vibe_get_product_changelog`'s `pending` is `> 0`, checked directly.

## 1. When this triggers

Almost always mid another task — an email campaign or blog post that
starts, per its own skill's routing, by reading the Product Brain. The
staleness field rides along on that same call; you don't need a
separate check unless you're inspecting the changelog directly.

## 2. The flow

1. **List the pending changes to the user.** Summarize
   `staleness.entries[]` (or the changelog entries behind `pending`) in
   plain language: what shipped, roughly when, and which KB sections
   each one touches.
2. **Propose updating the KB first**, before continuing the original
   task. Frame it as a question, not a blocker: "Your Product Brain is
   missing N recent changes — want me to fold those in before I draft
   this?"
3. **On consent**, for each pending entry, update the relevant KB
   section(s) via `vibe_update_product_kb_section` (the
   `vvibe-product-brain` skill's write path) — incorporate the change's
   `summary` into the section's existing content, don't just paste the
   raw log line in as prose. If properly updating a section needs more
   detail than the one-sentence `summary` gives you (a fuller pricing
   breakdown, a new customer case), ask the user for the missing detail
   rather than padding it out — this defers to `vvibe-product-brain`'s
   own no-fabrication rule (see its `extraction-discipline.md`).
4. **After the KB write(s) land, `pending` resets automatically** — the
   backend compares the KB's `updated_at` against changelog entry
   timestamps, so there's no separate "clear staleness" call.
5. **Continue the original task** (draft the email / blog) now grounded
   in the refreshed KB.

## 3. If the user declines

Proceed with the original task using the KB as-is. This is a soft
nudge, not a gate — don't ask again in the same session. If staleness
resurfaces in a later session, it's fair to ask again then.

## 4. Notes

- Only touch the sections the pending entries actually named in
  `affected_kb_sections` — don't use the opportunity to re-extract the
  whole Product Brain from scratch.
- If a pending entry has no `affected_kb_sections` at all, mention it
  to the user as logged-but-not-mapped and skip it in the KB write —
  don't guess which section it belongs to.
