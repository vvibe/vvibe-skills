# Mode A — Hosted CTA

Use VVibe's hosted waitlist page. Zero server-side code in the vibe coder's app.

## CTA URL Template

```
https://vvibe.ai/waitlist/{creatorSlug}
```

`creatorSlug` is the public-facing slug for the creator's profile. Get it from `GET /api/store-config` or the VVibe Dashboard.

## Placement Examples

### HTML button

```html
<a
  href="https://vvibe.ai/waitlist/jane-creator"
  class="btn btn-primary"
  rel="noopener noreferrer"
>
  Join Jane's waitlist
</a>
```

### React component

```tsx
type WaitlistCtaProps = {
  creatorSlug: string
  merchantName: string
}

export const WaitlistCta = ({ creatorSlug, merchantName }: WaitlistCtaProps) => (
  <a
    href={`https://vvibe.ai/waitlist/${creatorSlug}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-block rounded-md bg-black px-6 py-3 text-white"
  >
    Join {merchantName}'s waitlist
  </a>
)
```

### Next.js Server Component link

```tsx
import Link from 'next/link'

export default function CreatorHero({ creatorSlug }: { creatorSlug: string }) {
  return (
    <Link
      href={`https://vvibe.ai/waitlist/${creatorSlug}`}
      className="rounded bg-amber-500 px-5 py-2"
    >
      Get early access
    </Link>
  )
}
```

## Adding Your Own Attribution (Optional)

Append your own UTM params for marketing analytics — VVibe preserves all unrecognized query params and forwards them to the form submission:

```
https://vvibe.ai/waitlist/jane-creator?utm_source=hero&utm_medium=button&utm_campaign=spring2026
```

VVibe's invitation-email flow uses `?utm_source=invitation` already; pick anything else for your own placements so the two streams don't collide in the creator's dashboard.

## What You Don't Need

- No backend route
- No form handling code
- No webhook
- No API key in the embed (the page uses public endpoints)

## When to Switch to Mode B

- You want to match the creator's brand colors / typography
- You want to capture additional fields beyond email + name
- You want to fire your own analytics events on the signup
- You want post-signup redirect to a specific page in your product

If any of these apply, switch to the self-hosted-waitlist mode.

## Switching back from Mode B or C

If the merchant previously enabled a self-hosted mode, clear `appBaseUrl` (and `inviteRedirectPath` if set) before relying on the hosted CTA — otherwise click redirects continue routing to the old self-hosted destination.

**Vibe MCP (preferred — no API key needed):**

```
vibe_update_brand({ "appBaseUrl": "", "inviteRedirectPath": "" })
```

**REST fallback:**

```bash
curl -X PUT https://vvibe.ai/api/store-config \
  -H "Authorization: Bearer ${VVIBE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "appBaseUrl": "", "inviteRedirectPath": "" }'
```

Propagates within ~60 seconds (VVibe's per-process cache TTL) and applies to every email already in flight — including recipients whose emails were sent before the switch.
