# Inbound Webhook — Receive VVibe events in the vibe coder's app

## When to use this

Load this reference when VVibe-side state changes (subscription created or canceled, waitlist signup on a hosted page, member deletion) should push into the vibe coder's app in realtime instead of being learned through polling or outbound-sync feedback loops. If you are pushing data from the app to VVibe, you are in the wrong mode — return to the routing SKILL.md and pick `outbound-sync`. For exact wire shapes (envelope, signing) see [./_shared/webhook-signature-verify.md](./_shared/webhook-signature-verify.md).

## 1. Consent

Before anything else, the AI agent **must ask the human user** for explicit consent. Present the following and **wait for the user's response** before moving to Step 2:

> This skill will set up a webhook receiver so VVibe can notify your app in realtime when members are created or their subscription changes.
>
> This involves modifying your codebase:
> 1. Adding a POST endpoint at a path you choose (default `/api/vvibe/webhook`)
> 2. Verifying every request's HMAC signature against a shared secret
> 3. Storing each `event_id` so retries cannot double-process the same event
> 4. Wiring per-event-type logic (access grant, onboarding, deletion) into your app's existing data flow
>
> Would you like to proceed?

**Do NOT continue until the user explicitly agrees.** If they decline, stop here — do not proceed to any subsequent step.

## 2. Capability check

Confirm before generating code:

| Check | Required | If false |
|---|---|---|
| App has a server runtime (Next.js / Express / FastAPI / Rails / etc.) | Yes | **Stop.** Inbound webhooks need a server-side receiver. Static sites cannot receive them — tell the user this and offer to fall back to the `query-read` mode (their app polls VVibe). |
| App is reachable via a public HTTPS URL | Yes | Stop until the user has a tunnel or production deployment. Localhost is fine for development if they're using ngrok / Cloudflare tunnel / Vercel preview — confirm with them. |
| Has a way to persist a small dedup table (DB / Redis / KV) | Yes | Stop. At-least-once delivery means the same `event_id` can arrive twice — receivers MUST dedup or risk double-grants / double-emails. |

## 3. Register the webhook

The agent registers the webhook by calling VVibe's API with the creator's existing `VVIBE_API_KEY` (the same `pcs_*` key used by `outbound-sync`). The plaintext secret is shown **exactly once** — write it to the user's secrets surface (`.env`, Vercel env vars, etc.) before continuing.

```typescript
const VVIBE_API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'

const res = await fetch(`${VVIBE_API_HOST}/api/webhooks`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.VVIBE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://your-app.example.com/api/vvibe/webhook',
  }),
})

if (!res.ok) {
  // 409 → already registered. List the existing registration:
  //   GET ${VVIBE_API_HOST}/api/webhooks   with same Bearer
  // and reuse its id (delete + recreate if you've lost the secret).
  throw new Error(`Webhook registration failed: ${res.status}`)
}

const { data } = await res.json()
// data.secret is the plaintext signing secret — STORE IT NOW.
// VVibe will never show it again; lost secret = delete + recreate.
console.log(`Save this to VVIBE_WEBHOOK_SECRET: ${data.secret}`)
```

**Constraints:**
- URL MUST be HTTPS.
- One registration per API key in v1. Multi-endpoint is deferred.
- The endpoint must return `2xx` within 10 seconds or VVibe will retry per the schedule in §6.

## 4. Implement the receiver

The receiver is one HTTP POST handler. It does five things in this order, every time:

1. Read the **raw** request body (NOT parsed JSON).
2. Verify the HMAC signature against `VVIBE_WEBHOOK_SECRET` per [./_shared/webhook-signature-verify.md](./_shared/webhook-signature-verify.md).
3. Check the `event_id` against the dedup store — if already seen, return `200 OK` immediately without re-processing.
4. Branch on `event_type` and update your app's state.
5. Return `200 OK` (or `410 Gone` to ask VVibe to disable this registration; see §6).

Generate the template that matches the user's framework. The shape is identical; the **raw body capture** is what differs — make sure to use the framework-specific incantation, since this is where every webhook-receiver tutorial gets it wrong.

### Next.js App Router

```typescript
// app/api/vvibe/webhook/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.VVIBE_WEBHOOK_SECRET!

export const dynamic = 'force-dynamic' // never cache

export async function POST(req: NextRequest) {
  // Raw body — NextRequest.text() gives the bytes verbatim. Do NOT
  // call req.json() first; that re-serialisation breaks the signature.
  const rawBody = await req.text()
  const sig = req.headers.get('x-vvibe-signature')

  const result = verifySignature({ secret: SECRET, rawBody, signatureHeader: sig })
  if (!result.ok) {
    return new NextResponse('invalid signature', { status: 401 })
  }

  const envelope = JSON.parse(rawBody)
  const eventId: string = envelope.event_id

  // Dedup. Replace with your DB / KV / Redis.
  if (await haveSeenEvent(eventId)) {
    return new NextResponse(null, { status: 200 })
  }

  try {
    await handleEvent(envelope)
    await markEventSeen(eventId)
  } catch (err) {
    // Log + return 200 anyway (per VVibe's retry guidance):
    //   "Returning 5xx triggers retries that may amplify your own outage."
    // Recover from your own event log; do NOT rely on VVibe to retry forever.
    console.error('[vvibe webhook]', err)
  }

  return new NextResponse(null, { status: 200 })
}

function verifySignature(input: {
  secret: string
  rawBody: string
  signatureHeader: string | null
}): { ok: boolean } {
  if (!input.signatureHeader) return { ok: false }
  const parts: Record<string, string> = {}
  for (const seg of input.signatureHeader.split(',')) {
    const [k, v] = seg.split('=', 2)
    if (k && v !== undefined) parts[k.trim()] = v.trim()
  }
  const t = Number(parts.t)
  const v1 = (parts.v1 || '').toLowerCase()
  if (!Number.isInteger(t) || !/^[a-f0-9]+$/.test(v1)) return { ok: false }
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > 300) return { ok: false }
  const expected = createHmac('sha256', input.secret)
    .update(`${t}.${input.rawBody}`)
    .digest('hex')
  const a = Buffer.from(v1, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return {
    ok: a.length === b.length && timingSafeEqual(a, b),
  }
}

async function handleEvent(envelope: { event_type: string; data: unknown }) {
  switch (envelope.event_type) {
    case 'member.created':
      await onMemberCreated(envelope.data)
      break
    case 'member.subscription_changed':
      await onSubscriptionChanged(envelope.data)
      break
    default:
      console.warn('[vvibe] unhandled event_type', envelope.event_type)
  }
}

// Replace these stubs with the app's own logic.
async function onMemberCreated(_data: unknown) {}
async function onSubscriptionChanged(_data: unknown) {}
async function haveSeenEvent(_eventId: string): Promise<boolean> { return false }
async function markEventSeen(_eventId: string): Promise<void> {}
```

### Express

```typescript
import express from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'

const app = express()
const SECRET = process.env.VVIBE_WEBHOOK_SECRET!

// CRITICAL: express.raw() preserves the body bytes verbatim. If you
// have a global app.use(express.json()) ABOVE this route, the JSON
// parser will have already consumed the stream and the signature
// will never verify. Mount express.raw() ONLY on this path.
app.post(
  '/api/vvibe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = req.body.toString('utf8') // Buffer → string
    const sig = req.header('x-vvibe-signature') ?? null

    if (!verifySignature({ secret: SECRET, rawBody, signatureHeader: sig }).ok) {
      return res.status(401).send('invalid signature')
    }

    const envelope = JSON.parse(rawBody)
    const eventId: string = envelope.event_id

    if (await haveSeenEvent(eventId)) return res.sendStatus(200)

    try {
      await handleEvent(envelope)
      await markEventSeen(eventId)
    } catch (err) {
      console.error('[vvibe webhook]', err)
    }
    return res.sendStatus(200)
  },
)

// verifySignature, handleEvent, dedup stubs — same as Next.js example above.
```

### FastAPI

```python
import hmac, hashlib, time
from fastapi import FastAPI, Request, Response, HTTPException

app = FastAPI()
SECRET = os.environ["VVIBE_WEBHOOK_SECRET"]

@app.post("/api/vvibe/webhook")
async def vvibe_webhook(request: Request):
    # await request.body() returns bytes verbatim — do NOT use
    # await request.json() before this. JSON parsing is fine
    # AFTER signature verification.
    raw_body = await request.body()
    sig = request.headers.get("x-vvibe-signature")

    if not verify_signature(SECRET, raw_body, sig):
        raise HTTPException(status_code=401, detail="invalid signature")

    envelope = json.loads(raw_body)
    event_id = envelope["event_id"]

    if await have_seen_event(event_id):
        return Response(status_code=200)

    try:
        await handle_event(envelope)
        await mark_event_seen(event_id)
    except Exception as err:
        print(f"[vvibe webhook] {err}")
    return Response(status_code=200)

def verify_signature(secret: str, raw_body: bytes, sig_header: str | None) -> bool:
    if not sig_header:
        return False
    parts = dict(p.strip().split("=", 1) for p in sig_header.split(",") if "=" in p)
    try:
        t = int(parts.get("t", ""))
        v1 = parts.get("v1", "").lower()
    except ValueError:
        return False
    if abs(int(time.time()) - t) > 300:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{t}.".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, v1)
```

## 5. Per-event-type handler logic

Map each event type to the app's domain. The envelope `data` shape is documented in the VVibe RFC; the agent should read the `data` keys, not guess.

| `event_type` | What it means | Typical handler |
|---|---|---|
| `member.created` | New member signed up on a VVibe-hosted page (e.g. public waitlist `/r/{slug}`) — the vibe coder's app did NOT trigger this. | Provision tenant resources, send the app's own brand welcome email, add to internal CRM. Use `data.email` as the dedup key against existing rows. |
| `member.subscription_changed` | Subscription status changed (created / updated / canceled) via VVibe-hosted checkout. | Flip the app's local access flag (`is_premium`, feature toggles). Use `data.member_id` to find the matching local user. |

**Idempotency by `event_id` is non-negotiable.** Retries WILL deliver the same event id. The dedup table can be as simple as a `webhook_events_seen` table with the `event_id` column unique and `INSERT ... ON CONFLICT DO NOTHING` — if the insert reports zero rows affected, the event was already processed and the handler short-circuits.

## 6. Response semantics

| Receiver returns | What VVibe does | When to use |
|---|---|---|
| `200`–`299` within 10s | Records delivery as `succeeded`. | Default — return `200` even when your processing errored. Recover from your own event log. |
| `4xx` (except `410`) | Records this attempt as failed; retries per schedule. | Avoid. 4xx triggers retries that won't succeed and inflate delivery-log noise. Only use for genuine "this body is malformed in a way that won't change" (signature failures). |
| `5xx` or timeout | Records as failed; retries per schedule. | Avoid unless your app is genuinely down — sustained 5xx amplifies your own outage by triggering retries every minute. |
| `410 Gone` | **Disables the webhook registration on VVibe's side.** | Use when the app intentionally retires the receiver (uninstalling the integration, migrating to a new endpoint). This is the graceful uninstall path. |

**Retry curve** (per VVibe RFC §3.4):

| Attempt | Delay from previous |
|---:|---|
| 1 | — (immediate emit) |
| 2 | 5s |
| 3 | 30s |
| 4 | 2m |
| 5 | 10m |
| 6 | 1h |

After attempt 6 fails, the delivery is marked `failed` and not retried. Receivers can query `GET /api/webhooks/{id}/deliveries` to see the failure log.

## 7. Verify & done

### 7a — Endpoint checklist

Review the codebase and present this per-step checklist:

```
## VVibe Webhook Receiver Checklist
✅ / ❌ Webhook registered via POST /api/webhooks — secret stored in VVIBE_WEBHOOK_SECRET
✅ / ❌ Receiver route exists at the registered URL — {file:line}
✅ / ❌ Raw body captured correctly (framework-specific incantation) — {file:line}
✅ / ❌ HMAC signature verified with constant-time compare — {file:line}
✅ / ❌ 5-minute replay window enforced — {file:line}
✅ / ❌ event_id dedup table or store present — {file:line}
✅ / ❌ Per-event-type handler logic wired (member.created / subscription_changed) — {file:line}
✅ / ❌ Handler returns 2xx fast — heavy work moved to background queue — {file:line}
```

Use ✅ if the pattern is present and ❌ otherwise (explain why and add the missing piece before continuing).

### 7b — Smoke test

Pick the simplest workable test: send a real waitlist signup (or have VVibe replay an existing delivery in a future v2). Verify:

- The receiver returns `200`.
- The dedup table now contains the `event_id`.
- A second POST with the same `event_id` short-circuits (no duplicate side effect on the app side).
- The signature check rejects a tampered body (flip one character of `rawBody` in a unit test).

### 7c — Next steps & done

Tell the user the integration is complete, then present these action items:

1. **Set environment variables** in production / staging:
   ```
   VVIBE_API_HOST=https://vvibe.ai
   VVIBE_API_KEY=pcs_live_xxxxxxxxxxxxxxxxxxxxxxxx
   VVIBE_WEBHOOK_SECRET=whsec_live_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
2. **Deploy the receiver endpoint.** It must be reachable at the URL passed during registration.
3. **Confirm the first event arrives.** Trigger a waitlist signup on the VVibe-hosted page (`/r/<creator-slug>`) and watch the receiver logs.

After the first event lands, no further action is needed for daily use. Review `GET /api/webhooks/{id}/deliveries` periodically if there are concerns about delivery health.

## Guardrails

- **Raw body, every time.** If `req.body` is parsed JSON by the framework's default middleware, you've broken the signature. Use the framework-specific raw-body incantation called out in §4.
- **Constant-time compare.** Never `==` or `===`. Use `timingSafeEqual` / `hmac.compare_digest`.
- **Dedup is mandatory.** At-least-once delivery means retries. Without `event_id` dedup the receiver double-grants access, double-sends welcome emails, double-charges.
- **Return 200 fast.** Anything > 10s is a timeout from VVibe's perspective. Move heavy work (image generation, third-party API calls) to a background queue and return 200 immediately.
- **No ordering guarantees.** Two events can arrive out of order. Use `created_at` to order on the receiver side if it matters (e.g. a `subscription_changed` to `canceled` followed by a stale `active` retry).
- **HTTPS only.** VVibe will refuse to register HTTP URLs even on localhost.

## Pitfalls

- **Middleware order eats the body.** A global `express.json()` above the webhook route consumes the stream before `express.raw()` can see it. Mount the raw parser ON THE ROUTE, not globally. Same shape in Fastify (`rawBody: true`), NestJS (`rawBody: true` on `NestFactory.create`), and Hono (`c.req.text()` before `c.req.json()`).
- **Re-serialising via a logger.** Some structured loggers (Pino + custom serializers, Bunyan body interceptors) call `JSON.parse(body)` and store the parsed form. The signature only validates the original bytes — make sure the logger sits AFTER signature verification, or copy the raw bytes before logging.
- **Replay window off by a factor of 1000.** Stripe / GitHub / VVibe all use UNIX seconds, not milliseconds. `Date.now()` returns milliseconds — divide by 1000 before comparing to `t`.
- **Wrong hex case.** VVibe sends lowercase hex. If you upper-case before comparing, the constant-time compare always fails on length match.
- **Storing the secret in source control.** `VVIBE_WEBHOOK_SECRET` belongs in env vars, not `.env` committed to the repo. The `vvibe-sentry` skill scans for the `whsec_` prefix; check the repo before pushing.
- **Returning 200 after a partial failure WITHOUT logging.** "Return 200 even on error" works only if the error is durably logged for human follow-up. Silent swallow turns a webhook failure into invisible data loss.
- **Trusting the response body.** VVibe ignores the response body — only the status code matters. Any data you "return" in the body is wasted.
