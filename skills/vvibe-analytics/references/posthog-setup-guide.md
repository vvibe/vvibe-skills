# PostHog Setup Guide

Framework-specific instructions for installing PostHog (product analytics:
funnels, retention, feature usage, session replay) in web applications, plus
server-side capture, identity, and deduplication.

PostHog can run on **PostHog Cloud** or a **self-hosted PostHog CE** instance —
the only difference is the host you point the SDK at.

## Prerequisites

- A PostHog project API key (starts with `phc_`)
- The PostHog host:
  - PostHog Cloud US → `https://us.i.posthog.com`
  - PostHog Cloud EU → `https://eu.i.posthog.com`
  - Self-hosted CE → your own instance URL (e.g. `https://analytics.mysite.com`)
- Environment variables:

```
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

- **Verify `.gitignore` includes `.env`** before proceeding. The `phc_` key is a
  client-side (public) key by design, but keep it in `.env` for configuration
  hygiene. The **personal / project API keys** used for server-side imports ARE
  secret — never expose those to the browser.

## Next.js App Router (v13+)

### 1. Install the SDK

```
npm install posthog-js
```

### 2. Initialize in a client provider

```tsx
// app/providers.tsx
'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    capture_pageview: false, // we send them manually on route change (below)
    person_profiles: 'identified_only',
  });
}

export function PHProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
```

Wrap the app in `app/layout.tsx` with `<PHProvider>`.

### 3. Track route changes

```tsx
// app/PostHogPageView.tsx
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import posthog from 'posthog-js';

export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      const url = pathname + (searchParams?.toString() ? `?${searchParams}` : '');
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}
```

## Next.js Pages Router

```jsx
// pages/_app.js
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { useRouter } from 'next/router';

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  useEffect(() => {
    const handleRouteChange = () => posthog.capture('$pageview');
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, [router.events]);

  return (
    <PostHogProvider client={posthog}>
      <Component {...pageProps} />
    </PostHogProvider>
  );
}
```

## React SPA (Vite / CRA)

```tsx
// src/main.tsx
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
});

// wrap <App /> in <PostHogProvider client={posthog}>…</PostHogProvider>
```

Track SPA route changes with a `useLocation()` effect that calls
`posthog.capture('$pageview')`.

## Vanilla HTML

```html
<script>
  !function(t,e){/* PostHog snippet from Project Settings → Web snippet */}
  posthog.init('phc_xxxxxxxxxxxx', { api_host: 'https://us.i.posthog.com' });
</script>
```

Copy the exact snippet from **PostHog → Project Settings → Web snippet** — it is
versioned and self-updating.

## Self-hosted PostHog CE

Everything above is identical; the only change is the host:

```
NEXT_PUBLIC_POSTHOG_HOST=https://analytics.mysite.com
```

Point every SDK (browser and `posthog-node`) at the same self-hosted URL. No
other code changes. Confirm your instance is reachable over HTTPS and that the
`phc_` key belongs to a project on that instance.

## Tracking VVibe events

Instrument the canonical events from `event-tracking-contract.md`. PostHog keeps
the `vvibe_` event name as-is:

```ts
import posthog from 'posthog-js';

// vvibe_checkout_complete — revenue attached as a property
posthog.capture(
  'vvibe_checkout_complete',
  {
    session_id: 'cs_xyz789',
    plan_id: 'plan_abc123',
    amount: 299,
    currency: 'TWD',
    $revenue: 299, // native revenue property
  },
  { uuid: eventId }, // canonical eventId → dedup key
);
```

## Server-side capture (posthog-node)

Use for `vvibe_checkout_complete` and platform lifecycle events emitted from your
backend / payment webhook.

```ts
// server only — do NOT ship the project key to the browser here
import { PostHog } from 'posthog-node';

const client = new PostHog(process.env.POSTHOG_KEY!, {
  host: process.env.POSTHOG_HOST,
});

client.capture({
  distinctId: 'user_123',
  event: 'vvibe_checkout_complete',
  properties: {
    session_id: 'cs_xyz789',
    amount: 299,
    currency: 'TWD',
    $revenue: 299,
  },
  uuid: eventId, // SAME eventId the client used → PostHog dedups by uuid
});

await client.shutdown(); // flush before the serverless function exits
```

## Identity & alias

Merge the anonymous visitor into the known user at signup, then set `tier` as a
person property.

```ts
// at vvibe_sign_up (client-side)
posthog.identify('user_123', { tier: 'growth' }); // person properties
posthog.alias('user_123', posthog.get_distinct_id()); // stitch the anonymous id
```

After `identify`, every subsequent event belongs to `user_123`. See the Identity
section of `event-tracking-contract.md` for the cross-provider rule.

## Deduplication

Send the canonical `eventId` as PostHog's `uuid` on **both** the client-side and
server-side capture of the same action. PostHog drops the duplicate by `uuid`.

## Verification

1. Open your site with the SDK installed.
2. In PostHog go to **Activity** (live events) — you should see `$pageview` and
   your `vvibe_*` events stream in within seconds.
3. Click into an event to confirm the properties (`amount`, `currency`,
   `$revenue`, …) arrived.
4. Fire a checkout twice (client + server) and confirm only **one**
   `vvibe_checkout_complete` lands (dedup by `uuid`).
5. Build a funnel under **Product analytics → Funnels**:
   `$pageview → vvibe_sign_up → vvibe_checkout_start → vvibe_checkout_complete`.

## Environment variables

| Variable | Framework | Description |
|----------|-----------|-------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Next.js | Project API key (`phc_…`, browser-safe) |
| `NEXT_PUBLIC_POSTHOG_HOST` | Next.js | PostHog host (Cloud or self-hosted) |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | Vite | Same, Vite naming |
| `POSTHOG_KEY` / `POSTHOG_HOST` | Server | For `posthog-node` (keep server-only) |
