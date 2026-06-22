---
name: vvibe-email
version: 0.5.0
manifest_version: 1
description: Help VVibe creators wire invitation-email integration end-to-end — where the email CTA lands (VVibe-hosted, self-hosted waitlist, or direct register), how to send campaigns via Vibe MCP, and how to manage system + follower-flow email templates. When drafting campaign copy, reads the creator's Product Brain (`vibe_get_product_kb`) for brand voice, value prop, audience, and forbidden claims so the email matches the brand and avoids legal landmines. Trigger when the user mentions invitation emails, follower outreach campaigns, sending an email blast, drafting an email campaign, waitlist signup landing page, app base URL, embedding a waitlist CTA, skipping the waitlist when a member system already exists, or asks where the registration email link lands.

---

# VVibe Email Skill — Routing

This file is a router. It decides **which** email integration the human user
needs, then directs you to a single deep-dive in `references/`.

When you load this skill: read this whole file, run the capability checks in
§2, pick a mode using §3 / §4, then **Read the matching references/*.md**.
Do not read every reference upfront.

## 1. What this skill does

The skill covers four independent concerns. Pick any combination — they are
NOT mutually exclusive:

- **hosted-cta** — embed VVibe's hosted waitlist URL as a button/link. Zero infra.
- **self-hosted-waitlist** — host `/waitlist/[slug]` on your own domain. Brand control.
- **direct-register** — skip the waitlist; invitation clicks land on your app's existing register page.
- **mcp-campaign** — author + send invitation campaigns via the Vibe MCP tools. Independent of where clicks land.

The first three are mutually exclusive *as the click destination* (one
merchant has one destination per moment), but they're swappable — a
creator may start with hosted-cta and migrate to direct-register later.

**Click tracking is universal.** Every invitation-email click goes through
`https://vvibe.ai/r/{referralCode}` first for tracking + rate-limit + log,
then 302-redirects to the destination based on which mode is configured.
Pointing the email CTA directly at the creator's domain bypasses this and
loses click analytics.

**Out of scope for this skill.** Inbound webhooks (click / open / signup
event callbacks to the creator's app) are NOT covered here — that's the
vvibe-member skill's `inbound-webhook` mode (planned, not yet shipping).
This skill is outbound email only: where the CTA lands, how to send
campaigns, and which templates fire on what triggers.

## 2. Capability checklist (run BEFORE asking the user anything)

Detect from the project. Don't ask if you can find out.

| Capability | How to detect | Used by |
|---|---|---|
| `has_server_runtime` | Server framework (Next.js with API routes, Express, FastAPI, Rails). Static-only sites fail this. | self-hosted-waitlist, direct-register |
| `has_public_https_endpoint` | Deployed (Vercel / Fly / Render) OR known prod domain. Localhost-only ⇒ false. | self-hosted-waitlist, direct-register |
| `has_signup_flow` | Discoverable registration handler (route file or auth-provider hook). | direct-register |
| `has_api_key_local` | `VVIBE_API_KEY` in `.env*` or framework env. | all three click destinations + REST fallbacks |
| `outbound_sync_wired` | Grep for `POST /api/members/sync` or `syncToVVibe` helper. See vvibe-member skill. | direct-register (required), self-hosted-waitlist (recommended) |
| `vibe_mcp_connected` | `vibe_*` tools registered on this session. | mcp-campaign only |
| `product_brain_exists` | `vibe_get_product_kb` returns non-null `data`. The brain tools are always registered (no skill gate), so this read works even if only the email skill is installed — building it still needs vvibe-product-brain. | mcp-campaign (drafting copy) |

After detection, tell the user briefly what you found.

**If detection is impossible** (closed-source repo, thin context, agent
can't run filesystem operations): name the capability you couldn't verify
and ask the user a single yes/no question per missing capability. Default
to assuming missing rather than present — better to over-route to
quickstart than to generate code against a backend that doesn't exist.

## 3. Modes

```yaml
modes:
  hosted-cta:
    status: available
    when: >
      Fastest possible launch. No backend work. Creator embeds the URL
      anywhere — app, social bio, email signature. VVibe hosts the
      waitlist page.
    triggers:
      - "embed VVibe waitlist CTA"
      - "hosted waitlist"
      - "fastest setup for invitation emails"
      - "I don't have a backend"
    requires: []
    load: references/hosted-cta.md

  self-hosted-waitlist:
    status: available
    when: >
      Brand consistency matters. Creator hosts the waitlist page on their
      own domain at `/waitlist/[slug]`. Full UI control. Click tracking
      and attribution still go through VVibe.
    triggers:
      - "self-hosted waitlist"
      - "waitlist page on my own domain"
      - "branded waitlist"
      - "app base URL"
    requires: [has_server_runtime, has_public_https_endpoint, has_api_key_local]
    load: references/self-hosted-waitlist.md

  direct-register:
    status: available
    when: >
      The vibe coder's app already has a register / signup flow. Skip
      the waitlist entirely — invitation clicks land directly on the
      existing signup page. **Most common choice for any production app
      that already has user accounts.**
    triggers:
      - "skip the waitlist"
      - "land on my existing register page"
      - "I already have user signup"
      - "inviteRedirectPath"
      - "direct register"
    requires: [has_server_runtime, has_signup_flow, has_api_key_local, outbound_sync_wired]
    wired_check: >
      `outbound_sync_wired` = grep for `syncToVVibe` or `POST /api/members/sync`
      in the project. If absent, route to vvibe-member skill outbound-sync
      mode FIRST — direct-register cannot stamp campaign analytics without it.
    load: references/direct-register.md

  mcp-campaign:
    status: available
    when: >
      Author and send invitation campaigns via the Vibe MCP tools.
      Independent of where clicks land — works alongside any of A/B/C.
      Requires the agent to be connected to the creator's Vibe MCP.
      Draft the copy from the creator's Product Brain (brand voice,
      value prop, ICP, forbidden claims) — read it FIRST; see
      references/sending-campaigns.md.
    triggers:
      - "send an invitation campaign"
      - "draft an email blast"
      - "campaign analytics"
      - "send invitation emails"
    requires: [vibe_mcp_connected]
    fallback: >
      If MCP isn't connected: invitation campaigns can only be created
      via the dashboard UI today. There is no REST equivalent to
      `vibe_send_campaign`. Direct the creator to vvibe.ai/dashboard
      and offer to revisit when MCP is wired.
    load: references/sending-campaigns.md
```

## 4. Recipes (common multi-mode combos)

```yaml
recipes:
  quickstart:
    description: "Zero-backend launch — hosted CTA only."
    load_in_order: [hosted-cta]

  branded:
    description: "Self-hosted waitlist on the creator's domain. Optionally pair with mcp-campaign for sending."
    load_in_order: [self-hosted-waitlist]
    optional: [mcp-campaign]

  existing-app:
    description: >
      Recommended for any app that already has user accounts.
      Direct-register lands invitation clicks on the existing signup
      page; outbound-sync (vvibe-member) must be wired first so
      campaign analytics' signedUp count populates.
    prerequisite: [vvibe-member: outbound-sync]
    load_in_order: [direct-register]
    optional: [mcp-campaign]

  production-launch:
    description: "Direct-register click destination + MCP campaign authoring + analytics."
    prerequisite: [vvibe-member: outbound-sync]
    load_in_order: [direct-register, mcp-campaign]
```

Recipe defaults — match the user's phrase first, then fall back by
capability:

- "set up invitation emails properly" → `existing-app` if `has_signup_flow`, else `branded` if `has_server_runtime`, else `quickstart`.
- "production launch" / "everything wired" / phrase enumerating BOTH a click destination AND campaign sending → `production-launch`.
- "fastest" / "no backend" / "I just want to share a link" → `quickstart`.

Always name the recipe back to the user before running it.

## 5. Disambiguators

```yaml
disambiguators:
  - signal: ["invitation emails", "where does the email link land", "set up email", "wire invitation emails"]
    scope: >
      This question is ONLY about the click destination (A/B/C are mutually
      exclusive). Campaign sending (mcp-campaign) is on a separate axis —
      do NOT mix it in here. If the user also wants to send campaigns, ask
      about that separately after the destination is settled, or use the
      `production-launch` recipe.
    ask: >
      VVibe sends invitation emails on behalf of creators. The CTA in those
      emails goes through VVibe for click tracking, then redirects to a
      landing page. You have three options:

      - **A. Hosted waitlist (fastest launch)** — VVibe hosts the page. No backend code.
      - **B. Self-hosted waitlist (brand consistency)** — host `/waitlist/[creatorSlug]` on your own domain.
      - **C. Direct register (skip the waitlist)** — recommended if your app already has signup. Clicks land directly on `/signup` (or wherever). Requires `appBaseUrl` + `inviteRedirectPath`, and you'll need to call `syncToVVibe` after signup so campaign analytics' `signedUp` count populates.

      Which fits your setup?
    map:
      "A|hosted": hosted-cta
      "B|self-hosted|brand": self-hosted-waitlist
      "C|direct|existing": direct-register
    tiebreaker: >
      If the project clearly has has_signup_flow = true, mention C first
      in the prompt and explain "you almost certainly want C". Don't ask
      blindly when capability detection already favors a mode.
```

**Tiebreaker rule.** If the user's phrase matches a §3 trigger
directly (e.g. "set up direct register"), route there and skip §5.

## 6. Cross-cutting facts (apply to ALL modes)

**API host.** `https://vvibe.ai` by default; overridable via
`VVIBE_API_HOST`. Generated code reads it:

```ts
const VVIBE_API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'
```

The override applies to click tracking (`/r/{code}`), the hosted waitlist
page, and all REST endpoints. See `PROVIDER.md` for the contract.

**Authentication.** Bearer token:

```http
Authorization: Bearer ${VVIBE_API_KEY}
```

Same `pcs_live_*` / `pcs_test_*` key as vvibe-member and vvibe-sentry.
Public endpoints (`GET /api/waitlist/{slug}`, `POST /api/waitlist/{slug}`)
need no auth. MCP tools use the Vibe MCP Bearer token, not the API key.

**No VVibe account yet? Register before asking for a key.** Modes that
need `VVIBE_API_KEY` (everything except the public waitlist endpoints)
require a VVibe account first. If the key is missing, don't just ask the
user to paste one — a brand-new user won't have an account. Ask whether
they already have a VVibe account; if not (or unsure), walk them through
signing up at `https://vvibe.ai/dashboard` (new visitors are redirected to
register), then copying the key from the dashboard's API-key settings. These
steps are self-contained; `ONBOARDING.md` at the repo root has the full
version when present.

**Email types.** VVibe ships built-in system emails and follower-flow
emails. See `references/email-types.md` for the catalog, when to
disable, and how to avoid double-emails when the creator's app sends
its own welcome flow.

**Localhost is not a valid `appBaseUrl`.** For local dev of self-hosted
or direct-register modes, use ngrok / Cloudflare Tunnel. VVibe enforces
HTTPS on `appBaseUrl`.

## 7. Output preferences (apply to ALL modes)

- Prefer code snippets over architecture explanations.
- Use the vibe coder's existing framework and language.
- For hosted-cta, prefer one short paragraph + the CTA URL. No code.
- For self-hosted-waitlist, lean on the framework templates in the reference.
- For direct-register, focus on `inviteRedirectPath` config + the post-signup `syncToVVibe` call.
- Keep secrets out of chat — write `.env` instructions instead.
- Always confirm the chosen mode before configuration calls (especially
  `vibe_update_brand` / `PUT /api/store-config`) — switching modes is
  visible to every recipient already in flight.

## 8. Reference documents

| File | Contains | Load when |
|---|---|---|
| `references/hosted-cta.md` | Mode A: CTA URL template, placement examples (HTML / React / email signature). | mode = hosted-cta |
| `references/self-hosted-waitlist.md` | Mode B: full implementation contract + templates for Next.js, React SPA, and plain HTML. | mode = self-hosted-waitlist |
| `references/direct-register.md` | Mode C: `inviteRedirectPath` configuration, attribution params, post-signup `syncToVVibe` wiring. | mode = direct-register |
| `references/sending-campaigns.md` | Reads the Product Brain first to ground subject + body, then MCP campaign tools: list / create / update / send / analytics, with body templates and outcome handling. | mode = mcp-campaign |
| `references/email-types.md` | Reference: system vs follower-flow email categories, disable/edit flow, avoiding double-emails. | shared reference; load on demand when discussing welcome / cancellation emails or disabling templates. |
