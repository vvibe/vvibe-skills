# Signup Event — tell VVibe when someone registers

## When to use this

Use this reference to wire **one** call into the creator's registration
handler. That call is the entire integration.

VVibe does not keep a copy of the creator's users. It records an address, and
optionally a referral code and an attribution snapshot, because three things
downstream need them:

1. **Referral discount** — a code captured at signup auto-applies at the
   buyer's first VVibe checkout.
2. **Welcome email** — `welcome_free` (or `welcome_paid` if they already have
   an active subscription) fires on the first event for an address.
3. **Campaign analytics** — the `signedUp` stage of an invitation campaign
   stamps when the code matches a recipient.

Nothing else. There is no login hook, no profile-update hook, no deletion
hook, and **no backfill**. If the creator's user data is needed for anything
(an audience, a report, a lookup), read it from their database — see
`vvibe-email`'s `audience-segments.md`.

For exact wire shapes see [./api-contract.md](./api-contract.md).

## 1. Consent

Before anything else, the AI agent **must ask the human user** for explicit
consent. Present the following and **wait for the user's response** before
moving to Step 2:

> This skill will notify VVibe when someone registers in your app, so
> referral codes work at checkout and VVibe can send your welcome email.
>
> This involves modifying your codebase:
> 1. Adding one fire-and-forget call to your registration handler
> 2. Reading `VVIBE_API_KEY` from your environment
>
> VVibe stores the email address, plus the referral code and attribution if
> you send them. It does not receive or store the rest of your user records.
>
> Would you like to proceed?

**Do NOT continue until the user explicitly agrees.** If they decline, stop
here — do not proceed to any subsequent step.

## 2. Confirm `VVIBE_API_KEY`

Check local env files (`.env`, `.env.local`, `.env.development`, framework env
config) for an existing key. If found, confirm with the user it's the right
one for the target environment (`pcs_test_*` → test, `pcs_live_*` →
production). If not found, ask the user to grab it from
`https://vvibe.ai/dashboard` and paste it; save to the appropriate local env
file.

**Stop here if the key isn't available.** Tell the user to re-run once they
have one.

## 3. What to send

| Field | Type | Req | Description |
|---|---|---|---|
| `email` | string | Yes | The address. Dedup key per (merchant, mode). |
| `display_name` | string | No | Used to personalise the welcome email. |
| `signup_ref_code` | string | No | Referral / promo code from the signup URL or form (e.g. `?ref=EARLY2026`). 3–40 chars, `[A-Z0-9_-]`, stored UPPERCASE. **First-write-wins.** |
| `metadata` | object | No | Signup-time context, max 10KB. `attribution` lives here — see [./attribution-utm.md](./attribution-utm.md). |

**Do not map the rest of the user model.** Role, plan, last login, external
id, status — VVibe has nowhere to put them and no use for them. Sending them
is not an error (unknown keys are ignored), but it's noise.

## 4. Add the call

Put it in the registration handler, **after** the user has been successfully
created, detached from the response path.

```typescript
// lib/vvibe-signup.ts
const VVIBE_API_KEY = process.env.VVIBE_API_KEY
const VVIBE_API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'

export async function notifyVVibeSignup(signup: {
  email: string
  displayName?: string
  signupRefCode?: string
  metadata?: Record<string, unknown>
}) {
  if (!VVIBE_API_KEY) return

  const res = await fetch(`${VVIBE_API_HOST}/api/members/signup-event`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VVIBE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: signup.email,
      display_name: signup.displayName,
      signup_ref_code: signup.signupRefCode,
      metadata: signup.metadata,
    }),
  })

  if (!res.ok) {
    throw new Error(`VVibe signup-event ${res.status}: ${await res.text()}`)
  }
  return res.json()
}
```

Wire it into the signup path:

```typescript
// ✅ Correct — main flow owns its own error path; the notify runs detached
try {
  const user = await createUser(userData) // may fail, return 500
} catch (err) {
  return res.status(500).json({ error: 'Registration failed' })
}
notifyVVibeSignup({
  email: userData.email,
  displayName: userData.name,
  signupRefCode: refCodeFromUrlOrForm, // ?ref= / ?code= / ?promo= / ?coupon=
}).catch((err) => console.error('[VVibe signup]', err))

// ❌ Wrong — a VVibe outage would cascade into registration failure
await createUser(userData)
await notifyVVibeSignup({ email: userData.email })
```

Use the framework's own registration hook where one exists — Better Auth
`databaseHooks.user.create.after`, Payload `afterChange` on create, NextAuth
`events.createUser`, Supabase auth webhook, Django `post_save` on the user
model. **Create only** — do not attach to update or delete.

`scripts/signup_event.mjs` is a runnable version of the same call if the
project isn't TypeScript.

## 5. Response

```json
{ "data": { "recorded": true, "outcome": "created", "refCodeError": null } }
```

- `outcome` — `created` on the first event for this address, `updated` on a
  repeat. The welcome email only fires on `created`.
- `refCodeError` — one of:
  - `null` — accepted, or none supplied
  - `unknown_signup_ref_code` — the code doesn't exist / is disabled / is past
    `redeemBy`. Dropped; signup still recorded.
  - `signup_ref_code_already_recorded` — a different code was already on file;
    first-write-wins kept the original.
  - `ref_code_lookup_unavailable` — VVibe couldn't check right now, so it kept
    the code rather than risk discarding a good one permanently.

No ref-code error fails the signup. Since the call is fire-and-forget,
you won't normally read the body — log it if the creator wants to debug why a
referral didn't apply.

## 6. Verify & done

### 6a — Checklist

```
## VVibe Signup Event Checklist
✅ / ❌ Registration handler fires notifyVVibeSignup — {file:line}
✅ / ❌ Call is fire-and-forget (.catch, not awaited in the response path) — {file:line}
✅ / ❌ Referral param from the signup URL/form is passed as signupRefCode — {file:line} (❌ + "app has no referral links" is a valid answer)
✅ / ❌ VVIBE_API_KEY read from env, host not hardcoded — {file:line}
❌ No sync loop: no VVibe call on login, profile update, or deletion
```

That last line is a **negative** check — confirm those calls are absent. If a
previous integration wired them, remove them; they now do nothing but burn
requests.

### 6b — Next steps

1. **Set environment variables** in production/staging (API key at
   `https://vvibe.ai/dashboard`; `pcs_test_*` → test, `pcs_live_*` →
   production):
   ```
   VVIBE_API_HOST=https://vvibe.ai
   VVIBE_API_KEY=pcs_live_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
2. **Deploy** — the hook only fires after deployment.
3. **Register a test account** and confirm the welcome email arrives.

There is no backfill step and no re-run. Existing users are not sent to
VVibe, by design.

## Guardrails

- **Fire-and-forget**: never let a VVibe failure break registration.
- **Registration only**: one event per new account, never on update.
- **Metadata limit**: 10KB.
- **Mode isolation**: `pcs_test_*` and `pcs_live_*` data are completely
  separate.
- **`signup_ref_code` is first-write-wins**: pass it on registration only.

## Pitfalls

- **Rebuilding the old sync loop.** Hooks on login / profile update /
  deletion / admin import were part of the mirror that no longer exists.
  Adding them back sends data VVibe discards.
- **Backfilling existing users.** There is no batch endpoint to backfill
  into, and looping the signup event over every existing user will fire a
  welcome email at each of them. Don't.
- **Awaiting the call in the request path.** Detach with `.catch(...)`.
- **Hardcoded host URL.** Always read `process.env.VVIBE_API_HOST` with
  default `https://vvibe.ai`.
- **Sending the ref code on every call.** First-write-wins; a later
  different code is dropped and reported as
  `signup_ref_code_already_recorded`.
- **Still calling `POST /api/members/sync`.** That endpoint is deprecated. It
  still works (it forwards each entry to the signup event) so existing
  deployments don't silently drop signups, but new code must not use it.
