# Sending a Campaign via Vibe MCP

End-to-end run with body templates and concrete outcome handling.

## Prerequisites

- Agent is connected to the creator's VVibe MCP server (the dashboard onboarding flow installs this).
- The `email` skill is installed for that connection — without it, the campaign tools are not registered for this MCP session.
- The creator has a working sender domain. If not, point them at **Email → Domain** in the Vibe dashboard first; that's where they verify DKIM / CNAME. Sending before the domain is verified results in delivery failures the creator will have to chase.

## Read the Product Brain first

Before drafting anything, call `vibe_get_product_kb`. The Product Brain is
the creator's structured product facts; grounding the campaign in it is what
keeps the copy on-brand instead of generic. `vibe_get_product_kb` is always
available on an MCP session (the brain tools are not skill-gated), so this
read works even when only the email skill is installed.

Use it to:

- **set the voice** — `company.brand_voice.tone` (and `avoid` list) drive
  the greeting, hook, and CTA wording. Don't paraphrase `preferred_terms`.
- **anchor the hook** — `product.core_value_prop` and
  `product.differentiators` are the one-paragraph reason to act.
- **target the angle** — `growth_context.icp_persona` and
  `reader_pain_points` tell you which pain the invitation should open on.
- **stay legal** — `legal_compliance.forbidden_claims` are phrases you must
  **never** write toward (CAN-SPAM / FTC / medical / financial). Treat them
  as hard guardrails, same as the blog skill does.

**If `data` is null** (no Product Brain yet): the copy will be generic.
Suggest the creator run **vvibe-product-brain** first — one build makes
every future campaign sharper. They can still proceed without it; in that
case fall back to the merchant's brand description (the minimum context the
dashboard's "Draft with AI" already uses), but say plainly that a built
brain produces better copy.

## Authoring contract

The dashboard arranges the work as **Email content → Recipients → Send** — you author the email *first*, then attach recipients, then dispatch. The MCP tools enforce the same shape:

| Step | Tool | What it sets |
|---|---|---|
| Author | `vibe_create_campaign` | `name`, `subject`, `bodyHtml`, `aiContext` |
| Revise | `vibe_update_campaign` | any of the above |
| Recipients | _dashboard only_ | recipient list (CSV / Sheet / typed addresses) |
| Send | `vibe_send_campaign` | dispatches the saved draft (campaignId only) |

`vibe_send_campaign` takes only `campaignId`. If the saved draft has no subject or body, it returns `missing_content`.

## Flow

```
vibe_get_product_kb                          # brand voice, value prop, ICP, forbidden claims
  ↓
vibe_list_campaigns                          # find or confirm a draft
  ↓
draft subject + bodyHtml grounded in the brain, with creator
  ↓
vibe_create_campaign  ({ name, subject, bodyHtml, aiContext })  # aiContext = brain-derived brief
  ↓
[creator imports recipients in dashboard]    # not via MCP
  ↓
vibe_update_campaign  (optional — only if revising copy)
  ↓
read back to creator + confirm
  ↓
vibe_send_campaign  ({ campaignId })
  ↓
switch on outcome
  ↓
vibe_get_campaign_analytics  (a few min later)
```

## Drafting the body

The body is HTML. Keep it simple — most email clients strip aggressive CSS and break on layout-heavy markup. A reliable starting point:

```html
<p>Hi {customerName},</p>

<p>{productName} here. <!-- one-paragraph hook tied to the campaign angle --></p>

<p>
  <a href="{inviteUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px;">
    <!-- CTA text -->
  </a>
</p>

<p>— {productName}</p>
```

Rules:

- **Voice and hook come from the brain.** Write the greeting + hook in
  `company.brand_voice.tone`, lead with `product.core_value_prop`, and open
  on a `reader_pain_points` the ICP actually feels. Don't paraphrase
  `preferred_terms`.
- **Never write toward `forbidden_claims`.** No invented metrics, ROI
  numbers, or guarantees. These are hard guardrails from the brain's
  `legal_compliance` section.
- `{inviteUrl}` is mandatory — it's the tracked invitation link.
- `{customerName}` falls back to a generic greeting when a row has no name.
- Custom column slugs (e.g. `{discount_code}`, `{cohort}`) are referenced the same way. Confirm slugs with the creator — they appear in the dashboard's import preview.
- Inline styles only. External stylesheets and `<style>` blocks are stripped or ignored by Gmail / Outlook / Apple Mail.
- Images: use absolute HTTPS URLs (no `data:` URIs). Hosted images can be uploaded in **Email → Templates**.

### Set `aiContext` from the brain

When you call `vibe_create_campaign`, pass an `aiContext` distilled from the
Product Brain — a short brief naming the campaign angle, the brand voice
tone, the value prop, and any forbidden claims to avoid. Two reasons:

1. It's the drafting context the dashboard shows the creator.
2. It's the **bridge** to the dashboard's "Draft with AI" button: that
   server-side regenerate currently grounds only on the merchant brand
   description, so a brain-derived `aiContext` is how brand context reaches
   it today. (A later change will have that path read the brain directly;
   until then, `aiContext` carries it.)

Keep it plain-language and ≤ 4000 chars. Example:

```text
Angle: early-access invite for past workshop attendees.
Voice: warm, direct, second-person; avoid hype words ("revolutionary").
Value prop: turn your following into paying members in an afternoon.
Avoid: income guarantees, "#1", medical/financial claims.
```

## Outcome handling

`vibe_send_campaign` returns a discriminated `outcome`. Pseudocode for the agent:

```
result = vibe_send_campaign({ campaignId })

switch result.outcome:
  case "enqueued":
    say "Sent to {result.enqueuedCount} people. {result.remainingQuota} email credits left this month."
    optionally: schedule a follow-up to call vibe_get_campaign_analytics

  case "campaign_not_found":
    re-list with vibe_list_campaigns and confirm the id with the creator

  case "no_recipients":
    say "There are no recipients on this campaign yet. Open the Recipients tab in the dashboard, find this campaign, and import your list (CSV, Google Sheet, or paste addresses). Tell me when you're done and I'll send."

  case "missing_content":
    call vibe_update_campaign with the agreed subject + bodyHtml, then retry
    if you no longer have the copy in chat, ask the creator to confirm it again

  case "quota_exceeded":
    say "You're {result.needed - result.remainingQuota} credits short of sending to everyone. You can top up in Email → Credits in the dashboard, then I'll send. Or split the list and send a smaller batch first."
```

## Confirmation pattern

Before calling `vibe_send_campaign`, read the saved draft back to the creator and wait for explicit confirmation:

> About to send campaign **"{name}"** to **N recipients** imported on {date}.
>
> **Subject (saved):** {subject}
>
> **Preview (saved):**
> ```
> {first 200 chars of saved bodyHtml stripped to text}
> ```
>
> Sending costs {N} email credits ({remainingQuota} available). Proceed?

If the creator wants changes, call `vibe_update_campaign` with the revisions, then re-read the saved draft.

## Reading analytics

A few minutes after `enqueued`:

```
analytics = vibe_get_campaign_analytics({ campaignId })
```

The funnel is cumulative left-to-right:

- `imported` = list size
- `enqueued` = how many reached the SES queue (= `imported` minus any validation rejects)
- `delivered` = SES confirmed delivery
- `opened`, `clicked` = engagement (tracking pixel + `/r/{code}` redirect)
- `bounced`, `complained` = SES hygiene signals
- `signedUp` = recipient submitted the waitlist form (Mode A/B) or `syncToVVibe` ran with their refcode (Mode C). Requires the per-recipient `outboxId` (URL `utm_content`) to pin — campaign-level refcodes alone don't pin and stay at 0.
- `converted` = recipient later completed a paid checkout in the vibe coder's payment integration and the checkout email matched the imported email on a `signedUp` row.

Report 3–4 numbers, not all 9. Most creators want: delivered, opened, clicked, signedUp.

## Common follow-ups

- "Why is the open rate low?" — Subject line, sender reputation, time of day. Suggest A/B testing in a follow-up campaign.
- "Why did N people bounce?" — Bad addresses in the imported list. Tell them to clean the list before the next send (the dashboard's import preview flags invalid emails).
- "Can I edit the subject/body and resend?" — No, a sent campaign is immutable. Create a new campaign with the same recipient logic for a follow-up.
- "Can I cancel a send mid-flight?" — No. Once `vibe_send_campaign` returns `enqueued`, the send is committed and the SES outbox processes it through. There is no MCP tool or dashboard control to stop it.
