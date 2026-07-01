---
name: vvibe-payment
version: 0.1.0
manifest_version: 1
description: Help VVibe creators sell subscriptions and one-time plans with Stripe — create pricing plans, then wire the hosted Stripe checkout into the creator's own app so buyers can pay. Covers plan management (via Vibe MCP or REST), the checkout-session → redirect → webhook flow, reading resulting orders/subscriptions, and the Stripe-enabled prerequisite (bring-your-own-Stripe on self-host; Stripe Connect on the managed cloud for creators without their own Stripe). Trigger when the user mentions charging their audience, selling a subscription or membership, monthly/yearly pricing, a pay-what-you-want or one-time purchase, setting up a paid plan, adding a checkout/pay button, or connecting Stripe.
---

# VVibe Payment Skill — Routing

This file is a router. Read it fully, run the checks in §2, confirm the
prerequisite in §3, then **read the one matching file in `references/`**.
Do not read every reference upfront.

## 1. What this skill does

Two independent jobs — do either or both:

- **plans** — create and manage pricing plans (subscription or one-time)
  via the Vibe MCP tools or the REST API. → `references/plans-and-orders.md`
- **checkout** — wire the hosted Stripe checkout into the creator's OWN app:
  create a checkout session, redirect the buyer to Stripe, and let VVibe's
  webhook record the resulting subscription + payment. → `references/checkout-integration.md`

Money model (both jobs): with Stripe enabled, the buyer pays on Stripe's
hosted page; a completion webhook then creates the subscription and records
the payment. The creator reads results via `vibe_list_orders` or the
dashboard. **Plan amounts are in MAJOR currency units (10 = $10, not cents).**

## 2. Capability checklist (run BEFORE asking the user anything)

Detect from the project / session. Don't ask what you can find out.

| Capability | How to detect | Used by |
|---|---|---|
| `has_api_key_local` | `VVIBE_API_KEY` (`pcs_live_*` / `pcs_test_*`) in `.env*` | plans (REST), checkout |
| `vibe_mcp_connected` | `vibe_*` tools registered this session | plans (MCP path) |
| `has_server_runtime` | Server framework (Next.js API routes, Express, etc.). Static-only sites can't create checkout sessions securely. | checkout |
| `stripe_enabled` | See §3 — a `vibe_create_plan` succeeds but checkout returns 503 until Stripe is on | checkout |

Tell the user briefly what you found, then continue.

## 3. Prerequisite — Stripe must be enabled for the merchant

Plans can be created anytime, but **checkout only works once Stripe is
enabled** for the merchant (otherwise the checkout endpoint returns a
"payment is not set up yet" error). Two deployment shapes:

- **Self-host (bring your own Stripe):** the operator sets
  `PAYMENT_PROVIDER=stripe` + `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`)
  and flips the merchant's payment on in dashboard Settings. The creator is
  their own Stripe account holder and Stripe pays out to them directly.
- **Managed cloud (vvibe.ai):** the creator enables payments in Settings. A
  creator **without their own Stripe** onboards through **Stripe Connect
  Express** (a few minutes: name + bank + minimal ID) — VVibe collects on
  their behalf and Stripe pays out to their bank. They never manage Stripe
  keys.

If checkout returns the payment-disabled error, **do not** try to work around
it — tell the creator to enable payments in Settings first, then continue.

## 4. Standard flow

1. Confirm the prerequisite (§3). If unsure, create the plan first (works
   regardless) and surface the enable-payments step before wiring checkout.
2. **Create a plan** — `references/plans-and-orders.md`.
3. **Wire checkout** into the app — `references/checkout-integration.md`.
4. **Verify** — after a test payment, `vibe_list_orders` (or the dashboard)
   shows the order; the subscription appears once the webhook lands.

## 5. Auth & brand-new users

Every path acts on the creator's VVibe account. MCP tools use the connected
session; REST calls use `Authorization: Bearer $VVIBE_API_KEY`
(`pcs_live_*` / `pcs_test_*`). Scripts/examples read the host via
`process.env.VVIBE_API_HOST || 'https://vvibe.ai'` — never hardcode it.

If there's no key and no MCP connection, the user may have **no VVibe account
yet**. Don't jump to "paste your key" — follow the account-first branch in
the repo-root `ONBOARDING.md` (sign up at `https://vvibe.ai/dashboard`, then
copy the API key), then proceed.
