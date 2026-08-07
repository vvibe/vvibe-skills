# VVibe Signup Event API Contract

## Base URL

```
https://vvibe.ai
```

Default; overridable via `VVIBE_API_HOST`. See `PROVIDER.md` at the repo root.

## Authentication

```
Authorization: Bearer {VVIBE_API_KEY}
```

- API Key prefix determines mode: `pcs_live_*` (production) / `pcs_test_*` (sandbox)
- API Key auth only. There is no JWT path — this endpoint is server-to-server.

---

## POST /api/members/signup-event

Record one registration. Idempotent per `(merchant, mode, email)`.

**Request:**
```json
{
  "email": "alice@example.com",
  "display_name": "Alice",
  "metadata": { "attribution": { "utm_source": "InsForge" } },
  "signup_ref_code": "EARLY2026"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | string | Yes | Valid email, max 255 chars. Dedup key. |
| `display_name` | string | No | Max 255 chars. Personalises the welcome email. |
| `metadata` | object | No | Arbitrary key-value, max 10KB serialized. `attribution` lives here. |
| `signup_ref_code` | string | No | Discount code used as a referral at signup. 3-40 chars, `[A-Z0-9_-]` (case-insensitive on input; stored UPPERCASE). When this buyer later starts a checkout and verifies their email, VVibe auto-applies the matching rule for the chosen plan — provided the code is still within its `redeemBy` window and the per-customer cap (if any) has not been reached. **First-write-wins** per (merchant, mode, email). |

Unknown keys are ignored rather than rejected, so a payload carrying leftover
fields from the old sync contract (`role`, `plan_name`, `last_login_at`,
`external_user_id`, `status`) still succeeds — those values are simply not
stored.

**Response (200):**
```json
{
  "data": {
    "recorded": true,
    "outcome": "created",
    "refCodeError": null
  }
}
```

| Field | Meaning |
|---|---|
| `recorded` | Always `true` on 200. |
| `outcome` | `created` — first event for this address; the welcome email fires. `updated` — already known; no email. |
| `refCodeError` | `null`, `unknown_signup_ref_code`, or `signup_ref_code_already_recorded`. |

**`refCodeError` values:**

- `unknown_signup_ref_code` — the code does not exist in VVibe, is `disabled`,
  or is past `redeemBy`. The signup is still recorded; the code is dropped.
- `signup_ref_code_already_recorded` — a different code is already on file for
  this address. The original is kept (first-write-wins); the new one is
  dropped.

Neither blocks the signup.

**Side effects on `outcome: "created"`:**

1. `welcome_free` is enqueued — or `welcome_paid` if the address already has
   an active VVibe subscription (they bought on hosted checkout, then
   registered). Deduped per address per template, so a repeat event never
   double-sends. Disable the template in the dashboard if the creator's app
   sends its own welcome.
2. If `signup_ref_code` matches an invitation-campaign recipient, that
   recipient's `signedUp` stage is stamped.

**Fire-and-forget pattern (required):**
```typescript
notifyVVibeSignup(data).catch(err => console.error('[VVibe signup]', err))
```

---

## Deprecated: POST /api/members/sync

The old batch upsert. Still accepted so already-deployed apps don't silently
drop signups, but **do not write new code against it**.

Behaviour now: each entry in `users[]` is forwarded to the signup-event path.
Entries with `status: "deleted"` are skipped (there is no mirror to delete
from). Fields beyond email / display_name / metadata / signup_ref_code are
ignored.

```json
{
  "data": {
    "synced": 2, "created": 1, "updated": 1, "deleted": 0,
    "errors": [],
    "deprecated": "POST /api/members/sync is deprecated. Use POST /api/members/signup-event, fired once at registration."
  }
}
```

The read endpoints that used to accompany it — `GET /api/members`,
`GET /api/members/{userId}`, `GET /api/members/stats`,
`GET /api/members/sync-logs`, `GET /api/members/export` — **are removed** and
return 404. VVibe is not the source of truth for the creator's users; query
their own database instead.

---

## Error Responses

**401 Unauthorized:**
```json
{ "error": "Missing bearer token" }
{ "error": "Invalid API key" }
{ "error": "Signup event API requires API Key authentication" }
```

**400 Bad Request:**
```json
{
  "error": "Validation error",
  "details": [ ... zod issues ... ]
}
```

**500 Internal Server Error:**
```json
{ "error": "Internal server error" }
```
