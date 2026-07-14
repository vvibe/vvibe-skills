# Mixpanel Setup Guide

Framework-specific instructions for installing Mixpanel (product analytics:
funnels, retention, cohorts) in web applications, plus server-side tracking,
identity, and deduplication.

## Prerequisites

- A Mixpanel project token (from **Project Settings → Access Keys → Project
  Token**)
- Environment variable:

```
NEXT_PUBLIC_MIXPANEL_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- **Verify `.gitignore` includes `.env`** first. The project token is used in the
  browser (not a secret in the credentials sense), but keep it in `.env` for
  config hygiene. The **API Secret / Service Account** used for the server-side
  import API IS secret — keep it server-only.

## Next.js / React

### 1. Install the SDK

```
npm install mixpanel-browser
```

### 2. Initialize

```tsx
// lib/mixpanel.ts
import mixpanel from 'mixpanel-browser';

export const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

if (typeof window !== 'undefined' && MIXPANEL_TOKEN) {
  mixpanel.init(MIXPANEL_TOKEN, {
    // 'localStorage' persistence avoids third-party-cookie loss
    persistence: 'localStorage',
    track_pageview: true, // automatic page views; set false to send manually
  });
}

export default mixpanel;
```

For the **App Router**, initialize inside a `'use client'` provider component and
mount it in `app/layout.tsx`. For the **Pages Router**, initialize in
`_app.js`. For **Vite/CRA SPAs**, use `import.meta.env.VITE_MIXPANEL_TOKEN` /
`process.env.REACT_APP_MIXPANEL_TOKEN` and track route changes with a
`useLocation()` effect calling `mixpanel.track_pageview()`.

## Vanilla HTML

Use the CDN snippet from **Mixpanel → Project Settings → Set up Mixpanel → HTML**,
then:

```html
<script>
  mixpanel.init('YOUR_PROJECT_TOKEN', { track_pageview: true });
</script>
```

## Tracking VVibe events

Instrument the canonical events from `event-tracking-contract.md`. Mixpanel keeps
the `vvibe_` event name as-is and attaches revenue via its charge API.

```ts
import mixpanel from '@/lib/mixpanel';

// vvibe_checkout_complete
mixpanel.track('vvibe_checkout_complete', {
  session_id: 'cs_xyz789',
  plan_id: 'plan_abc123',
  amount: 299,
  currency: 'TWD',
  $insert_id: eventId, // canonical eventId → dedup key
});

// revenue → Mixpanel people charge
mixpanel.people.track_charge(299, { currency: 'TWD', session_id: 'cs_xyz789' });
```

## Server-side tracking (mixpanel node)

Use for `vvibe_checkout_complete` and platform lifecycle events emitted from the
backend / payment webhook.

```ts
// server only
import Mixpanel from 'mixpanel';

const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN!);

mixpanel.track('vvibe_checkout_complete', {
  distinct_id: 'user_123',
  session_id: 'cs_xyz789',
  amount: 299,
  currency: 'TWD',
  $insert_id: eventId, // SAME eventId the client used → dedup
});

mixpanel.people.track_charge('user_123', 299, { currency: 'TWD' });
```

## Identity

Call `identify(userId)` at signup. Mixpanel's Simplified ID Merge stitches the
prior anonymous id to the identified user automatically — no explicit alias call
is required. Set `tier` as a people property.

```ts
// at vvibe_sign_up
mixpanel.identify('user_123');
mixpanel.people.set({ tier: 'growth' });
```

After `identify`, subsequent events belong to `user_123`. See the Identity
section of `event-tracking-contract.md` for the cross-provider rule.

## Deduplication

Set `$insert_id` to the canonical `eventId` on **both** the client-side and
server-side track of the same action. Mixpanel deduplicates events that share a
`(distinct_id, event, $insert_id, time)` within a ~5-day window, so the duplicate
checkout report is dropped.

## Verification

1. Open your site with the SDK installed.
2. In Mixpanel open **Events** (the live/recent events view) — you should see your
   `vvibe_*` events arrive.
3. Click an event to confirm properties (`amount`, `currency`, `session_id`, …).
4. Fire a checkout twice (client + server) and confirm only **one**
   `vvibe_checkout_complete` lands (dedup by `$insert_id`).
5. Build a funnel under **Reports → Funnels**:
   `vvibe_sign_up → vvibe_checkout_start → vvibe_checkout_complete`.

## Environment variables

| Variable | Framework | Description |
|----------|-----------|-------------|
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Next.js | Project token (browser) |
| `VITE_MIXPANEL_TOKEN` | Vite | Project token |
| `REACT_APP_MIXPANEL_TOKEN` | CRA | Project token |
| `MIXPANEL_TOKEN` | Server | For the Node SDK (keep server-only) |
