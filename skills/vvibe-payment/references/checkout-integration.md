# Checkout Integration

Wire the hosted Stripe checkout into the creator's own app: create a checkout
session server-side, redirect the buyer to the returned URL, and let VVibe's
webhook record the subscription + payment. The creator's app never touches
card data — Stripe hosts the payment page.

## Flow

```
buyer clicks "Subscribe"
  → creator's server: POST /api/checkout-sessions (with a plan id)
  → VVibe returns data.checkoutUrl (a Stripe-hosted page)
  → creator redirects the buyer to checkoutUrl
  → buyer pays on Stripe
  → Stripe → VVibe webhook → subscription + payment recorded
  → buyer bounced to successRedirectUrl
```

## Prerequisites

- Stripe enabled for the merchant (see SKILL.md §3). Until then this endpoint
  returns a payment-disabled error — surface the enable-payments step, don't
  work around it.
- Create the session **server-side** — it needs the secret `VVIBE_API_KEY`
  (`pcs_live_*` / `pcs_test_*`). Never call it from the browser.
- The API key must have a **callback secret** set (done when the key is
  created in the dashboard); the endpoint rejects keys without one.

## Create a checkout session

```
POST ${VVIBE_API_HOST:-https://vvibe.ai}/api/checkout-sessions
Authorization: Bearer $VVIBE_API_KEY
Content-Type: application/json

{
  "planId": "<plan id from vibe_create_plan / GET /api/plans>",
  "customerEmail": "buyer@example.com",          // optional pre-fill
  "successRedirectUrl": "https://yourapp.com/thanks",
  "cancelRedirectUrl": "https://yourapp.com/pricing"
}
```

Response:

```json
{ "data": {
    "sessionId": "…",
    "checkoutUrl": "https://checkout.stripe.com/c/…",
    "checkoutToken": "…",
    "expiresAt": "…"
} }
```

Redirect the buyer to `data.checkoutUrl`. That's it — do not build your own
payment form.

## Example (Next.js App Router)

```ts
// app/api/subscribe/route.ts  (server-side)
export async function POST(req: Request) {
  const { planId, email } = await req.json()
  const res = await fetch(`${process.env.VVIBE_API_HOST || 'https://vvibe.ai'}/api/checkout-sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VVIBE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      planId,
      customerEmail: email,
      successRedirectUrl: `${process.env.APP_URL}/thanks`,
      cancelRedirectUrl: `${process.env.APP_URL}/pricing`,
    }),
  })
  const { data } = await res.json()
  return Response.redirect(data.checkoutUrl, 303)
}
```

Adapt the transport to the stack (Express handler, Rails controller, etc.) —
the contract is the same: server-side POST, then redirect to `checkoutUrl`.

## After payment

The completion webhook (VVibe ↔ Stripe, configured by the operator) writes the
subscription and payment rows. The creator reads them via `vibe_list_orders`
or the dashboard — see `plans-and-orders.md`. There's no work for the
creator's app here beyond landing the buyer on `successRedirectUrl`.

> Server-to-server completion callbacks to the creator's own app (so their
> backend hears about a payment directly) are a later addition — today, read
> state via orders / the dashboard.

## Verify before going live

Use a `pcs_test_*` key + Stripe test card `4242 4242 4242 4242`. Confirm the
order shows up (`vibe_list_orders` with `mode: "test"`) before switching to
the live key.
