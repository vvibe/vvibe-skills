# GA4 Setup Guide

Framework-specific instructions for installing Google Analytics 4 (gtag.js) in web applications.

## Prerequisites

- GA4 Measurement ID (`G-XXXXXXX`) from Google Analytics admin
- Environment variable: `NEXT_PUBLIC_GA_MEASUREMENT_ID` (or equivalent for your framework)

## Next.js App Router (v13+)

### 1. Add gtag.js script in root layout

```tsx
// app/layout.tsx
import Script from 'next/script';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 1b. Alternative: vanilla DOM injection (no `next/script`)

When you can't (or don't want to) render the tag through `next/script`, load
gtag.js by appending a `<script>` to the document yourself. Use this when:

- **Conditional / gated load** — only load GA after cookie consent, a feature
  flag, or an env check, rather than always emitting it in `layout.tsx`.
- **Overlay / widget that can't touch `layout.tsx`** — a third-party embed or a
  page-scoped component that must self-install its tag.
- **Boot module** — a single client entry (e.g. `instrumentation-client.ts`, see
  §3b) that centralizes all analytics init.

```ts
// lib/loadGtag.ts
export function loadGtag(measurementId: string) {
  if (typeof window === 'undefined' || !measurementId) return;
  if (window.gtag) return; // already loaded — don't double-inject

  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function gtag(...args: any[]) {
    window.dataLayer.push(args);
  }
  window.gtag = gtag as typeof window.gtag;

  const s = document.createElement('script');
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  s.async = true;
  document.head.appendChild(s);

  gtag('js', new Date());
  gtag('config', measurementId);
}

// Example — gated on consent:
// if (userAcceptedAnalytics) loadGtag(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!);
```

### 2. Create gtag helper

```ts
// lib/gtag.ts
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const pageview = (url: string) => {
  if (typeof window.gtag === 'function') {
    window.gtag('config', GA_MEASUREMENT_ID!, {
      page_path: url,
    });
  }
};

export const event = (action: string, params: Record<string, any>) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', action, params);
  }
};
```

### 3. Track route changes

```tsx
// app/providers.tsx (or in layout.tsx)
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { pageview } from '@/lib/gtag';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      pageview(pathname + (searchParams?.toString() ? `?${searchParams}` : ''));
    }
  }, [pathname, searchParams]);

  return <>{children}</>;
}
```

> **Suspense trap (Next 15/16 App Router):** `useSearchParams()` opts the
> component out of static rendering and, in Next 15/16, throws at build unless
> it sits under a `<Suspense>` boundary. If you use this provider, wrap it in
> `<Suspense>` in `layout.tsx`. It also splits your analytics setup across two
> places (gtag load in `layout.tsx`, page views here). The variant below avoids
> both problems.

### 3b. Next.js App Router — `instrumentation-client.ts` variant (recommended for Next 15/16)

Next.js runs `instrumentation-client.ts` (at the project root) once on the client
before the app hydrates, and calls its exported `onRouterTransitionStart` on every
client-side navigation. Doing both the gtag **load** and the route-change
**page_view** here keeps analytics in one file and avoids the `useSearchParams`
Suspense boundary entirely.

```ts
// instrumentation-client.ts  (project root, alongside next.config.js)
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

if (GA_MEASUREMENT_ID) {
  // 1. Load gtag.js once, up front.
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function gtag(...args: any[]) {
    window.dataLayer.push(args);
  }
  window.gtag = gtag as typeof window.gtag;

  const s = document.createElement('script');
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  s.async = true;
  document.head.appendChild(s);

  gtag('js', new Date());
  // send_page_view:false — we send page_view ourselves on each transition below
  gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });

  // initial page load
  gtag('event', 'page_view', {
    page_path: window.location.pathname + window.location.search,
  });
}

// 2. Fires on every client-side route change — no Suspense boundary needed.
export function onRouterTransitionStart(url: string) {
  if (GA_MEASUREMENT_ID && typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', { page_path: url });
  }
}
```

With this variant you can drop the `<Script>` tags from `layout.tsx` and the
`AnalyticsProvider` above — everything lives in `instrumentation-client.ts`.

## Next.js Pages Router

### 1. Add gtag.js script in _app.js

```jsx
// pages/_app.js
import Script from 'next/script';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import * as gtag from '../lib/gtag';

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    const handleRouteChange = (url) => {
      gtag.pageview(url);
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  return (
    <>
      {gtag.GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gtag.GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gtag.GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}
      <Component {...pageProps} />
    </>
  );
}
```

### 2. Create gtag helper

Same as App Router version — see `lib/gtag.ts` above.

## React SPA (Create React App / Vite)

### 1. Add gtag.js to index.html

```html
<!-- public/index.html (CRA) or index.html (Vite) -->
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXX');
  </script>
</head>
```

Replace `G-XXXXXXX` with the actual Measurement ID. For Vite, use `import.meta.env.VITE_GA_MEASUREMENT_ID`.

### 2. Track SPA route changes

```tsx
// src/hooks/usePageTracking.ts
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('config', 'G-XXXXXXX', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);
}
```

## Vanilla HTML

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXX');
  </script>
</head>
<body>
  <!-- Your content -->
</body>
</html>
```

## TypeScript Type Declaration

If using TypeScript, add gtag type declaration:

```ts
// types/gtag.d.ts
interface Window {
  gtag: (
    command: 'config' | 'event' | 'js' | 'set',
    targetId: string | Date,
    config?: Record<string, any>
  ) => void;
  dataLayer: Array<any>;
}
```

## Environment Variables

| Variable | Framework | Description |
|----------|-----------|-------------|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Next.js | GA4 Measurement ID (`G-XXXXXXX`) |
| `VITE_GA_MEASUREMENT_ID` | Vite | GA4 Measurement ID |
| `REACT_APP_GA_MEASUREMENT_ID` | CRA | GA4 Measurement ID |

## Verification

After installation, verify tracking works:

1. Open the website in a browser
2. Open Google Analytics → Reports → Realtime
3. You should see your visit in the active users count
4. Navigate between pages to verify pageview tracking
5. Trigger a custom event and check it appears in Realtime → Event count

## Event tracking & the `purchase` deduplication rule

This guide covers **installing** gtag.js. For the VVibe event definitions and the
GA4 ecommerce mappings, see `event-tracking-contract.md`.

> **Don't double-count purchases.** GA4 has no generic per-event dedup field, so a
> `purchase` (mapped from `vvibe_checkout_complete`) is deduplicated on
> `transaction_id`. If you fire it both client-side (success page) and server-side
> (payment webhook / Measurement Protocol), **both must send the same
> `transaction_id` = the VVibe `session_id`**, or GA4 counts the sale twice. See
> the Deduplication section of `event-tracking-contract.md` (and
> `scripts/ga4-mp-purchase-example.mjs` for the server side).
