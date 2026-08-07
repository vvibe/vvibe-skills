---
name: vvibe-member
version: 0.6.0
manifest_version: 1
description: Help users wire signup events between their app and VVibe — tell VVibe when someone registers so referral codes and welcome emails work, capture signup attribution, and receive VVibe-side member events. Trigger when the user mentions VVibe signup events, member integration, telling VVibe about new users, referral / ref code capture at signup, signup attribution, utm tracking, or VVibe webhooks.
---

# VVibe Member Skill — Routing

This file is a router. It decides **which** member integration the human user
needs, then directs you to a single deep-dive in `references/`. Do not put
implementation detail here — keep it in the referenced files.

When you load this skill: read this whole file, run the capability checks in
§2, pick a mode using §3 / §4, then **Read the matching references/*.md**.
Do not read every reference file upfront.

## 1. What this skill does — and what it deliberately doesn't

**VVibe does not hold a copy of your users.** It used to; that's gone. A
mirror of the creator's user table has to be re-synced every time any field
changes, and the thing it was built for — picking a fine-grained email
audience — is better served by querying the creator's own database live at
send time (that's what `vvibe-email`'s audience segments do).

So this skill wires exactly two seams, plus one cross-cutting concern:

- **signup-event** — your app → VVibe, **once per registration**. VVibe
  records the address, any referral code, and any attribution. Nothing else.
- **inbound-webhook** — VVibe → your app (get notified when VVibe-side state
  changes: hosted-checkout subscription, waitlist signup on a VVibe page)
- **attribution-utm** — capture utm_* / referrer at signup, ship it inside
  the signup event. Hangs off `signup-event`.

**Do not build a sync loop.** No login hook, no profile-update hook, no
deletion hook, no backfill of existing users. If you catch yourself wiring
`syncToVVibe` into more than the registration handler, stop — that's the old
shape and it no longer buys anything.

**Where the creator's user data belongs: in the creator's database.** When a
task needs it (an audience for a campaign, a report, a lookup), query it
there. `vvibe-email`'s `audience-segments.md` is the canonical pattern.

## 2. Capability checklist (run BEFORE asking the user anything)

Detect these from the project, not by asking. Use whatever fits the
language / framework — read `package.json`, glob for files, look at `.env`.

| Capability | How to detect | Used by |
|---|---|---|
| `has_server_runtime` | Server framework present (Next.js with API routes, Express, FastAPI, Rails, Django, Payload, etc.). Static-only sites fail this. | all modes |
| `has_api_key_local` | `VVIBE_API_KEY` present in `.env*` or framework env config. | all modes |
| `has_signup_flow` | Discoverable registration handler (route file or auth-provider hook). | signup-event, attribution-utm |
| `has_public_https_endpoint` | Deployed (Vercel / Fly / Render / etc.) OR has a known reverse-proxied prod domain. Localhost-only ⇒ false. | inbound-webhook |

After detection, briefly tell the human user what you found and what's
missing — don't ask them to confirm capabilities you can verify yourself.

## 3. Modes

```yaml
modes:
  signup-event:
    status: available
    when: >
      The vibe coder wants VVibe to know when someone registers, so that
      referral codes captured at signup can auto-apply at checkout, the
      welcome email fires, and invitation-campaign analytics can stamp a
      signup. This is the default starting mode for any new integration.
    triggers:
      - "tell VVibe about new signups"
      - "VVibe user integration"
      - "track signups"
      - "referral code at signup"
      - "ref code / promo code capture"
      - "sync users to VVibe"          # legacy phrasing — route here and say why
    requires: [has_server_runtime, has_api_key_local, has_signup_flow]
    load: references/signup-event.md

  inbound-webhook:
    status: available
    when: >
      VVibe-side state changes (subscription created/canceled, payout
      completed, waitlist signup on VVibe-hosted page) should push to the
      vibe coder's app in realtime.
    triggers:
      - "VVibe notify my app when X"
      - "subscribe to VVibe events"
      - "VVibe → my app webhook"
      - "realtime member state from VVibe"
    requires: [has_server_runtime, has_public_https_endpoint, has_api_key_local]
    load: references/inbound-webhook.md

  attribution-utm:
    status: available
    when: >
      The vibe coder wants to know where signups came from (utm_*,
      referrer). This is a layer on top of signup-event — do not enable
      it before signup-event is wired.
    triggers:
      - "attribution"
      - "utm tracking"
      - "referrer tracking"
      - "where signups came from"
      - "marketing attribution"
    requires: [signup-event wired, has_signup_flow]
    wired_check: >
      "signup-event wired" = grep the repo for a POST to
      /api/members/signup-event, or a helper named notifyVVibeSignup /
      syncToVVibe. If absent, load signup-event.md FIRST and wire it; then
      return to this mode. Do not interleave.
    load: references/attribution-utm.md
```

## 4. Recipes

```yaml
recipes:
  starter:
    description: "MVP — tell VVibe when someone registers."
    load_in_order: [signup-event]

  production-launch:
    description: >
      Production-ready integration — signup events + marketing attribution +
      realtime inbound events. Pick this for "set up properly",
      "production integration", "launch-ready", "full bidirectional".
    aliases: [full-bidirectional]
    load_in_order: [signup-event, attribution-utm, inbound-webhook]
```

When the human user says something matching a recipe (e.g. "set up VVibe
properly", "production integration"), pick the recipe, name it back to
them, and load the referenced files in order.

## 5. When the user asks for something this skill no longer does

Three asks used to be modes here. Answer them straight — don't route to a
reference that no longer exists, and don't improvise a replacement API.

| They ask for | Say |
|---|---|
| "sync my users to VVibe" / "migrate my users" / "backfill" | VVibe doesn't hold a copy of your users any more — only a signup record per address. Wire `signup-event` and new registrations flow through; there is nothing to backfill. |
| "show my members in the VVibe dashboard" / "member list" | That page is gone. Paying members are on the Payment surface (they come from VVibe's own checkout). Everyone else lives in your database, where your agent can query them directly. |
| "read members back from VVibe" / "build an admin UI from VVibe data" | VVibe is not the source of truth for your users, so there's nothing to read back. Query your own database — that's the same path `vvibe-email` uses to build an audience. |

If they specifically want a **campaign audience**, that's `vvibe-email`'s
`audience-segments.md`: you run a read-only query against their database and
import the rows straight into the campaign.

## 6. Cross-cutting facts (apply to ALL modes)

**API host.** `https://vvibe.ai` by default, overridable via
`VVIBE_API_HOST`. Generated code must read it:

```ts
const VVIBE_API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'
```

`scripts/signup_event.mjs` follows this pattern. See `PROVIDER.md` at the
repo root for the backend compatibility contract.

**Authentication.** Bearer token in `Authorization` header:

```http
Authorization: Bearer ${VVIBE_API_KEY}
```

API Key prefix determines mode: `pcs_live_*` → production, `pcs_test_*` →
sandbox.

**No VVibe account yet? Register before asking for a key.** When
`VVIBE_API_KEY` is missing from the project's env, don't just ask the
user to paste one — a brand-new user won't have an account at all. First
ask whether they already have a VVibe account:

- **No / unsure** → walk them through signing up at
  `https://vvibe.ai/dashboard` (new visitors land on the login page — use the "Sign up" toggle to create an account),
  then copying their `pcs_live_*` / `pcs_test_*` key from the dashboard's
  API-key settings. These steps are self-contained; `ONBOARDING.md` at the
  repo root has the full version when present.
- **Yes** → point them at `https://vvibe.ai/dashboard` to copy the key.

Only once the key is in `.env` can any mode proceed.

**Consent gate (signup-event and attribution-utm only).** Before
modifying the vibe coder's codebase, the agent **must** ask explicit
consent. The exact wording lives in `references/signup-event.md` §1.
Don't skip it — wait for an unambiguous yes. When attribution-utm is
loaded as part of the same conversation that already wired signup-event,
the §1 consent covers both — do not re-prompt. When attribution-utm is
loaded standalone (later session, signup-event already wired in prior
work), surface a short re-confirmation: "I'm about to add an attribution
table and signup-time capture. OK to proceed?" Don't generate code
before the user agrees.

## 7. Output preferences (apply to ALL modes)

- Prefer code snippets over architecture explanations.
- Use the vibe coder's existing framework and language.
- The signup call is always fire-and-forget — never let a VVibe failure
  break the app's registration flow.
- Show `.env` setup before any API call.

## 8. Reference documents

| File | Contains | Load when |
|---|---|---|
| `references/signup-event.md` | The one call, where to put it, what to send, guardrails. | mode = signup-event |
| `references/inbound-webhook.md` | Webhook registration, signature verification flow, framework receiver templates (Next.js / Express / FastAPI), retry + response semantics. | mode = inbound-webhook |
| `references/attribution-utm.md` | Cookie + middleware + signup snapshot. Hangs off signup-event. | mode = attribution-utm |
| `references/_shared/webhook-signature-verify.md` | Signing canonical reference. Wire format + 5-step verification + test vectors. | loaded by inbound-webhook.md; flat reference data. |
| `references/api-contract.md` | Authoritative wire spec for the signup-event endpoint. | reference data — link to it from other refs, don't read end-to-end. |
| `scripts/signup_event.mjs` | Runnable signup-event helper. | optional starter template for signup-event. |
