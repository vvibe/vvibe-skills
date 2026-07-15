---
name: vvibe-analytics
version: 0.4.1
description: Help VVibe creators install web analytics on their websites — Google Analytics 4 (GA4), PostHog (cloud or self-hosted), or Mixpanel — set up VVibe's canonical event tracking against a provider-neutral contract, and connect GA4 to VVibe for viewing dashboards. Covers utm tracking & traffic-source attribution, conversion funnels, identity/user_id, and event deduplication. For signup-time first-touch attribution, see the vvibe-member skill. Trigger when the user mentions analytics, tracking, Google Analytics, GA4, PostHog, Mixpanel, product analytics, funnels, retention, website traffic, event tracking, utm tracking, traffic source, referral attribution, or wants to connect analytics to VVibe.
---

# VVibe Analytics Integration

Use this skill to help a VVibe creator install a web analytics provider on their
website, instrument VVibe's canonical events, and (for GA4) connect it to VVibe.
Keep answers operational: prefer step lists, code snippets, and copy-ready
examples over long architecture explanations.

## Quick Start

- First, ask the human user what they want to accomplish:
  - **Install analytics on my website** → Part A (per-provider steps)
  - **Connect GA to VVibe dashboard** → Part B
  - **Both** → Part A + Part B

1. Confirm what the human user is trying to build.
   Ask about their tech stack (Next.js / React / vanilla HTML) and which provider
   they want (see **Provider Selection** below).
2. Guide through provider setup, then event tracking installation.
3. If the user wants to see analytics inside VVibe, guide through the VVibe
   authorization flow (Part B — GA4 only today).
4. The event contract is always the same regardless of provider — start from
   `references/event-tracking-contract.md`.
5. Return implementation-ready output.
   Prefer numbered steps, code samples, and copy-ready configuration.

## Provider Selection

VVibe is provider-neutral. Pick based on what the creator needs to answer:

| Need | Provider | Notes |
|------|----------|-------|
| Marketing attribution, ad-platform closed loop, acquisition reports | **GA4** | Free, integrates with Google Ads; the only provider VVibe can read into its own dashboard today |
| Product analytics — funnels, retention, feature usage, session replay | **PostHog** | Can be **self-hosted** (PostHog CE) for full data ownership |
| Product analytics — funnels, retention, cohorts | **Mixpanel** | Hosted; strong funnel/retention UX |

- The common growth-stage setup is a **dual stack: GA4 + PostHog** — GA4 for
  marketing/ad attribution, PostHog for product behavior. Instrument the same
  canonical events once; fan them out to both.
- Self-hosting matters → PostHog CE.
- "I just want to see traffic in my VVibe dashboard" → GA4 (Part B).

## Output Style

- Write for an AI agent that is helping a human user complete integration work.
- Lead with the next concrete steps the human should take.
- Use lists for setup steps, environment variables, event definitions, and
  configuration options.
- Prefer concise code samples in JavaScript or TypeScript unless the user asks
  for another stack.
- Always include `.env` configuration and `.gitignore` verification steps.

## UTM tracking & traffic-source attribution — split between two skills

Analytics providers (this skill) automatically capture `utm_source` /
`utm_medium` / `utm_campaign` / `utm_term` / `utm_content` on page views as
**traffic-level analytics**. In GA4 you see them in Acquisition reports; in
PostHog/Mixpanel they land as event/person properties. Use this for funnel
analysis: "how many sessions came from `utm_source=insforge` last month?"

For **signup-time first-touch attribution** — pinning each individual user record
to the source that originally brought them — use the **`vvibe-member` skill's
Step 7**. That skill walks through adding a `user_attribution` table, a
middleware that captures utm/referrer to a 30-day cookie, and a signup hook that
snapshots the cookie to the DB so every user has a permanent
`(utm_source, utm_medium, utm_campaign, referrer)` of record.

Both layers are useful and complementary: the analytics provider tells you
traffic patterns; `user_attribution` tells you which paying user came from which
partner. Recommend installing both for any creator running paid partnerships.

## Part A — Analytics Installation & Event Tracking

The flow is the same for every provider: **install the SDK → instrument the
canonical events → set identity → verify**. Only the provider setup differs.

### 1. Pick the provider and open its setup guide

- **GA4** → `references/ga4-setup-guide.md`
  (env `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXX`; reference
  `scripts/gtag-nextjs-example.mjs`)
- **PostHog** → `references/posthog-setup-guide.md`
  (env `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST`; supports
  self-hosted CE)
- **Mixpanel** → `references/mixpanel-setup-guide.md`
  (env `NEXT_PUBLIC_MIXPANEL_TOKEN`)

Each guide covers Next.js App Router / Pages Router / React SPA / vanilla HTML.
**Verify `.gitignore` includes `.env`** before proceeding.

### 2. Install the provider SDK

Follow the chosen guide for the user's tech stack. Confirm page views appear
before instrumenting custom events.

### 3. Set up VVibe event tracking (provider-neutral)

- `references/event-tracking-contract.md` is the single source of truth: the
  canonical event envelope, the creator-side events, the platform lifecycle
  events, and the **GA4 / PostHog / Mixpanel mapping table**.
- Instrument the creator-side events the user's app supports:
  - `vvibe_checkout_start` — a checkout session is created
  - `vvibe_checkout_complete` — a payment callback confirms completion
  - `vvibe_subscription_cancel` — a subscription is cancelled
  - `vvibe_page_view` — a VVibe-embedded page is viewed
  - `vvibe_product_view` — a product page is viewed
- Use the same canonical property keys for every provider; only the event name /
  revenue convention changes (see the mapping table).
- GA4 reference: `scripts/track-vvibe-events.mjs`. Server-side GA4 purchase:
  `scripts/ga4-mp-purchase-example.mjs`.

### 4. Set identity (user_id + tier)

Once the user is known (login / signup), carry the user id on every event and set
the creator's `tier` as a user/person property. The per-provider snippets live in
the **Identity** section of `event-tracking-contract.md`:

- **GA4**: `gtag('config', 'G-XXXXXXX', { user_id })` + `gtag('set',
  'user_properties', { tier })`; server-side MP must reuse the same `client_id`.
- **PostHog**: `posthog.identify(userId, { tier })` + `posthog.alias(...)`.
- **Mixpanel**: `mixpanel.identify(userId)` + `mixpanel.people.set({ tier })`.

### 5. Deduplication (client + server double-fire)

`vvibe_checkout_complete` is often fired twice — once client-side, once from the
payment webhook. Dedup with the canonical `eventId` (see the Deduplication
section of the contract):

- **GA4**: no generic dedup field — `purchase` dedups on `transaction_id`
  (= VVibe `session_id`); send the same value from client and server.
- **PostHog**: same `eventId` as `uuid` on both captures.
- **Mixpanel**: same `eventId` as `$insert_id` on both tracks.

### 6. Verify installation

Each setup guide has a Verification section (GA4 Realtime / PostHog Activity /
Mixpanel Events). Confirm:

- page views appear,
- a fired `vvibe_*` event shows with its properties,
- a double-fired checkout lands only once (dedup working).

### 7. Build a conversion funnel

- **GA4**: Explore → **Funnel exploration** → add steps
  `page_view → sign_up → begin_checkout → purchase`. (Map from the canonical
  events via the contract's mapping table.)
- **PostHog / Mixpanel**: Funnels report →
  `$pageview/vvibe_page_view → vvibe_sign_up → vvibe_checkout_start →
  vvibe_checkout_complete`.

### 8. Optional: consent mode (GDPR / cookie consent)

If the site needs cookie consent, GA4 supports Consent Mode. Set defaults before
the tag loads, then update on the user's choice:

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  // default: deny until the user chooses
  gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
  });
</script>
<!-- after the user accepts in your consent banner -->
<script>
  gtag('consent', 'update', {
    ad_storage: 'granted',
    analytics_storage: 'granted',
  });
</script>
```

PostHog and Mixpanel gate similarly — initialize with capturing disabled and
opt-in after consent (`posthog.opt_in_capturing()` / Mixpanel `opt_in_tracking()`).

## Part B — Connect Google Analytics to VVibe

> **Provider support:** VVibe's dashboard can read **GA4** today. Reading PostHog
> and Mixpanel dashboards into VVibe is planned (VV-68) — for those providers,
> creators view analytics in the provider's own UI for now.

### Authorize VVibe to access GA data

Once GA4 is installed and collecting data, guide the user to connect it to VVibe.
This needs a VVibe account — if the user is brand-new to VVibe (no account yet),
don't assume they have one: first have them sign up at `https://vvibe.ai/dashboard`
(new visitors land on the login page — use the "Sign up" toggle to create an
account; these steps are self-contained, with the full version in `ONBOARDING.md`
at the repo root when present), then continue:

1. Go to VVibe Dashboard: `https://vvibe.ai/dashboard/analytics`
2. Navigate to **數據分析** (Analytics) settings
3. Click **連結 Google Analytics**
4. Sign in with the Google account that owns the GA4 Property
5. Grant VVibe read-only access to Google Analytics data
6. Select the GA4 Property to connect
7. Done — analytics dashboard will appear in VVibe Dashboard

**Key points to communicate to the user:**
- VVibe only requests **read-only** access (`analytics.readonly` scope). VVibe
  cannot modify your GA4 settings or data.
- You can revoke access at any time from your [Google Account permissions](https://myaccount.google.com/permissions).
- The dashboard in VVibe shows data from your connected GA4 Property, including
  sessions, page views, traffic sources, and VVibe-specific events.
- GA4 data has a **24–48 hour processing delay**. Newly installed tracking may
  take 1–2 days to show historical data in VVibe.

## Guardrails

- **GA4 Measurement ID format**: Always `G-XXXXXXX`. If the user provides
  `UA-XXXXX`, that is a Universal Analytics ID — guide them to create a GA4
  Property instead.
- **Credentials security**:
  - GA4 Measurement ID (`G-XXXXXXX`), PostHog `phc_` project key, and Mixpanel
    project token are all designed to be client-visible — not secrets — but keep
    them in `.env`.
  - The GA4 Measurement Protocol `api_secret`, PostHog personal/project API keys
    for server imports, and Mixpanel API Secret ARE secret — keep them
    server-only; never ship them to the browser.
- **Cross-domain tracking (GA4)**: If the user's app redirects to `vvibe.ai` for
  checkout and back, recommend GA4 cross-domain tracking (Admin → Data Streams →
  Web → Configure tag settings → Configure your domains) to keep session
  continuity.
- **Ad blockers**: Some visitors block analytics scripts. Numbers will always
  undercount. Do not promise 100% tracking accuracy.
- **Consent mode**: If the site needs cookie consent (GDPR, etc.), implement the
  provider's consent gating (see Part A step 8).
- **Data freshness**: GA4 has a 24–48 hour processing delay; PostHog/Mixpanel are
  near-real-time. Realtime views exist in each provider's own UI.
- **VVibe authorization (GA4)**: handled entirely by VVibe's hosted OAuth flow.
  The user does not create any Google Cloud projects, OAuth clients, or API keys
  — they click "Connect" and authorize.

## Preferred Response Shape

When answering with this skill, prefer this order:

1. Goal summary
2. Prerequisites check (including provider choice)
3. Step-by-step setup instructions
4. Environment variable configuration
5. Code implementation
6. Verification steps
7. Troubleshooting notes

## Resources

- `references/event-tracking-contract.md`
  **Source of truth** — canonical event envelope, creator-side + platform
  lifecycle events, GA4/PostHog/Mixpanel mapping, identity & dedup rules.
- `references/ga4-setup-guide.md`
  Framework-specific gtag.js installation and pageview/event tracking.
- `references/posthog-setup-guide.md`
  posthog-js + posthog-node installation, self-hosted CE, identify/alias, dedup.
- `references/mixpanel-setup-guide.md`
  mixpanel-browser + node installation, identify, `$insert_id` dedup.
- `scripts/gtag-nextjs-example.mjs`
  Reference implementation for installing gtag.js in a Next.js application.
- `scripts/track-vvibe-events.mjs`
  Reference implementation for tracking VVibe-specific events (GA4).
- `scripts/ga4-mp-purchase-example.mjs`
  Server-side GA4 Measurement Protocol `purchase` reference — client_id from
  the `_ga` cookie, `api_secret`, and `transaction_id` dedup.
