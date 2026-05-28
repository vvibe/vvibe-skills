# Attribution (utm / referrer) — First-touch capture

## When to use this

This mode is a **layer on top of outbound-sync**. It captures where each user came from (`utm_*`, HTTP `Referer`) at signup and ships it to VVibe inside the sync payload's `metadata.attribution` field — that's what powers the "how many signups did our InsForge / Twitter / blog post send us this month?" report in the Dashboard. **If outbound-sync isn't wired yet, wire that first.** Without it, attribution rows land in the local DB but never reach VVibe. VVibe itself uses this pattern for its own creator signups — canonical reference at <https://github.com/vvibe/vvibe/tree/main/apps/web/lib/attribution> (Next.js + Better Auth, but the pattern is framework-agnostic).

## Prerequisites

- **outbound-sync is wired.** `syncToVVibe` (or equivalent) exists and is called on registration. Attribution writes piggy-back on that call.
- **`has_signup_flow` is true.** There's a discoverable registration handler where you can snapshot the cookie into a DB row.
- **You can add a new DB table.** The agent needs to create `user_attribution` (don't mutate the auth provider's managed user table).
- **Cookie support.** The runtime can set HTTP cookies (rules out pure-static / edge-only setups without middleware).

## 1. Storage

Add a separate `user_attribution` table (don't add columns to the existing user table — keeps the auth provider's managed schema clean):

```sql
CREATE TABLE "user_attribution" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" <user_id_type> NOT NULL UNIQUE
    REFERENCES "users"("id") ON DELETE CASCADE,
  "utm_source" varchar(64),
  "utm_medium" varchar(64),
  "utm_campaign" varchar(128),
  "utm_term" varchar(128),
  "utm_content" varchar(128),
  "referrer" varchar(1024),
  "landing_path" varchar(512),
  "captured_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
```

Match `user_id_type` to whatever the auth provider uses (`text` for Better Auth, `uuid` for Supabase Auth, `varchar` for custom). UNIQUE on `user_id` enforces **first-write-wins** at the DB layer — the row is written once at signup and never overwritten.

## 2. Capture: middleware + cookie

When an inbound request carries `utm_*` query params (or an external HTTP Referer), set a cookie with a 30-day max-age — **but only if one isn't already set** (first-touch semantics). The cookie survives across pages, bounces through login, and lasts until either signup writes it to the DB or it expires. Next.js middleware example:

```ts
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ATTRIBUTION_COOKIE = 'attribution'
const ATTRIBUTION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  if (!request.cookies.has(ATTRIBUTION_COOKIE)) {
    const sp = request.nextUrl.searchParams
    const utm_source = sp.get('utm_source')
    const referer = request.headers.get('referer')

    // Capture only when meaningful — utm OR external referer.
    const externalReferer = referer && !referer.includes(request.nextUrl.host)
    if (utm_source || externalReferer) {
      response.cookies.set(
        ATTRIBUTION_COOKIE,
        JSON.stringify({
          utm_source,
          utm_medium: sp.get('utm_medium'),
          utm_campaign: sp.get('utm_campaign'),
          utm_term: sp.get('utm_term'),
          utm_content: sp.get('utm_content'),
          referrer: externalReferer ? referer : null,
          landing_path: request.nextUrl.pathname,
          captured_at: new Date().toISOString(),
        }),
        {
          maxAge: ATTRIBUTION_MAX_AGE,
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
        },
      )
    }
  }

  return response
}
```

For Express/Fastify/Hono, follow the same shape — read query string, check cookie absence, set cookie. Truncate string values defensively (a malicious `?utm_source=<10KB>` shouldn't crash the cookie write).

## 3. Snapshot: at signup

In the signup handler (Better Auth `databaseHooks.user.create.after`, Supabase `auth.signUp` callback, or a custom registration endpoint), read the cookie, write the `user_attribution` row, and ship it to VVibe in the Sync payload:

```ts
async function onUserSignup(newUser: User, req: Request) {
  const raw = getCookie(req, 'attribution')
  const attribution = raw ? safeParse(raw) : null

  if (attribution) {
    await db.insert(user_attribution).values({
      user_id: newUser.id,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_term: attribution.utm_term,
      utm_content: attribution.utm_content,
      referrer: attribution.referrer,
      landing_path: attribution.landing_path,
      captured_at: new Date(attribution.captured_at),
    }).onConflictDoNothing()  // first-write-wins enforcement
  }

  // Send to VVibe in the Sync payload's metadata field.
  await syncToVVibe({
    email: newUser.email,
    externalUserId: newUser.id,
    // ... existing fields ...
    metadata: {
      // ... existing metadata ...
      attribution,  // null if nothing captured
    },
  })
}
```

The attribution object lives inside `metadata.attribution` — mind the overall `metadata` size cap, see [`./api-contract.md`](./api-contract.md) for the 10KB limit. **Critical: must not throw on attribution errors.** Account creation MUST succeed even if the attribution write fails — wrap in try/catch and log, never propagate.

## 4. VVibe-side display

The VVibe Dashboard surfaces `metadata.attribution.utm_source` as a column / filter on the Members page. No additional Sync API changes needed — the existing `metadata` jsonb field carries it through. For partner-program creators (cloud-only), VVibe additionally joins `metadata.attribution.utm_source` against the platform's partner table to compute revenue attribution — invisible to the creator, surfaces in admin reporting.

## 5. Hard rules

- **First-touch only in v1.** Do NOT overwrite the cookie on re-visit. A user who clicks an InsForge link, bounces, and returns organically a week later still counts toward InsForge.
- **No HMAC signing yet.** Attribution data isn't auth state; self-faking doesn't grant any privilege. Add HMAC in v2 when formal revenue-share starts.
- **Soft-fail everywhere.** Cookie parse error, DB write error, malformed payload — log and move on. A signup must never fail because of an attribution issue.
- **GDPR consent.** If the user's audience is EU-heavy, gate cookie write behind a consent banner OR fall back to anonymized funnel-only tracking (no per-user storage).

## Pitfalls

- **GDPR / cookie consent.** EU-heavy audiences: gate the cookie write behind a consent banner, or fall back to anonymized funnel-only tracking with no per-user storage. The cookie is httpOnly but still PII-adjacent.
- **First-touch-wins — don't overwrite the cookie.** The middleware checks `request.cookies.has(ATTRIBUTION_COOKIE)` before writing. Removing that guard turns the system into last-touch and silently rewrites history.
- **Don't throw on attribution errors.** Wrap the DB insert and cookie parse in try/catch. Account creation must succeed even if every attribution step fails. A botched utm capture should never block a signup.
- **Cookie size limit — truncate defensively.** `utm_*` values can be arbitrarily long (or hostile: `?utm_source=<10KB>`). Browsers cap cookies near 4KB total; clamp each field to the column width in §1 before writing.
- **Forgot to wire outbound-sync first.** Without it, the `user_attribution` row lands in the local DB but `metadata.attribution` never reaches VVibe — the Dashboard column stays empty. Verify `syncToVVibe` is called from the same signup handler before declaring done.
