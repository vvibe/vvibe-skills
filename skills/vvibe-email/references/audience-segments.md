# Audience Segments — pulling a recipient list from the creator's own data

Who an email goes to is usually a question about the creator's *own* database,
not about VVibe: "the people on the pro plan in Taiwan who logged in this
month". You can answer it — query their project, import the result into the
campaign, and save how you pulled it so the same list can be refreshed later.

VVibe never connects to the creator's database. **You** run the query, in
their project, with their code and credentials. VVibe stores the rows you
import and a plain-prose note of how you got them.

## Start by checking what already exists

Whenever the conversation turns to *who* should receive something, call
`vibe_list_audience_segments` **before** designing a query. Each segment
carries `name`, `definition`, `lastRowCount`, `lastRunAt`, `lastCampaignId`.

If one matches what the creator just described, your **first** line back to
them names it — before the draft, before any blocker you found, before
anything else. State all four: the name, the date it was last built
(`lastRunAt`), the row count (`lastRowCount`), and the choice.

> You built **Taiwan paid actives** on 2026/08/06 — 412 people, defined as
> `plan = pro AND region = TW AND last_login within 30 days`. Refresh that
> list, or build a new one?

Say the date out loud even when the answer looks obvious to you. It is how
the creator judges whether the list is stale — a segment built yesterday and
one built in March mean completely different things about who is on it, and
they know their own churn better than you do. "You already have this
segment" without the date and the count is not the same message.

Then wait for the answer before pulling anything. If something else is
blocking the send (no production credentials, an unresolved CTA, missing
copy), raise it *after* the segment line — a blocker doesn't excuse skipping
the question, and the creator can often answer both in one reply.

- **Refresh** → re-run the definition now (numbers move), import, and pass the
  same `segmentId` so the count and run date update in place.
- **New** → a different name, and say plainly that both will now exist.
- **Same rules, different wording** → still a refresh. Don't create twins that
  mean the same thing; update the `definition` instead.

Never silently reuse the *rows* from last time — a segment is a query, not a
frozen list. If the creator wants exactly the previous recipients, that's
`sourceCampaignId` (copy a previous campaign's list) in the dashboard, not a
segment refresh.

## Pulling the list safely

The creator's database is production data. Rules, in order:

1. **Read-only.** A `SELECT` (or the ORM's read path). Never write, never
   migrate, never "clean up" the data while you're in there. If reading
   requires credentials you don't have, ask — don't improvise.
2. **Find the email column, don't guess it.** Read the schema / model
   definition. `email`, `email_address`, `contact_email`, `user.email` on a
   join — confirm which one holds a reachable address, and skip rows where it's
   null or obviously placeholder (`test@`, `noreply@`).
3. **Consent, not just reachability.** If the schema has anything resembling
   `unsubscribed`, `marketing_opt_in`, `email_verified`, or `deleted_at` —
   respect it in the query. Ask if you're unsure whether a flag means consent.
   VVibe filters its own unsubscribes at send time, but it cannot know about a
   flag that only exists in the creator's database.
4. **Bound the query.** Add a `LIMIT` while you're still shaping it. A
   `count(*)` first tells you whether the definition is even plausible before
   you pull rows.
5. **Confirm the rules before the run that counts.** Read the conditions back
   in the creator's own words and get a yes. A wrong segment sends a real email
   to real people.
6. **Pull the columns the copy needs, in the same query.** Plan name, region,
   last login — each becomes a merge tag. Going back for a second pull means
   two chances to disagree with yourself.

## Don't put the list in the chat

The names and addresses are the creator's customers' personal data. Report:

- the **count** ("412 people"),
- **2–3 de-identified samples** to prove the shape (`j•••@gmail.com — pro, TW`),
- the **column names** you'll expose as merge tags.

Never paste the full list, never dump raw rows, and don't write the list to a
file in their repo. It goes from the query straight into
`vibe_import_campaign_recipients`.

## Importing

```
vibe_import_campaign_recipients({
  campaignId,
  rows: [
    { email, displayName?, columnData: { plan: 'pro', region: 'TW' } },
    …
  ],
  headers: [ { key: 'plan', label: 'Plan' }, { key: 'region', label: 'Region' } ],
  segment: { segmentId?, name: 'Taiwan paid actives', definition: '…' },
})
```

- `columnData` keys are merge-tag slugs: lowercase, `a-z0-9_`, starting with a
  letter. Anything you send is usable as `{slug}` in the body, so the copy can
  say "you're on {plan}" without a second campaign per plan.
- `headers` gives those slugs human labels in the creator's editor. Register
  every slug you use, or the creator sees raw keys.
- `segment` records the pull. Pass `segmentId` when refreshing an existing one;
  omit it for a new segment (a matching name updates in place rather than
  duplicating). The stored `rowCount` is the size of the pull, not the number
  of new rows — dupes already on the campaign don't shrink the segment.
- Duplicates within the campaign are skipped server-side, so a refresh into the
  same campaign is safe. The result's `imported` / `skipped` tells you which.
- Over **10,000** rows the import is split across requests automatically;
  `requests` in the result says how many. Over **50,000** the call is refused
  outright rather than truncated — narrow the definition (or split the send)
  and tell the creator why.

`vibe_save_audience_segment` is the same store without an import: use it to
name a segment you agreed on but haven't run, to correct a `definition` after
the creator clarifies the rules, or to rename one. Only pass `rowCount` if you
actually ran the query — it stamps the run date the creator reads back later.

## Then finish the normal send flow

Importing recipients changes nothing about the rest of `sending-campaigns.md`.
Still:

1. `vibe_get_brand` → resolve where the CTA actually lands (mandatory, every
   send).
2. Read the saved draft back and confirm subject + body + **recipient count**
   with the creator.
3. `vibe_send_campaign({ campaignId })`.

When the body uses a pulled column, check one rendered example with the
creator before sending — a `{plan}` that reaches a recipient whose row had no
plan renders empty, which reads as a bug in their product.

## Worked example

> **Creator:** send this month's update to my paying users in Taiwan.

1. `vibe_list_audience_segments` → empty. Nothing to reuse.
2. Read the project's schema: `users(email, plan, country, last_login_at,
   marketing_opt_in, deleted_at)`.
3. Propose: `plan = 'pro' AND country = 'TW' AND marketing_opt_in = true AND
   deleted_at IS NULL`. `count(*)` → 412. Read that back, get a yes.
4. Pull 412 rows with `email`, `name`, `plan`, `country`.
5. `vibe_import_campaign_recipients({ campaignId, rows, headers, segment: {
   name: 'Taiwan paid actives', definition: "users table: plan='pro',
   country='TW', marketing_opt_in, not deleted; columns plan + country as
   merge tags" } })` → imported 412.
6. Report: "412 people, e.g. j•••@gmail.com — pro, TW. `{plan}` and
   `{country}` are available in the body." Then the normal CTA-resolve →
   confirm → send.

Next month, step 1 finds the segment and the conversation starts with
"refresh 412, or new?" instead of rebuilding the query from scratch.
