# VVibe Event Tracking Contract

The **canonical, provider-neutral** definition of every event VVibe tracks. This
is the single source of truth: instrument against the canonical event names and
properties here, then let the provider mapping tables translate each event into
whatever analytics backend the creator uses (GA4, PostHog, or Mixpanel).

> This document is the source of truth. `vvibe-oss` mirrors the event **names**
> as constants in `infrastructure/analytics/events.ts` — if you change a name
> here, update that mirror too (and vice versa). A later change (VV-64) adds a
> server-side sink that emits the same canonical envelope described below.

## Canonical event envelope

Every event — whether fired client-side by a creator's site or server-side by
the VVibe platform — is described by one shape:

```ts
interface CanonicalAnalyticsEvent {
  /** UUID v4. The idempotency key used for cross-provider deduplication. */
  eventId: string;
  /** Canonical event name, always `vvibe_`-prefixed (e.g. 'vvibe_checkout_complete'). */
  event: string;
  /**
   * The merchant this event belongs to, or `null` for pre-merchant events.
   * Pre-merchant lifecycle events (notably `vvibe_sign_up`) fire before a
   * merchant exists — the default merchant is only provisioned on the first
   * agent connection (`ensureDefaultMerchant`). For those, `merchantId` is
   * `null` and the event is attributed by `userId` instead.
   */
  merchantId: string | null;
  /** Who caused the event. */
  actorKind: 'user' | 'agent' | 'admin' | 'system';
  /** The authenticated user id, once known. Omit for anonymous / pre-signup events. */
  userId?: string;
  /** Event-specific properties (see each event below). */
  properties: Record<string, unknown>;
  /** ISO 8601 timestamp of when the event occurred. */
  occurredAt: string;
}
```

**Naming rules**

- Every VVibe event name carries the `vvibe_` prefix so it never collides with a
  provider's built-in events (GA4 `page_view`, `sign_up`, `purchase`, …).
- `snake_case` for both event names and property keys.
- Property keys are the same across every provider. The mapping tables only
  translate the *event name* and any provider-specific revenue/id conventions —
  never the property names.

**Client-side vs. server-side**

- **Creator-side events** (checkout, product/page views) are fired from the
  creator's own website with the provider's browser SDK. The creator instruments
  these.
- **Platform lifecycle events** are fired **server-side by the VVibe platform**.
  Creators do **not** instrument these themselves — they are documented here so
  the mapping and identity rules are complete end-to-end.

---

## Creator-side events

These are fired from the creator's website. The `vvibe_` prefix distinguishes
them from provider built-ins.

### vvibe_checkout_start

Fired when a checkout session is created (before redirecting to VVibe hosted
checkout).

```ts
// properties
{
  plan_id: 'plan_abc123',
  plan_name: 'Premium Monthly',
  amount: 299,
  currency: 'TWD',
  billing_period: 'monthly',   // 'monthly' | 'yearly' | 'one-time'
  pricing_type: 'fixed',       // 'fixed' | 'dynamic'
  session_id: 'cs_xyz789',
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `plan_id` | string | Yes | VVibe plan ID |
| `plan_name` | string | No | Human-readable plan name |
| `amount` | number | Yes | Checkout amount (in smallest currency unit or main unit depending on setup) |
| `currency` | string | Yes | Currency code (e.g., `TWD`, `USD`) |
| `billing_period` | string | No | `monthly`, `yearly`, or `one-time` |
| `pricing_type` | string | No | `fixed` or `dynamic` |
| `session_id` | string | No | VVibe checkout session ID |

### vvibe_checkout_complete

Fired when a payment callback confirms successful completion. Typically triggered
server-side or on the success redirect page.

```ts
// properties
{
  session_id: 'cs_xyz789',
  subscription_id: 'cs_xyz789',
  amount: 299,
  currency: 'TWD',
  payment_method: 'credit_card',
  plan_id: 'plan_abc123',
  plan_name: 'Premium Monthly',
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | VVibe checkout session ID |
| `subscription_id` | string | No | VVibe subscription ID (same as session_id in current implementation) |
| `amount` | number | Yes | Payment amount |
| `currency` | string | Yes | Currency code |
| `payment_method` | string | No | Payment method used |
| `plan_id` | string | No | VVibe plan ID |
| `plan_name` | string | No | Human-readable plan name |

### vvibe_subscription_cancel

Fired when a subscription is cancelled.

```ts
// properties
{
  subscription_id: 'cs_xyz789',
  plan_id: 'plan_abc123',
  reason: 'customer_requested',
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subscription_id` | string | Yes | VVibe subscription ID |
| `plan_id` | string | No | VVibe plan ID |
| `reason` | string | No | Cancellation reason |

### vvibe_subscription_past_due

Fired when a subscription's dunning flow transitions it into `past_due` (a
failed-payment retry state). This is a **transition signal, distinct from
cancellation** — a `past_due` subscription may still recover (payment retried
successfully) or later end in `vvibe_subscription_cancel`. Keeping the two
events separate avoids polluting churn metrics with recoverable payment
retries.

```ts
// properties
{
  subscription_id: 'cs_xyz789',
  previous_status: 'active',
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subscription_id` | string | No | VVibe subscription ID |
| `previous_status` | string | Yes | Subscription status immediately before the transition (e.g. `active`) |

### vvibe_page_view

Fired when a VVibe-embedded or VVibe-powered page is viewed. Use this in addition
to the provider's automatic page view for more granular VVibe-specific tracking.

```ts
// properties
{
  page_type: 'creator_profile',   // 'creator_profile' | 'product_page' | 'subpage'
  creator_id: 'creator_abc',
  page_slug: 'my-creator-page',
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_type` | string | Yes | Type of VVibe page |
| `creator_id` | string | No | Creator's profile ID |
| `page_slug` | string | No | Page URL slug |

### vvibe_product_view

Fired when a specific product page is viewed.

```ts
// properties
{
  product_id: 'prod_001',
  product_name: 'Digital Art Pack',
  price: 150,
  currency: 'TWD',
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `product_id` | string | Yes | VVibe product ID |
| `product_name` | string | No | Product name |
| `price` | number | No | Product price |
| `currency` | string | No | Currency code |

---

## Platform lifecycle events

Fired **server-side by the VVibe platform** as part of the creator's growth and
monetization funnel. Creators do not instrument these — they are listed so the
funnel (`landing → sign_up → connect → checkout`) and the identity/dedup rules
below cover the whole journey.

### vvibe_sign_up

Fired when a new user completes registration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `method` | string | No | Signup method (`email`, `magic_link`, `oauth_google`, …) |
| `utm_source` | string | No | First-touch source, if captured |
| `utm_medium` | string | No | First-touch medium |
| `utm_campaign` | string | No | First-touch campaign |

### vvibe_agent_connected

Fired when a coding agent pairs with VVibe (daemon device-flow or MCP connect).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | string | Yes | Agent identifier (`claude-code`, `cursor`, `codex`, …) |
| `transport` | string | Yes | `mcp` or `daemon` |

### vvibe_skill_installed

Fired when an agent reports a skill as installed (`vibe_report_skill_installed`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skill_id` | string | Yes | Skill identifier (`analytics`, `email`, `payment`, …) |
| `agent` | string | No | Agent that installed it |

### vvibe_tier_upgrade

Fired when a creator upgrades their VVibe platform tier (revenue event).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from_tier` | string | Yes | Previous tier |
| `to_tier` | string | Yes | New tier |
| `billing_period` | string | No | `monthly` or `yearly` |
| `value` | number | Yes | Charge amount |
| `currency` | string | Yes | Currency code |
| `session_id` | string | No | Billing/checkout session id (used as the dedup `transaction_id`) |

### vvibe_credit_pack_purchase

Fired when a creator buys a one-off credit pack (revenue event).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pack_id` | string | Yes | Credit pack identifier |
| `value` | number | Yes | Charge amount |
| `currency` | string | Yes | Currency code |
| `session_id` | string | No | Billing/checkout session id (used as the dedup `transaction_id`) |

---

## Provider mapping

The canonical event name and properties above are provider-neutral. This table
is the authoritative translation into each backend. Property keys are unchanged
across providers unless a note says otherwise.

| Canonical event | GA4 | PostHog | Mixpanel |
|-----------------|-----|---------|----------|
| `vvibe_page_view` | `vvibe_page_view` (custom) | `vvibe_page_view` | `vvibe_page_view` |
| `vvibe_product_view` | `view_item` (+ `items[]`, `value`, `currency`) | `vvibe_product_view` | `vvibe_product_view` |
| `vvibe_checkout_start` | `begin_checkout` (+ `items[]`, `value`, `currency`) | `vvibe_checkout_start` | `vvibe_checkout_start` |
| `vvibe_checkout_complete` | `purchase` (+ `transaction_id`, `items[]`, `value`, `currency`) | `vvibe_checkout_complete` + `$revenue` on the event | `vvibe_checkout_complete` + Mixpanel revenue (`people.track_charge`) |
| `vvibe_subscription_cancel` | `vvibe_subscription_cancel` (custom) | `vvibe_subscription_cancel` | `vvibe_subscription_cancel` |
| `vvibe_subscription_past_due` | `vvibe_subscription_past_due` (custom event, **not** a conversion) | `vvibe_subscription_past_due` | `vvibe_subscription_past_due` |
| `vvibe_sign_up` | `sign_up` (`method`) | `vvibe_sign_up` (then `identify` + `alias`) | `vvibe_sign_up` (then `identify`) |
| `vvibe_agent_connected` | `vvibe_agent_connected` (custom) | `vvibe_agent_connected` | `vvibe_agent_connected` |
| `vvibe_skill_installed` | `vvibe_skill_installed` (custom) | `vvibe_skill_installed` | `vvibe_skill_installed` |
| `vvibe_tier_upgrade` | `purchase` (with `items[]`, `transaction_id`=`session_id`) | `vvibe_tier_upgrade` + `$revenue` | `vvibe_tier_upgrade` + revenue |
| `vvibe_credit_pack_purchase` | `purchase` (with `items[]`, `transaction_id`=`session_id`) | `vvibe_credit_pack_purchase` + `$revenue` | `vvibe_credit_pack_purchase` + revenue |

Notes:

- **GA4** has no generic per-event dedup field, so purchase-type events
  (`purchase`, mapped from `vvibe_checkout_complete` / `vvibe_tier_upgrade` /
  `vvibe_credit_pack_purchase`) rely on `transaction_id` for dedup — set it to
  the VVibe `session_id`. Non-purchase custom events keep the `vvibe_` name
  verbatim.
- **PostHog** and **Mixpanel** keep the canonical `vvibe_` event name as-is;
  they attach revenue as a native revenue property rather than renaming the
  event.
- Revenue-carrying events map to `value` + `currency` (GA4/PostHog) or Mixpanel's
  charge API. Always use the 3-letter ISO 4217 currency code (`TWD`, `USD`, …).

### GA4 ecommerce payload examples

`view_item` (from `vvibe_product_view`):

```ts
gtag('event', 'view_item', {
  currency: 'TWD',
  value: 150,
  items: [{ item_id: 'prod_001', item_name: 'Digital Art Pack', price: 150 }],
});
```

`begin_checkout` (from `vvibe_checkout_start`):

```ts
gtag('event', 'begin_checkout', {
  currency: 'TWD',
  value: 299,
  items: [{ item_id: 'plan_abc123', item_name: 'Premium Monthly', price: 299 }],
});
```

`purchase` (from `vvibe_checkout_complete`):

```ts
gtag('event', 'purchase', {
  transaction_id: 'cs_xyz789', // = VVibe session_id — the dedup key
  currency: 'TWD',
  value: 299,
  items: [{ item_id: 'plan_abc123', item_name: 'Premium Monthly', price: 299, quantity: 1 }],
});
```

---

## Identity

The goal: an anonymous visitor gets stitched to their user record at signup, and
every event after login carries the user id. Tier is a **user/person property**,
not an event property.

**Rule of thumb**

1. Before signup the visitor is anonymous (provider-assigned anonymous id).
2. At `vvibe_sign_up`, merge the anonymous identity into the now-known `userId`.
3. Every event after login carries `userId`.
4. Set the creator's `tier` as a user/person property so you can segment by it.

### GA4

Set `user_id` on the config and let GA4 reuse the `_ga` cookie's `client_id`.
The client-side tag and any server-side Measurement Protocol call **must send the
same `client_id`** so sessions stitch.

```ts
// once the user is known (login / signup)
gtag('config', 'G-XXXXXXX', {
  user_id: 'user_123',
});
// tier as a user property (registered in GA4 Admin → Custom definitions)
gtag('set', 'user_properties', { tier: 'growth' });
```

### PostHog

Call `identify(userId)` and `alias(anonymousId → userId)` at signup so pre- and
post-signup events belong to one person. Tier is a person property.

```ts
posthog.identify('user_123', {
  // person properties (set once on the person)
  tier: 'growth',
});
posthog.alias('user_123', posthog.get_distinct_id()); // merge the anonymous id
```

### Mixpanel

Call `identify(userId)` (Mixpanel's Simplified ID Merge stitches the anonymous
id automatically). Tier is a people property.

```ts
mixpanel.identify('user_123');
mixpanel.people.set({ tier: 'growth' });
```

---

## Deduplication

The same purchase is often reported twice — once client-side on the success page,
once server-side from the payment callback. The canonical `eventId` is the
idempotency key; map it to each provider's native dedup field so the duplicate is
dropped.

| Canonical | Provider dedup field |
|-----------|----------------------|
| `eventId` | PostHog `uuid` |
| `eventId` | Mixpanel `$insert_id` |
| `eventId` | GA4 — **no generic dedup field**; for `purchase` events use `transaction_id` (= VVibe `session_id`) |

**Client + server double-fire (checkout):** GA4 dedups `purchase` by
`transaction_id`, so client and server must send the **same** `transaction_id`
(the VVibe `session_id`). PostHog/Mixpanel send the same `eventId` as
`uuid` / `$insert_id` on both calls.

**Which track owns `value`:** when you fire both a client and a server track for
the same purchase, the **server track is the revenue authority** — the payment
webhook / GA4 Measurement Protocol call knows the confirmed, authoritative amount.
The **client track MAY omit `value`** (the browser often has no trustworthy final
amount — coupons, tax, currency conversion, or partial captures are resolved
server-side). Sending `value` on both is safe *only because* the two tracks share
the same `transaction_id` / `eventId` and are deduplicated to one; if you are
unsure the ids will match, omit `value` client-side and let the server track carry
revenue so you never double-count the amount.

```ts
// PostHog — same uuid on both client and server capture
posthog.capture('vvibe_checkout_complete', { $revenue: 299 }, { uuid: eventId });

// Mixpanel — $insert_id makes the event idempotent
mixpanel.track('vvibe_checkout_complete', { $insert_id: eventId, /* … */ });
```

---

## Implementation notes

- **Dual firing (GA4):** you can fire both the VVibe custom event (VVibe-specific
  properties) and the GA4 ecommerce event (enables GA4 built-in reports) for the
  same action. See the mapping table for which canonical events have an ecommerce
  twin.
- **Server-side events:** `vvibe_checkout_complete` and the platform lifecycle
  events are typically emitted server-side. GA4 uses the Measurement Protocol
  (needs an `api_secret` from GA4 Admin → Data Streams → Measurement Protocol API
  secrets — see `scripts/ga4-mp-purchase-example.mjs`); PostHog uses `posthog-node`;
  Mixpanel uses its Node SDK / import API.
- **Currency:** always the 3-letter ISO 4217 code (`TWD`, `USD`, `JPY`).
- **Value:** same unit as your VVibe plan amount configuration.
