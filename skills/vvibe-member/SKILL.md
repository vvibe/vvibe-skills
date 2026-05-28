---
name: vvibe-member
version: 0.4.0
manifest_version: 1
description: Help users wire member data between their app and VVibe — push their users to VVibe, query VVibe for member state, and capture signup attribution. Trigger when the user mentions VVibe user sync, member sync, user management, fetching members from VVibe, building a member admin UI, signup attribution, utm tracking, or referral tracking.
---

# VVibe Member Skill — Routing

This file is a router. It decides **which** member integration the human user
needs, then directs you to a single deep-dive in `references/`. Do not put
implementation detail here — keep it in the referenced files.

When you load this skill: read this whole file, run the capability checks in
§2, pick a mode using §3 / §4, then **Read the matching references/*.md**.
Do not read every reference file upfront.

## 1. What this skill does

Wire the seams between the vibe coder's app and VVibe's member system.
Three independent directions of data flow — pick any combination, not
mutually exclusive:

- **outbound-sync** — your app → VVibe (push your users so creators see them)
- **query-read** — your app → VVibe (read back members, stats, sync logs)
- **inbound-webhook** — VVibe → your app (get notified when VVibe-side state changes) *(planned, not available yet)*

A cross-cutting concern that hangs off `outbound-sync`:

- **attribution-utm** — capture utm_* / referrer at signup, ship in sync payload

## 2. Capability checklist (run BEFORE asking the user anything)

Detect these from the project, not by asking. Use whatever fits the
language / framework — read `package.json`, glob for files, look at `.env`.

| Capability | How to detect | Used by |
|---|---|---|
| `has_server_runtime` | Server framework present (Next.js with API routes, Express, FastAPI, Rails, Django, Payload, etc.). Static-only sites fail this. | all modes |
| `has_user_model` | Database schema / ORM model with users (Prisma, Drizzle, Mongoose, Payload collections, raw SQL migrations). | outbound-sync |
| `has_api_key_local` | `VVIBE_API_KEY` present in `.env*` or framework env config. | all modes |
| `has_public_https_endpoint` | Deployed (Vercel / Fly / Render / etc.) OR has a known reverse-proxied prod domain. Localhost-only ⇒ false. | inbound-webhook |
| `has_signup_flow` | Discoverable registration handler (route file or auth-provider hook). | outbound-sync, attribution-utm |

After detection, briefly tell the human user what you found and what's
missing — don't ask them to confirm capabilities you can verify yourself.

## 3. Modes

```yaml
modes:
  outbound-sync:
    status: available
    when: >
      The vibe coder owns their own user DB and wants creators to see
      those users (and their subscription status) in the VVibe Dashboard.
      This is the default starting mode for any new integration.
    triggers:                              # the "to VVibe" phrases are directional — route directly, skip §5
      - "sync users to VVibe"              # directional
      - "migrate users to VVibe"           # directional
      - "push members to VVibe"            # directional
      - "track signups"
      - "VVibe user integration"
    requires: [has_server_runtime, has_user_model, has_api_key_local, has_signup_flow]
    load: references/outbound-sync.md

  query-read:
    status: available
    when: >
      The vibe coder wants to BUILD something with VVibe's member data —
      a custom admin UI in their own app, a CRM lookup, a report, a
      pre-send eligibility check, gating a premium feature by plan. Read-only.
    triggers:
      - "build admin UI for members"
      - "fetch users from VVibe"
      - "show subscription status in my app"
      - "check if user is subscribed / on paid plan"
      - "gate premium feature by subscription status"
      - "list members programmatically"
      - "member stats / sync history"
    requires: [has_server_runtime, has_api_key_local]
    load: references/query-read.md

  inbound-webhook:
    status: planned
    available: false
    when: >
      VVibe-side state changes (subscription created/canceled, payout
      completed, waitlist signup on VVibe-hosted page) should push to the
      vibe coder's app in realtime, instead of being learned via polling
      or outbound-sync feedback loops.
    triggers:
      - "VVibe notify my app when X"
      - "subscribe to VVibe events"
      - "VVibe → my app webhook"
      - "realtime member state from VVibe"
    requires: [has_server_runtime, has_public_https_endpoint, has_api_key_local]
    fallback: >
      Not built yet. Be honest: VVibe → app push is on the roadmap, not
      shipping today. Pick the closest workaround based on the user's
      use case:
        (a) Events ORIGINATE in VVibe (e.g. checkout on the hosted page,
            email click): the only stopgap is to poll query-read on a
            short interval. Flag clearly that this is a stopgap, not a
            solution — pulls are not realtime and add request load.
        (b) Events ORIGINATE in the vibe coder's app: outbound-sync
            already covers it.
      Do NOT generate webhook receiver code. Offer to revisit when
      inbound-webhook ships.

  attribution-utm:
    status: available
    when: >
      The vibe coder wants to know where signups came from (utm_*,
      referrer). This is a layer on top of outbound-sync — do not enable
      it before outbound-sync is wired.
    triggers:
      - "attribution"
      - "utm tracking"
      - "referrer tracking"
      - "where signups came from"
      - "marketing attribution"
    requires: [outbound-sync wired, has_signup_flow]
    wired_check: >
      "outbound-sync wired" = grep the repo for a VVibe sync call
      (POST to /api/members/sync, or import/definition of a syncToVVibe
      helper). If absent, load outbound-sync.md FIRST and wire it; then
      return to this mode. Do not interleave.
    load: references/attribution-utm.md
```

## 4. Recipes (common multi-mode combos)

```yaml
recipes:
  starter:
    description: "MVP — just push signups so VVibe knows about your users."
    load_in_order: [outbound-sync]

  production-launch:
    description: >
      Production-ready integration — outbound sync + marketing attribution.
      Pick this for "set up properly", "production integration",
      "launch-ready". (Not truly bidirectional — inbound-webhook is
      planned but not yet available.)
    aliases: [full-bidirectional]
    load_in_order: [outbound-sync, attribution-utm]

  reverse-only:
    description: "VVibe hosts the user list; the app only reads."
    load_in_order: [query-read]
    note: >
      Rare. Most vibe coders own their user DB. Use only when the vibe
      coder explicitly says VVibe is the source of truth (e.g. their app
      embeds VVibe-hosted auth).
```

When the human user says something matching a recipe (e.g. "set up VVibe
properly", "production integration"), pick the recipe, name it back to
them, and load the referenced files in order.

## 5. Disambiguators

Use these only when the user's phrase genuinely maps to >1 mode AND
capability detection didn't narrow it down.

**Tiebreaker rule.** If the user's phrase matches a §3 trigger as a full,
directional phrase (e.g. "sync users **to** VVibe" — the preposition
disambiguates), route directly and **skip** the disambiguator. Only ask
when the phrase matches a §5 `signal` as a substring without any
disambiguating preposition or object ("sync users", "user integration").

**Ask at most one question per ambiguity** — do not chain. Phrase
verbatim (translate to the conversation's language); the bracketed
mapping is for your routing, not for the user.

```yaml
disambiguators:
  - signal: ["sync users", "user sync", "user integration"]
    ask: >
      Are you pushing your existing users to VVibe (your DB is the source
      of truth), or fetching member data from VVibe to use in your app
      (VVibe is the source)?
    map:
      "push|to VVibe|outbound": outbound-sync
      "fetch|from VVibe|read|inbound": query-read
      "both": [outbound-sync, query-read]

  - signal: ["VVibe notify", "webhook", "VVibe push", "subscription event"]
    ask: null
    map:
      "*": inbound-webhook
    note: >
      No question. Inbound-webhook is not available — surface the
      fallback message from §3 and offer outbound-sync as a workaround.
```

## 6. Cross-cutting facts (apply to ALL modes)

**API host.** `https://vvibe.ai` by default, overridable via
`VVIBE_API_HOST`. Generated code must read it:

```ts
const VVIBE_API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'
```

`scripts/sync_user.mjs` follows this pattern. See `PROVIDER.md` at the
repo root for the backend compatibility contract.

**Authentication.** Bearer token in `Authorization` header:

```
Authorization: Bearer ${VVIBE_API_KEY}
```

API Key prefix determines mode: `pcs_live_*` → production, `pcs_test_*` →
sandbox. The Sync endpoint requires API Key. GET endpoints also accept
Firebase JWT (for in-browser Dashboard usage).

Get the key from `https://vvibe.ai/dashboard`. If `VVIBE_API_KEY` is
missing from the project's env, stop and ask the user to paste it before
any mode can proceed.

**Consent gate (outbound-sync and attribution-utm only).** Before
modifying the vibe coder's codebase, the agent **must** ask explicit
consent. The exact wording lives in `references/outbound-sync.md` §1.
Don't skip it — wait for an unambiguous yes. When attribution-utm is
loaded as part of the same conversation that already wired outbound-sync,
the §1 consent covers both — do not re-prompt. When attribution-utm is
loaded standalone (later session, outbound-sync already wired in prior
work), surface a short re-confirmation: "I'm about to add an attribution
table and signup-time capture. OK to proceed?" Don't generate code
before the user agrees.

## 7. Output preferences (apply to ALL modes)

- Prefer code snippets over architecture explanations.
- Use the vibe coder's existing framework and language.
- Sync calls are always fire-and-forget — never let a VVibe failure break
  the app's main flow.
- Show `.env` setup before any API call.

## 8. Reference documents

| File | Contains | Load when |
|---|---|---|
| `references/outbound-sync.md` | Schema mapping, sync helper, incremental hooks, initial backfill, sync-specific guardrails. | mode = outbound-sync |
| `references/query-read.md` | List members, get one, stats, sync logs. Read-only walkthrough. | mode = query-read |
| `references/attribution-utm.md` | Cookie + middleware + signup snapshot. Hangs off outbound-sync. | mode = attribution-utm |
| `references/api-contract.md` | Authoritative wire spec for all 5 endpoints. | reference data — link to it from other refs, don't read end-to-end. |
| `scripts/sync_user.mjs` | Runnable single-user sync helper. | optional starter template for outbound-sync. |
